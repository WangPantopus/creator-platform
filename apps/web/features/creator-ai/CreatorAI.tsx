"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { brand } from "@qelvora/brand";
import { SessionSchema } from "@qelvora/api";
import {
  AuthorLabel,
  Avatar,
  Mark,
  Notice,
  Skeleton,
  Toast,
} from "@qelvora/ui-web";
import type {
  Configuration,
  EvaluationCase,
  Source,
  StudioState,
  Version,
  VersionComparison,
} from "../../../../packages/api/src/agent/contracts";
import {
  DEVELOPMENT_LICENSE_TERMS,
  DraftConfig as ConfigurationSchema,
  developmentProofReference,
} from "../../../../packages/api/src/agent/contracts";
import "./creator-ai.css";

type ErrorBody = { error?: { code: string; message: string } };
type CreatorAIIdentity = Readonly<{
  accountId: string;
  sessionId: string;
  signal: AbortSignal;
  end: () => void;
}>;
type Preview = {
  revision: number;
  sentences: { text: string; citations: string[] }[];
  passages: {
    id: string;
    title: string;
    text: string;
    start: number;
    end: number;
  }[];
  durationMs: number;
  firstApprovedMs: number | null;
  usage: { costMicros: number | null }[];
};
const tabs = ["Sources", "Style", "Rules", "Test", "Versions"];
const sections = [
  "overview",
  "sources",
  "style",
  "rules",
  "test",
  "versions",
  "license",
  "interview",
  "onboard",
];
function readDraft(key: string) {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "null") as unknown;
  } catch {
    return null;
  }
}
function storeDraft(key: string, value: unknown) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* Private browsing may disable storage; server drafts still work. */
  }
}
function Button({
  id,
  children,
  onClick,
  disabled = false,
  variant = "secondary",
  type = "button",
}: {
  id?: string;
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "secondary" | "quiet" | "ai";
  type?: "button" | "submit";
}) {
  return (
    <button
      id={id}
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`qv-btn qv-btn--${variant}`}
    >
      {children}
    </button>
  );
}
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="w2-field">
      <span>{label}</span>
      {children}
    </label>
  );
}
function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="w2-panel">
      <span className="qv-meta">{title}</span>
      {children}
    </section>
  );
}
function Lines({
  value,
  onChange,
  placeholder,
}: {
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
}) {
  return (
    <textarea
      rows={4}
      value={value.join("\n")}
      onChange={(e) => onChange(e.target.value.split("\n"))}
      placeholder={placeholder}
    />
  );
}
// Exact paths from the shared ui-web glyph definitions; W1 owns their public export seam.
function Glyph({ name, size = 20 }: { name: string; size?: number }) {
  const paths: Record<string, string> = {
    Notes: "M13.5 4.2a5.4 5.4 0 0 1 0 7.6M16.8 1.8a8.8 8.8 0 0 1 0 12.4",
    Requests: "M4 12.5l2-7.5h10l2 7.5V17H4zM4 12.5h4l1 2h4l1-2h4",
    Threads:
      "M4 5.5h10a1.5 1.5 0 0 1 1.5 1.5v5A1.5 1.5 0 0 1 14 13.5H9l-3.5 3v-3H4A1.5 1.5 0 0 1 2.5 12V7A1.5 1.5 0 0 1 4 5.5zM18 9h.5A1.5 1.5 0 0 1 20 10.5v4a1.5 1.5 0 0 1-1.5 1.5H18v2.5L15 16h-3",
    Offers: "M3.5 4.5v6l8 8 7-7-8-8h-6a1 1 0 0 0-1 1z",
    Publish: "M4 18l1-4.5L14.5 4l3.5 3.5L8.5 17zM12.5 6l3.5 3.5",
    Insights: "M4 18h14M6.5 15v-4M11 15V6.5M15.5 15v-6.5",
    Earnings:
      "M13.3 8.3c-.5-.6-1.3-1-2.3-1-1.4 0-2.3.7-2.3 1.7 0 2.4 4.8 1.3 4.8 3.9 0 1-1 1.8-2.5 1.8-1.1 0-2-.4-2.5-1.1M11 6v1.3M11 14.7V16",
    Team: "M3 17.5c.9-2.6 3-4 5.5-4s4.6 1.4 5.5 4M14 5.2a3 3 0 0 1 0 5.6M16 13.8c1.3.6 2.3 1.9 2.8 3.7",
  };
  if (name === "My AI") return <Mark kind="ai" size={size} />;
  return (
    <svg
      width={name === "Notes" ? Math.round(size * 1.375) : size}
      height={size}
      viewBox={name === "Notes" ? "0 0 22 16" : "0 0 22 22"}
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      {name === "Notes" && (
        <circle cx="6.5" cy="8" r="4.5" fill="currentColor" />
      )}
      {name === "Earnings" && (
        <circle
          cx="11"
          cy="11"
          r="7.5"
          stroke="currentColor"
          strokeWidth="1.5"
        />
      )}
      {name === "Team" && (
        <circle cx="8.5" cy="8" r="3" stroke="currentColor" strokeWidth="1.5" />
      )}
      {name === "Offers" && (
        <circle cx="7.5" cy="8" r="1.3" fill="currentColor" />
      )}
      {name === "More" ? (
        [5.5, 11, 16.5].map((cx) => (
          <circle key={cx} cx={cx} cy="11" r="1.4" fill="currentColor" />
        ))
      ) : (
        <path
          d={paths[name]}
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </svg>
  );
}
export function CreatorAI({
  section,
  creatorId,
  identity,
}: {
  section: string;
  creatorId?: string;
  identity?: CreatorAIIdentity;
}) {
  const router = useRouter();
  const current = sections.includes(section) ? section : "overview";
  const [state, setState] = useState<StudioState | null>(null);
  const [configuration, setConfiguration] = useState<Configuration | null>(
    null,
  );
  const [dirty, setDirty] = useState(false);
  const dirtyRef = useRef(false);
  const draftRevision = useRef<number | null>(null);
  const actorKey = useRef<string | null>(null);
  const fetchSequence = useRef(0);
  const sourceFileSequence = useRef(0);
  const [error, setError] = useState("");
  // Counts failures of person-initiated actions. Background refreshes never
  // move focus while someone is typing.
  const [actionFailure, setActionFailure] = useState(0);
  const errorNotice = useRef<HTMLDivElement>(null);
  const failAction = (text: string) => {
    setError(text);
    setActionFailure((count) => count + 1);
  };
  const [message, setMessage] = useState("");
  const [confirmationVisible, setConfirmationVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const completedActionFocus = useRef<{
    control: HTMLElement | null;
    fallback: HTMLElement | null;
  } | null>(null);
  const draftEvaluationLink = useRef<HTMLAnchorElement | null>(null);
  const [online, setOnline] = useState(true);
  const [story, setStory] = useState("");
  const [boundaries, setBoundaries] = useState("");
  const [statusText, setStatusText] = useState("");
  const [sourceForm, setSourceForm] = useState(false);
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [rights, setRights] = useState("");
  const [sourceOrigin, setSourceOrigin] = useState<
    "manual_text" | "manual_upload"
  >("manual_text");
  const [scopeKind, setScopeKind] = useState("public");
  const [scopeIds, setScopeIds] = useState("");
  const [expiry, setExpiry] = useState("");
  const [review, setReview] = useState<{
    id: string;
    title: string;
    text: string;
    rightsEvidence: string;
    revision: number;
  } | null>(null);
  const [olderVersions, setOlderVersions] = useState<Version[]>([]);
  const [historyEnd, setHistoryEnd] = useState(false);
  const [confirmed, setConfirmed] = useState<Record<string, boolean>>({});
  const [selectedCase, setSelectedCase] = useState<EvaluationCase | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [prompt, setPrompt] = useState("");
  const [example, setExample] = useState("");
  const exampleInput = useRef<HTMLTextAreaElement | null>(null);
  const exampleEditors = useRef(new Map<string, HTMLTextAreaElement>());
  const pendingExampleFocus = useRef<{
    id: string | null;
    from: Element | null;
  } | null>(null);
  const [paraphrase, setParaphrase] = useState("");
  const [rule, setRule] = useState("");
  const [sponsorBrand, setSponsorBrand] = useState("");
  const [aliases, setAliases] = useState("");
  const [sponsorExpiry, setSponsorExpiry] = useState("");
  const [changes, setChanges] = useState("");
  const [comparisons, setComparisons] = useState<{
    available: boolean;
    items: {
      id: string;
      state: string;
      error: string | null;
      results: VersionComparison[];
    }[];
  }>({ available: false, items: [] });
  const [confirmation, setConfirmation] = useState<{
    title: string;
    body: string;
    confirm: string;
    run: () => Promise<void>;
  } | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const pendingKeys = useRef(new Map<string, string>());
  const identityAccount = identity?.accountId;
  const identitySession = identity?.sessionId;
  const identitySignal = identity?.signal;
  const endIdentity = identity?.end;
  const request = useCallback(
    async (path: string, init: RequestInit = {}) => {
      identitySignal?.throwIfAborted();
      const headers = new Headers(init.headers);
      if (identityAccount)
        headers.set("X-Expected-Account-Id", identityAccount);
      const response = await fetch(path, {
        ...init,
        headers,
        cache: "no-store",
        ...(identitySignal
          ? {
              signal: AbortSignal.any([
                identitySignal,
                ...(init.signal ? [init.signal] : []),
              ]),
            }
          : {}),
      });
      if (identitySignal && endIdentity && identityAccount) {
        if (response.status === 401) {
          const current = await fetch("/api/platform/identity/session", {
            cache: "no-store",
            signal: AbortSignal.any([
              identitySignal,
              AbortSignal.timeout(4000),
            ]),
          });
          if (
            current.status === 401 ||
            (current.ok &&
              SessionSchema.parse(await current.json()).accountId !==
                identityAccount)
          )
            endIdentity();
        } else if (response.status === 409) {
          const code = ((await response.clone().json()) as ErrorBody).error
            ?.code;
          if (
            ["session_account_changed", "studio_actor_changed"].includes(
              code ?? "",
            )
          )
            endIdentity();
        }
        identitySignal.throwIfAborted();
      }
      return response;
    },
    [identityAccount, identitySignal, endIdentity],
  );
  useEffect(() => {
    if (!identitySignal || !identityAccount || !identitySession) return;
    const sessionKey = `w2-session:${identityAccount}`;
    const purge = () => {
      ++fetchSequence.current;
      ++sourceFileSequence.current;
      actorKey.current = null;
      pendingKeys.current.clear();
      try {
        const prefixes = ["w2-source", "w2-interview", "w2-config"].map(
          (kind) => `${kind}:${identityAccount}:`,
        );
        const keys = Object.keys(localStorage).filter((key) =>
          prefixes.some((prefix) => key.startsWith(prefix)),
        );
        for (const key of keys) localStorage.removeItem(key);
        localStorage.removeItem(sessionKey);
      } catch {
        /* Storage may already be unavailable; the account boundary unmounts. */
      }
    };
    if (identitySignal.aborted) purge();
    else {
      // Access-token rotation retains the server session ID. Fresh sign-in
      // creates another ID, so a draft left on an unmounted page cannot return.
      if (readDraft(sessionKey) !== identitySession) purge();
      storeDraft(sessionKey, identitySession);
      identitySignal.addEventListener("abort", purge, { once: true });
    }
    return () => identitySignal.removeEventListener("abort", purge);
  }, [identityAccount, identitySession, identitySignal]);
  const edit = (next: Configuration) => {
    if (!dirtyRef.current) draftRevision.current = state?.revision ?? null;
    setConfiguration(next);
    dirtyRef.current = true;
    setDirty(true);
  };
  const fetchState = useCallback(
    async (initial = false) => {
      const sequence = ++fetchSequence.current;
      try {
        const response = await request("/api/studio/ai/state", {
          cache: "no-store",
        });
        const data = (await response.json()) as StudioState & ErrorBody;
        identitySignal?.throwIfAborted();
        if (sequence !== fetchSequence.current) return null;
        if (!response.ok) {
          if ([401, 403].includes(response.status)) {
            setState(null);
            setConfiguration(null);
            setReview(null);
            setPreview(null);
            setSelectedCase(null);
            setOlderVersions([]);
            setComparisons({ available: false, items: [] });
            setConfirmation(null);
            actorKey.current = null;
            dirtyRef.current = false;
            draftRevision.current = null;
            setDirty(false);
            pendingKeys.current.clear();
          }
          throw new Error(data.error?.message ?? "Studio is unavailable.");
        }
        if (identityAccount && data.actorAccountId !== identityAccount) {
          endIdentity?.();
          throw new Error(
            "Your creator session changed. Continue with Pantopus again.",
          );
        }
        const nextActor = `${data.actorAccountId}:${data.creator.id}`;
        if (actorKey.current !== nextActor) {
          initial = true;
          ++sourceFileSequence.current;
          actorKey.current = nextActor;
          dirtyRef.current = false;
          draftRevision.current = null;
          setDirty(false);
          setTitle("");
          setText("");
          setRights("");
          setScopeKind("public");
          setScopeIds("");
          setExpiry("");
          setSourceOrigin("manual_text");
          setSourceForm(false);
          setReview(null);
          setPreview(null);
          setPrompt("");
          setExample("");
          setParaphrase("");
          setRule("");
          setSponsorBrand("");
          setAliases("");
          setSponsorExpiry("");
          setChanges("");
          setConfirmed({});
          setSelectedCase(null);
          setConfirmation(null);
          setOlderVersions([]);
          setHistoryEnd(false);
          setComparisons({ available: false, items: [] });
          setMessage("");
          setError("");
          pendingKeys.current.clear();
        }
        setState(data);
        if (!dirtyRef.current) setConfiguration(data.configuration);
        if (initial) {
          setStory(data.interview.story);
          setBoundaries(data.interview.boundaries);
          setStatusText(data.status?.text ?? "");
          const cached = readDraft(`w2-source:${nextActor}`);
          if (cached && typeof cached === "object") {
            const source = cached as {
              title: string;
              text: string;
              rights: string;
              scopeKind?: string;
              scopeIds?: string;
              expiry?: string;
              sourceOrigin?: "manual_text" | "manual_upload";
            };
            setTitle(source.title);
            setText(source.text);
            setRights(source.rights);
            setScopeKind(source.scopeKind ?? "public");
            setScopeIds(source.scopeIds ?? "");
            setExpiry(source.expiry ?? "");
            setSourceOrigin(source.sourceOrigin ?? "manual_text");
          }
          const interview = readDraft(`w2-interview:${nextActor}`);
          if (interview && typeof interview === "object") {
            const stored = interview as {
              story: string;
              boundaries: string;
            };
            setStory(stored.story);
            setBoundaries(stored.boundaries);
          }
          const draft = readDraft(`w2-config:${nextActor}`) as {
            revision?: number;
            configuration?: unknown;
          } | null;
          const restored = ConfigurationSchema.safeParse(draft?.configuration);
          if (restored.success && Number.isInteger(draft?.revision)) {
            setConfiguration(restored.data);
            draftRevision.current = draft!.revision!;
            dirtyRef.current = true;
            setDirty(true);
            if (draft!.revision !== data.revision)
              setError(
                "The saved draft changed elsewhere. Your unsaved input is preserved; reload the saved draft before editing it again.",
              );
          }
        }
        return data;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Studio is unavailable.");
        return null;
      }
    },
    [request, identityAccount, identitySignal, endIdentity],
  );
  useEffect(() => {
    void fetchState(true);
    const connected = () => {
      setOnline(navigator.onLine);
      if (navigator.onLine) void fetchState();
    };
    setOnline(navigator.onLine);
    const focused = () => {
      void fetchState();
    };
    window.addEventListener("focus", focused);
    window.addEventListener("online", connected);
    window.addEventListener("offline", connected);
    return () => {
      window.removeEventListener("online", connected);
      window.removeEventListener("offline", connected);
      window.removeEventListener("focus", focused);
    };
  }, [fetchState]);
  useEffect(() => {
    if (preview && (dirty || preview.revision !== state?.revision))
      setPreview(null);
  }, [dirty, preview, state?.revision]);
  useEffect(() => {
    const notice = errorNotice.current;
    if (!actionFailure || !notice) return;
    // The design system never animates scrolling. Make the focused recovery
    // notice visible immediately, including for reduced-motion users.
    notice.scrollIntoView({
      block: "start",
      behavior: "instant",
    });
    notice.focus({ preventScroll: true });
  }, [actionFailure]);
  useEffect(() => {
    setConfirmationVisible(Boolean(message));
    if (!message) return;
    // The design system's Toast confirms successful actions without moving
    // focus. Keep the inline receipt after its four-second display expires.
    const timer = window.setTimeout(() => setConfirmationVisible(false), 4000);
    return () => window.clearTimeout(timer);
  }, [message]);
  useEffect(() => {
    if (busy) return;
    const pending = completedActionFocus.current;
    completedActionFocus.current = null;
    // Disabling an in-flight button can leave keyboard focus on the body.
    // Restore only a surviving, enabled initiator, never a moved focus or a
    // failed action's Notice/dialog.
    if (document.activeElement !== document.body) return;
    const control =
      pending?.control?.isConnected && !pending.control.matches(":disabled")
        ? pending.control
        : pending?.fallback;
    if (control?.isConnected && !control.matches(":disabled"))
      control.focus({ preventScroll: true });
  }, [busy]);
  useEffect(() => {
    const pending = pendingExampleFocus.current;
    pendingExampleFocus.current = null;
    if (
      !pending ||
      (document.activeElement !== document.body &&
        document.activeElement !== pending.from)
    )
      return;
    const editor = pending.id
      ? exampleEditors.current.get(pending.id)
      : exampleInput.current;
    editor?.focus();
  }, [configuration?.examples]);
  useEffect(() => {
    if (!state || identitySignal?.aborted) return;
    storeDraft(`w2-source:${state.actorAccountId}:${state.creator.id}`, {
      title,
      text,
      rights,
      scopeKind,
      scopeIds,
      expiry,
      sourceOrigin,
    });
  }, [
    title,
    text,
    rights,
    scopeKind,
    scopeIds,
    expiry,
    sourceOrigin,
    state?.creator.id,
    state?.actorAccountId,
    identitySignal,
  ]);
  useEffect(() => {
    if (!state || identitySignal?.aborted) return;
    storeDraft(`w2-interview:${state.actorAccountId}:${state.creator.id}`, {
      story,
      boundaries,
    });
  }, [
    story,
    boundaries,
    state?.creator.id,
    state?.actorAccountId,
    identitySignal,
  ]);
  useEffect(() => {
    if (state && dirty && configuration && !identitySignal?.aborted)
      storeDraft(`w2-config:${state.actorAccountId}:${state.creator.id}`, {
        revision: draftRevision.current,
        configuration,
      });
  }, [
    configuration,
    dirty,
    state?.creator.id,
    state?.actorAccountId,
    identitySignal,
  ]);
  useEffect(() => {
    if (
      !state?.sources.some((s) => s.state === "processing") &&
      state?.evaluation?.state !== "running"
    )
      return;
    const timer = setInterval(() => void fetchState(), 2000);
    return () => clearInterval(timer);
  }, [state, fetchState]);
  useEffect(() => {
    if (confirmation && !dialog.current?.open) {
      setError("");
      setMessage("");
      dialog.current?.showModal();
      dialog.current
        ?.querySelector<HTMLButtonElement>("#w2-confirm-cancel")
        ?.focus();
    } else if (!confirmation && dialog.current?.open) dialog.current.close();
  }, [confirmation]);
  useEffect(() => {
    if (!state || !["test", "versions"].includes(current)) return;
    let cancelled = false;
    const expectedActor = actorKey.current;
    const load = async () => {
      try {
        const response = await request("/api/studio/ai/comparisons", {
          cache: "no-store",
          headers: expectedActor ? { "X-Studio-Actor": expectedActor } : {},
        });
        if (response.ok) {
          const result = (await response.json()) as typeof comparisons;
          if (!cancelled && actorKey.current === expectedActor)
            setComparisons(result);
        }
      } catch {
        /* Keep the last received comparison during a reconnect. */
      }
    };
    void load();
    const timer = setInterval(() => void load(), 5000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [current, state?.creator.id, state?.actorAccountId, request]);
  const api = async (path: string, body?: unknown, method = "POST") => {
    if (!navigator.onLine)
      throw new Error(
        "You’re offline. Your input is saved; reconnect before continuing.",
      );
    const expectedActor = actorKey.current;
    if (!expectedActor)
      throw new Error("Reload Studio with your current creator session.");
    const identity = expectedActor + path + JSON.stringify(body ?? {});
    const key = pendingKeys.current.get(identity) ?? crypto.randomUUID();
    pendingKeys.current.set(identity, key);
    const response = await request(`/api/studio/ai/${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": key,
        "X-Studio-Actor": expectedActor,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const result = (await response.json()) as ErrorBody &
      Record<string, unknown>;
    identitySignal?.throwIfAborted();
    if (actorKey.current !== expectedActor)
      throw new Error("Your Studio session changed. Reload before continuing.");
    if (!response.ok)
      throw new Error(
        result.error?.message ?? "The action did not finish. Try again.",
      );
    pendingKeys.current.delete(identity);
    return result;
  };
  const action = async (
    run: () => Promise<void | string>,
    success = "Saved.",
    followup: HTMLElement | null = null,
  ) => {
    if (busy) return;
    const initiator =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    completedActionFocus.current = null;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const outcome = await run();
      setMessage(outcome ?? success);
      await fetchState();
      completedActionFocus.current = { control: initiator, fallback: followup };
    } catch (e) {
      failAction(e instanceof Error ? e.message : "The action did not finish.");
    } finally {
      setBusy(false);
    }
  };
  const save = async () => {
    if (!state || !configuration) return;
    await api(
      "draft",
      {
        expectedRevision: draftRevision.current ?? state.revision,
        configuration: {
          ...configuration,
          rules: configuration.rules.filter((s) => s.trim()),
          neverReveal: configuration.neverReveal.filter((s) => s.trim()),
        },
      },
      "PUT",
    );
    dirtyRef.current = false;
    draftRevision.current = null;
    storeDraft(`w2-config:${state.actorAccountId}:${state.creator.id}`, null);
    setDirty(false);
  };
  const actSource = async (source: Source, operation: string) => {
    await api(`sources/${source.id}`, {
      expectedRevision: source.revision,
      action: operation,
      rightsConfirmed: confirmed[`${source.id}:${source.revision}`] ?? false,
    });
  };
  const loadReview = (source: Source) =>
    action(async () => {
      const result = await api(`sources/${source.id}`, undefined, "GET");
      setReview(result as typeof review);
    }, "Source opened for review.");
  const sourceRows = state?.sources ?? [];
  const versionNumber = state?.liveVersion?.number;
  const versions = [
    ...(state?.versions ?? []),
    ...olderVersions.filter(
      (v) => !state?.versions.some((current) => current.id === v.id),
    ),
  ];
  const titleFor: Record<string, string> = {
    overview: "My AI",
    sources: "What your AI knows",
    style: "How it answers",
    rules: "How it answers",
    test: `Before v${(state?.versions[0]?.number ?? 0) + 1} goes live`,
    versions: "Your AI’s versions",
    license: `You own your voice. ${brand.name} borrows it, on your terms.`,
    interview: "Your story, in your words",
    onboard: "Approve what your AI may learn from",
  };
  const navNames = [
    "Notes",
    "Requests",
    "Threads",
    "My AI",
    "Offers",
    "Publish",
    "Insights",
    "Earnings",
    "Team",
  ];
  const destination = (name: string) => {
    if (["Notes", "Requests", "Threads"].includes(name)) {
      const currentCreator = creatorId ?? state?.creator.id;
      return currentCreator
        ? `/studio/${encodeURIComponent(currentCreator)}/${name.toLowerCase()}`
        : "/studio/workspace";
    }
    return name === "My AI" ? "/studio/ai" : `/studio/${name.toLowerCase()}`;
  };
  const controlsDisabled = busy || !online;
  const navigate = (
    event: React.MouseEvent<HTMLAnchorElement>,
    href: string,
  ) => {
    if (dirty) {
      event.preventDefault();
      setConfirmation({
        title: "Keep your draft changes",
        confirm: "Save and continue",
        body: "Save these changes before leaving this section.",
        run: async () => {
          await save();
          router.push(href);
        },
      });
    }
  };
  const studioHeader = (
    <header className="w2-header">
      <div>
        <span className="qv-meta">
          {current === "license"
            ? "YOUR LICENSE TO YOUR AI"
            : current === "overview"
              ? "CREATOR STUDIO"
              : `MY AI${dirty ? " · UNSAVED DRAFT" : ""}`}
        </span>
        <h1>{titleFor[current]}</h1>
      </div>
      {![
        "overview",
        "license",
        "interview",
        "onboard",
        "test",
        "versions",
      ].includes(current) && (
        <nav className="w2-segments" aria-label="My AI sections">
          {tabs.map((tab) => (
            <Link
              key={tab}
              href={`/studio/ai/${tab.toLowerCase()}`}
              onClick={(e) => navigate(e, `/studio/ai/${tab.toLowerCase()}`)}
              aria-current={current === tab.toLowerCase() ? "page" : undefined}
            >
              {tab}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
  return (
    <div className="qv w2-studio">
      <aside className="w2-sidebar">
        <nav className="qv-side" aria-label="Studio">
          <div className="qv-side__who">
            <Avatar initial={state?.creator.name.charAt(0) ?? "C"} />
            <div>
              <strong>{state?.creator.name ?? "Creator Studio"}</strong>
              <div className="qv-side__product">{brand.studioName}</div>
            </div>
          </div>
          <div className="qv-side__group">
            {navNames.slice(0, 4).map((name) => (
              <Link
                key={name}
                href={destination(name)}
                onClick={(e) => navigate(e, destination(name))}
                className={`qv-side__item ${name === "My AI" ? "is-active" : ""}`}
                aria-current={name === "My AI" ? "page" : undefined}
              >
                <span className="qv-side__icon">
                  <Glyph name={name} />
                </span>
                <span className="qv-side__label">{name}</span>
              </Link>
            ))}
          </div>
          <div className="qv-side__rule" />
          <div className="qv-side__group">
            {navNames.slice(4).map((name) => (
              <Link
                key={name}
                href={destination(name)}
                className="qv-side__item"
              >
                <span className="qv-side__icon">
                  <Glyph name={name} />
                </span>
                <span className="qv-side__label">{name}</span>
              </Link>
            ))}
          </div>
          <div className="qv-side__status">
            <Mark kind="ai" size={12} />
            <span>
              {versionNumber
                ? `Your AI is ${state?.paused ? "paused" : "live"} · v${versionNumber}`
                : "Your AI is a draft"}
            </span>
          </div>
        </nav>
      </aside>
      <main className={`w2-main w2-${current}`}>
        {state?.development && (
          <div className="w2-development" role="note">
            Development identity ·{" "}
            {state.creator.verification === "verified"
              ? "fictional verified creator"
              : "pending verification"}
            {state.capabilities.syntheticLicensing
              ? " · synthetic license only"
              : ""}{" "}
            · external fan publication disabled
          </div>
        )}
        {!online && (
          <Notice tone="offline" title="You’re offline">
            Your saved information is shown. Reconnect before sending or
            publishing.
          </Notice>
        )}
        {!["test", "license"].includes(current) && studioHeader}
        {error && (
          <div
            role="alert"
            ref={errorNotice}
            tabIndex={-1}
            className="w2-action-alert"
          >
            <Notice tone="error" title="Action needs attention">
              {error}
            </Notice>
            <Button variant="quiet" onClick={() => void fetchState(!state)}>
              Refresh saved state
            </Button>
            {!state && (
              <Link
                className="qv-link-btn"
                href="/auth/continue?returnTo=%2Fstudio%2Fai"
              >
                Continue with Pantopus
              </Link>
            )}
          </div>
        )}
        {message && <p className="w2-status">{message}</p>}
        {message && confirmationVisible && (
          <div className="w2-confirmation">
            <Toast>{message}</Toast>
          </div>
        )}
        {!state && !error && (
          <div aria-label="Loading creator AI">
            <Skeleton />
            <Skeleton />
          </div>
        )}
        {state && configuration && (
          <>
            {current === "overview" && (
              <>
                <p className="w2-intro">
                  Uses your approved writing and sources. It stays labeled as AI
                  and never claims human feelings, memories or promises your
                  time.
                </p>
                <section className="w2-live">
                  <div className="w2-between">
                    <AuthorLabel kind="ai" name={state.creator.name} />
                    <span className="qv-badge qv-ink-ai">
                      {versionNumber
                        ? `${state.paused ? "Paused" : "Live"} · v${versionNumber}`
                        : "Draft · not published"}
                    </span>
                  </div>
                  <div className="w2-stats">
                    {[
                      "conversations this week",
                      "asked for you",
                      "flagged by you",
                    ].map((label) => (
                      <div key={label}>
                        <span>—</span>
                        <span className="qv-help">{label}</span>
                      </div>
                    ))}
                  </div>
                  <p className="qv-help">
                    Conversation activity appears when the thread and digest
                    services are connected.
                  </p>
                  <div className="w2-actions">
                    <Button
                      disabled={controlsDisabled || !state.liveVersionId}
                      onClick={() =>
                        void action(async () => {
                          await api("pause");
                        }, "Your AI is paused.")
                      }
                    >
                      Pause my AI
                    </Button>
                    <Link
                      className="qv-btn qv-btn--quiet"
                      href="/studio/ai/test"
                    >
                      Test it as a fan
                    </Link>
                  </div>
                </section>
                <section className="w2-digest">
                  <span className="qv-meta">
                    {versionNumber
                      ? `SINCE YOU PUBLISHED V${versionNumber}`
                      : "YOUR FIRST PUBLISHED AI"}
                  </span>
                  <p>
                    For the first 72 hours after publication, every AI reply is
                    available for your review.
                  </p>
                  <p className="qv-help">
                    {state.liveVersionId
                      ? "The reply digest needs the connected conversation service."
                      : "No replies yet. Approve sources, define your style, and run the boundary evaluations before publication."}
                  </p>
                  <div className="w2-actions">
                    <Link
                      className="qv-btn qv-btn--secondary"
                      href="/studio/ai/sources"
                    >
                      Sources
                    </Link>
                    <Link
                      className="qv-btn qv-btn--secondary"
                      href="/studio/ai/style"
                    >
                      Style and rules
                    </Link>
                    <Link
                      className="qv-btn qv-btn--secondary"
                      href="/studio/ai/license"
                    >
                      License and sponsorships
                    </Link>
                    <Link
                      className="qv-btn qv-btn--quiet"
                      href="/studio/ai/interview"
                    >
                      Your interview
                    </Link>
                  </div>
                  <p className="qv-help">
                    Sources, style, rules and versions are easier on a bigger
                    screen. Open {brand.studioName} on your computer.
                  </p>
                </section>
              </>
            )}
            {(current === "sources" || current === "onboard") && (
              <div className="w2-source-grid">
                <section className="w2-list">
                  <div className="w2-between">
                    <span className="qv-meta">
                      APPROVED ·{" "}
                      {sourceRows.filter((s) => s.state === "approved").length}{" "}
                      · WAITING FOR YOU ·{" "}
                      {sourceRows.filter((s) => s.state === "candidate").length}
                    </span>
                    <Button
                      variant="quiet"
                      disabled={
                        controlsDisabled ||
                        !sourceRows.some((s) => s.state === "candidate") ||
                        sourceRows
                          .filter((s) => s.state === "candidate")
                          .some((s) => !confirmed[`${s.id}:${s.revision}`])
                      }
                      onClick={() =>
                        void action(async () => {
                          for (const source of sourceRows.filter(
                            (s) => s.state === "candidate",
                          ))
                            await actSource(source, "approve");
                        }, "Reviewed sources queued for ingestion.")
                      }
                    >
                      Approve all waiting
                    </Button>
                  </div>
                  {!sourceRows.length && (
                    <Panel title="NO SOURCES YET">
                      <p>
                        Add your own writing or files. Candidates are not used
                        until you approve them.
                      </p>
                      <Link href="/studio/ai/interview" className="qv-link-btn">
                        Start with your interview
                      </Link>
                    </Panel>
                  )}
                  {sourceRows.map((source) => (
                    <div key={source.id}>
                      <div className="qv-source">
                        <div className="qv-source__text">
                          <button
                            className="w2-source-title"
                            onClick={() => void loadReview(source)}
                          >
                            {source.title}
                          </button>
                          <span className="qv-help">
                            {source.state === "candidate"
                              ? "Found · not used until you approve"
                              : source.state === "processing"
                                ? `Processing · ${source.progress}%`
                                : source.state === "revoked"
                                  ? "Revoked · no longer used"
                                  : source.state === "failed"
                                    ? source.error
                                    : source.expiresAt &&
                                        Date.parse(source.expiresAt) <=
                                          Date.now()
                                      ? "Expired · no longer used"
                                      : `Approved · ${new Date(source.reviewedAt ?? source.createdAt).toLocaleDateString()}`}{" "}
                            · revision {source.revision}
                          </span>
                        </div>
                        <span
                          className={`qv-scope ${source.audience.kind !== "public" ? "qv-scope--tier" : ""}`}
                        >
                          {source.audience.kind === "public"
                            ? "Public"
                            : `${source.audience.kind} · ${source.audience.ids.length}`}
                        </span>
                        <Button
                          variant={
                            source.state === "candidate" ? "secondary" : "quiet"
                          }
                          disabled={
                            controlsDisabled ||
                            (["candidate", "revoked"].includes(source.state) &&
                              !confirmed[`${source.id}:${source.revision}`])
                          }
                          onClick={() => {
                            const operation =
                              source.state === "candidate"
                                ? "approve"
                                : source.state === "failed"
                                  ? "retry"
                                  : source.state === "revoked"
                                    ? "restore"
                                    : source.state === "processing"
                                      ? "cancel"
                                      : "revoke";
                            if (
                              operation === "revoke" ||
                              operation === "cancel"
                            )
                              setConfirmation({
                                title:
                                  operation === "revoke"
                                    ? "Revoke this source"
                                    : "Cancel this import",
                                confirm:
                                  operation === "revoke"
                                    ? "Revoke source"
                                    : "Cancel import",
                                body: "New replies stop using this source. A live version using it is paused. Historical replies remain, and source access closes.",
                                run: async () => {
                                  await actSource(source, operation);
                                },
                              });
                            else
                              void action(
                                () => actSource(source, operation),
                                "Source action saved.",
                              );
                          }}
                        >
                          {source.state === "candidate"
                            ? "Approve"
                            : source.state === "failed"
                              ? "Retry"
                              : source.state === "revoked"
                                ? "Restore"
                                : source.state === "processing"
                                  ? "Cancel"
                                  : "Revoke"}
                        </Button>
                      </div>
                      {source.state === "processing" && (
                        <progress
                          value={source.progress}
                          max={100}
                          aria-label={`Processing ${source.title}`}
                        />
                      )}
                      <details className="w2-source-review">
                        <summary>Rights and audience review</summary>
                        <p>{source.rightsEvidence}</p>
                        <p className="qv-help">
                          {source.expiresAt
                            ? `Expires ${new Date(source.expiresAt).toLocaleString()}`
                            : "No source expiry set"}{" "}
                          · {source.origin}
                        </p>
                        {(source.state === "candidate" ||
                          source.state === "failed") && (
                          <Button
                            disabled={controlsDisabled}
                            variant="quiet"
                            onClick={() =>
                              setConfirmation({
                                title: "Revoke this source",
                                confirm: "Revoke source",
                                body: "This source is removed from future replies and its index is deleted. You can review it again before restoring it.",
                                run: () => actSource(source, "revoke"),
                              })
                            }
                          >
                            Revoke source
                          </Button>
                        )}
                        <label>
                          <input
                            type="checkbox"
                            checked={
                              confirmed[`${source.id}:${source.revision}`] ??
                              false
                            }
                            onChange={(e) =>
                              setConfirmed({
                                ...confirmed,
                                [`${source.id}:${source.revision}`]:
                                  e.target.checked,
                              })
                            }
                          />{" "}
                          I reviewed this exact source, its audience and
                          permission for AI reuse.
                        </label>
                      </details>
                    </div>
                  ))}
                  {review && (
                    <Panel title={`REVIEW · ${review.title}`}>
                      <Field label="Exact stored source text">
                        <textarea
                          rows={8}
                          value={review.text}
                          onChange={(e) =>
                            setReview({ ...review, text: e.target.value })
                          }
                        />
                      </Field>
                      <p className="qv-help">{review.rightsEvidence}</p>
                      <div className="w2-actions">
                        <Button
                          disabled={controlsDisabled}
                          onClick={() =>
                            void action(async () => {
                              const source = sourceRows.find(
                                (s) => s.id === review.id,
                              )!;
                              await api(
                                `sources/${review.id}`,
                                {
                                  expectedRevision: review.revision,
                                  title: review.title,
                                  text: review.text,
                                  origin: source.origin,
                                  originReference:
                                    source.originReference ?? undefined,
                                  audience: source.audience,
                                  rightsEvidence: source.rightsEvidence,
                                  expiresAt: source.expiresAt,
                                },
                                "PUT",
                              );
                              setReview(null);
                            }, "Revision saved; review and approve it again.")
                          }
                        >
                          Save revision
                        </Button>
                        <Button variant="quiet" onClick={() => setReview(null)}>
                          Close source
                        </Button>
                      </div>
                    </Panel>
                  )}
                  {current === "onboard" && (
                    <Link
                      className="qv-btn qv-btn--secondary"
                      href="/studio/ai/test"
                    >
                      Continue to boundary evaluations
                    </Link>
                  )}
                </section>
                <aside className="w2-aside">
                  <Panel title="ADD A SOURCE">
                    <Button disabled onClick={() => undefined}>
                      Connect YouTube
                    </Button>
                    <p className="qv-help">
                      Creator OAuth and approved caption reuse policy must be
                      connected first.
                    </p>
                    <Button onClick={() => setSourceForm(!sourceForm)}>
                      Upload files
                    </Button>
                    <Button
                      variant="quiet"
                      onClick={() => setSourceForm(!sourceForm)}
                    >
                      Add text
                    </Button>
                    <span className="qv-help">
                      Podcast and newsletter next. Instagram and TikTok arrive
                      through their data exports.
                    </span>
                    {sourceForm && (
                      <form
                        onSubmit={(e: FormEvent) => {
                          e.preventDefault();
                          void action(async () => {
                            const audience =
                              scopeKind === "public"
                                ? { kind: "public" }
                                : {
                                    kind: scopeKind,
                                    ids: scopeIds
                                      .split(",")
                                      .map((s) => s.trim())
                                      .filter(Boolean),
                                  };
                            const result = await api("sources", {
                              title,
                              text,
                              origin: sourceOrigin,
                              audience,
                              rightsEvidence: rights,
                              expiresAt: expiry
                                ? new Date(expiry).toISOString()
                                : null,
                            });
                            if (result.duplicate)
                              return "This source already exists; no duplicate was created.";
                            else {
                              setTitle("");
                              setText("");
                              setRights("");
                              setSourceOrigin("manual_text");
                              setSourceForm(false);
                            }
                          }, "Source saved as a candidate. Review before approving.");
                        }}
                        className="w2-form"
                      >
                        <Field label="Upload UTF-8 text (up to 1 MB)">
                          <input
                            type="file"
                            accept=".txt,.md,.vtt,.csv,text/plain,text/markdown"
                            onChange={(e) => {
                              const sequence = ++sourceFileSequence.current;
                              const expectedActor = actorKey.current;
                              const file = e.target.files?.[0];
                              if (!file) return;
                              setMessage("");
                              setError("");
                              // Permit selecting the same file after fixing it.
                              e.target.value = "";
                              if (file.size > 1_000_000) {
                                failAction(
                                  "This file is too large. Split it into files up to 1 MB.",
                                );
                                return;
                              }
                              const currentRead = () =>
                                sourceFileSequence.current === sequence &&
                                actorKey.current === expectedActor &&
                                !identitySignal?.aborted;
                              void file
                                .arrayBuffer()
                                .then((bytes) => {
                                  const content = new TextDecoder("utf-8", {
                                    fatal: true,
                                  }).decode(bytes);
                                  if (!currentRead()) return;
                                  if (content.length > 250_000) {
                                    failAction(
                                      "Split this source into files with at most 250,000 characters.",
                                    );
                                    return;
                                  }
                                  setError("");
                                  setMessage("");
                                  setText(content);
                                  setTitle(file.name);
                                  setSourceOrigin("manual_upload");
                                })
                                .catch(() => {
                                  if (currentRead())
                                    failAction(
                                      "This file could not be read as UTF-8 text. Save it as UTF-8 and try again.",
                                    );
                                });
                            }}
                          />
                        </Field>
                        <Field label="Source title">
                          <input
                            required
                            maxLength={160}
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                          />
                        </Field>
                        <Field label="Source text">
                          <textarea
                            required
                            maxLength={250000}
                            rows={6}
                            value={text}
                            onChange={(e) => setText(e.target.value)}
                          />
                        </Field>
                        <Field label="Rights evidence">
                          <textarea
                            required
                            minLength={10}
                            maxLength={2000}
                            rows={3}
                            value={rights}
                            onChange={(e) => setRights(e.target.value)}
                            placeholder="Rights holder, permitted AI use, and permission reference"
                          />
                        </Field>
                        <Field label="Who may hear answers from this source">
                          <select
                            value={scopeKind}
                            onChange={(e) => setScopeKind(e.target.value)}
                          >
                            <option value="public">Public</option>
                            <option value="tier">Specific tiers</option>
                            <option value="group">Specific groups</option>
                          </select>
                        </Field>
                        {scopeKind !== "public" && (
                          <Field label="Authorized tier or group IDs (comma separated)">
                            <input
                              required
                              value={scopeIds}
                              onChange={(e) => setScopeIds(e.target.value)}
                            />
                          </Field>
                        )}
                        <Field label="Source expiry (optional)">
                          <input
                            type="datetime-local"
                            value={expiry}
                            onChange={(e) => setExpiry(e.target.value)}
                          />
                        </Field>
                        <Button type="submit" disabled={controlsDisabled}>
                          Save candidate
                        </Button>
                      </form>
                    )}
                  </Panel>
                  <Panel title="THIS WEEK’S UPDATE">
                    <Field label="This week’s update">
                      <textarea
                        rows={3}
                        value={statusText}
                        onChange={(e) => setStatusText(e.target.value)}
                        maxLength={2000}
                      />
                    </Field>
                    <span className="qv-help">
                      Your AI mentions this when it’s relevant. Expires after
                      seven days.
                    </span>
                    <Button
                      disabled={controlsDisabled}
                      onClick={() =>
                        void action(async () => {
                          await api(
                            "status",
                            {
                              text: statusText,
                              expiresAt: new Date(
                                Date.now() + 7 * 86400000 - 1000,
                              ).toISOString(),
                            },
                            "PUT",
                          );
                        }, "Weekly update saved.")
                      }
                    >
                      Save this week’s update
                    </Button>
                  </Panel>
                  <p className="qv-help">
                    Sources are evidence, never instructions. Scope decides who
                    can hear answers drawn from each one.
                  </p>
                </aside>
              </div>
            )}
            {(current === "style" || current === "rules") && (
              <>
                <div className="w2-mode-grid">
                  {(["expert", "companion", "blend"] as const).map((mode) => (
                    <label
                      key={mode}
                      className={`w2-mode ${configuration.mode === mode ? "is-selected" : ""}`}
                    >
                      <span>
                        <input
                          type="radio"
                          name="mode"
                          checked={configuration.mode === mode}
                          onChange={() => edit({ ...configuration, mode })}
                        />
                        {mode.charAt(0).toUpperCase() + mode.slice(1)}
                      </span>
                      <span className="qv-help">
                        {mode === "expert"
                          ? "Answers only from your sources, hands off when it can’t."
                          : mode === "companion"
                            ? "Your voice and memory, with stricter guardrails on closeness."
                            : "Both: expert answers, companion warmth."}
                      </span>
                    </label>
                  ))}
                </div>
                <div className="w2-two-grid">
                  <Panel title="STYLE CARD · FROM YOUR OWN REPLIES">
                    <Field label="Style card">
                      <textarea
                        className="w2-style-card"
                        rows={4}
                        maxLength={4000}
                        value={configuration.styleCard}
                        onChange={(e) =>
                          edit({ ...configuration, styleCard: e.target.value })
                        }
                      />
                    </Field>
                    <div className="w2-segments" role="group" aria-label="Tone">
                      {(["Plainer", "As written", "Warmer"] as const).map(
                        (tone) => (
                          <button
                            key={tone}
                            aria-pressed={tone === configuration.tone}
                            onClick={() => edit({ ...configuration, tone })}
                          >
                            {tone}
                          </button>
                        ),
                      )}
                    </div>
                    <p className="qv-help">
                      {
                        configuration.examples.filter(
                          (e) => e.fixed && e.approved,
                        ).length
                      }{" "}
                      fixed example replies anchor this voice ·{" "}
                      {
                        configuration.examples.filter(
                          (e) => !e.fixed && e.approved,
                        ).length
                      }{" "}
                      more in the pool · up to 20 fixed and 5 retrieved per turn
                    </p>
                    <details>
                      <summary>Edit examples</summary>
                      {configuration.examples.map((item) => (
                        <div className="w2-example" key={item.id}>
                          <textarea
                            ref={(editor) => {
                              if (editor)
                                exampleEditors.current.set(item.id, editor);
                              else exampleEditors.current.delete(item.id);
                            }}
                            rows={2}
                            aria-label="Your own reply example"
                            value={item.text}
                            onChange={(e) =>
                              edit({
                                ...configuration,
                                examples: configuration.examples.map((ex) =>
                                  ex.id === item.id
                                    ? {
                                        ...ex,
                                        text: e.target.value,
                                        approved: false,
                                      }
                                    : ex,
                                ),
                              })
                            }
                          />
                          <label>
                            <input
                              type="checkbox"
                              checked={item.approved}
                              onChange={(e) =>
                                edit({
                                  ...configuration,
                                  examples: configuration.examples.map((ex) =>
                                    ex.id === item.id
                                      ? { ...ex, approved: e.target.checked }
                                      : ex,
                                  ),
                                })
                              }
                            />{" "}
                            Creator-owned and approved
                          </label>
                          <label>
                            <input
                              type="checkbox"
                              checked={item.fixed}
                              onChange={(e) =>
                                edit({
                                  ...configuration,
                                  examples: configuration.examples.map((ex) =>
                                    ex.id === item.id
                                      ? { ...ex, fixed: e.target.checked }
                                      : ex,
                                  ),
                                })
                              }
                            />{" "}
                            Fixed in the version prefix
                          </label>
                          <Button
                            variant="quiet"
                            onClick={() => {
                              const index = configuration.examples.findIndex(
                                (example) => example.id === item.id,
                              );
                              pendingExampleFocus.current = {
                                id:
                                  configuration.examples[index + 1]?.id ??
                                  configuration.examples[index - 1]?.id ??
                                  null,
                                from: document.activeElement,
                              };
                              edit({
                                ...configuration,
                                examples: configuration.examples.filter(
                                  (ex) => ex.id !== item.id,
                                ),
                              });
                            }}
                          >
                            Remove example
                          </Button>
                        </div>
                      ))}
                      <Field label="Add your own reply">
                        <textarea
                          ref={exampleInput}
                          rows={3}
                          value={example}
                          maxLength={2000}
                          onChange={(e) => setExample(e.target.value)}
                        />
                      </Field>
                      <Button
                        disabled={!example.trim()}
                        onClick={() => {
                          const id = crypto.randomUUID();
                          pendingExampleFocus.current = {
                            id,
                            from: document.activeElement,
                          };
                          edit({
                            ...configuration,
                            examples: [
                              ...configuration.examples,
                              {
                                id,
                                text: example,
                                fixed:
                                  configuration.examples.filter((e) => e.fixed)
                                    .length < 20,
                                approved: false,
                              },
                            ],
                          });
                          setExample("");
                        }}
                      >
                        Add example
                      </Button>
                    </details>
                    <Button
                      disabled={
                        controlsDisabled || dirty || !state.capabilities.model
                      }
                      onClick={() =>
                        void action(async () => {
                          await api("style-card", {
                            expectedRevision: state.revision,
                          });
                        }, "Style card generated from approved replies.")
                      }
                    >
                      Generate style card
                    </Button>
                    <span className="qv-help">
                      Save approved examples first. A configured model is
                      required; generation only runs when you ask.
                    </span>
                  </Panel>
                  <Panel title="RULES">
                    <Field label="Rules (one per line)">
                      <Lines
                        value={configuration.rules}
                        onChange={(rules) => edit({ ...configuration, rules })}
                        placeholder="No medical, legal or financial advice"
                      />
                    </Field>
                    <span className="qv-meta">NEVER REVEAL</span>
                    <Field label="Never-reveal details (one exact value per line)">
                      <Lines
                        value={configuration.neverReveal}
                        onChange={(neverReveal) =>
                          edit({ ...configuration, neverReveal })
                        }
                        placeholder="Private addresses, names, or sensitive facts"
                      />
                    </Field>
                    <Field label="Hand off to you when">
                      <textarea
                        rows={2}
                        value={configuration.handoff}
                        maxLength={1000}
                        onChange={(e) =>
                          edit({ ...configuration, handoff: e.target.value })
                        }
                      />
                    </Field>
                    <Field label="Daily AI cost cap (USD; 0 pauses generation)">
                      <input
                        type="number"
                        min={0}
                        max={1000}
                        step={0.01}
                        value={configuration.dailyCostCapMicros / 1_000_000}
                        onChange={(e) =>
                          edit({
                            ...configuration,
                            dailyCostCapMicros: Math.round(
                              Number(e.target.value) * 1_000_000,
                            ),
                          })
                        }
                      />
                    </Field>
                    <Field label="Companion session reminder (minutes)">
                      <input
                        type="number"
                        min={15}
                        max={90}
                        value={configuration.sessionNudgeMinutes}
                        onChange={(e) =>
                          edit({
                            ...configuration,
                            sessionNudgeMinutes: Number(e.target.value),
                          })
                        }
                      />
                    </Field>
                  </Panel>
                  <Panel title="YOUR EVALUATION CRITERIA">
                    <Field label="What makes an answer useful">
                      <textarea
                        value={configuration.usefulnessCriteria}
                        rows={3}
                        maxLength={2000}
                        onChange={(e) =>
                          edit({
                            ...configuration,
                            usefulnessCriteria: e.target.value,
                          })
                        }
                      />
                    </Field>
                    <Field label="What sounds like your writing">
                      <textarea
                        value={configuration.styleCriteria}
                        rows={3}
                        maxLength={2000}
                        onChange={(e) =>
                          edit({
                            ...configuration,
                            styleCriteria: e.target.value,
                          })
                        }
                      />
                    </Field>
                    <p className="qv-help">
                      The fan always sees the AI label. Criteria measure
                      usefulness and style.
                    </p>
                  </Panel>
                </div>
                <div className="w2-actions">
                  <Button
                    variant="ai"
                    disabled={controlsDisabled || !dirty}
                    onClick={() =>
                      void action(
                        save,
                        "Draft saved. Previous evaluation evidence is invalidated.",
                        draftEvaluationLink.current,
                      )
                    }
                  >
                    {busy ? "Saving…" : "Save draft"}
                  </Button>
                  {dirty && (
                    <Button
                      disabled={controlsDisabled}
                      variant="quiet"
                      onClick={() => {
                        setConfiguration(state.configuration);
                        dirtyRef.current = false;
                        draftRevision.current = null;
                        setDirty(false);
                        storeDraft(
                          `w2-config:${state.actorAccountId}:${state.creator.id}`,
                          null,
                        );
                        setMessage("Saved draft reloaded.");
                      }}
                    >
                      Reload saved draft
                    </Button>
                  )}
                  <Link
                    ref={draftEvaluationLink}
                    className="qv-btn qv-btn--quiet"
                    href="/studio/ai/test"
                    onClick={(e) => navigate(e, "/studio/ai/test")}
                  >
                    Run boundary evaluations
                  </Link>
                </div>
              </>
            )}
            {(current === "test" || current === "versions") && (
              <div className="w2-test-grid">
                <section className="w2-list">
                  {current === "test" && studioHeader}
                  {current === "test" && (
                    <>
                      <div className="qv-console">
                        <div className="qv-console__head">
                          <span className="qv-meta">
                            DRAFT · REVISION {state.revision}
                          </span>
                          <span className="qv-badge">
                            {state.evaluation && !state.evaluationCurrent
                              ? `Stale · revision ${state.evaluation.revision}`
                              : (state.evaluation?.state ?? "Not run")}
                          </span>
                        </div>
                        <ul className="qv-console__list">
                          {[
                            "Identity disclosure",
                            "Out of scope",
                            "Restricted-source probe",
                            "Unsupported opinion",
                            "Never-reveal probe",
                            "Instruction override",
                          ]
                            .map(
                              (name) =>
                                state.evaluation?.cases.find(
                                  (c) => c.name === name,
                                ) ?? { name, state: "not run" },
                            )
                            .concat(
                              state.evaluation?.cases.filter(
                                (c) =>
                                  ![
                                    "Identity disclosure",
                                    "Out of scope",
                                    "Restricted-source probe",
                                    "Unsupported opinion",
                                    "Never-reveal probe",
                                    "Instruction override",
                                  ].includes(c.name),
                              ) ?? [],
                            )
                            .map((item) => (
                              <li
                                key={item.name}
                                className={`qv-console__row ${item.state === "fail" ? "is-fail" : ""}`}
                              >
                                <span
                                  className="qv-console__state"
                                  aria-hidden="true"
                                >
                                  {item.state === "pass"
                                    ? "✓"
                                    : item.state === "fail"
                                      ? "×"
                                      : "·"}
                                </span>
                                <button
                                  className="w2-case"
                                  disabled={!("prompt" in item)}
                                  aria-expanded={
                                    selectedCase?.name === item.name
                                  }
                                  aria-controls={
                                    selectedCase
                                      ? "w2-case-transcript"
                                      : undefined
                                  }
                                  onClick={() =>
                                    setSelectedCase(
                                      "prompt" in item &&
                                        selectedCase?.name !== item.name
                                        ? (item as EvaluationCase)
                                        : null,
                                    )
                                  }
                                >
                                  {item.name}
                                </button>
                                <span className="qv-console__result">
                                  {item.state}
                                </span>
                              </li>
                            ))}
                        </ul>
                        {selectedCase && (
                          <div
                            id="w2-case-transcript"
                            role="region"
                            aria-label={`${selectedCase.name} evaluation details`}
                            className="qv-console__transcript"
                          >
                            <span className="qv-meta">{selectedCase.name}</span>
                            <div className="qv-console__line">
                              <span className="qv-console__who">Fan</span>
                              <span>{selectedCase.prompt}</span>
                            </div>
                            <div className="qv-console__line">
                              <span className="qv-console__who">
                                {state.creator.name}’s AI
                              </span>
                              <span>{selectedCase.answer}</span>
                            </div>
                            <p className="qv-console__why">
                              {selectedCase.reason}
                            </p>
                            {selectedCase.withheld && (
                              <>
                                <p className="qv-console__why">
                                  Withheld before delivery ·{" "}
                                  {selectedCase.withheld.category}
                                </p>
                                <p>{selectedCase.withheld.text}</p>
                              </>
                            )}
                          </div>
                        )}
                        <div className="qv-console__foot">
                          <Button
                            disabled={
                              controlsDisabled ||
                              dirty ||
                              state.evaluation?.state === "running"
                            }
                            onClick={() =>
                              void action(async () => {
                                await api("evaluations", {
                                  expectedRevision: state.revision,
                                });
                              }, "Evaluation queued against this exact draft.")
                            }
                          >
                            Run boundary evaluations
                          </Button>
                          {state.evaluation?.state === "running" && (
                            <Button
                              variant="quiet"
                              onClick={() =>
                                void action(async () => {
                                  await api("evaluations/cancel");
                                }, "Evaluation cancellation requested.")
                              }
                            >
                              Cancel evaluation
                            </Button>
                          )}
                          <Field label="What changed in this version">
                            <input
                              value={changes}
                              maxLength={500}
                              onChange={(e) => setChanges(e.target.value)}
                            />
                          </Field>
                          <Button
                            variant="ai"
                            disabled={
                              controlsDisabled ||
                              dirty ||
                              Boolean(state.gates.length) ||
                              !changes.trim()
                            }
                            onClick={() =>
                              void action(async () => {
                                await api("publish", {
                                  expectedRevision: state.revision,
                                  evaluationId: state.evaluation?.id,
                                  changes,
                                });
                              }, "Immutable version published.")
                            }
                          >
                            Publish v{(state.versions[0]?.number ?? 0) + 1}
                          </Button>
                          {state.gates.map((gate) => (
                            <span key={gate} className="qv-help">
                              {gate}
                            </span>
                          ))}
                        </div>
                      </div>
                      <Panel title="TEST IT AS A FAN · PUBLIC AUDIENCE">
                        <form
                          className="w2-form"
                          onSubmit={(e) => {
                            e.preventDefault();
                            void action(async () => {
                              const revision = state.revision;
                              const result = await api("preview", {
                                expectedRevision: revision,
                                message: prompt,
                              });
                              setPreview({
                                ...(result as unknown as Omit<
                                  Preview,
                                  "revision"
                                >),
                                revision,
                              });
                            }, "Draft preview complete.");
                          }}
                        >
                          <Field label="Fan message">
                            <textarea
                              rows={3}
                              maxLength={2000}
                              required
                              value={prompt}
                              onChange={(e) => setPrompt(e.target.value)}
                            />
                          </Field>
                          <Button
                            type="submit"
                            disabled={controlsDisabled || dirty}
                          >
                            Send to draft AI
                          </Button>
                        </form>
                        {preview &&
                          preview.revision === state.revision &&
                          !dirty && (
                            <>
                              <p className="qv-meta">
                                Draft preview · revision {preview.revision}
                              </p>
                              <AuthorLabel
                                kind="ai"
                                name={state.creator.name}
                              />
                              {preview.sentences.map((sentence, index) => (
                                <div key={index}>
                                  <p>{sentence.text}</p>
                                  {sentence.citations.map((id) => (
                                    <details key={id}>
                                      <summary>Open authorized passage</summary>
                                      {preview.passages.find((p) => p.id === id)
                                        ?.text ?? "No longer accessible to you"}
                                    </details>
                                  ))}
                                </div>
                              ))}
                              <p className="qv-help">
                                Pipeline {preview.durationMs} ms · first
                                approved {preview.firstApprovedMs ?? "withheld"}{" "}
                                ms · cost{" "}
                                {preview.usage.some(
                                  (u) => u.costMicros === null,
                                )
                                  ? "awaiting provider usage or rate reconciliation"
                                  : `${preview.usage.reduce((sum, u) => sum + (u.costMicros ?? 0), 0)} USD micros`}
                              </p>
                            </>
                          )}
                      </Panel>
                      <Panel title="I’D NEVER SAY THAT">
                        <p className="qv-help">
                          Write a paraphrase of the scenario. Do not paste a
                          fan’s private message.
                        </p>
                        <Field label="Paraphrased regression prompt">
                          <textarea
                            rows={3}
                            value={paraphrase}
                            maxLength={1000}
                            onChange={(e) => setParaphrase(e.target.value)}
                          />
                        </Field>
                        <Field label="Your one-line rule">
                          <textarea
                            rows={2}
                            value={rule}
                            maxLength={500}
                            onChange={(e) => setRule(e.target.value)}
                          />
                        </Field>
                        <Button
                          disabled={
                            controlsDisabled ||
                            dirty ||
                            !rule.trim() ||
                            !paraphrase.trim()
                          }
                          onClick={() =>
                            void action(async () => {
                              await api("corrections", {
                                expectedRevision: state.revision,
                                paraphrasedPrompt: paraphrase,
                                rule,
                                unacceptableAnswer:
                                  preview?.sentences
                                    .map((s) => s.text)
                                    .join("\n") ?? "",
                              });
                              setRule("");
                              setParaphrase("");
                            }, "Correction filed; the rule is added to the draft and its regression runs before publish.")
                          }
                        >
                          File correction
                        </Button>
                      </Panel>
                    </>
                  )}
                </section>
                <aside className="w2-aside w2-versions">
                  <span className="qv-meta">VERSIONS</span>
                  <ul className="qv-versions">
                    <li className="qv-version">
                      <span className="qv-version__id">Draft</span>
                      <div className="qv-version__text">
                        <span className="qv-meta">
                          REVISION {state.revision}
                        </span>
                        <span className="qv-version__changes">
                          {dirty ? "Unsaved edits" : "Editable configuration"}
                        </span>
                      </div>
                    </li>
                    {versions.map((version) => (
                      <li
                        key={version.id}
                        className={`qv-version ${version.state === "live" ? "is-live" : ""}`}
                      >
                        <span className="qv-version__id">
                          v{version.number}
                        </span>
                        <div className="qv-version__text">
                          <span className="qv-meta">
                            {version.state} ·{" "}
                            {new Date(version.publishedAt).toLocaleDateString()}
                          </span>
                          <span className="qv-version__changes">
                            {version.changes}
                          </span>
                          <span className="qv-help">
                            {version.compiledHash.slice(0, 12)}
                          </span>
                        </div>
                        {version.state !== "live" && (
                          <Button
                            variant="quiet"
                            disabled={controlsDisabled}
                            onClick={() =>
                              setConfirmation({
                                title: `Roll back to v${version.number}`,
                                confirm: `Roll back to v${version.number}`,
                                body: "The prior immutable version is reused after current license, source and creator-authority checks.",
                                run: async () => {
                                  await api(`versions/${version.id}/rollback`);
                                },
                              })
                            }
                          >
                            Roll back
                          </Button>
                        )}
                      </li>
                    ))}
                  </ul>
                  {state.versions.length === 100 && !historyEnd && (
                    <Button
                      disabled={busy || !online}
                      onClick={() =>
                        void action(async () => {
                          const before = versions[versions.length - 1]!.number;
                          const page = (await api(
                            `versions?before=${before}`,
                            undefined,
                            "GET",
                          )) as { items: Version[]; nextBefore: number | null };
                          setOlderVersions((current) => [
                            ...current,
                            ...page.items,
                          ]);
                          setHistoryEnd(page.nextBefore === null);
                        }, "Earlier versions loaded.")
                      }
                    >
                      Load earlier versions
                    </Button>
                  )}
                  <a
                    className="qv-btn qv-btn--quiet"
                    href="/api/studio/ai/export"
                    download
                  >
                    Export sources, rules and examples
                  </a>
                  <Panel title="COMPARE WITH THE LIVE VERSION">
                    <p className="qv-help">
                      Replay privacy-safe paraphrases from the last seven days
                      through both versions. Fans continue seeing the live
                      version.
                    </p>
                    {!comparisons.available && (
                      <p className="qv-help">
                        Recent conversation comparison is waiting for the
                        privacy-safe sample feed.
                      </p>
                    )}
                    <Button
                      disabled={
                        controlsDisabled ||
                        dirty ||
                        !comparisons.available ||
                        !state.liveVersionId ||
                        comparisons.items.some(
                          (item) => item.state === "running",
                        )
                      }
                      onClick={() =>
                        void action(async () => {
                          await api("comparisons", {
                            expectedRevision: state.revision,
                          });
                        }, "Version comparison started. Results appear as each case completes.")
                      }
                    >
                      Compare versions
                    </Button>
                    {comparisons.items.map((item) => (
                      <details key={item.id}>
                        <summary>
                          Comparison · {item.state} · {item.results.length}{" "}
                          scenarios
                        </summary>
                        {item.error && <p role="status">{item.error}</p>}
                        {item.results.map((comparison, index) => (
                          <div key={index} className="w2-comparison">
                            <p>{comparison.paraphrase}</p>
                            <table>
                              <thead>
                                <tr>
                                  <th>Live</th>
                                  <th>Draft</th>
                                </tr>
                              </thead>
                              <tbody>
                                <tr>
                                  {(["live", "draft"] as const).map(
                                    (version) => (
                                      <td key={version}>
                                        <AuthorLabel
                                          kind="ai"
                                          name={state.creator.name}
                                        />
                                        {comparison[version].sentences.map(
                                          (sentence, i) => (
                                            <p key={i}>{sentence.text}</p>
                                          ),
                                        )}
                                        <p className="qv-help">
                                          {comparison[version].score.passed
                                            ? "Pass"
                                            : "Needs correction"}{" "}
                                          · {comparison[version].durationMs} ms
                                          ·{" "}
                                          {comparison[version].costMicros ===
                                          null
                                            ? "Cost unconfirmed"
                                            : `$${(comparison[version].costMicros! / 1000000).toFixed(6)}`}
                                        </p>
                                        <p className="qv-help">
                                          {comparison[version].score.reason}
                                        </p>
                                      </td>
                                    ),
                                  )}
                                </tr>
                              </tbody>
                            </table>
                          </div>
                        ))}
                      </details>
                    ))}
                  </Panel>
                </aside>
              </div>
            )}
            {current === "license" && (
              <div className="w2-two-grid">
                <section className="w2-list">
                  {studioHeader}
                  <Panel
                    title={
                      state.license?.counselVersion ===
                      DEVELOPMENT_LICENSE_TERMS
                        ? `DEVELOPMENT LICENSE · NOT REVIEWED · ${state.license.state}`
                        : state.license
                          ? `LICENSE · ${state.license.state}`
                          : state.capabilities.syntheticLicensing
                            ? "DEVELOPMENT LICENSE · NOT RECORDED"
                            : "LICENSE · REVIEWED TERMS REQUIRED"
                    }
                  >
                    <span>
                      Your AI speaks only on {brand.name}, only under the label
                      “{state.creator.name}’s AI”.
                    </span>
                    <span>
                      Source permission and provider data policy are checked
                      before use.
                    </span>
                    <span>You can pause your AI at any time.</span>
                    <span>
                      AI voice is off. Turning it on needs a separate consent
                      recording.
                    </span>
                    {state.license ? (
                      <>
                        <p>
                          {state.license.counselVersion ===
                          DEVELOPMENT_LICENSE_TERMS
                            ? "Synthetic terms for a fictional development creator. Counsel has not reviewed them, nothing was signed, and real fans, payments and AI voice stay off."
                            : `Reviewed terms: ${state.license.counselVersion}`}
                        </p>
                        <p>
                          Term ends{" "}
                          {new Date(state.license.termEndsAt).toLocaleString()}
                        </p>
                        <p>
                          Permitted uses:{" "}
                          {state.license.permittedUses.join(", ")}
                        </p>
                      </>
                    ) : state.capabilities.syntheticLicensing ? (
                      <>
                        <p className="qv-help">
                          This loopback host can record a labeled development
                          license so a fictional creator’s AI can be tested end
                          to end. It is not a reviewed license, carries no
                          signature and never applies to real fans.
                        </p>
                        <Button
                          disabled={
                            controlsDisabled ||
                            state.creator.verification !== "verified"
                          }
                          onClick={() =>
                            void action(async () => {
                              await api("license", {
                                proofReference: developmentProofReference(
                                  state.creator.id,
                                ),
                                counselVersion: DEVELOPMENT_LICENSE_TERMS,
                                permittedUses: [
                                  "sponsored_mentions",
                                  "text_ai",
                                ],
                                termEndsAt: new Date(
                                  Date.now() + 90 * 86_400_000,
                                ).toISOString(),
                              });
                            }, "Development license recorded for 90 days.")
                          }
                        >
                          Record development license
                        </Button>
                        {state.creator.verification !== "verified" && (
                          <span className="qv-help">
                            Creator verification is pending.
                          </span>
                        )}
                      </>
                    ) : (
                      <p className="qv-help">
                        Reviewed license terms and creator signing are required
                        before publication.
                      </p>
                    )}
                  </Panel>
                  <Button
                    disabled={controlsDisabled}
                    onClick={() =>
                      setConfirmation({
                        title: "Pause my AI",
                        confirm: "Pause my AI",
                        body: "Generation stops. Any pending commitments remain visible until their refunds are confirmed.",
                        run: async () => {
                          await api("pause");
                        },
                      })
                    }
                  >
                    Pause my AI
                  </Button>
                  <span className="qv-help">
                    License renewal requires your signature on the exact
                    reviewed terms.
                  </span>
                </section>
                <section className="w2-list">
                  <span className="qv-meta">SPONSORSHIPS</span>
                  {state.sponsors.map((sponsor) => (
                    <Panel key={sponsor.id} title={sponsor.brand}>
                      <span className="qv-badge qv-ink-ai">
                        {sponsor.active &&
                        Date.parse(sponsor.expiresAt) > Date.now()
                          ? `Active until ${new Date(sponsor.expiresAt).toLocaleDateString()}`
                          : "Inactive"}
                      </span>
                      <p className="qv-help">
                        Your AI may mention this sponsor when it answers the
                        question. Every such reply carries the disclosure.
                      </p>
                      <div className="w2-live">
                        <AuthorLabel kind="ai" name={state.creator.name} />
                        <p>
                          Paid partnership: {state.creator.name} is paid by{" "}
                          {sponsor.brand}.
                        </p>
                      </div>
                      <Button
                        variant="quiet"
                        disabled={controlsDisabled}
                        onClick={() =>
                          void action(async () => {
                            await api("sponsors", {
                              brand: sponsor.brand,
                              aliases: sponsor.aliases,
                              expiresAt: sponsor.expiresAt,
                              active: !sponsor.active,
                            });
                          }, "Sponsor registry updated.")
                        }
                      >
                        {sponsor.active
                          ? "Deactivate sponsor"
                          : "Activate sponsor"}
                      </Button>
                    </Panel>
                  ))}
                  <Panel title="ADD A SPONSOR">
                    <form
                      className="w2-form"
                      onSubmit={(e) => {
                        e.preventDefault();
                        void action(async () => {
                          await api("sponsors", {
                            brand: sponsorBrand,
                            aliases: aliases
                              .split(",")
                              .map((a) => a.trim())
                              .filter(Boolean),
                            expiresAt: new Date(sponsorExpiry).toISOString(),
                            active: true,
                          });
                          setSponsorBrand("");
                          setAliases("");
                        }, "Sponsor saved; mentions carry the paid-partnership disclosure.");
                      }}
                    >
                      <Field label="Sponsor brand">
                        <input
                          required
                          value={sponsorBrand}
                          maxLength={80}
                          onChange={(e) => setSponsorBrand(e.target.value)}
                        />
                      </Field>
                      <Field label="Aliases (comma separated)">
                        <input
                          value={aliases}
                          onChange={(e) => setAliases(e.target.value)}
                        />
                      </Field>
                      <Field label="Sponsorship expiry">
                        <input
                          required
                          type="datetime-local"
                          value={sponsorExpiry}
                          onChange={(e) => setSponsorExpiry(e.target.value)}
                        />
                      </Field>
                      <Button type="submit" disabled={controlsDisabled}>
                        Add a sponsor
                      </Button>
                    </form>
                  </Panel>
                </section>
              </div>
            )}
            {current === "interview" && (
              <div className="w2-interview">
                <p>
                  Tell your AI what you teach, how you speak, and where your
                  boundaries are. Save and return whenever you like.
                </p>
                <Panel title="YOUR STORY">
                  <Field label="Your story, experience and approach">
                    <textarea
                      rows={10}
                      maxLength={20000}
                      value={story}
                      onChange={(e) => setStory(e.target.value)}
                    />
                  </Field>
                  <Field label="Boundaries and subjects you avoid">
                    <textarea
                      rows={5}
                      maxLength={10000}
                      value={boundaries}
                      onChange={(e) => setBoundaries(e.target.value)}
                    />
                  </Field>
                  <div className="w2-actions">
                    <Button
                      disabled={controlsDisabled}
                      onClick={() =>
                        void action(async () => {
                          await api(
                            "interview",
                            {
                              expectedRevision: state.revision,
                              story,
                              boundaries,
                              audioConsent: false,
                            },
                            "PUT",
                          );
                        }, "Interview draft saved. It is not an approved source yet.")
                      }
                    >
                      Save interview draft
                    </Button>
                    <Button
                      disabled={controlsDisabled || !story.trim()}
                      onClick={() =>
                        void action(async () => {
                          await api("sources", {
                            title: "Your interview",
                            text: `${story}\n\nBoundaries:\n${boundaries}`,
                            origin: "interview",
                            audience: { kind: "public" },
                            rightsEvidence:
                              "Creator-owned interview text submitted for explicit review and approved AI reuse.",
                            expiresAt: null,
                          });
                          router.push("/studio/ai/sources");
                        }, "Interview candidate created. Review before approval.")
                      }
                    >
                      Review as a source
                    </Button>
                  </div>
                  <Button disabled>Record interview audio</Button>
                  <span className="qv-help">
                    Consented recording needs the configured media/transcription
                    service. Text interviewing is available.
                  </span>
                </Panel>
                <Link className="qv-link-btn" href="/studio/ai/sources">
                  Skip interview and add your own sources
                </Link>
              </div>
            )}
          </>
        )}
      </main>
      <nav className="w2-phone-nav" aria-label="Phone Studio">
        {["Notes", "Requests", "Threads", "My AI", "More"].map((name) => (
          <Link
            key={name}
            href={name === "More" ? "/studio/ai/license" : destination(name)}
            aria-current={name === "My AI" ? "page" : undefined}
          >
            <Glyph name={name} size={name === "Notes" ? 17 : 22} />
            <span>{name}</span>
          </Link>
        ))}
      </nav>
      <dialog
        ref={dialog}
        className="w2-dialog"
        aria-labelledby="w2-confirm-title"
        aria-describedby="w2-confirm-body"
        onKeyDown={(event) => {
          if (event.key !== "Tab") return;
          const buttons =
            event.currentTarget.querySelectorAll<HTMLButtonElement>(
              "button:not(:disabled)",
            );
          const first = buttons[0];
          const last = buttons[buttons.length - 1];
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last?.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first?.focus();
          }
        }}
        onCancel={() => setConfirmation(null)}
        onClose={() => setConfirmation(null)}
      >
        <h2 id="w2-confirm-title">{confirmation?.title}</h2>
        <p id="w2-confirm-body">{confirmation?.body}</p>
        {error && <p role="alert">{error}</p>}
        <div className="w2-actions">
          <Button
            disabled={busy}
            onClick={() => {
              if (confirmation)
                void action(async () => {
                  await confirmation.run();
                  setConfirmation(null);
                }, "Action saved.");
            }}
          >
            {confirmation?.confirm}
          </Button>
          <Button
            id="w2-confirm-cancel"
            variant="quiet"
            onClick={() => setConfirmation(null)}
          >
            Cancel
          </Button>
        </div>
      </dialog>
    </div>
  );
}
