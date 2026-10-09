import { createHash } from "node:crypto";
import { DomainError } from "../../src/core/errors.js";
import type {
  Intent,
  PaymentProvider,
} from "../../src/modules/payments/provider.js";

/**
 * A deterministic, in-memory stand-in for the card processor, modelled on the
 * parts of Stripe's manual-capture PaymentIntent lifecycle that the money path
 * depends on. It touches no network and uses no real credentials.
 *
 *   authorize -> requires_capture   (a hold; funds reserved, not moved)
 *   capture   -> succeeded          (funds move; only from requires_capture)
 *   release   -> canceled           (hold dropped; idempotent, tolerates canceled)
 *   refund    -> refund object      (only against a succeeded intent)
 *
 * Idempotency keys are honoured the way Stripe honours them: the first request
 * with a key stores its response, a later request with the same key replays that
 * stored response without touching state, and the same key with different
 * parameters is rejected. Every call is logged in arrival order so a test can
 * assert exactly what reached the provider.
 *
 * Faults are injected per operation and per phase. A "before" fault means the
 * request never reached the provider (state unchanged). An "after" fault means
 * the provider acted and stored its response but the caller still saw an
 * error, which is the lost-response / process-crash-after-success case.
 */

export type ProviderOp =
  | "authorize"
  | "recoverAuthorization"
  | "fetchIntent"
  | "capture"
  | "release"
  | "refund"
  | "fetchRefund"
  | "recoverRefund";

/** Operations that can change provider state. */
export const MUTATING_OPS: readonly ProviderOp[] = [
  "authorize",
  "capture",
  "release",
  "refund",
];

export type RefundState = "pending" | "succeeded" | "failed";
export type PaymentMethodBehavior = "ok" | "decline" | "requires_action";

export interface ProviderCall {
  /** Arrival order, starting at 1. */
  seq: number;
  op: ProviderOp;
  key?: string;
  intentId?: string;
  amount?: number;
  paymentMethodId?: string;
  /** Answered from the stored idempotent response; no provider state changed. */
  replayed: boolean;
  /** This call changed provider state (a "real" call). */
  acted: boolean;
  outcome: "pending" | "ok" | "error";
  /** The DomainError code the caller saw, when outcome is "error". */
  error?: string;
}

/** Which failure the caller sees, mirroring `stripeOperation`'s mapping. */
export type ProviderFault =
  /** Timeout, connection reset or HTTP 5xx: code `provider_unknown`. */
  | "unknown"
  /** HTTP 4xx other than 409/429: code `provider_rejected`. */
  | "rejected";

export class Gate {
  private release!: () => void;
  private arrive!: (call: ProviderCall) => void;
  private readonly released = new Promise<void>((resolve) => {
    this.release = resolve;
  });
  /** Resolves when a call reaches the gate. */
  readonly arrived = new Promise<ProviderCall>((resolve) => {
    this.arrive = resolve;
  });
  /** Let the held call (and any later call that hits this gate) continue. */
  open() {
    this.release();
  }
  /** @internal */
  async pass(call: ProviderCall) {
    this.arrive(call);
    await this.released;
  }
}

export interface InjectOptions {
  /** "before": the provider has not acted. "after": it has acted and stored its response. */
  phase?: "before" | "after";
  /** How many matching calls are affected. Default 1. */
  times?: number;
  /** Narrow the rule to some calls (for example one payment method or one key). */
  match?: (call: ProviderCall) => boolean;
  /** Pause matching calls at this point until the gate is opened. */
  gate?: Gate;
  /** After any gate, fail the call. Omit to only pause. */
  throws?: ProviderFault;
}

interface Rule extends InjectOptions {
  op: ProviderOp;
  phase: "before" | "after";
  remaining: number;
}

interface IntentRecord {
  id: string;
  packetId: string;
  paymentMethodId: string;
  amount: number;
  currency: string;
  status: Intent["status"];
  captureBefore: Date | null;
  clientSecret: string;
  amountReceived: number;
  refunded: number;
  metadata: Record<string, string>;
  cancellationReason: "requested_by_customer" | "automatic" | null;
  createdBy: string;
}

interface RefundRecord {
  id: string;
  intentId: string;
  amount: number;
  key: string;
  state: RefundState;
}

interface StoredResponse {
  op: ProviderOp;
  fingerprint: string;
  result: unknown;
}

export interface FakeProviderOptions {
  /** Provide recoverAuthorization / recoverRefund, as the Stripe adapter does. Default true. */
  recovery?: boolean;
  /** How long a manual-capture hold lives. Default seven days. */
  captureWindowMs?: number;
  /** What a refund reports. Default "succeeded". */
  refundState?: RefundState;
}

let providerSerial = 0;

export class FakePaymentProvider implements PaymentProvider {
  readonly name = "fake";
  /** Every call in arrival order. */
  readonly calls: ProviderCall[] = [];
  captureWindowMs: number;
  refundState: RefundState;
  recoverAuthorization?: PaymentProvider["recoverAuthorization"];
  recoverRefund?: PaymentProvider["recoverRefund"];

  private readonly namespace: string;
  private intentSerial = 0;
  private refundSerial = 0;
  private clockOffsetMs = 0;
  private readonly intentsById = new Map<string, IntentRecord>();
  private readonly refundsById = new Map<string, RefundRecord>();
  private readonly responses = new Map<string, StoredResponse>();
  private readonly methods = new Map<string, PaymentMethodBehavior>([
    ["pm_cardVisa", "ok"],
    ["pm_cardDeclined", "decline"],
    ["pm_cardAuthRequired", "requires_action"],
  ]);
  private rules: Rule[] = [];

  constructor(options: FakeProviderOptions = {}) {
    providerSerial += 1;
    // Intent references are UNIQUE in the database, so providers made for
    // different test worlds in one fixture database must not reuse ids.
    this.namespace = String(providerSerial).padStart(3, "0");
    this.captureWindowMs = options.captureWindowMs ?? 7 * 24 * 3600 * 1000;
    this.refundState = options.refundState ?? "succeeded";
    if (options.recovery ?? true) {
      this.recoverAuthorization = (input) =>
        this.run("recoverAuthorization", { key: input.key }, () => {
          const id = [...this.intentsById.values()].find(
            (intent) => intent.createdBy === input.key,
          )?.id;
          return id ? this.view(this.must(id)) : undefined;
        });
      this.recoverRefund = (input) =>
        this.run(
          "recoverRefund",
          { key: input.key, intentId: input.intentId, amount: input.amount },
          () => {
            const found = [...this.refundsById.values()].find(
              (refund) => refund.key === input.key,
            );
            if (!found) return undefined;
            if (
              found.amount !== input.amount ||
              found.intentId !== input.intentId
            )
              throw this.fault("rejected");
            return { id: found.id, state: found.state };
          },
        );
    }
  }

  // ---------------------------------------------------------------- scenario

  /** Choose how a payment method behaves when a hold is authorized on it. */
  setPaymentMethod(paymentMethodId: string, behavior: PaymentMethodBehavior) {
    this.methods.set(paymentMethodId, behavior);
  }

  /** The cardholder completes (or fails) 3-D Secure for an intent in requires_action. */
  completeAuthentication(intentId: string, succeeded = true) {
    const intent = this.must(intentId);
    if (intent.status !== "requires_action")
      throw new Error(
        `Intent ${intentId} is ${intent.status}, not requires_action`,
      );
    if (succeeded) {
      intent.status = "requires_capture";
      intent.captureBefore = new Date(
        this.now().getTime() + this.captureWindowMs,
      );
    } else intent.status = "requires_payment_method";
  }

  /**
   * The hold dies without our involvement: the capture window passes or the
   * issuer voids it. A later capture is rejected, which is a "dead card".
   */
  killHold(intentId: string) {
    const intent = this.must(intentId);
    if (intent.status === "requires_capture") {
      intent.status = "canceled";
      intent.cancellationReason = "automatic";
    }
  }

  /** Make the provider's record disagree with what was agreed (a bad reply, a partial capture). */
  distort(
    intentId: string,
    patch: Partial<
      Pick<IntentRecord, "amount" | "currency" | "amountReceived">
    >,
  ) {
    Object.assign(this.must(intentId), patch);
  }

  /** Move the provider clock forward, for capture-window expiry. */
  advanceClock(ms: number) {
    this.clockOffsetMs += ms;
  }

  now() {
    return new Date(Date.now() + this.clockOffsetMs);
  }

  /** Shrink one hold's capture window to `ms` from now (the real clock). */
  setCaptureBefore(intentId: string, ms: number) {
    this.must(intentId).captureBefore = new Date(this.now().getTime() + ms);
  }

  // ------------------------------------------------------------- fault rules

  inject(op: ProviderOp, options: InjectOptions = {}) {
    this.rules.push({
      ...options,
      op,
      phase: options.phase ?? "before",
      remaining: options.times ?? 1,
    });
  }

  /** The request is lost before the provider sees it: nothing changes, caller errors. */
  failBeforeAction(
    op: ProviderOp,
    fault: ProviderFault = "unknown",
    times = 1,
  ) {
    this.inject(op, { phase: "before", throws: fault, times });
  }

  /** The provider acts and stores its answer, but the caller sees a timeout. */
  failAfterAction(op: ProviderOp, times = 1) {
    this.inject(op, { phase: "after", throws: "unknown", times });
  }

  /** Hold the next matching call until the returned gate is opened. */
  pause(
    op: ProviderOp,
    phase: "before" | "after",
    match?: InjectOptions["match"],
  ) {
    const gate = new Gate();
    this.inject(op, { phase, gate, ...(match ? { match } : {}) });
    return gate;
  }

  clearFaults() {
    this.rules = [];
  }

  // -------------------------------------------------------------- assertions

  callsOf(op: ProviderOp) {
    return this.calls.filter((call) => call.op === op);
  }

  /** Calls that actually changed provider state (not replays, not reads). */
  realCalls(op: ProviderOp) {
    return this.calls.filter(
      (call) => call.op === op && call.acted && !call.replayed,
    );
  }

  /** The state-changing operations, in the order the provider performed them. */
  mutations() {
    return this.calls
      .filter((call) => call.acted && !call.replayed)
      .map((call) => call.op);
  }

  /** Every operation in arrival order, optionally without the read-only ones. */
  order(options: { includeReads?: boolean } = {}) {
    return this.calls
      .filter((call) => options.includeReads || MUTATING_OPS.includes(call.op))
      .map((call) => call.op);
  }

  intent(id: string): Readonly<IntentRecord> {
    return { ...this.must(id) };
  }

  intentFor(packetId: string): Readonly<IntentRecord>[] {
    return [...this.intentsById.values()]
      .filter((intent) => intent.packetId === packetId)
      .map((intent) => ({ ...intent }));
  }

  /** Holds that are still live. A test that expects "no dangling hold" asserts 0. */
  openHolds(packetId?: string) {
    return [...this.intentsById.values()].filter(
      (intent) =>
        intent.status === "requires_capture" &&
        (packetId === undefined || intent.packetId === packetId),
    ).length;
  }

  capturedTotal(packetId?: string) {
    return [...this.intentsById.values()]
      .filter(
        (intent) => packetId === undefined || intent.packetId === packetId,
      )
      .reduce((sum, intent) => sum + intent.amountReceived, 0);
  }

  refundedTotal(packetId?: string) {
    return [...this.intentsById.values()]
      .filter(
        (intent) => packetId === undefined || intent.packetId === packetId,
      )
      .reduce((sum, intent) => sum + intent.refunded, 0);
  }

  refunds() {
    return [...this.refundsById.values()].map((refund) => ({ ...refund }));
  }

  // ------------------------------------------------------- PaymentProvider

  authorize(input: Parameters<PaymentProvider["authorize"]>[0]) {
    return this.run(
      "authorize",
      {
        key: input.key,
        amount: input.amount,
        paymentMethodId: input.paymentMethodId,
      },
      (call) => {
        const fingerprint = JSON.stringify([
          input.packetId,
          input.amount,
          input.currency,
          input.paymentMethodId,
        ]);
        const replay = this.replay<Intent>(
          call,
          "authorize",
          input.key,
          fingerprint,
        );
        if (replay) return replay;
        const behavior = this.methods.get(input.paymentMethodId) ?? "ok";
        this.intentSerial += 1;
        const id = `pi_fake${this.namespace}n${String(this.intentSerial).padStart(4, "0")}`;
        const record: IntentRecord = {
          id,
          packetId: input.packetId,
          paymentMethodId: input.paymentMethodId,
          amount: input.amount,
          currency: input.currency.toUpperCase(),
          status:
            behavior === "decline"
              ? "requires_payment_method"
              : behavior === "requires_action"
                ? "requires_action"
                : "requires_capture",
          captureBefore:
            behavior === "ok"
              ? new Date(this.now().getTime() + this.captureWindowMs)
              : null,
          clientSecret: `${id}_secret_${this.namespace}`,
          amountReceived: 0,
          refunded: 0,
          metadata: {
            packet_id: input.packetId,
            commerce_key: createHash("sha256").update(input.key).digest("hex"),
          },
          cancellationReason: null,
          createdBy: input.key,
        };
        this.intentsById.set(id, record);
        call.acted = true;
        call.intentId = id;
        const result = this.view(record);
        this.responses.set(input.key, {
          op: "authorize",
          fingerprint,
          result: this.view(record),
        });
        return result;
      },
    );
  }

  fetchIntent(id: string) {
    return this.run("fetchIntent", { intentId: id }, () =>
      this.view(this.known(id)),
    );
  }

  capture(id: string, key: string) {
    return this.run("capture", { key, intentId: id }, (call) => {
      const fingerprint = JSON.stringify([id]);
      const replay = this.replay<Intent>(call, "capture", key, fingerprint);
      if (replay) return replay;
      const intent = this.known(id);
      if (intent.status !== "requires_capture") throw this.fault("rejected");
      intent.status = "succeeded";
      intent.amountReceived = intent.amount;
      call.acted = true;
      this.responses.set(key, {
        op: "capture",
        fingerprint,
        result: this.view(intent),
      });
      return this.view(intent);
    });
  }

  release(id: string, key: string) {
    return this.run("release", { key, intentId: id }, (call) => {
      const fingerprint = JSON.stringify([id]);
      const replay = this.replay<Intent>(call, "release", key, fingerprint);
      if (replay) return replay;
      const intent = this.known(id);
      // An already-canceled intent is tolerated, not an error.
      if (intent.status === "canceled") return this.view(intent);
      if (intent.status === "succeeded") throw this.fault("rejected");
      intent.status = "canceled";
      intent.cancellationReason = "requested_by_customer";
      call.acted = true;
      this.responses.set(key, {
        op: "release",
        fingerprint,
        result: this.view(intent),
      });
      return this.view(intent);
    });
  }

  refund(id: string, amount: number, key: string) {
    return this.run("refund", { key, intentId: id, amount }, (call) => {
      const fingerprint = JSON.stringify([id, amount]);
      const replay = this.replay<{ id: string; state: RefundState }>(
        call,
        "refund",
        key,
        fingerprint,
      );
      if (replay) return replay;
      const intent = this.known(id);
      const committed = this.committedRefunds(id);
      if (
        intent.status !== "succeeded" ||
        amount <= 0 ||
        committed + amount > intent.amountReceived
      )
        throw this.fault("rejected");
      this.refundSerial += 1;
      const refund: RefundRecord = {
        id: `re_fake${this.namespace}n${String(this.refundSerial).padStart(4, "0")}`,
        intentId: id,
        amount,
        key,
        state: this.refundState,
      };
      this.refundsById.set(refund.id, refund);
      if (refund.state === "succeeded") intent.refunded += amount;
      call.acted = true;
      const result = { id: refund.id, state: refund.state };
      this.responses.set(key, { op: "refund", fingerprint, result });
      return { ...result };
    });
  }

  fetchRefund(id: string) {
    return this.run("fetchRefund", {}, () => {
      const refund = this.refundsById.get(id);
      if (!refund) throw this.fault("rejected");
      return { id: refund.id, state: refund.state };
    });
  }

  /** A pending refund settles (or fails) at the provider. */
  settleRefund(id: string, state: Exclude<RefundState, "pending">) {
    const refund = this.refundsById.get(id);
    if (!refund) throw new Error(`No refund ${id}`);
    if (refund.state === "pending" && state === "succeeded")
      this.must(refund.intentId).refunded += refund.amount;
    refund.state = state;
  }

  // ---------------------------------------------------------------- internals

  private committedRefunds(intentId: string) {
    return [...this.refundsById.values()]
      .filter(
        (refund) => refund.intentId === intentId && refund.state !== "failed",
      )
      .reduce((sum, refund) => sum + refund.amount, 0);
  }

  private replay<T>(
    call: ProviderCall,
    op: ProviderOp,
    key: string,
    fingerprint: string,
  ): T | undefined {
    const stored = this.responses.get(key);
    if (!stored) return undefined;
    if (stored.op !== op || stored.fingerprint !== fingerprint)
      throw this.fault("rejected");
    call.replayed = true;
    return structuredClone(stored.result) as T;
  }

  private must(id: string) {
    const intent = this.intentsById.get(id);
    if (!intent) throw new Error(`Unknown intent ${id}`);
    return intent;
  }

  /** Lookup as the provider API does: unknown ids are a 404, so rejected. */
  private known(id: string) {
    const intent = this.intentsById.get(id);
    if (!intent) throw this.fault("rejected");
    // Lazy expiry: a hold past its capture window is canceled by the provider.
    if (
      intent.status === "requires_capture" &&
      intent.captureBefore &&
      intent.captureBefore.getTime() <= this.now().getTime()
    ) {
      intent.status = "canceled";
      intent.cancellationReason = "automatic";
    }
    return intent;
  }

  private view(record: IntentRecord): Intent {
    return {
      id: record.id,
      amount: record.amount,
      currency: record.currency,
      status: record.status,
      captureBefore: record.captureBefore
        ? new Date(record.captureBefore)
        : null,
      clientSecret: record.clientSecret,
      amountReceived: record.amountReceived,
      refunded: record.refunded,
      metadata: { ...record.metadata },
    };
  }

  /** The same stable errors `stripeOperation` produces; no provider text escapes. */
  private fault(kind: ProviderFault) {
    return kind === "rejected"
      ? new DomainError(
          "provider_rejected",
          "The provider could not complete this change. Refresh its current status.",
          409,
        )
      : new DomainError(
          "provider_unknown",
          "The provider is still being reconciled. Check again shortly.",
          503,
        );
  }

  private async fire(call: ProviderCall, phase: "before" | "after") {
    for (const rule of this.rules) {
      if (rule.op !== call.op || rule.phase !== phase || rule.remaining <= 0)
        continue;
      if (rule.match && !rule.match(call)) continue;
      rule.remaining -= 1;
      if (rule.gate) await rule.gate.pass(call);
      if (rule.throws) throw this.fault(rule.throws);
    }
  }

  private async run<T>(
    op: ProviderOp,
    details: Pick<
      ProviderCall,
      "key" | "intentId" | "amount" | "paymentMethodId"
    >,
    work: (call: ProviderCall) => T,
  ): Promise<T> {
    const call: ProviderCall = {
      seq: this.calls.length + 1,
      op,
      ...details,
      replayed: false,
      acted: false,
      outcome: "pending",
    };
    this.calls.push(call);
    try {
      await this.fire(call, "before");
      const result = work(call);
      await this.fire(call, "after");
      call.outcome = "ok";
      return result;
    } catch (error) {
      call.outcome = "error";
      call.error = error instanceof DomainError ? error.code : "unexpected";
      throw error;
    }
  }
}
