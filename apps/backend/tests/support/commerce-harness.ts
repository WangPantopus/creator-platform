import {
  createHash,
  generateKeyPairSync,
  randomBytes,
  randomUUID,
  sign,
} from "node:crypto";
import type { KeyObject } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { describe } from "vitest";
import type { SignedActCommand, commerceContracts } from "@qelvora/api";
import { contentHash } from "../../src/core/canonical.js";
import { Database } from "../../src/db/database.js";
import { AccessService } from "../../src/modules/access/scope.js";
import { CommerceService } from "../../src/modules/commerce/service.js";
import { commerceSignedSubjects } from "../../src/modules/commerce/registration.js";
import { SignedActService } from "../../src/modules/identity/signed-acts.js";
import type { Actor } from "../../src/modules/identity/adapter.js";
import { FakePaymentProvider } from "./fake-payment-provider.js";

/**
 * Money-path harness. It boots a disposable PostgreSQL fixture database the
 * same way tests/postgres.integration.test.ts does (scripts/migrate-trust.ts
 * with W8_LEGACY_ROOT_MIGRATIONS=false, then the non-owner `creator_runtime`
 * role), and layers on a creator, fans, threads, an offered written-reply mode,
 * a fake card processor and real passkey-signed acceptance acts.
 *
 * The suites using it skip cleanly when CREATOR_TEST_DATABASE_URL is unset, and
 * fail loudly in CI when it is unset, exactly like the existing suite.
 */
export const adminUrl = process.env.CREATOR_TEST_DATABASE_URL;
const ci = process.env.CI;
if (ci && !["false", "0"].includes(ci.toLowerCase()) && !adminUrl) {
  throw new Error(
    "CI requires CREATOR_TEST_DATABASE_URL pointing to a disposable PostgreSQL database with pgvector; integration tests cannot be skipped.",
  );
}
export const describeMoney = describe.skipIf(!adminUrl);

const RP_ID = "localhost";
const ORIGIN = "http://localhost:3000";
export const CURRENCY = "USD";

export type PacketView = Awaited<ReturnType<CommerceService["packet"]>>;
export type SubmitInput = commerceContracts.SubmitPacketInput;

export interface Person {
  id: string;
  account: string;
  handle: string;
  name: string;
  actor: Actor;
}

export interface WorldOptions {
  fans?: number;
  /** Price of the written reply, minor units. */
  price?: number;
  weeklyLimit?: number;
  decisionHours?: number;
  deliveryHours?: number;
  /** Monthly spend limit for every fan: minor units, or null for an explicit "no limit". "unset" leaves fans without one. */
  limit?: number | null | "unset";
  provider?: FakePaymentProvider;
}

const FAN_NAMES = ["Priya", "Devon", "Lena", "Omar", "Sana", "Tomas", "Ines"];

export function actorOf(account: string): Actor {
  return { accountId: account, adultEligible: true };
}

function cosePublicKey(keys: { publicKey: KeyObject }) {
  const jwk = keys.publicKey.export({ format: "jwk" });
  return Buffer.concat([
    Buffer.from("a5010203262001215820", "hex"),
    Buffer.from(jwk.x!, "base64url"),
    Buffer.from("225820", "hex"),
    Buffer.from(jwk.y!, "base64url"),
  ]);
}

export class MoneyFixture {
  private serial = 0;
  private constructor(
    readonly admin: pg.Pool,
    readonly runtime: pg.Pool,
    readonly db: Database,
    readonly access: AccessService,
    readonly signing: SignedActService,
    private readonly bootstrap: pg.Pool,
    private readonly fixtureDatabase: string,
  ) {}

  static async create() {
    // The fixture may only use a disposable database with an explicit test name.
    const url = new URL(adminUrl!);
    if (!/test|foundation/u.test(url.pathname))
      throw new Error("Use a disposable test database.");
    const bootstrap = new pg.Pool({ connectionString: adminUrl, max: 1 });
    const fixtureDatabase = `creator_foundation_${randomUUID().replaceAll("-", "")}`;
    const existingRole = await bootstrap.query(
      "SELECT 1 FROM pg_roles WHERE rolname='creator_runtime'",
    );
    await bootstrap.query(`CREATE DATABASE "${fixtureDatabase}"`);
    url.pathname = `/${fixtureDatabase}`;
    const admin = new pg.Pool({ connectionString: url.toString(), max: 4 });
    try {
      await promisify(execFile)(
        process.execPath,
        [
          "--import",
          "tsx",
          fileURLToPath(
            new URL("../../scripts/migrate-trust.ts", import.meta.url),
          ),
        ],
        {
          env: {
            ...process.env,
            DATABASE_MIGRATION_URL: url.toString(),
            W8_LEGACY_ROOT_MIGRATIONS: "false",
          },
          timeout: 60000,
        },
      );
      // Configure only a newly created fixture role; never rotate a retained
      // cluster's runtime credential when this suite is repeated.
      if (!existingRole.rowCount)
        await admin.query(
          "ALTER ROLE creator_runtime PASSWORD 'foundation-test-only'",
        );
      url.username = "creator_runtime";
      url.password = "foundation-test-only";
      // CommerceService.account() requires a finite connection budget of at most
      // five seconds. The pool is wide enough for the parallel races below.
      const runtime = new pg.Pool({
        connectionString: url.toString(),
        max: 30,
        connectionTimeoutMillis: 5000,
      });
      const db = new Database(runtime);
      await db.assertRuntimeRole();
      const access = new AccessService(runtime);
      const signing = new SignedActService(runtime, RP_ID, ORIGIN, undefined, [
        commerceSignedSubjects,
      ]);
      // The commerce tables must exist after the standard bootstrap.
      const tables = await admin.query<{ n: string }>(
        "SELECT count(*)::text AS n FROM information_schema.tables WHERE table_schema='creator' AND table_name IN ('commerce_mode','commerce_capacity','commerce_packet','commerce_effect','commerce_ledger','commerce_commitment','commerce_spend_limit','commerce_provider_inbox')",
      );
      if (tables.rows[0]!.n !== "8")
        throw new Error("Commerce tables are missing after the bootstrap.");
      return new MoneyFixture(
        admin,
        runtime,
        db,
        access,
        signing,
        bootstrap,
        fixtureDatabase,
      );
    } catch (error) {
      await admin.end();
      await bootstrap.query(`DROP DATABASE IF EXISTS "${fixtureDatabase}"`);
      await bootstrap.end();
      throw error;
    }
  }

  async destroy() {
    await this.runtime.end();
    await this.admin.end();
    await this.bootstrap.query(`DROP DATABASE "${this.fixtureDatabase}"`);
    await this.bootstrap.end();
  }

  nextSerial() {
    this.serial += 1;
    return this.serial;
  }

  /** A fresh creator, fans, threads, one offered mode and spend limits. */
  async newWorld(options: WorldOptions = {}) {
    const serial = this.nextSerial();
    const tag = `${serial}-${randomBytes(3).toString("hex")}`;
    const provider = options.provider ?? new FakePaymentProvider();
    const price = options.price ?? 5000;
    const service = new CommerceService(
      this.runtime,
      this.db,
      this.access,
      { currency: CURRENCY, limitOptions: [], passEnabled: false },
      provider,
    );
    const creatorAccount = randomUUID();
    const creator: Person = {
      id: randomUUID(),
      account: creatorAccount,
      handle: `maya-${tag}`,
      name: "Maya",
      actor: actorOf(creatorAccount),
    };
    await this.admin.query(
      "INSERT INTO creator.creator_profile(id,account_id,handle,display_name,verification) VALUES($1,$2,$3,$4,'verified')",
      [creator.id, creator.account, creator.handle, creator.name],
    );
    const fans: Person[] = [];
    for (let index = 0; index < (options.fans ?? 1); index++) {
      const account = randomUUID();
      const fan: Person = {
        id: randomUUID(),
        account,
        handle: `fan-${tag}-${index}`,
        name: FAN_NAMES[index % FAN_NAMES.length]!,
        actor: actorOf(account),
      };
      await this.admin.query(
        "INSERT INTO creator.fan_profile(id,account_id,handle) VALUES($1,$2,$3)",
        [fan.id, fan.account, fan.handle],
      );
      await this.admin.query(
        "INSERT INTO creator.thread(creator_id,fan_id,privacy_notice_at,processor_consent_version) VALUES($1,$2,now(),'test-processors-v1')",
        [creator.id, fan.id],
      );
      fans.push(fan);
    }
    // The creator's passkey. Accepting a request needs a real user-verified
    // assertion bound to the exact content, so the harness signs with a key.
    const keys = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
    const credentialId = randomBytes(16).toString("base64url");
    await this.admin.query(
      "INSERT INTO creator.passkey_credential(id,account_id,public_key,counter) VALUES($1,$2,$3,0)",
      [credentialId, creator.account, cosePublicKey(keys)],
    );
    const mode = (await service.saveMode(creator.actor, creator.id, null, {
      title: "Written reply",
      kind: "written_reply",
      amount: price,
      publicAmount: null,
      currency: CURRENCY,
      decisionHours: options.decisionHours ?? 48,
      deliveryHours: options.deliveryHours ?? 72,
      durationSeconds: null,
      weeklyLimit: options.weeklyLimit ?? 5,
      shareable: false,
      state: "offered",
      version: 0,
      idempotencyKey: `mode-${tag}`,
    })) as { id: string; version: number };
    const world = new World(
      this,
      service,
      provider,
      creator,
      fans,
      { id: mode.id, version: mode.version },
      price,
      { keys, credentialId },
    );
    const limit = options.limit === undefined ? 1_000_000 : options.limit;
    if (limit !== "unset")
      for (const fan of fans) await world.setLimit(fan, limit);
    return world;
  }
}

/** Everything one test needs, with direct database access for assertions. */
export class World {
  private counter = 0;
  constructor(
    readonly fixture: MoneyFixture,
    readonly service: CommerceService,
    readonly provider: FakePaymentProvider,
    readonly creator: Person,
    readonly fans: Person[],
    readonly mode: { id: string; version: number },
    readonly price: number,
    private readonly passkey: {
      keys: { privateKey: KeyObject };
      credentialId: string;
    },
  ) {}

  get admin() {
    return this.fixture.admin;
  }
  get fan() {
    return this.fans[0]!;
  }

  /** A unique idempotency key, 8 to 128 characters. */
  key(label = "k") {
    this.counter += 1;
    return `${label}-${this.counter}-${randomBytes(4).toString("hex")}`;
  }

  async setLimit(fan: Person, amount: number | null) {
    return this.service.setLimit(fan.actor, {
      currency: CURRENCY,
      amount,
      explicitNone: amount === null,
      remindersOn: false,
      idempotencyKey: this.key("limit"),
    });
  }

  submitBody(fan: Person, overrides: Partial<SubmitInput> = {}): SubmitInput {
    return {
      creatorId: this.creator.id,
      fanId: fan.id,
      modeId: this.mode.id,
      modeVersion: this.mode.version,
      visibility: "private",
      disclosure: {
        summary: `${fan.name}'s glaze crawls on thick pieces`,
        includeSummary: true,
        messageIds: [],
        attachmentIds: [],
        wholeThread: false,
        identity: "handle",
        accessNoticeVersion: "C06-1",
      },
      paymentMethodId: "pm_cardVisa",
      idempotencyKey: this.key("submit"),
      ...overrides,
    } as SubmitInput;
  }

  /** Submit a request as `fan` (default: the first fan). */
  submit(fan: Person = this.fan, overrides: Partial<SubmitInput> = {}) {
    return this.service.submit(fan.actor, this.submitBody(fan, overrides));
  }

  /** Submit and require that the hold landed (state submitted, requires_capture). */
  async submitted(
    fan: Person = this.fan,
    overrides: Partial<SubmitInput> = {},
  ) {
    const view = await this.submit(fan, overrides);
    if (view.packet.state !== "submitted")
      throw new Error(
        `Expected a submitted request, got ${view.packet.state}/${view.packet.payment_state}`,
      );
    return view;
  }

  /** Creator's current view of a request. */
  creatorView(packetId: string) {
    return this.service.packet(this.creator.actor, packetId);
  }
  fanView(fan: Person, packetId: string) {
    return this.service.packet(fan.actor, packetId);
  }

  /**
   * A real creator-signed acceptance: the canonical content comes from the
   * commerce signing policy, the assertion is verified by WebAuthn code, and
   * the act is single-use. `skipPolicy` signs the command the policy would
   * refuse (a closed window) to prove decide() refuses it independently.
   */
  async signAccept(
    packetId: string,
    action: "reply_myself" | "approve_draft" | "voice_note" = "reply_myself",
    options: { skipPolicy?: boolean } = {},
  ) {
    const { packet } = await this.service.packet(this.creator.actor, packetId);
    const command: SignedActCommand = {
      actType: "accept",
      subjectId: packet.thread_id,
      content: {
        packetId: packet.id,
        packetVersion: packet.version,
        snapshot: packet.snapshot,
        action,
      },
    };
    return this.signCommand(command, options.skipPolicy);
  }

  async signCommand(command: SignedActCommand, skipPolicy = false) {
    const signing = this.fixture.signing;
    const challenge = skipPolicy
      ? await signing.begin(this.creator.actor, this.creator.id, command)
      : await signing.beginSubject(
          this.creator.actor,
          this.creator.id,
          command,
        );
    const assertion = await this.assertionFor(challenge.publicKey.challenge);
    const { signedActId } = await signing.verify(
      this.creator.actor,
      challenge.challengeId,
      assertion,
    );
    return signedActId;
  }

  private signatureCounter = 0;
  private async assertionFor(challenge: string) {
    this.signatureCounter += 1;
    const clientData = Buffer.from(
      JSON.stringify({ type: "webauthn.get", challenge, origin: ORIGIN }),
    );
    const counter = Buffer.alloc(4);
    counter.writeUInt32BE(this.signatureCounter);
    const authenticatorData = Buffer.concat([
      createHash("sha256").update(RP_ID).digest(),
      Buffer.from([5]),
      counter,
    ]);
    const signature = sign(
      "sha256",
      Buffer.concat([
        authenticatorData,
        createHash("sha256").update(clientData).digest(),
      ]),
      this.passkey.keys.privateKey,
    );
    return {
      id: this.passkey.credentialId,
      rawId: this.passkey.credentialId,
      type: "public-key" as const,
      response: {
        clientDataJSON: clientData.toString("base64url"),
        authenticatorData: authenticatorData.toString("base64url"),
        signature: signature.toString("base64url"),
      },
      clientExtensionResults: {},
    };
  }

  /** Creator decision on the packet at its current version. */
  async decide(
    packetId: string,
    body: {
      action:
        | "ai_answer"
        | "approve_draft"
        | "reply_myself"
        | "voice_note"
        | "offer_times"
        | "group_offer"
        | "more_info"
        | "decline";
      signedActId?: string;
      text?: string;
      key?: string;
      version?: number;
    },
  ) {
    const version = body.version ?? (await this.packetRow(packetId)).version;
    return this.service.decide(this.creator.actor, packetId, {
      action: body.action,
      version,
      idempotencyKey: body.key ?? this.key("decide"),
      ...(body.signedActId ? { signedActId: body.signedActId } : {}),
      ...(body.text ? { text: body.text } : {}),
    });
  }

  /** Sign and accept in one step. */
  async accept(packetId: string, action: "reply_myself" = "reply_myself") {
    const signedActId = await this.signAccept(packetId, action);
    return this.decide(packetId, { action, signedActId });
  }

  decline(packetId: string, action: "decline" | "ai_answer" = "decline") {
    return this.decide(packetId, { action });
  }

  withdraw(fan: Person, packetId: string, version?: number) {
    return (async () =>
      this.service.withdraw(fan.actor, packetId, {
        version: version ?? (await this.packetRow(packetId)).version,
        idempotencyKey: this.key("withdraw"),
      }))();
  }

  // ----------------------------------------------------------- database truth

  async packetRow(packetId: string) {
    const result = await this.admin.query(
      "SELECT * FROM creator.commerce_packet WHERE id=$1",
      [packetId],
    );
    if (!result.rows[0]) throw new Error(`No packet ${packetId}`);
    return result.rows[0] as {
      id: string;
      state: string;
      payment_state: string;
      version: number;
      intent_ref: string | null;
      accepted_act_id: string | null;
      accepted_action: string | null;
      authorization_attempt: number;
      hold_expires_at: Date | null;
      decision_at: Date | null;
      auth_pending_until: Date | null;
      terminal_target: string | null;
      reason: string | null;
      mode_id: string;
      fan_id: string;
      creator_id: string;
      thread_id: string;
      snapshot: { amount: number; currency: string };
      submitted_at: Date | null;
      accepted_at: Date | null;
    };
  }

  async capacity() {
    const result = await this.admin.query<{
      capacity_limit: number;
      used: number;
      reserved: number;
    }>(
      "SELECT capacity_limit,used,reserved FROM creator.commerce_capacity WHERE mode_id=$1 ORDER BY window_start DESC LIMIT 1",
      [this.mode.id],
    );
    return result.rows[0] ?? { capacity_limit: 0, used: 0, reserved: 0 };
  }

  async ledger(packetId: string) {
    return (
      await this.admin.query<{
        kind: string;
        cause: string;
        amount: string;
        currency: string;
        provider_ref: string | null;
      }>(
        "SELECT kind,cause,amount::text,currency,provider_ref FROM creator.commerce_ledger WHERE packet_id=$1 ORDER BY created_at,id",
        [packetId],
      )
    ).rows;
  }

  async ledgerKinds(packetId: string) {
    return (await this.ledger(packetId)).map((row) => row.kind);
  }

  async effects(packetId: string) {
    return (
      await this.admin.query<{
        id: string;
        operation: string;
        state: string;
        attempt: number;
        provider_key: string;
        provider_ref: string | null;
        error_code: string | null;
        lease_until: Date | null;
        next_at: Date;
        request: Record<string, unknown>;
      }>(
        "SELECT id,operation,state,attempt,provider_key,provider_ref,error_code,lease_until,next_at,request FROM creator.commerce_effect WHERE packet_id=$1 ORDER BY created_at,id",
        [packetId],
      )
    ).rows;
  }

  async events(packetId: string) {
    return (
      await this.admin.query<{ type: string }>(
        "SELECT type FROM creator.commerce_event WHERE aggregate_id=$1 ORDER BY created_at,id",
        [packetId],
      )
    ).rows.map((row) => row.type);
  }

  async commitments(packetId: string) {
    return (
      await this.admin.query<{
        id: string;
        state: string;
        due_at: Date;
        version: number;
        outcome: string | null;
        delivered_at: Date | null;
      }>(
        "SELECT id,state,due_at,version,outcome,delivered_at FROM creator.commerce_commitment WHERE packet_id=$1",
        [packetId],
      )
    ).rows;
  }

  async consumed(signedActId: string) {
    return (
      ((
        await this.admin.query(
          "SELECT 1 FROM creator.signed_act_consumption WHERE signed_act_id=$1",
          [signedActId],
        )
      ).rowCount ?? 0) > 0
    );
  }

  // ------------------------------------------------------- thread and replies

  async threadId(fan: Person = this.fan) {
    const result = await this.admin.query<{ id: string }>(
      "SELECT id FROM creator.thread WHERE creator_id=$1 AND fan_id=$2",
      [this.creator.id, fan.id],
    );
    return result.rows[0]!.id;
  }

  /** Messages written by the fan in their thread. Returns the new message ids. */
  async fanMessages(fan: Person, texts: string[]) {
    const threadId = await this.threadId(fan);
    const ids: string[] = [];
    for (const text of texts) {
      const result = await this.admin.query<{ id: string }>(
        `INSERT INTO creator.message(thread_id,creator_id,fan_id,author_kind,author_account_id,text,delivery_state,control_epoch,sequence)
         SELECT $1,$2,$3,'fan',$4,$5,'delivered',0,coalesce(max(sequence),0)+1 FROM creator.message WHERE thread_id=$1 RETURNING id`,
        [threadId, this.creator.id, fan.id, fan.account, text],
      );
      ids.push(result.rows[0]!.id);
    }
    return ids;
  }

  /**
   * A reply under the creator's name: the creator's passkey signs the exact
   * text, then the message is stored the way the conversation service stores it
   * (the database trigger re-derives and checks the signed hash).
   */
  async creatorReply(fan: Person, text: string, createdAt?: Date) {
    const threadId = await this.threadId(fan);
    const command = {
      actType: "reply" as const,
      subjectId: threadId,
      content: { text },
    };
    const signedActId = await this.signCommand(command, true);
    const result = await this.admin.query<{ id: string }>(
      `INSERT INTO creator.message(thread_id,creator_id,fan_id,author_kind,author_account_id,text,delivery_state,control_epoch,sequence,signed_act_id,signed_content_hash,created_at)
       SELECT $1,$2,$3,'human_creator',$4,$5,'delivered',0,coalesce(max(sequence),0)+1,$6,$7,coalesce($8::timestamptz,now())
       FROM creator.message WHERE thread_id=$1 RETURNING id`,
      [
        threadId,
        this.creator.id,
        fan.id,
        this.creator.account,
        text,
        signedActId,
        contentHash(command),
        createdAt?.toISOString() ?? null,
      ],
    );
    return result.rows[0]!.id;
  }

  /** A reply the creator did not write: an AI, team or fan message in the thread. */
  async otherMessage(
    fan: Person,
    authorKind: "ai" | "team" | "fan",
    text: string,
    authorAccount: string | null = null,
  ) {
    const threadId = await this.threadId(fan);
    const result = await this.admin.query<{ id: string }>(
      `INSERT INTO creator.message(thread_id,creator_id,fan_id,author_kind,author_account_id,text,delivery_state,control_epoch,sequence)
       SELECT $1,$2,$3,$4,$5,$6,'delivered',0,coalesce(max(sequence),0)+1 FROM creator.message WHERE thread_id=$1 RETURNING id`,
      [threadId, this.creator.id, fan.id, authorKind, authorAccount, text],
    );
    return result.rows[0]!.id;
  }

  deliver(
    packetId: string,
    messageId: string,
    actor: Actor = this.creator.actor,
  ) {
    return (async () =>
      this.service.deliver(actor, packetId, {
        version: (await this.commitments(packetId))[0]!.version,
        idempotencyKey: this.key("deliver"),
        messageId,
      }))();
  }

  // ------------------------------------------------------------ conservation

  /**
   * Money and slots add up. Every captured or refunded dollar at the provider
   * is in the ledger, nothing is captured without an accepted act, no hold is
   * left open on a closed request, and the capacity counters equal the number
   * of requests that hold or used a slot. Call it once every effect settled;
   * pass `settled: false` for the invariants that hold even mid-flight.
   */
  async assertConserved(options: { settled?: boolean } = {}) {
    const settled = options.settled ?? true;
    const packets = (
      await this.admin.query<{
        id: string;
        state: string;
        payment_state: string;
        accepted_act_id: string | null;
      }>(
        "SELECT id,state,payment_state,accepted_act_id FROM creator.commerce_packet WHERE creator_id=$1",
        [this.creator.id],
      )
    ).rows;
    const slotStates = [
      "submitting",
      "submitted",
      "more_info",
      "offer_pending",
      "accepting",
      "releasing",
    ];
    const liveStates = ["submitted", "more_info", "offer_pending"];
    const problems: string[] = [];
    let reserved = 0;
    let used = 0;
    for (const packet of packets) {
      if (slotStates.includes(packet.state)) reserved += 1;
      if (packet.state === "accepted") used += 1;
      const ledger = await this.ledger(packet.id);
      const total = (kind: string) =>
        ledger
          .filter((entry) => entry.kind === kind)
          .reduce((sum, entry) => sum + Number(entry.amount), 0);
      const intents = this.provider.intentFor(packet.id);
      const captured = intents.reduce((sum, i) => sum + i.amountReceived, 0);
      const refunded = intents.reduce((sum, i) => sum + i.refunded, 0);
      if (captured > 0 && !packet.accepted_act_id)
        problems.push(
          `${packet.id}: ${captured} captured without an accepted act`,
        );
      if (
        captured > 0 &&
        packet.state !== "accepted" &&
        packet.state !== "accepting"
      )
        problems.push(
          `${packet.id}: ${captured} captured while ${packet.state}`,
        );
      if (total("capture") > captured)
        problems.push(
          `${packet.id}: ledger shows a capture the provider never made`,
        );
      if (settled) {
        if (total("capture") !== captured)
          problems.push(
            `${packet.id}: ledger captured ${total("capture")}, provider ${captured}`,
          );
        if (total("refund") !== refunded)
          problems.push(
            `${packet.id}: ledger refunded ${total("refund")}, provider ${refunded}`,
          );
        const open = intents.filter(
          (i) => i.status === "requires_capture",
        ).length;
        const expected =
          liveStates.includes(packet.state) &&
          packet.payment_state === "requires_capture"
            ? 1
            : 0;
        if (open !== expected)
          problems.push(
            `${packet.id}: ${open} live holds, expected ${expected} while ${packet.state}/${packet.payment_state}`,
          );
      }
    }
    const capacity = await this.capacity();
    if (capacity.used < 0 || capacity.reserved < 0)
      problems.push(`negative capacity counter ${JSON.stringify(capacity)}`);
    if (capacity.used + capacity.reserved > capacity.capacity_limit)
      problems.push(`capacity overbooked ${JSON.stringify(capacity)}`);
    if (settled && packets.length > 0) {
      if (capacity.reserved !== reserved)
        problems.push(`reserved ${capacity.reserved}, expected ${reserved}`);
      if (capacity.used !== used)
        problems.push(`used ${capacity.used}, expected ${used}`);
    }
    if (problems.length)
      throw new Error(`Not conserved:\n${problems.join("\n")}`);
  }

  // -------------------------------------------------------------- time travel

  /** Put the decision deadline `seconds` from now (negative: already past). */
  async setDecisionAt(packetId: string, seconds: number) {
    await this.admin.query(
      "UPDATE creator.commerce_packet SET decision_at=now()+($2*interval '1 second') WHERE id=$1",
      [packetId, seconds],
    );
  }
  /** Put the end of the authorization `seconds` from now. */
  async setHoldExpiry(packetId: string, seconds: number) {
    await this.admin.query(
      "UPDATE creator.commerce_packet SET hold_expires_at=now()+($2*interval '1 second') WHERE id=$1",
      [packetId, seconds],
    );
  }
  async setDueAt(packetId: string, seconds: number) {
    await this.admin.query(
      "UPDATE creator.commerce_commitment SET due_at=now()+($2*interval '1 second') WHERE packet_id=$1",
      [packetId, seconds],
    );
  }
  async setAuthPendingUntil(packetId: string, seconds: number) {
    await this.admin.query(
      "UPDATE creator.commerce_packet SET auth_pending_until=now()+($2*interval '1 second') WHERE id=$1",
      [packetId, seconds],
    );
  }
  /** Make every unfinished effect of the packet claimable now, as if its backoff elapsed. */
  async makeEffectsDue(packetId: string) {
    await this.admin.query(
      "UPDATE creator.commerce_effect SET next_at=now()-interval '1 second',lease_until=NULL WHERE packet_id=$1 AND state<>'done'",
      [packetId],
    );
  }
  /** Expire the 30 second claim lease of an effect, as if its worker died. */
  async expireLease(effectId: string) {
    await this.admin.query(
      "UPDATE creator.commerce_effect SET lease_until=now()-interval '1 second' WHERE id=$1",
      [effectId],
    );
  }
}
