"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import Link from "next/link";
import {
  AccessLines,
  RequestStatus,
  Receipt,
  Seal,
  TermsBlock,
} from "@qelvora/ui-web";
import { copy, formatCopy } from "@qelvora/copy";
import { brand } from "@qelvora/brand";
import { SessionSchema, type commerceContracts } from "@qelvora/api";
import "./commerce.css";
import { CardEntry, authenticateCard } from "./CardEntry";

type Mode = {
  id: string;
  creator_id: string;
  title: string;
  kind: string;
  amount: string | null;
  public_amount: string | null;
  currency: string;
  weekly_limit: number;
  used: number;
  reserved: number;
  decision_hours: number;
  delivery_hours: number;
  duration_seconds: number | null;
  shareable: boolean;
  state: string;
  version: number;
};
type Packet = {
  id: string;
  creator_id: string;
  fan_id: string;
  proposed_mode?: {
    title?: string;
    kind: string;
    amount: string;
    version: number;
    publicAmount?: number;
    currency: string;
    fanConsented?: boolean;
  } | null;
  snapshot: {
    title: string;
    mode: string;
    amount: number;
    currency: string;
    decisionHours: number;
    deliveryHours: number;
    shareable: boolean;
  };
  state: string;
  payment_state: string;
  version: number;
  created_at: string;
  submitted_at: string | null;
  accepted_at: string | null;
  decision_at: string | null;
  hold_expires_at: string | null;
  question?: string;
  disclosure: { summary?: string };
  commitment_id?: string;
  commitment_state?: string;
  due_at?: string;
  delivered_at?: string;
};
type Ledger = {
  id: string;
  packet_id: string | null;
  creator_id: string;
  fan_id: string | null;
  kind: string;
  amount: string;
  currency: string;
  cause: string;
  created_at: string;
};
type Limit = {
  currency: string;
  amount: string | null;
  explicit_none: boolean;
  pending_amount: string | null;
  pending_none: boolean | null;
  effective_at: string | null;
  reminders_on: boolean;
  version: number;
};
type Overview = {
  fan: { id: string; handle: string } | null;
  creators: { id: string; display_name: string; handle: string }[];
  owned: { id: string; display_name: string; verification: string }[];
  packets: Packet[];
  modes: Mode[];
  memberships: {
    id: string;
    creator_id: string;
    name: string;
    state: string;
    period_end: string;
    cancel_at_end: boolean;
    provider: string;
    version: number;
  }[];
  tiers: {
    id: string;
    creator_id: string;
    name: string;
    version: number;
    state: string;
    capabilities: string[];
    ai_allowance: number;
    catalog: {
      key?: string;
      web?: { amount: number; currency: string; interval: "month" };
    };
  }[];
  spendingNotices: { id: string; threshold: number; created_at: string }[];
  tierCatalog: {
    creatorId: string;
    products: { key: string; label: string }[];
  }[];
  payoutAccounts: { creator_id: string; state: string; details_due: boolean }[];
  limits: Limit[];
  exposure: {
    captured: number;
    held: number;
    total: number;
    currency: string;
  } | null;
  ledger: Ledger[];
  pass: {
    id: string;
    version: number;
    slot_capacity: number;
    cycle_start: string;
    cycle_end: string;
    allowance: number;
    used: number;
    reserved: number;
    state: string;
  }[];
  passChoices: {
    creators: { id: string; display_name: string }[];
    replaceableSlotIds: string[];
  };
  slots: {
    id: string;
    display_name: string;
    creator_id: string;
    cycle_start: string;
    state: string;
    position: number;
    ends_at: string;
  }[];
  policy: { currency: string; limitOptions: number[]; passEnabled: boolean };
  capabilities: {
    paymentsAvailable: boolean;
    membershipAvailable: boolean;
    nativeReplyPurchase: boolean;
    stripePublishableKey: string | null;
  };
};
type Detail = {
  packet: Packet;
  commitment: {
    id: string;
    state: string;
    version: number;
    due_at: string;
    delivered_at: string | null;
    accept_act_id?: string;
    evidence?: { signedActId: string; authorKind: string };
  } | null;
  ledger: Ledger[];
  share: {
    version: number;
    fan_choice: boolean;
    revoked_at: string | null;
  } | null;
};
const titles: Record<string, string> = {
  requests: "Requests",
  spending: "Spending and time",
  access: "Access",
  packet: "Included in your request",
  checkout: "A hold, not a charge",
  status: "Your request",
  pass: "Your pass",
  offers: "Your prices, your deadlines",
  earnings: "Earnings",
  pool: "Pool earnings",
  membership: "Manage membership",
};
const modesNames: Record<string, string> = {
  written_reply: "Written reply",
  voice_note: "Voice note",
  audio_call: "Audio call",
  video_call: "Video call",
  group_answer: "Group answer",
  guaranteed_review: "Guaranteed review",
};
function money(amount: number | string | bigint, currency: string) {
  const digits =
    new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
    }).resolvedOptions().maximumFractionDigits ?? 2;
  const formatter = new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
  });
  const value = BigInt(amount),
    divisor = 10n ** BigInt(digits),
    fraction = value % divisor;
  const localizedFraction = new Intl.NumberFormat(undefined, {
    minimumIntegerDigits: Math.max(1, digits),
    maximumFractionDigits: 0,
    useGrouping: false,
  }).format(fraction);
  return formatter
    .formatToParts(value / divisor)
    .map((part) => (part.type === "fraction" ? localizedFraction : part.value))
    .join("");
}
function minor(value: string, currency: string) {
  const digits =
    new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
    }).resolvedOptions().maximumFractionDigits ?? 2;
  if (!new RegExp(`^\\d+(?:\\.\\d{0,${digits}})?$`, "u").test(value))
    throw new Error("Enter a valid amount.");
  const [whole, fraction = ""] = value.split(".");
  const result =
    BigInt(whole!) * 10n ** BigInt(digits) +
    BigInt(fraction.padEnd(digits, "0") || "0");
  if (result > BigInt(Number.MAX_SAFE_INTEGER))
    throw new Error("This amount is too large.");
  return Number(result);
}
function date(value: string | null | undefined) {
  return value
    ? new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(value))
    : "—";
}
function requestId(id: string) {
  return `REQ-${id.slice(0, 8).toUpperCase()}`;
}
async function commerceFetch(path: string, init: RequestInit = {}) {
  let response = await fetch(path, { ...init, cache: "no-store" });
  if (response.status === 401) {
    const refresh = await fetch("/api/platform/identity/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    if (refresh.ok)
      response = await fetch(path, { ...init, cache: "no-store" });
  }
  return response;
}
function Button({
  children,
  onClick,
  disabled = false,
  type = "button",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      className="qv qv-btn qv-btn--secondary qv-btn--lg"
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
function Empty({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="commerce-empty">
      <h2>{title}</h2>
      <p>{children}</p>
    </section>
  );
}
function status(p: Packet, name: string) {
  if (p.state === "declined") return formatCopy("declined", { name });
  if (p.state === "expired") return formatCopy("expired", { name });
  if (p.state === "withdrawn")
    return "Request withdrawn · the hold was released";
  if (
    p.payment_state === "unknown" ||
    ["accepting", "releasing"].includes(p.state)
  )
    return "Confirming payment · check again shortly";
  if (p.payment_state === "refunded") return "Refund confirmed";
  if (p.payment_state === "requires_action")
    return "Your bank needs authentication · nothing shared yet";
  if (p.payment_state === "failed") return copy.paymentFailed;
  if (p.state === "more_info")
    return `${name} asked for more information · your bank hold still expires`;
  if (p.state === "offer_pending")
    return "A changed offer is waiting for your choice";
  if (p.commitment_state === "delivered")
    return "Delivered · your receipt is below";
  return p.state === "accepted"
    ? "Accepted · charged once"
    : "Seen by the queue · charged only on acceptance";
}

type CommerceScreenProps = {
  screen: string;
  creatorId?: string;
  packetId?: string;
  accountId: string | null;
};
function commerceDestination({
  screen,
  creatorId,
  packetId,
}: CommerceScreenProps) {
  const query = new URLSearchParams();
  if (creatorId) query.set("creatorId", creatorId);
  if (packetId) query.set("packetId", packetId);
  const suffix = query.toString();
  return `/commerce/${screen}${suffix ? `?${suffix}` : ""}`;
}
export function CommerceScreen(props: CommerceScreenProps) {
  const [ended, setEnded] = useState(false);
  const [identityAvailable, setIdentityAvailable] = useState(
    Boolean(props.accountId),
  );
  useEffect(() => {
    let active = true;
    let checking = false;
    const abort = new AbortController();
    const check = async () => {
      if (checking || document.visibilityState !== "visible") return;
      checking = true;
      try {
        const response = await commerceFetch("/api/platform/identity/session", {
          signal: AbortSignal.any([abort.signal, AbortSignal.timeout(5000)]),
        });
        if (!active) return;
        if (response.status === 401) {
          setEnded(true);
          return;
        }
        if (!response.ok) throw new Error("Session unavailable");
        const session = SessionSchema.parse(await response.json());
        if (!active) return;
        if (session.accountId !== props.accountId) {
          setEnded(true);
          return;
        }
        setIdentityAvailable(true);
      } catch {
        if (active) setIdentityAvailable(false);
      } finally {
        checking = false;
      }
    };
    void check();
    const timer = setInterval(() => void check(), 4000);
    document.addEventListener("visibilitychange", check);
    return () => {
      active = false;
      abort.abort();
      clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
    };
  }, [props.accountId]);
  if (ended || !props.accountId)
    return (
      <div className="commerce commerce-phone">
        <main className="commerce-main commerce-content">
          <Empty title="Continue with Pantopus">
            Your session ended or the account changed. Continue to load this
            account’s current commerce information.
            <Link
              className="commerce-link-button"
              href={`/auth/continue?returnTo=${encodeURIComponent(commerceDestination(props))}`}
            >
              {copy.continueWithPantopus}
            </Link>
          </Empty>
        </main>
      </div>
    );
  return (
    <CommerceAccountScreen {...props} identityAvailable={identityAvailable} />
  );
}
function CommerceAccountScreen({
  screen,
  creatorId,
  packetId,
  accountId,
  identityAvailable,
}: {
  screen: string;
  creatorId?: string;
  packetId?: string;
  accountId: string | null;
  identityAvailable: boolean;
}) {
  const accountFetch = useCallback(
    (path: string, init: RequestInit = {}) => {
      const headers = new Headers(init.headers);
      if (accountId) headers.set("x-commerce-account-id", accountId);
      return commerceFetch(path, { ...init, headers });
    },
    [accountId],
  );
  const [data, setData] = useState<Overview | null>(null),
    [detail, setDetail] = useState<Detail | null>(null),
    [error, setError] = useState<string | null>(null),
    [errorCode, setErrorCode] = useState(""),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  const [selectedCreator, setSelectedCreator] = useState(creatorId ?? ""),
    [selectedMode, setSelectedMode] = useState(""),
    [visibility, setVisibility] = useState<"private" | "public">("private"),
    [summary, setSummary] = useState(""),
    [includeSummary, setIncludeSummary] = useState(true),
    [recent, setRecent] = useState(true),
    [whole, setWhole] = useState(false),
    [filter, setFilter] = useState("Open");
  const pending = useRef(new Map<string, string>());
  const [membershipTier, setMembershipTier] = useState<string | null>(null);
  const [editingModeId, setEditingModeId] = useState<string | null>(null);
  const [editingTierId, setEditingTierId] = useState<string | null>(null);
  const [checkout, setCheckout] = useState(false),
    [disclosure, setDisclosure] = useState<{
      messages: {
        id: string;
        author_kind: string;
        text: string;
        version: number;
      }[];
      recentIds: string[];
      accessNoticeVersion: string;
    } | null>(null);
  useEffect(() => {
    if (screen !== "packet" || !selectedCreator || !data?.fan) return;
    const abort = new AbortController();
    setDisclosure(null);
    void accountFetch(
      `/api/commerce/creators/${selectedCreator}/fans/${data.fan.id}/disclosure`,
      { cache: "no-store", signal: abort.signal },
    )
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok)
          throw new Error(
            body.error?.message ?? "Conversation disclosure is unavailable.",
          );
        if (!abort.signal.aborted) setDisclosure(body);
      })
      .catch((error) => {
        if (!abort.signal.aborted)
          setNotice(
            error instanceof Error
              ? error.message
              : "Conversation disclosure is unavailable.",
          );
      });
    return () => abort.abort();
  }, [screen, selectedCreator, data?.fan?.id, accountFetch]);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await accountFetch(
        `/api/commerce/overview${creatorId ? `?creatorId=${encodeURIComponent(creatorId)}` : ""}`,
        { cache: "no-store" },
      );
      const body = await response.json();
      if (!response.ok) {
        setErrorCode(
          response.status === 401
            ? "session_required"
            : (body.error?.code ?? ""),
        );
        if (response.status === 401) {
          setData(null);
          setDetail(null);
          setDisclosure(null);
          setSummary("");
          pending.current.clear();
        }
        throw new Error(
          body.error?.message ?? "This information is unavailable.",
        );
      }
      setData(body);
      setError(null);
      if (packetId) {
        const response = await accountFetch(
          `/api/commerce/packets/${packetId}`,
          {
            cache: "no-store",
          },
        );
        const body = await response.json();
        if (!response.ok)
          throw new Error(
            body.error?.message ?? "This request is unavailable.",
          );
        setDetail(body);
      }
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "The connection is unavailable.",
      );
    } finally {
      setLoading(false);
    }
  }, [creatorId, packetId, accountFetch]);
  useEffect(() => {
    void load();
  }, [load]);
  async function command(path: string, body: Record<string, unknown>) {
    if (busy) return;
    setBusy(true);
    setNotice("");
    const signature = JSON.stringify({ path, body });
    const key = pending.current.get(signature) ?? crypto.randomUUID();
    pending.current.set(signature, key);
    try {
      if (!identityAvailable)
        throw new Error("Reconnect to confirm your account before continuing.");
      const sessionResponse = await accountFetch(
        "/api/platform/identity/session",
        { signal: AbortSignal.timeout(5000) },
      );
      if (
        !sessionResponse.ok ||
        SessionSchema.parse(await sessionResponse.json()).accountId !==
          accountId
      )
        throw new Error(
          "Your session changed. Continue with Pantopus to refresh this account.",
        );
      const response = await accountFetch(`/api/commerce/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, idempotencyKey: key }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error?.message ?? "This action is unavailable.");
      pending.current.delete(signature);
      setNotice(
        result.delay
          ? "Your increase takes effect in 24 hours. Your current limit still applies."
          : result.processing
            ? "Processing. Check the current provider state before retrying."
            : result.state === "failed"
              ? "The provider did not complete this action. No new payment was attempted."
              : "Saved.",
      );
      await load();
      return result;
    } catch (e) {
      setNotice(
        e instanceof Error
          ? e.message
          : "Your action could not be confirmed. Check the current state before retrying.",
      );
    } finally {
      setBusy(false);
    }
  }
  const studio = ["offers", "earnings", "pool"].includes(screen);
  const currency = data?.policy.currency ?? "USD";
  const activeCreator = selectedCreator || data?.creators[0]?.id || "";
  const [access, setAccess] = useState<{
    value: commerceContracts.CapabilitySnapshot;
    receivedAt: number;
  } | null>(null);
  const [accessNow, setAccessNow] = useState(0);
  useEffect(() => {
    setAccess(null);
    setAccessNow(Date.now());
    if (
      screen !== "access" ||
      !identityAvailable ||
      !activeCreator ||
      !data?.fan
    )
      return;
    const fanId = data.fan.id;
    const abort = new AbortController();
    let checking = false;
    const check = async () => {
      if (checking || document.visibilityState !== "visible") return;
      checking = true;
      const checkedAt = Date.now();
      setAccessNow(checkedAt);
      try {
        const response = await accountFetch(
          `/api/commerce/creators/${activeCreator}/fans/${fanId}/access`,
          {
            signal: AbortSignal.any([abort.signal, AbortSignal.timeout(5000)]),
          },
        );
        const value: commerceContracts.CapabilitySnapshot =
          await response.json();
        if (abort.signal.aborted) return;
        if (
          !response.ok ||
          value.creatorId !== activeCreator ||
          value.fanId !== fanId
        )
          throw new Error("Current access is unavailable.");
        setAccess({ value, receivedAt: checkedAt });
        setAccessNow(Date.now());
      } catch {
        if (!abort.signal.aborted) setAccess(null);
      } finally {
        checking = false;
      }
    };
    void check();
    const refresh = setInterval(() => void check(), 4000);
    const clock = setInterval(() => setAccessNow(Date.now()), 1000);
    document.addEventListener("visibilitychange", check);
    return () => {
      abort.abort();
      clearInterval(refresh);
      clearInterval(clock);
      document.removeEventListener("visibilitychange", check);
    };
  }, [screen, activeCreator, data?.fan?.id, identityAvailable, accountFetch]);
  const currentAccess =
    access &&
    access.value.creatorId === activeCreator &&
    access.value.fanId === data?.fan?.id &&
    accessNow - access.receivedAt < 5000 &&
    (!access.value.validUntil ||
      Date.parse(access.value.validUntil) > accessNow)
      ? access.value
      : null;
  const paidMemberships =
    data?.memberships.filter(
      (m) =>
        m.creator_id === activeCreator &&
        ["active", "grace", "cancelled"].includes(m.state) &&
        Date.parse(m.period_end) > accessNow,
    ) ?? [];
  const accessChanges = [
    ...paidMemberships.map(
      (m) =>
        `${m.name}: ${m.cancel_at_end || m.state === "cancelled" ? "ends" : "renews"} ${date(m.period_end)}`,
    ),
    ...(currentAccess?.sources
      .filter((s) => s.source !== "membership")
      .map(
        (s) =>
          `${{ pass_slot: "Pass AI reach", trial: "Conversation trial", comp: "Gifted access", commitment: "Accepted service" }[s.source] ?? "Access"} ends ${date(s.validUntil)}`,
      ) ?? []),
  ].join("; ");
  const name =
    data?.creators.find((c) => c.id === activeCreator)?.display_name ??
    "the creator";
  const modes =
    data?.modes.filter(
      (m) => m.creator_id === activeCreator && m.state !== "hidden",
    ) ?? [];
  const chosen = modes.find((m) => m.id === selectedMode);
  const limit = data?.limits.find((l) => l.currency === currency);
  const earningsCreator = data?.owned.find(
    (c) =>
      c.id === (creatorId ?? data.owned[0]?.id) &&
      c.verification === "verified",
  )?.id;
  const creatorLedger =
    data?.ledger.filter((l) => l.creator_id === earningsCreator) ?? [];
  const selectedTier = data?.tiers.find((t) => t.id === membershipTier);
  const suffix = activeCreator ? `?creatorId=${activeCreator}` : "";
  function creatorPicker() {
    return (
      <label className="commerce-field">
        Creator
        <select
          value={activeCreator}
          onChange={(e) => {
            setSelectedCreator(e.target.value);
            setSelectedMode("");
          }}
        >
          {data?.creators.map((c) => (
            <option key={c.id} value={c.id}>
              {c.display_name}
            </option>
          ))}
        </select>
      </label>
    );
  }
  return (
    <div
      className={`commerce ${studio ? "commerce-studio" : "commerce-phone"}`}
    >
      {studio && (
        <aside className="commerce-sidebar">
          <Link href="/">{brand.name} Studio</Link>
          <nav aria-label="Commerce Studio">
            <Link
              href={`/commerce/offers${suffix}`}
              aria-current={screen === "offers" ? "page" : undefined}
            >
              Offers
            </Link>
            <Link
              href={`/commerce/earnings${suffix}`}
              aria-current={screen === "earnings" ? "page" : undefined}
            >
              Earnings
            </Link>
            {data?.policy.passEnabled && (
              <Link href={`/commerce/pool${suffix}`}>Pool earnings</Link>
            )}
          </nav>
        </aside>
      )}
      <main className="commerce-main">
        <header className="commerce-header">
          <Link href="/commerce/requests" aria-label="Back to requests">
            ‹
          </Link>
          {screen === "spending" ? (
            <h1 className="commerce-header-title">Spending and time</h1>
          ) : (
            <span className="qv-meta">
              {studio ? "STUDIO" : titles[screen]}
            </span>
          )}
          <button
            className="commerce-refresh"
            onClick={() => void load()}
            disabled={busy || loading}
            aria-label="Refresh current state"
          >
            Refresh
          </button>
        </header>
        <div
          className={`commerce-content ${["packet", "checkout"].includes(screen) ? "commerce-sheet" : ""}`}
        >
          {["packet", "checkout"].includes(screen) && (
            <div className="commerce-grabber" aria-hidden="true" />
          )}
          {screen !== "spending" && <h1>{titles[screen]}</h1>}
          <p className="commerce-announcement" role="status" aria-live="polite">
            {notice}
          </p>
          {!identityAvailable && (
            <p role="status">
              Reconnect to confirm your account. Your input is kept.
            </p>
          )}
          {loading && !data && (
            <p role="status">Loading current information…</p>
          )}
          {error && (
            <Empty
              title={
                errorCode === "session_required"
                  ? "Continue with Pantopus"
                  : "This information is unavailable"
              }
            >
              <span>{error}</span>
              <br />
              {errorCode === "session_required" ? (
                <Link
                  href={`/auth/continue?returnTo=${encodeURIComponent(commerceDestination({ screen, creatorId, packetId, accountId }))}`}
                >
                  {copy.continueWithPantopus}
                </Link>
              ) : (
                <Button onClick={() => void load()}>Retry</Button>
              )}
            </Empty>
          )}
          {data && (
            <>
              {screen === "requests" && (
                <>
                  <div
                    className="commerce-segments"
                    role="group"
                    aria-label="Request category"
                  >
                    {["Open", "Delivered", "Closed"].map((f) => (
                      <button
                        key={f}
                        aria-pressed={filter === f}
                        onClick={() => setFilter(f)}
                      >
                        {f}
                      </button>
                    ))}
                  </div>
                  {data.packets
                    .filter((p) =>
                      filter === "Open"
                        ? !["declined", "expired", "withdrawn"].includes(
                            p.state,
                          ) && p.commitment_state !== "delivered"
                        : filter === "Delivered"
                          ? p.commitment_state === "delivered"
                          : ["declined", "expired", "withdrawn"].includes(
                              p.state,
                            ),
                    )
                    .map((p) => (
                      <Link
                        className="commerce-request-link"
                        key={p.id}
                        href={`/commerce/status?packetId=${p.id}`}
                      >
                        <RequestStatus
                          reqId={requestId(p.id)}
                          mode={p.snapshot.title}
                          price={money(p.snapshot.amount, p.snapshot.currency)}
                          steps={[
                            {
                              label:
                                p.state === "accepted"
                                  ? "Accepted · charged"
                                  : "Request sent",
                              time: date(p.submitted_at),
                              state: "done",
                            },
                            {
                              label:
                                p.commitment_state === "delivered"
                                  ? "Delivered"
                                  : `Decision by ${date(p.decision_at)}`,
                              time: date(p.delivered_at),
                              state:
                                p.commitment_state === "delivered"
                                  ? "done"
                                  : "current",
                            },
                          ]}
                          outcome={status(
                            p,
                            data.creators.find((c) => c.id === p.creator_id)
                              ?.display_name ?? "The creator",
                          )}
                        />
                      </Link>
                    ))}
                  {!data.packets.length && (
                    <Empty title="No requests yet">
                      Your requests and receipts will appear here.{" "}
                      <Link href="/commerce/access">See your access</Link>
                    </Empty>
                  )}
                </>
              )}
              {screen === "spending" && (
                <>
                  <span className="qv-meta">
                    {new Intl.DateTimeFormat(undefined, {
                      month: "long",
                      year: "numeric",
                    })
                      .format(new Date())
                      .toUpperCase()}
                  </span>
                  <div className="commerce-spend-total">
                    {money(data.exposure?.captured ?? 0, currency)}
                  </div>
                  <p>
                    {limit?.explicit_none
                      ? "No monthly limit chosen explicitly"
                      : limit
                        ? `of your ${money(limit.amount ?? 0, currency)} monthly limit`
                        : "Choose a monthly limit before your first paid action."}
                  </p>
                  <div
                    className="commerce-progress"
                    role="progressbar"
                    aria-label="Monthly exposure"
                    aria-valuemin={0}
                    aria-valuemax={
                      limit?.amount ? Number(limit.amount) : undefined
                    }
                    aria-valuenow={data.exposure?.total ?? 0}
                  >
                    <span
                      style={{
                        width: `${limit?.amount ? Math.min(100, ((data.exposure?.total ?? 0) / Number(limit.amount)) * 100) : 0}%`,
                      }}
                    />
                  </div>
                  <dl className="commerce-rows">
                    <dt>Captured this month</dt>
                    <dd>{money(data.exposure?.captured ?? 0, currency)}</dd>
                    <dt>Pending holds and requests</dt>
                    <dd>{money(data.exposure?.held ?? 0, currency)}</dd>
                    <dt>Refunds recorded</dt>
                    <dd>
                      {money(
                        data.ledger
                          .filter(
                            (l) =>
                              l.kind === "refund" &&
                              l.currency === currency &&
                              l.fan_id === data.fan?.id &&
                              l.created_at.slice(0, 7) ===
                                new Date().toISOString().slice(0, 7),
                          )
                          .reduce((a, l) => a + BigInt(l.amount), 0n),
                        currency,
                      )}
                    </dd>
                  </dl>
                  {data.spendingNotices.map((n) => (
                    <p role="status" className="commerce-help" key={n.id}>
                      You’ve reached {n.threshold}% of your monthly limit.
                    </p>
                  ))}
                  <LimitForm
                    key={`${currency}:${limit?.version ?? 0}`}
                    currency={currency}
                    limit={limit}
                    busy={busy}
                    save={(body) => void command("spend-limit", body)}
                  />
                  {limit?.effective_at && (
                    <p className="commerce-help">
                      Pending increase:{" "}
                      {limit.pending_none
                        ? "No limit"
                        : money(limit.pending_amount ?? 0, currency)}{" "}
                      · {date(limit.effective_at)}. Your current limit applies
                      until then.
                    </p>
                  )}
                  <p className="commerce-help">
                    Lowering takes effect now and blocks new spending above the
                    cap. Existing accepted services and bank holds remain
                    visible.
                  </p>
                  <Link href="/commerce/membership">Manage memberships</Link>
                  <Empty title="Time with your AIs">
                    Usage information is not connected yet.
                  </Empty>
                </>
              )}
              {screen === "access" && (
                <>
                  {creatorPicker()}
                  <AccessLines
                    name={name}
                    can={
                      currentAccess
                        ? [
                            currentAccess.capabilities.includes("ai_message")
                              ? currentAccess.allowance.available > 0
                                ? "Message this AI."
                                : "Your AI allowance is used for this period."
                              : "",
                            currentAccess.capabilities.includes("note")
                              ? "Read included notes."
                              : "",
                            currentAccess.capabilities.includes("request")
                              ? "Request available services."
                              : "",
                          ]
                            .filter(Boolean)
                            .join(" ") || "Read your existing conversations."
                        : "Current access is unavailable. Refresh to try again."
                    }
                    included={
                      currentAccess
                        ? [
                            ...new Set(
                              currentAccess.sources.map(
                                (s) =>
                                  ({
                                    membership: "Membership",
                                    comp: "Gifted access",
                                    commitment: "Accepted service",
                                    pass_slot: "Pass AI reach",
                                    trial: "Conversation trial",
                                  })[s.source] ?? "Current access",
                              ),
                            ),
                          ]
                            .sort()
                            .join(", ") ||
                          "No included access for this creator."
                        : "Benefits cannot be confirmed."
                    }
                    byRequest={
                      modes.some(
                        (m) =>
                          m.state === "offered" &&
                          m.used + m.reserved < m.weekly_limit,
                      )
                        ? modes
                            .filter(
                              (m) =>
                                m.state === "offered" &&
                                m.used + m.reserved < m.weekly_limit,
                            )
                            .map((m) => m.title)
                            .join(", ")
                        : "No human modes are currently available."
                    }
                    changes={
                      accessChanges || "Access refreshes from the server."
                    }
                  />
                  <h2>By request</h2>
                  {modes
                    .filter((m) => m.state === "offered")
                    .map((m) => (
                      <section className="commerce-card" key={m.id}>
                        <h3>{m.title}</h3>
                        <span className="qv-meta">
                          {m.amount
                            ? money(m.amount, m.currency)
                            : "Price unavailable"}
                        </span>
                        <p>
                          Within {m.delivery_hours} hours or a full refund ·{" "}
                          {Math.max(0, m.weekly_limit - m.used - m.reserved)} of{" "}
                          {m.weekly_limit} left this week
                        </p>
                      </section>
                    ))}
                  <p className="commerce-help">
                    Charged only when {name} accepts. {copy.pendingHold}
                  </p>
                  {modes.some(
                    (m) =>
                      m.state === "offered" &&
                      m.used + m.reserved < m.weekly_limit,
                  ) ? (
                    <Link href={`/commerce/packet${suffix}`}>
                      Ask {name} to step in
                    </Link>
                  ) : (
                    <p className="commerce-help">
                      Requests are unavailable right now.
                    </p>
                  )}
                  <Link href="/commerce/membership">Manage membership</Link>
                </>
              )}
              {screen === "packet" && (
                <>
                  <div className="commerce-seal-line">
                    <Seal />
                    <span className="qv-meta">
                      ASK {name.toUpperCase()} TO STEP IN
                    </span>
                  </div>
                  <p>
                    {name}’s AI can draft a summary when connected. Change
                    anything; nothing is sent until you do.
                  </p>
                  {creatorPicker()}
                  <section className="qv qv-include">
                    <label className="qv-include__item">
                      <input
                        type="checkbox"
                        checked={includeSummary}
                        onChange={(e) => setIncludeSummary(e.target.checked)}
                      />
                      Summary of your question
                    </label>
                    <label className="qv-sr" htmlFor="commerce-summary">
                      Summary
                    </label>
                    <textarea
                      id="commerce-summary"
                      className="qv-include__summary"
                      value={summary}
                      onChange={(e) => setSummary(e.target.value)}
                      maxLength={8000}
                      rows={4}
                    />
                    <label className="qv-include__item">
                      <input
                        type="checkbox"
                        checked={recent}
                        onChange={(e) => setRecent(e.target.checked)}
                      />
                      Recent messages
                    </label>
                    <label className="qv-include__item">
                      <input
                        type="checkbox"
                        checked={whole}
                        onChange={(e) => setWhole(e.target.checked)}
                      />
                      The whole conversation
                    </label>
                    {(recent || whole) && (
                      <details className="commerce-disclosure">
                        <summary>Review the exact included messages</summary>
                        {!disclosure ? (
                          <p>
                            Start or reopen your conversation to choose its
                            messages.
                          </p>
                        ) : (
                          disclosure.messages
                            .filter(
                              (m) =>
                                whole || disclosure.recentIds.includes(m.id),
                            )
                            .map((m) => (
                              <p key={m.id}>
                                <strong>
                                  {m.author_kind.replaceAll("_", " ")}:
                                </strong>{" "}
                                {m.text}
                              </p>
                            ))
                        )}
                      </details>
                    )}
                    <p className="qv-help qv-include__notice">
                      {formatCopy("packetAccess", { name })}
                    </p>
                  </section>
                  <h2 className="qv-meta">How</h2>
                  <fieldset className="qv qv-modes">
                    <legend className="qv-sr">How the creator answers</legend>
                    {modes.map((m) => (
                      <label
                        key={m.id}
                        className={`qv-mode ${selectedMode === m.id ? "is-selected" : ""} ${m.state !== "offered" || m.used + m.reserved >= m.weekly_limit ? "is-disabled" : ""}`}
                      >
                        <input
                          type="radio"
                          name="commerce-mode"
                          checked={selectedMode === m.id}
                          onChange={() => setSelectedMode(m.id)}
                          disabled={
                            m.state !== "offered" ||
                            m.used + m.reserved >= m.weekly_limit
                          }
                        />
                        <span className="qv-mode__text">
                          <span className="qv-mode__title">{m.title}</span>
                          <span className="qv-mode__meta">
                            Within {m.delivery_hours} hours or a full refund ·{" "}
                            {Math.max(0, m.weekly_limit - m.used - m.reserved)}{" "}
                            of {m.weekly_limit} left this week
                          </span>
                        </span>
                        <span className="qv-mode__price">
                          {m.amount
                            ? money(m.amount, m.currency)
                            : "Unavailable"}
                        </span>
                      </label>
                    ))}
                  </fieldset>
                  {!modes.length && <p>No request modes are available.</p>}
                  <h2 className="qv-meta">Who sees the answer</h2>
                  <fieldset className="qv qv-modes">
                    <legend className="qv-sr">Who sees the answer</legend>
                    {(["private", "public"] as const).map((v) => (
                      <label
                        key={v}
                        className={`qv-mode ${visibility === v ? "is-selected" : ""}`}
                      >
                        <input
                          type="radio"
                          name="visibility"
                          checked={visibility === v}
                          onChange={() => setVisibility(v)}
                          disabled={v === "public" && !chosen?.public_amount}
                        />
                        <span className="qv-mode__text">
                          <span className="qv-mode__title">
                            {v === "private" ? "Private" : "Public"}
                          </span>
                          <span className="qv-mode__meta">
                            {v === "private"
                              ? "Only you"
                              : "Eligible audience members can read it. AI use requires separate creator approval."}
                          </span>
                        </span>
                        <span className="qv-mode__price">
                          {chosen
                            ? (
                                v === "private"
                                  ? chosen.amount
                                  : chosen.public_amount
                              )
                              ? money(
                                  (v === "private"
                                    ? chosen.amount
                                    : chosen.public_amount)!,
                                  chosen.currency,
                                )
                              : "Unavailable"
                            : "—"}
                        </span>
                      </label>
                    ))}
                  </fieldset>
                  {chosen && (
                    <TermsBlock
                      name={name}
                      price={money(
                        visibility === "public"
                          ? (chosen.public_amount ?? 0)
                          : (chosen.amount ?? 0),
                        chosen.currency,
                      )}
                      deadline={`${chosen.decision_hours} h`}
                    />
                  )}
                  <p className="commerce-help">
                    Card holds are unavailable until payment setup is complete.
                    The server rechecks your access, limit and capacity before
                    any hold.
                  </p>
                  <Button
                    disabled={
                      !data.capabilities.paymentsAvailable ||
                      !data.capabilities.stripePublishableKey ||
                      !data.fan ||
                      !disclosure ||
                      !limit ||
                      !chosen ||
                      !summary ||
                      busy
                    }
                    onClick={() => setCheckout(true)}
                  >
                    Send request
                    {chosen?.amount
                      ? ` · ${money(chosen.amount, chosen.currency)} if accepted`
                      : ""}
                  </Button>
                  {checkout &&
                    chosen &&
                    data.capabilities.stripePublishableKey &&
                    data.fan &&
                    disclosure && (
                      <div className="commerce-checkout-scrim">
                        <CardEntry
                          publishableKey={
                            data.capabilities.stripePublishableKey
                          }
                          busy={busy}
                          label={`Place hold · ${money(visibility === "public" ? (chosen.public_amount ?? 0) : (chosen.amount ?? 0), chosen.currency)}`}
                          onCancel={() => setCheckout(false)}
                          onMethod={async (paymentMethodId) => {
                            const result = await command("packets", {
                              creatorId: selectedCreator,
                              fanId: data.fan!.id,
                              modeId: chosen.id,
                              modeVersion: chosen.version,
                              visibility,
                              disclosure: {
                                summary,
                                includeSummary,
                                messageIds: whole
                                  ? disclosure.messages.map((m) => m.id)
                                  : recent
                                    ? disclosure.recentIds
                                    : [],
                                attachmentIds: [],
                                wholeThread: whole,
                                identity: "handle",
                                accessNoticeVersion:
                                  disclosure.accessNoticeVersion,
                              },
                              paymentMethodId,
                            });
                            if (result?.packet?.id) {
                              setCheckout(false);
                              window.location.assign(
                                `/commerce/status?packetId=${result.packet.id}`,
                              );
                            } else
                              throw new Error(
                                "The request could not be confirmed. Your input is kept.",
                              );
                          }}
                        />
                      </div>
                    )}
                  {!limit && (
                    <Link href="/commerce/spending">
                      Choose your monthly limit
                    </Link>
                  )}
                  <p className="commerce-help">
                    Your request input stays on this page. Nothing has been
                    sent.
                  </p>
                </>
              )}
              {screen === "checkout" && (
                <>
                  <p>{copy.pendingHold}</p>
                  <Empty title="Card entry is unavailable">
                    Card entry must be connected to the configured payment
                    provider. No hold has been placed.
                  </Empty>
                  <Link href="/commerce/packet">Return to your request</Link>
                </>
              )}
              {screen === "status" &&
                (!detail ? (
                  <Empty title="Choose a request">
                    Open a request from{" "}
                    <Link href="/commerce/requests">Requests</Link> to see its
                    current status.
                  </Empty>
                ) : (
                  <>
                    {detail.packet.payment_state === "requires_action" &&
                      data.capabilities.stripePublishableKey && (
                        <Button
                          disabled={busy}
                          onClick={() => {
                            void (async () => {
                              const result = await command(
                                `packets/${detail.packet.id}/authentication`,
                                {},
                              );
                              if (!result?.clientSecret) return;
                              try {
                                await authenticateCard(
                                  data.capabilities.stripePublishableKey!,
                                  result.clientSecret,
                                );
                                await command(
                                  `packets/${detail.packet.id}/reconcile`,
                                  {},
                                );
                              } catch (error) {
                                setNotice(
                                  error instanceof Error
                                    ? error.message
                                    : "Authentication did not complete.",
                                );
                              }
                            })();
                          }}
                        >
                          Authenticate the existing hold
                        </Button>
                      )}
                    {detail.packet.state === "offer_pending" &&
                      detail.packet.proposed_mode && (
                        <section className="commerce-card">
                          <h2>A public answer offer</h2>
                          <p>
                            {detail.packet.proposed_mode.title ??
                              "Group answer"}{" "}
                            ·{" "}
                            {money(
                              detail.packet.proposed_mode.amount,
                              detail.packet.proposed_mode.currency,
                            )}
                            . Accepting releases the existing hold; a new
                            authorization is required before this service can be
                            accepted.
                          </p>
                          <Button
                            disabled={busy}
                            onClick={() =>
                              void command(
                                `packets/${detail.packet.id}/offer-choice`,
                                {
                                  version: detail.packet.version,
                                  accept: true,
                                },
                              )
                            }
                          >
                            Accept changed service
                          </Button>
                          <Button
                            disabled={busy}
                            onClick={() =>
                              void command(
                                `packets/${detail.packet.id}/offer-choice`,
                                {
                                  version: detail.packet.version,
                                  accept: false,
                                },
                              )
                            }
                          >
                            Keep the original request
                          </Button>
                        </section>
                      )}
                    {(["draft", "expired"].includes(detail.packet.state) ||
                      detail.packet.payment_state === "failed") &&
                      data.capabilities.paymentsAvailable &&
                      data.capabilities.stripePublishableKey && (
                        <>
                          <p>
                            The same packet can be authorized again after the
                            previous bank hold has closed.
                          </p>
                          <Button
                            disabled={busy}
                            onClick={() => setCheckout(true)}
                          >
                            Authorize a new hold
                          </Button>
                          {checkout && (
                            <CardEntry
                              publishableKey={
                                data.capabilities.stripePublishableKey
                              }
                              busy={busy}
                              label="Authorize this request"
                              onCancel={() => setCheckout(false)}
                              onMethod={async (paymentMethodId) => {
                                const result = await command(
                                  `packets/${detail.packet.id}/reauthorize`,
                                  {
                                    version: detail.packet.version,
                                    paymentMethodId,
                                  },
                                );
                                if (!result?.packet)
                                  throw new Error(
                                    "Authorization could not be confirmed. Check the current request.",
                                  );
                                setCheckout(false);
                              }}
                            />
                          )}
                        </>
                      )}
                    <RequestStatus
                      reqId={requestId(detail.packet.id)}
                      mode={detail.packet.snapshot.title}
                      price={money(
                        detail.packet.snapshot.amount,
                        detail.packet.snapshot.currency,
                      )}
                      steps={[
                        {
                          label: "Request sent · hold placed",
                          time: date(detail.packet.submitted_at),
                          state: detail.packet.submitted_at
                            ? "done"
                            : "current",
                        },
                        {
                          label: "Accepted · charged only then",
                          time: date(detail.packet.accepted_at),
                          state: detail.packet.accepted_at ? "done" : "todo",
                        },
                        {
                          label: "Delivered",
                          time: date(detail.commitment?.delivered_at),
                          state:
                            detail.commitment?.state === "delivered"
                              ? "done"
                              : "todo",
                        },
                      ]}
                      outcome={status(
                        {
                          ...detail.packet,
                          commitment_state: detail.commitment?.state,
                        },
                        data.creators.find(
                          (c) => c.id === detail.packet.creator_id,
                        )?.display_name ?? "The creator",
                      )}
                    />
                    {detail.packet.state === "more_info" &&
                      detail.packet.question && (
                        <section className="commerce-card">
                          <h2>More information requested</h2>
                          <p>{detail.packet.question}</p>
                          <MoreInfoForm
                            busy={busy}
                            onSend={(text) =>
                              void command(`packets/${detail.packet.id}/info`, {
                                version: detail.packet.version,
                                text,
                              })
                            }
                          />
                          <p>
                            The bank authorization still expires at{" "}
                            {date(detail.packet.hold_expires_at)}.
                          </p>
                        </section>
                      )}
                    {[
                      "submitting",
                      "submitted",
                      "more_info",
                      "offer_pending",
                    ].includes(detail.packet.state) && (
                      <Button
                        disabled={busy}
                        onClick={() =>
                          void command(`packets/${detail.packet.id}/withdraw`, {
                            version: detail.packet.version,
                          })
                        }
                      >
                        Withdraw request
                      </Button>
                    )}
                    {["unknown", "requires_action"].includes(
                      detail.packet.payment_state,
                    ) && (
                      <Button
                        disabled={busy}
                        onClick={() =>
                          void command(
                            `packets/${detail.packet.id}/reconcile`,
                            {},
                          )
                        }
                      >
                        Check payment status
                      </Button>
                    )}
                    {detail.commitment?.delivered_at &&
                      ["delivered", "refunded", "resolved"].includes(
                        detail.commitment.state,
                      ) && (
                        <>
                          <Receipt
                            name={
                              data.creators.find(
                                (c) => c.id === detail.packet.creator_id,
                              )?.display_name ?? "Creator"
                            }
                            reqId={requestId(detail.packet.id)}
                            title={detail.packet.snapshot.title}
                            rows={[
                              [
                                "Charged",
                                money(
                                  detail.packet.snapshot.amount,
                                  detail.packet.snapshot.currency,
                                ),
                              ],
                              ["Accepted", date(detail.packet.accepted_at)],
                              [
                                "Delivered",
                                date(detail.commitment.delivered_at),
                              ],
                              ...detail.ledger
                                .filter(
                                  (l) =>
                                    l.kind === "refund" &&
                                    l.currency ===
                                      detail.packet.snapshot.currency,
                                )
                                .map((l): [string, string] => [
                                  "Refund confirmed",
                                  money(l.amount, l.currency),
                                ]),
                            ]}
                            label={
                              detail.commitment.evidence?.authorKind ===
                              "approved_draft"
                                ? `Prepared by AI · approved by ${data.creators.find((c) => c.id === detail.packet.creator_id)?.display_name ?? "the creator"}`
                                : `${detail.packet.snapshot.title} · personally fulfilled by the creator`
                            }
                          />
                          {detail.commitment.evidence?.signedActId && (
                            <Link
                              href={`/verify/${detail.commitment.evidence.signedActId}`}
                            >
                              Open signed verification
                            </Link>
                          )}
                          {!detail.commitment.evidence?.signedActId &&
                            detail.commitment.accept_act_id && (
                              <Link
                                href={`/verify/${detail.commitment.accept_act_id}`}
                              >
                                Open signed acceptance
                              </Link>
                            )}
                          {detail.commitment.state === "delivered" && (
                            <Button
                              disabled={
                                busy ||
                                !detail.packet.snapshot.shareable ||
                                Boolean(detail.share?.revoked_at)
                              }
                              onClick={() =>
                                void command(
                                  `packets/${detail.packet.id}/share`,
                                  {
                                    version: detail.share?.version ?? 1,
                                    enabled: true,
                                    handleDisplay: "hidden",
                                  },
                                )
                              }
                            >
                              Allow a share card without your handle
                            </Button>
                          )}
                          {detail.share?.fan_choice && (
                            <Button
                              onClick={() =>
                                void command(
                                  `packets/${detail.packet.id}/share`,
                                  {
                                    version: detail.share!.version,
                                    enabled: false,
                                    handleDisplay: "hidden",
                                  },
                                )
                              }
                            >
                              Revoke sharing
                            </Button>
                          )}
                        </>
                      )}
                    <Link href="/support">Get help with this request</Link>
                  </>
                ))}
              {screen === "membership" && (
                <>
                  {data.memberships.map((m) => (
                    <section className="commerce-card" key={m.id}>
                      <h2>{m.name}</h2>
                      <p>
                        {m.state} · {m.provider} ·{" "}
                        {m.cancel_at_end ? "Ends" : "Period ends"}{" "}
                        {date(m.period_end)}
                      </p>
                      {m.provider === "stripe" &&
                      ["active", "grace", "cancelled"].includes(m.state) &&
                      data.capabilities.membershipAvailable ? (
                        <>
                          <Button
                            disabled={busy || m.cancel_at_end}
                            onClick={() =>
                              void command(`memberships/${m.id}/cancel`, {
                                version: m.version,
                                refundNow: false,
                              })
                            }
                          >
                            Cancel at the end of this period
                          </Button>
                          <Button
                            disabled={busy}
                            onClick={() =>
                              void command(`memberships/${m.id}/cancel`, {
                                version: m.version,
                                refundNow: true,
                              })
                            }
                          >
                            End now and request the eligible refund
                          </Button>
                        </>
                      ) : (
                        <p>
                          Manage this membership in the{" "}
                          {m.provider === "apple"
                            ? "App Store"
                            : m.provider === "google"
                              ? "Play Store"
                              : "billing provider"}{" "}
                          that billed it.
                        </p>
                      )}
                    </section>
                  ))}
                  {data.tiers
                    .filter((t) => t.state === "active")
                    .map((t) => (
                      <section className="commerce-card" key={t.id}>
                        <h2>{t.name}</h2>
                        {t.catalog.web ? (
                          <>
                            <p>
                              {money(
                                t.catalog.web.amount,
                                t.catalog.web.currency,
                              )}{" "}
                              per month
                            </p>
                            <Button
                              disabled={
                                busy ||
                                !limit ||
                                !data.capabilities.membershipAvailable ||
                                !data.capabilities.stripePublishableKey ||
                                data.memberships.some(
                                  (m) =>
                                    m.creator_id === t.creator_id &&
                                    ["active", "grace", "cancelled"].includes(
                                      m.state,
                                    ) &&
                                    Date.parse(m.period_end) > Date.now(),
                                )
                              }
                              onClick={() => setMembershipTier(t.id)}
                            >
                              Subscribe
                            </Button>
                          </>
                        ) : (
                          <p>Membership price is unavailable.</p>
                        )}
                      </section>
                    ))}
                  {selectedTier?.catalog.web &&
                    data.capabilities.stripePublishableKey && (
                      <CardEntry
                        publishableKey={data.capabilities.stripePublishableKey}
                        busy={busy}
                        title="Monthly membership"
                        description={`${money(selectedTier.catalog.web.amount, selectedTier.catalog.web.currency)} per month until cancelled. Memberships with the same currency are billed together on web.`}
                        returnLabel="Return to memberships"
                        label={`Subscribe · ${money(selectedTier.catalog.web.amount, selectedTier.catalog.web.currency)} per month`}
                        onCancel={() => setMembershipTier(null)}
                        onMethod={async (paymentMethodId) => {
                          const result = await command("memberships/start", {
                            tierId: selectedTier.id,
                            version: selectedTier.version,
                            paymentMethodId,
                          });
                          if (!result)
                            throw new Error(
                              "Purchase could not be confirmed. Reconcile before retrying.",
                            );
                          if (result.clientSecret)
                            await authenticateCard(
                              data.capabilities.stripePublishableKey!,
                              result.clientSecret,
                            );
                          setMembershipTier(null);
                          await command("memberships/reconcile", {});
                        }}
                      />
                    )}
                  {data.capabilities.membershipAvailable && (
                    <Button
                      disabled={busy}
                      onClick={() => void command("memberships/reconcile", {})}
                    >
                      Check web billing status
                    </Button>
                  )}
                  {!data.memberships.length && (
                    <Empty title="No memberships yet">
                      Membership purchase and restore are unavailable until the
                      billing catalog and provider verification are connected.
                    </Empty>
                  )}
                  <p>
                    Memberships unused within seven days receive a full refund
                    on cancellation. Later refunds are prorated under the
                    configured policy.
                  </p>
                  <Button disabled>Restore purchases</Button>
                  <p className="commerce-help">
                    Store verification is not connected yet. No access is
                    granted from a local receipt.
                  </p>
                </>
              )}
              {screen === "pass" && (
                <>
                  {!data.policy.passEnabled ? (
                    <Empty title="The pass is not available yet">
                      Your memberships and existing conversations remain
                      accessible.
                    </Empty>
                  ) : (
                    <>
                      <h2>Your selected creators</h2>
                      {data.pass[0] && (
                        <>
                          <p>
                            {data.pass[0].used + data.pass[0].reserved} of{" "}
                            {data.pass[0].allowance} shared AI cost units used
                            or reserved this month. Ends{" "}
                            {date(data.pass[0].cycle_end)}.
                          </p>
                          <PassChoices data={data} busy={busy} save={command} />
                        </>
                      )}
                      {data.slots.map((s) => (
                        <section className="commerce-card" key={s.id}>
                          <h3>{s.display_name}</h3>
                          <p>
                            {s.state.replaceAll("_", " ")} · {date(s.ends_at)}
                          </p>
                          {data.passChoices.replaceableSlotIds.includes(s.id) &&
                            data.pass[0] && (
                              <PassReplacement
                                slotId={s.id}
                                passVersion={data.pass[0].version}
                                choices={data.passChoices.creators.filter(
                                  (c) =>
                                    !data.slots.some(
                                      (slot) =>
                                        slot.state === "active" &&
                                        slot.creator_id === c.id,
                                    ),
                                )}
                                busy={busy}
                                save={command}
                              />
                            )}
                        </section>
                      ))}
                      <p>
                        Changes take effect on the 1st. An incomplete draft
                        carries your current choices forward.
                        Membership-included AI access uses no slot.
                      </p>
                    </>
                  )}
                </>
              )}
              {screen === "offers" && (
                <>
                  {data.owned.length ? (
                    <>
                      <p>
                        Charged only on acceptance. Declines and expiries
                        release the hold.
                      </p>
                      <div
                        className="commerce-offer-table"
                        role="table"
                        aria-label="Human modes"
                      >
                        <div className="commerce-offer-heading" role="row">
                          {[
                            "Mode",
                            "Price",
                            "Deadline",
                            "Refund if late",
                            "Per week",
                            "State",
                          ].map((v) => (
                            <span key={v} role="columnheader">
                              {v}
                            </span>
                          ))}
                        </div>
                        {data.modes
                          .filter(
                            (m) =>
                              m.creator_id === (creatorId ?? data.owned[0]?.id),
                          )
                          .map((m) => (
                            <div role="row" key={m.id}>
                              <span>{m.title}</span>
                              <span className="qv-meta">
                                {m.amount
                                  ? money(m.amount, m.currency)
                                  : "Not set"}
                              </span>
                              <span>{m.delivery_hours} h</span>
                              <span>Full refund</span>
                              <span>
                                {m.used + m.reserved} of {m.weekly_limit}
                              </span>
                              <span>
                                {m.state}
                                <button
                                  type="button"
                                  className="commerce-link-button"
                                  disabled={busy}
                                  onClick={() => setEditingModeId(m.id)}
                                  aria-label={`Edit ${m.title}`}
                                >
                                  Edit
                                </button>
                              </span>
                            </div>
                          ))}
                      </div>
                      <ModeForm
                        key={editingModeId ?? "new-mode"}
                        existing={data.modes.find(
                          (m) => m.id === editingModeId,
                        )}
                        onNew={() => setEditingModeId(null)}
                        currency={currency}
                        busy={busy}
                        onSave={(body) =>
                          void command(
                            `creators/${creatorId ?? data.owned[0]!.id}/modes${editingModeId ? `/${editingModeId}` : ""}`,
                            body,
                          )
                        }
                      />
                      <div className="commerce-two">
                        <section className="commerce-card">
                          <h2>Membership tiers</h2>
                          {data.tiers
                            .filter(
                              (t) =>
                                t.creator_id ===
                                (creatorId ?? data.owned[0]?.id),
                            )
                            .map((t) => (
                              <div key={t.id} className="commerce-row">
                                <div>
                                  <h3>{t.name}</h3>
                                  <p>
                                    {t.state} ·{" "}
                                    {t.catalog.web
                                      ? `${money(t.catalog.web.amount, t.catalog.web.currency)} per month`
                                      : "Price not set"}
                                  </p>
                                </div>
                                <Button
                                  disabled={busy}
                                  onClick={() => setEditingTierId(t.id)}
                                >
                                  Edit {t.name}
                                </Button>
                              </div>
                            ))}
                          <TierForm
                            key={editingTierId ?? "new-tier"}
                            existing={data.tiers.find(
                              (t) => t.id === editingTierId,
                            )}
                            products={
                              data.tierCatalog?.find(
                                (c) =>
                                  c.creatorId ===
                                  (creatorId ?? data.owned[0]?.id),
                              )?.products ?? []
                            }
                            busy={busy}
                            onNew={() => setEditingTierId(null)}
                            onSave={(body) =>
                              void command(
                                `creators/${creatorId ?? data.owned[0]!.id}/tiers${editingTierId ? `/${editingTierId}` : ""}`,
                                body,
                              )
                            }
                          />
                        </section>
                        <Empty title="Call windows">
                          Scheduling uses the current creator and fan time zones
                          when the call service is connected.
                        </Empty>
                      </div>
                    </>
                  ) : (
                    <Empty title="Creator access required">
                      Only a verified creator can configure personal offers.
                    </Empty>
                  )}
                </>
              )}
              {["earnings", "pool"].includes(screen) && (
                <>
                  {!earningsCreator ? (
                    <Empty title="Creator access required">
                      Earnings belong to the verified creator account.
                    </Empty>
                  ) : screen === "pool" && !data.policy.passEnabled ? (
                    <Empty title="Pool earnings are unavailable">
                      The pass is not enabled yet.
                    </Empty>
                  ) : (
                    <>
                      <div className="commerce-stats">
                        {["capture", "refund", "payout"].map((kind) => (
                          <section className="commerce-card" key={kind}>
                            <h2>
                              {kind === "capture"
                                ? "Requests"
                                : kind === "refund"
                                  ? "Refunded"
                                  : "Paid out"}
                            </h2>
                            <span className="commerce-money">
                              {money(
                                creatorLedger
                                  .filter(
                                    (l) =>
                                      l.kind === kind &&
                                      l.currency === currency,
                                  )
                                  .reduce((a, l) => a + BigInt(l.amount), 0n),
                                currency,
                              )}
                            </span>
                          </section>
                        ))}
                      </div>
                      <section className="commerce-card">
                        <h2>Payout account</h2>
                        <p>
                          {data.payoutAccounts.find(
                            (a) => a.creator_id === earningsCreator,
                          )?.state ?? "Not configured"}
                          {data.payoutAccounts.find(
                            (a) => a.creator_id === earningsCreator,
                          )?.details_due
                            ? " · Verification details required"
                            : ""}
                        </p>
                      </section>
                      <h2>Ledger</h2>
                      {creatorLedger.map((l) => (
                        <div className="commerce-ledger-row" key={l.id}>
                          <span className="qv-meta">{date(l.created_at)}</span>
                          <span>{l.kind.replaceAll("_", " ")}</span>
                          <span>{money(l.amount, l.currency)}</span>
                          <span>
                            {l.packet_id ? requestId(l.packet_id) : "—"}
                          </span>
                        </div>
                      ))}
                      {!creatorLedger.length && (
                        <Empty title="No ledger entries yet">
                          Amounts appear after verified provider activity.
                        </Empty>
                      )}
                      <p>
                        Payout eligibility starts seven days after delivery and
                        remains held during a dispute. Provider fees, payout
                        markets and tax reporting require configured account
                        details.
                      </p>
                      {screen === "pool" && (
                        <p>
                          The pool splits by slots held, not by messages sent.
                        </p>
                      )}
                    </>
                  )}
                </>
              )}
            </>
          )}
        </div>
        {!studio && (
          <nav className="commerce-nav" aria-label="Fan commerce">
            <Link href="/home">Home</Link>
            <Link href="/discover">Discover</Link>
            <Link
              href="/commerce/requests"
              aria-current={screen === "requests" ? "page" : undefined}
            >
              Requests
            </Link>
            <Link
              href="/commerce/spending"
              aria-current={screen === "spending" ? "page" : undefined}
            >
              You
            </Link>
          </nav>
        )}
      </main>
    </div>
  );
}
function LimitForm({
  currency,
  limit,
  busy,
  save,
}: {
  currency: string;
  limit?: Limit;
  busy: boolean;
  save: (body: Record<string, unknown>) => void;
}) {
  const [amount, setAmount] = useState(
      decimalInput(limit?.pending_amount ?? limit?.amount ?? null, currency),
    ),
    [none, setNone] = useState(
      limit?.pending_none ?? limit?.explicit_none ?? false,
    ),
    [reminders, setReminders] = useState(limit?.reminders_on ?? true),
    [error, setError] = useState("");
  function submit(e: FormEvent) {
    e.preventDefault();
    try {
      save({
        currency,
        amount: none ? null : minor(amount, currency),
        explicitNone: none,
        remindersOn: reminders,
      });
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Choose a valid amount.");
    }
  }
  return (
    <form className="commerce-limit-form" onSubmit={submit}>
      <h2>Your monthly limit</h2>
      <p>{copy.spendLimit}</p>
      <label className="commerce-field">
        Amount ({currency})
        <input
          inputMode="decimal"
          value={amount}
          onChange={(e) => {
            setAmount(e.target.value);
            setNone(false);
          }}
          required={!none}
          disabled={none}
        />
      </label>
      <label className="commerce-check">
        <input
          type="checkbox"
          checked={none}
          onChange={(e) => setNone(e.target.checked)}
        />
        No limit · my explicit choice
      </label>
      <label className="commerce-check">
        <input
          type="checkbox"
          checked={reminders}
          onChange={(e) => setReminders(e.target.checked)}
        />
        Reminders at 50% and 100%
      </label>
      {error && <p role="alert">{error}</p>}
      <Button type="submit" disabled={busy || (!none && !amount)}>
        Save limit
      </Button>
    </form>
  );
}
function MoreInfoForm({
  onSend,
  busy,
}: {
  onSend: (text: string) => void;
  busy: boolean;
}) {
  const [text, setText] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSend(text);
      }}
    >
      <label className="commerce-field">
        Your reply
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={8000}
        />
      </label>
      <Button type="submit" disabled={busy || !text.trim()}>
        Send information
      </Button>
    </form>
  );
}
function decimalInput(value: string | null, currency: string) {
  if (value === null) return "";
  const digits =
    new Intl.NumberFormat("en", {
      style: "currency",
      currency,
    }).resolvedOptions().maximumFractionDigits ?? 2;
  const n = BigInt(value),
    divisor = 10n ** BigInt(digits);
  return `${n / divisor}${digits ? `.${(n % divisor).toString().padStart(digits, "0")}` : ""}`;
}
function ModeForm({
  currency: fallbackCurrency,
  existing,
  busy,
  onSave,
  onNew,
}: {
  currency: string;
  existing?: Mode;
  busy: boolean;
  onSave: (body: Record<string, unknown>) => void;
  onNew: () => void;
}) {
  const currency = existing?.currency ?? fallbackCurrency;
  const [title, setTitle] = useState(existing?.title ?? ""),
    [kind, setKind] = useState(existing?.kind ?? "written_reply"),
    [amount, setAmount] = useState(
      decimalInput(existing?.amount ?? null, currency),
    ),
    [publicAmount, setPublicAmount] = useState(
      decimalInput(existing?.public_amount ?? null, currency),
    ),
    [weekly, setWeekly] = useState(
      existing ? String(existing.weekly_limit) : "",
    ),
    [decision, setDecision] = useState(
      existing ? String(existing.decision_hours) : "",
    ),
    [delivery, setDelivery] = useState(
      existing ? String(existing.delivery_hours) : "",
    ),
    [duration, setDuration] = useState(
      existing?.duration_seconds ? String(existing.duration_seconds) : "",
    ),
    [shareable, setShareable] = useState(existing?.shareable ?? false),
    [state, setState] = useState(existing?.state ?? "hidden"),
    [error, setError] = useState("");
  return (
    <form
      className="commerce-mode-form"
      onSubmit={(e) => {
        e.preventDefault();
        try {
          onSave({
            title,
            kind,
            amount: amount ? minor(amount, currency) : null,
            publicAmount: publicAmount ? minor(publicAmount, currency) : null,
            currency,
            weeklyLimit: Number(weekly),
            decisionHours: Number(decision),
            deliveryHours: Number(delivery),
            durationSeconds: duration ? Number(duration) : null,
            shareable,
            state,
            version: existing?.version ?? 0,
          });
          setError("");
        } catch (e) {
          setError(e instanceof Error ? e.message : "Check the offer.");
        }
      }}
    >
      <h2>{existing ? `Edit ${existing.title}` : "Add a mode"}</h2>
      <p>
        Drafts stay hidden until a price, deadline and capacity are set. Pausing
        stops new requests and preserves accepted obligations.
      </p>
      <div className="commerce-two">
        <label className="commerce-field">
          Title
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={100}
            required
          />
        </label>
        <label className="commerce-field">
          Mode
          <select value={kind} onChange={(e) => setKind(e.target.value)}>
            {Object.entries(modesNames).map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label className="commerce-field">
          Private price ({currency})
          <input
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required={state === "offered"}
          />
        </label>
        <label className="commerce-field">
          Public price ({currency}, optional)
          <input
            inputMode="decimal"
            value={publicAmount}
            onChange={(e) => setPublicAmount(e.target.value)}
          />
          <span>
            Must be lower than the private price. Fans choose public visibility
            explicitly.
          </span>
        </label>
        <label className="commerce-field">
          Weekly capacity
          <input
            type="number"
            min={0}
            max={100000}
            value={weekly}
            onChange={(e) => setWeekly(e.target.value)}
            required
          />
        </label>
        <label className="commerce-field">
          Decision window (hours)
          <input
            type="number"
            min={1}
            max={720}
            value={decision}
            onChange={(e) => setDecision(e.target.value)}
            required
          />
        </label>
        <label className="commerce-field">
          Delivery deadline (hours)
          <input
            type="number"
            min={1}
            max={8760}
            value={delivery}
            onChange={(e) => setDelivery(e.target.value)}
            required
          />
        </label>
        <label className="commerce-field">
          Promised duration (seconds)
          <input
            type="number"
            min={1}
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            required={
              state === "offered" && ["audio_call", "video_call"].includes(kind)
            }
          />
        </label>
        <label className="commerce-field">
          State
          <select value={state} onChange={(e) => setState(e.target.value)}>
            <option value="hidden">Hidden draft</option>
            <option value="offered">Offered</option>
            <option value="paused">Paused</option>
          </select>
        </label>
      </div>
      <label className="commerce-check">
        <input
          type="checkbox"
          checked={shareable}
          onChange={(e) => setShareable(e.target.checked)}
        />
        Allow fans to share delivered answers
      </label>
      {existing?.shareable && !shareable && (
        <p>
          Saving revokes existing shared cards for this mode. Re-enabling this
          option does not restore revoked cards.
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      <div className="commerce-actions">
        <Button type="submit" disabled={busy}>
          Save mode
        </Button>
        {existing && (
          <Button disabled={busy} onClick={onNew}>
            Add another mode
          </Button>
        )}
      </div>
    </form>
  );
}

function TierForm({
  existing,
  products,
  busy,
  onSave,
  onNew,
}: {
  existing?: Overview["tiers"][number];
  products: { key: string; label: string }[];
  busy: boolean;
  onSave: (body: Record<string, unknown>) => void;
  onNew: () => void;
}) {
  const [name, setName] = useState(existing?.name ?? "");
  const [capabilities, setCapabilities] = useState(
    existing?.capabilities ?? [],
  );
  const [allowance, setAllowance] = useState(
    existing ? String(existing.ai_allowance) : "",
  );
  const [state, setState] = useState(existing?.state ?? "draft");
  const [catalogKey, setCatalogKey] = useState(existing?.catalog.key ?? "");
  const includesAI = capabilities.includes("ai_message");
  return (
    <form
      className="commerce-mode-form"
      onSubmit={(e) => {
        e.preventDefault();
        onSave({
          name,
          capabilities,
          aiAllowance: includesAI ? Number(allowance) : 0,
          state,
          catalogKey: catalogKey || null,
          version: existing?.version ?? 0,
        });
      }}
    >
      <h3>{existing ? `Edit ${existing.name}` : "Add a membership tier"}</h3>
      <p>
        Save a draft while you choose benefits. Publishing requires a verified
        membership product. Keep purchased benefits and prices intact; use a new
        tier to change them.
      </p>
      <label className="commerce-field">
        Tier name
        <input
          required
          maxLength={100}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <fieldset>
        <legend>Included access</legend>
        {[
          ["ai_message", "AI conversations"],
          ["note", "Creator Notes"],
          ["request", "Human request access"],
        ].map(([key, label]) => (
          <label key={key} className="commerce-check">
            <input
              type="checkbox"
              checked={capabilities.includes(key!)}
              onChange={(e) =>
                setCapabilities((current) =>
                  e.target.checked
                    ? [...current, key!]
                    : current.filter((v) => v !== key),
                )
              }
            />
            {label}
          </label>
        ))}
      </fieldset>
      {includesAI && (
        <label className="commerce-field">
          AI allowance (cost units)
          <input
            type="number"
            min={1}
            max={2147483647}
            required
            value={allowance}
            onChange={(e) => setAllowance(e.target.value)}
          />
          <span>
            Equivalent membership and pass allowances do not add together.
          </span>
        </label>
      )}
      <label className="commerce-field">
        Membership product
        <select
          value={catalogKey}
          onChange={(e) => setCatalogKey(e.target.value)}
        >
          <option value="">No product selected</option>
          {existing?.catalog.key &&
            !products.some((p) => p.key === existing.catalog.key) && (
              <option value={existing.catalog.key}>Current product</option>
            )}
          {products.map((p) => (
            <option key={p.key} value={p.key}>
              {p.label}
            </option>
          ))}
        </select>
      </label>
      {!products.length && (
        <p>Products are not configured yet. You can save a draft now.</p>
      )}
      <label className="commerce-field">
        Availability
        <select value={state} onChange={(e) => setState(e.target.value)}>
          <option value="draft">Draft</option>
          <option value="active" disabled={!products.length}>
            Published
          </option>
          <option value="paused">Paused</option>
        </select>
      </label>
      <div className="commerce-actions">
        <Button type="submit" disabled={busy || (includesAI && !allowance)}>
          Save tier
        </Button>
        {existing && (
          <Button disabled={busy} onClick={onNew}>
            Add another tier
          </Button>
        )}
      </div>
    </form>
  );
}

function PassChoices({
  data,
  busy,
  save,
}: {
  data: Overview;
  busy: boolean;
  save: (path: string, body: Record<string, unknown>) => Promise<unknown>;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const pass = data.pass[0]!;
  const occupied = new Set(
    data.slots
      .filter(
        (s) =>
          s.cycle_start.slice(0, 10) === pass.cycle_start.slice(0, 10) &&
          ["active", "ended_readable", "replaced"].includes(s.state),
      )
      .map((s) => s.position),
  ).size;
  const remaining = pass.slot_capacity - occupied;
  return (
    <section className="commerce-card">
      <h3>Choose creators</h3>
      <fieldset>
        <legend>Available roster</legend>
        {data.passChoices.creators.map((c) => (
          <label className="commerce-field" key={c.id}>
            <input
              type="checkbox"
              checked={selected.includes(c.id)}
              onChange={(e) =>
                setSelected((values) =>
                  e.target.checked
                    ? [...values, c.id]
                    : values.filter((id) => id !== c.id),
                )
              }
            />
            {c.display_name}
          </label>
        ))}
      </fieldset>
      {remaining > 0 && (
        <Button
          disabled={busy || !selected.length || selected.length > remaining}
          onClick={() =>
            void save("pass/initial", {
              version: pass.version,
              creatorIds: selected,
            })
          }
        >
          Fill {remaining} available {remaining === 1 ? "slot" : "slots"}
        </Button>
      )}
      <Button
        disabled={busy || selected.length > pass.slot_capacity}
        onClick={() =>
          void save("pass/draft", {
            version: pass.version,
            creatorIds: selected,
          })
        }
      >
        Save next month’s choices
      </Button>
      <p>
        Complete all {pass.slot_capacity} choices for next month. An incomplete
        draft carries forward your current selection.
      </p>
    </section>
  );
}
function PassReplacement({
  slotId,
  passVersion,
  choices,
  busy,
  save,
}: {
  slotId: string;
  passVersion: number;
  choices: { id: string; display_name: string }[];
  busy: boolean;
  save: (path: string, body: Record<string, unknown>) => Promise<unknown>;
}) {
  const [creatorId, setCreatorId] = useState("");
  return (
    <div>
      <label className="commerce-field">
        Free replacement
        <select
          value={creatorId}
          onChange={(e) => setCreatorId(e.target.value)}
        >
          <option value="">Choose a creator</option>
          {choices.map((c) => (
            <option key={c.id} value={c.id}>
              {c.display_name}
            </option>
          ))}
        </select>
      </label>
      <Button
        disabled={busy || !creatorId}
        onClick={() =>
          void save(`pass/slots/${slotId}/replace`, {
            version: passVersion,
            creatorId,
          })
        }
      >
        Replace this unavailable creator
      </Button>
    </div>
  );
}
