// The fake card processor for lane 4's money scenarios (the outer edge only).
// A loopback HTTP server answering the part of Stripe's REST API that the
// backend's own Stripe adapter calls: manual-capture PaymentIntents and refunds,
// with Stripe's status rules, idempotency and error shapes. The backend runs its
// real adapter code unchanged; stripe-edge.mjs sends its api.stripe.com calls
// here. Nothing reaches Stripe and no real key is used or accepted.
//
//   node tests/scenarios/lane-4/fake-stripe.mjs [port] [state file]
//
// Like the real processor it never forgets: every change is written to the
// state file (default: the lane 4 scenario directory in the system temporary
// directory), so a restart of this fake keeps every hold, capture and refund.
//
// Test payment methods (the API contract allows only letters and digits after
// "pm_"): pm_cardVisa holds and captures; pm_cardDeclined,
// pm_cardInsufficientFunds and pm_cardExpired decline the way Stripe's test
// cards do; pm_cardAuthRequired needs 3-D Secure; any other id is "No such
// PaymentMethod" (a 400, nothing created).
//
// Scenario controls (never called by the backend): GET /__state, and POST
// /__control with one of {fault}, {authenticate, ok}, {captureBefore, seconds},
// {expire}, {refundStatus}, {settleRefund, status}, {reset}. A fault is
// {op, phase: "before"|"after", status|drop|delayMs, times, method}: "before"
// fails without acting, "after" acts, stores the answer, then fails or drops it.
import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const port = Number(process.argv[2] ?? process.env.FAKE_STRIPE_PORT ?? 56444);
const file =
  process.argv[3] ??
  join(tmpdir(), "qelvora-lane4-scenarios", `fake-stripe-${port}.json`);
const WINDOW_SECONDS = 7 * 24 * 3600; // a card hold lives seven days
const METHODS = {
  pm_cardVisa: { outcome: "ok" },
  pm_cardDeclined: { outcome: "card_declined", decline: "generic_decline" },
  pm_cardInsufficientFunds: {
    outcome: "card_declined",
    decline: "insufficient_funds",
  },
  pm_cardExpired: { outcome: "expired_card", decline: "expired_card" },
  pm_cardAuthRequired: { outcome: "requires_action" },
};
let state;
const reset = () =>
  (state = {
    intents: new Map(),
    refunds: new Map(),
    stored: new Map(),
    faults: [],
    calls: [],
    serial: 0,
    refundStatus: "succeeded",
  });
const maps = ["intents", "refunds", "stored"];
function save() {
  const plain = { ...state };
  for (const name of maps) plain[name] = [...state[name]];
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  writeFileSync(`${file}.next`, JSON.stringify(plain));
  renameSync(`${file}.next`, file);
}
reset();
try {
  const saved = JSON.parse(readFileSync(file, "utf8"));
  for (const name of maps) saved[name] = new Map(saved[name]);
  state = { ...state, ...saved };
} catch {
  /* a fresh processor */
}
const now = () => Math.floor(Date.now() / 1000);
const id = (prefix) =>
  `${prefix}_fake${String(++state.serial).padStart(5, "0")}${randomBytes(3).toString("hex")}`;

/** Stripe's bracket encoding (metadata[a]=x, expand[0]=y) back into objects. */
function nest(params) {
  const out = {};
  for (const [key, value] of params) {
    const parts = key.replace(/\]/gu, "").split("[");
    let at = out;
    parts.forEach((part, i) => {
      const last = i === parts.length - 1;
      const next = /^\d+$/u.test(parts[i + 1] ?? "") ? [] : {};
      if (last) at[part] = value;
      else at = at[part] ??= next;
    });
  }
  return out;
}
const fail = (status, type, message, extra = {}) => ({
  status,
  body: { error: { type, message, ...extra } },
});
const missing = (what, ref) =>
  fail(404, "invalid_request_error", `No such ${what}: '${ref}'`, {
    code: "resource_missing",
  });
const unexpected = (pi, action) =>
  fail(
    400,
    "invalid_request_error",
    `This PaymentIntent could not be ${action} because it has a status of ${pi.status}.`,
    { code: "payment_intent_unexpected_state" },
  );

function lapse(pi) {
  // The issuer drops a hold whose capture window has passed: Stripe cancels it.
  if (pi.status === "requires_capture" && pi.captureBefore <= now())
    Object.assign(pi, {
      status: "canceled",
      cancellation_reason: "automatic",
      canceled_at: now(),
    });
  return pi;
}
const refundedOn = (pi) =>
  [...state.refunds.values()]
    .filter((r) => r.payment_intent === pi.id && r.status === "succeeded")
    .reduce((n, r) => n + r.amount, 0);
function view(pi, expand) {
  lapse(pi);
  const charge = pi.charge && {
    id: pi.charge,
    object: "charge",
    amount: pi.amount,
    currency: pi.currency,
    payment_intent: pi.id,
    status: pi.chargeFailed ? "failed" : "succeeded",
    paid: !pi.chargeFailed,
    captured: pi.status === "succeeded",
    amount_captured: pi.amount_received,
    amount_refunded: refundedOn(pi),
    refunded: pi.status === "succeeded" && refundedOn(pi) >= pi.amount,
    payment_method_details: {
      type: "card",
      card: {
        brand: "visa",
        last4: "4242",
        ...(pi.chargeFailed ? {} : { capture_before: pi.captureBefore }),
      },
    },
  };
  // The fake's own bookkeeping never appears in an API answer.
  const plain = { ...pi };
  for (const field of ["charge", "captureBefore", "chargeFailed"])
    delete plain[field];
  return {
    ...plain,
    amount_capturable: pi.status === "requires_capture" ? pi.amount : 0,
    latest_charge: charge
      ? expand?.includes("latest_charge")
        ? charge
        : charge.id
      : null,
  };
}
const refundView = (r) => ({ ...r });

const ops = {
  create(body) {
    const method = METHODS[body.payment_method];
    if (!method)
      return fail(
        400,
        "invalid_request_error",
        `No such PaymentMethod: '${body.payment_method}'`,
        { code: "resource_missing", param: "payment_method" },
      );
    const pi = {
      id: id("pi"),
      object: "payment_intent",
      amount: Number(body.amount),
      currency: body.currency,
      amount_received: 0,
      capture_method: body.capture_method,
      confirmation_method: "automatic",
      livemode: false,
      metadata: body.metadata ?? {},
      payment_method: body.payment_method,
      payment_method_types: ["card"],
      created: now(),
      canceled_at: null,
      cancellation_reason: null,
      last_payment_error: null,
      next_action: null,
      status: "requires_capture",
      charge: null,
    };
    pi.client_secret = `${pi.id}_secret_${randomBytes(6).toString("hex")}`;
    state.intents.set(pi.id, pi);
    if (method.outcome === "requires_action")
      Object.assign(pi, {
        status: "requires_action",
        next_action: { type: "use_stripe_sdk" },
      });
    else if (method.outcome === "ok")
      Object.assign(pi, {
        charge: id("ch"),
        captureBefore: now() + WINDOW_SECONDS,
      });
    else {
      Object.assign(pi, {
        status: "requires_payment_method",
        charge: id("ch"),
        chargeFailed: true,
        last_payment_error: {
          type: "card_error",
          code: method.outcome,
          decline_code: method.decline,
        },
      });
      return fail(402, "card_error", "Your card was declined.", {
        code: method.outcome,
        decline_code: method.decline,
        payment_intent: view(pi, []),
      });
    }
    return { status: 200, body: view(pi, body.expand) };
  },
  retrieve(body, [ref]) {
    const pi = state.intents.get(ref);
    return pi
      ? { status: 200, body: view(pi, body.expand) }
      : missing("payment_intent", ref);
  },
  capture(body, [ref]) {
    const pi = state.intents.get(ref);
    if (!pi) return missing("payment_intent", ref);
    if (lapse(pi).status !== "requires_capture")
      return unexpected(pi, "captured");
    Object.assign(pi, { status: "succeeded", amount_received: pi.amount });
    return { status: 200, body: view(pi, body.expand) };
  },
  cancel(body, [ref]) {
    const pi = state.intents.get(ref);
    if (!pi) return missing("payment_intent", ref);
    if (["succeeded", "canceled"].includes(lapse(pi).status))
      return unexpected(pi, "canceled");
    Object.assign(pi, {
      status: "canceled",
      cancellation_reason: body.cancellation_reason ?? null,
      canceled_at: now(),
    });
    return { status: 200, body: view(pi, body.expand) };
  },
  list_intents: (query) =>
    page(
      [...state.intents.values()].map((pi) => view(pi, [])),
      query,
      "/v1/payment_intents",
    ),
  refund(body) {
    const pi = state.intents.get(body.payment_intent);
    if (!pi) return missing("payment_intent", body.payment_intent);
    const amount = Number(body.amount ?? pi.amount_received);
    const committed = [...state.refunds.values()]
      .filter((r) => r.payment_intent === pi.id && r.status !== "failed")
      .reduce((n, r) => n + r.amount, 0);
    if (lapse(pi).status !== "succeeded")
      return fail(
        400,
        "invalid_request_error",
        `This PaymentIntent (${pi.id}) does not have a successful charge to refund.`,
        { code: "charge_not_refundable" },
      );
    if (!(amount > 0) || committed + amount > pi.amount_received)
      return fail(
        400,
        "invalid_request_error",
        "Refund amount is greater than the unrefunded amount on the charge.",
        { code: "amount_too_large" },
      );
    const refund = {
      id: id("re"),
      object: "refund",
      amount,
      currency: pi.currency,
      payment_intent: pi.id,
      charge: pi.charge,
      status: state.refundStatus,
      metadata: body.metadata ?? {},
      created: now(),
    };
    state.refunds.set(refund.id, refund);
    return { status: 200, body: refundView(refund) };
  },
  list_refunds: (query) =>
    page(
      [...state.refunds.values()]
        .filter(
          (r) =>
            !query.payment_intent || r.payment_intent === query.payment_intent,
        )
        .map(refundView),
      query,
      "/v1/refunds",
    ),
  retrieve_refund(_body, [ref]) {
    const refund = state.refunds.get(ref);
    return refund
      ? { status: 200, body: refundView(refund) }
      : missing("refund", ref);
  },
};
function page(items, query, url) {
  // Newest first, as Stripe lists; `starting_after` continues after an id.
  const all = items.reverse();
  const from = query.starting_after
    ? all.findIndex((x) => x.id === query.starting_after) + 1
    : 0;
  const limit = Math.min(Number(query.limit ?? 10), 100);
  return {
    status: 200,
    body: {
      object: "list",
      url,
      has_more: from + limit < all.length,
      data: all.slice(from, from + limit),
    },
  };
}
const routes = [
  ["POST", /^\/v1\/payment_intents$/u, "create"],
  ["GET", /^\/v1\/payment_intents$/u, "list_intents"],
  ["GET", /^\/v1\/payment_intents\/([^/]+)$/u, "retrieve"],
  ["POST", /^\/v1\/payment_intents\/([^/]+)\/capture$/u, "capture"],
  ["POST", /^\/v1\/payment_intents\/([^/]+)\/cancel$/u, "cancel"],
  ["POST", /^\/v1\/refunds$/u, "refund"],
  ["GET", /^\/v1\/refunds$/u, "list_refunds"],
  ["GET", /^\/v1\/refunds\/([^/]+)$/u, "retrieve_refund"],
];

function control(body) {
  if (body.reset) reset();
  if (body.fault)
    state.faults.push({ phase: "before", times: 1, ...body.fault });
  if (body.clearFaults) state.faults = [];
  if (body.refundStatus) state.refundStatus = body.refundStatus;
  const pi = state.intents.get(
    body.authenticate ?? body.captureBefore ?? body.expire,
  );
  if (body.authenticate && pi?.status === "requires_action")
    Object.assign(
      pi,
      body.ok === false
        ? {
            status: "requires_payment_method",
            next_action: null,
            last_payment_error: {
              type: "card_error",
              code: "payment_intent_authentication_failure",
            },
          }
        : {
            status: "requires_capture",
            next_action: null,
            charge: id("ch"),
            captureBefore: now() + WINDOW_SECONDS,
          },
    );
  if (body.captureBefore && pi) pi.captureBefore = now() + Number(body.seconds);
  if (body.expire && pi) pi.captureBefore = now() - 1;
  const refund = state.refunds.get(body.settleRefund);
  if (refund) refund.status = body.status;
  return { ok: true };
}
const snapshot = () => ({
  intents: [...state.intents.values()].map((pi) => ({
    ...view(pi, []),
    captureBefore: pi.captureBefore ?? null,
    refunded: refundedOn(pi),
  })),
  refunds: [...state.refunds.values()],
  calls: state.calls.slice(-500),
});

createServer((req, res) => {
  let raw = "";
  req.on("data", (chunk) => (raw += chunk));
  req.on("end", async () => {
    const url = new URL(req.url, "http://fake");
    const send = (status, body, headers = {}) => {
      res.writeHead(status, {
        "content-type": "application/json",
        "request-id": `req_${randomBytes(6).toString("hex")}`,
        ...headers,
      });
      res.end(JSON.stringify(body));
    };
    if (url.pathname === "/__state") return send(200, snapshot());
    if (url.pathname === "/__control") {
      const result = control(JSON.parse(raw || "{}"));
      save();
      return send(200, result);
    }
    const route = routes.find(
      ([method, pattern]) =>
        method === req.method && pattern.test(url.pathname),
    );
    if (!route)
      return send(
        404,
        fail(404, "invalid_request_error", "Unrecognized request URL.").body,
      );
    const op = route[2];
    const args = url.pathname.match(route[1]).slice(1);
    const body =
      req.method === "GET"
        ? nest(url.searchParams)
        : nest(new URLSearchParams(raw));
    const key = req.headers["idempotency-key"];
    const call = {
      seq: state.calls.length + 1,
      op,
      ref: args[0] ?? body.payment_intent ?? null,
      key: key ?? null,
      amount: body.amount ? Number(body.amount) : null,
      method: body.payment_method ?? null,
      replayed: false,
      status: 0,
    };
    state.calls.push(call);
    const fault = state.faults.find(
      (f) =>
        f.op === op &&
        f.times > 0 &&
        (!f.method || f.method === body.payment_method),
    );
    if (fault) fault.times -= 1;
    if (fault?.delayMs) await new Promise((r) => setTimeout(r, fault.delayMs));
    if (fault?.phase === "before") {
      call.status = fault.status ?? "dropped";
      save();
      if (fault.drop || !fault.status) return req.socket.destroy();
      return send(
        fault.status,
        fail(
          fault.status,
          fault.status >= 500 ? "api_error" : "invalid_request_error",
          "Injected processor failure.",
        ).body,
      );
    }
    let answer;
    const fingerprint = JSON.stringify([req.method, url.pathname, raw]);
    const stored = key && state.stored.get(key);
    if (stored && stored.fingerprint !== fingerprint)
      answer = fail(
        400,
        "idempotency_error",
        "Keys for idempotent requests can only be used with the same parameters they were first used with.",
      );
    else if (stored) {
      answer = stored.answer;
      call.replayed = true;
    } else {
      answer = ops[op](body, args);
      // Stripe keeps the first answer of every request that began executing.
      if (
        key &&
        !(
          answer.status === 400 && answer.body.error.code === "resource_missing"
        )
      )
        state.stored.set(key, { fingerprint, answer });
    }
    call.status = answer.status;
    if (fault?.phase === "after")
      call.status = `${answer.status} then ${fault.status ?? "dropped"}`;
    save();
    if (fault?.phase === "after") {
      if (fault.drop || !fault.status) return req.socket.destroy();
      return send(
        fault.status,
        fail(
          fault.status,
          "api_error",
          "Injected processor failure after acting.",
        ).body,
      );
    }
    send(
      answer.status,
      answer.body,
      call.replayed ? { "idempotent-replayed": "true" } : {},
    );
  });
}).listen(port, "127.0.0.1", () =>
  process.stdout.write(
    `Fake Stripe on 127.0.0.1:${port} (scenario controls at /__control, truth at /__state)\n`,
  ),
);
