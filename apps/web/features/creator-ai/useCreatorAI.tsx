// My AI's state and actions (split from CreatorAI.tsx, B8). The screens read
// them through the returned view; nothing here renders.
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { brand } from "@qelvora/brand";
import { SessionSchema } from "@qelvora/api";
import {
  type Configuration,
  DraftConfig as ConfigurationSchema,
  type EvaluationCase,
  type Source,
  type StudioState,
  type Version,
  type VersionComparison,
} from "../../../../packages/api/src/agent/contracts";
import {
  type CreatorAIIdentity,
  type DraftKind,
  type ErrorBody,
  type Preview,
  draftStorageKey,
  purgeStoredDrafts,
  readDraft,
  sections,
  storeDraft,
} from "./shared";

export function useCreatorAI({
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
  const [error, setErrorMessage] = useState("");
  const stateReadFailure = useRef<string | null>(null);
  const setError = useCallback((text: string) => {
    stateReadFailure.current = null;
    setErrorMessage(text);
  }, []);
  // Counts failures of person-initiated actions. Background refreshes never
  // move focus while someone is typing.
  const [actionFailure, setActionFailure] = useState(0);
  const errorNotice = useRef<HTMLDivElement>(null);
  const studioHeading = useRef<HTMLHeadingElement>(null);
  const recoveredReadFocus = useRef<HTMLElement | null>(null);
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
  const sourceReviewButtons = useRef(new Map<string, HTMLButtonElement>());
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
  const [comparisonReadState, setComparisonReadState] = useState<
    "checking" | "current" | "unavailable"
  >("checking");
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
  const isSessionEnded = identity?.isSessionEnded;
  const legacyDraftSession = useRef<{
    accountId: string;
    sessionId: string;
    allowed: boolean;
  } | null>(null);
  const canUseDraft = useCallback(
    () => !identitySignal?.aborted,
    [identitySignal],
  );
  const readStoredDraft = useCallback(
    (kind: DraftKind, accountId: string, creatorId: string) => {
      if (!canUseDraft() || (identityAccount && accountId !== identityAccount))
        return null;
      const key = draftStorageKey(kind, accountId, creatorId, identitySession);
      const current = readDraft(key);
      if (current !== null || !identitySession) return current;
      const legacy = legacyDraftSession.current;
      const markerKey = `w2-session:${accountId}`;
      // Only a continuing original session may adopt its pre-migration buffer.
      // This optional presentation marker never supplies request authority.
      if (
        !legacy?.allowed ||
        legacy.accountId !== accountId ||
        legacy.sessionId !== identitySession ||
        readDraft(markerKey) !== identitySession
      )
        return null;
      const previous = readDraft(draftStorageKey(kind, accountId, creatorId));
      if (!canUseDraft() || readDraft(markerKey) !== identitySession)
        return null;
      if (previous !== null) storeDraft(key, previous);
      return previous;
    },
    [canUseDraft, identityAccount, identitySession],
  );
  const writeDraft = useCallback(
    (kind: DraftKind, accountId: string, creatorId: string, value: unknown) => {
      if (canUseDraft() && (!identityAccount || accountId === identityAccount))
        storeDraft(
          draftStorageKey(kind, accountId, creatorId, identitySession),
          value,
        );
    },
    [canUseDraft, identityAccount, identitySession],
  );
  const request = useCallback(
    async (path: string, init: RequestInit = {}) => {
      const original = identitySignal
        ? AbortSignal.any([
            identitySignal,
            ...(init.signal ? [init.signal] : []),
          ])
        : init.signal;
      original?.throwIfAborted();
      const headers = new Headers(init.headers);
      if (identityAccount)
        headers.set("X-Expected-Account-Id", identityAccount);
      // The captured view supplies a denial-only precondition. The genuine
      // cookie-resolved session remains the backend's identity authority.
      if (identitySession)
        headers.set("X-Expected-Session-Id", identitySession);
      const response = await fetch(path, {
        ...init,
        headers,
        cache: "no-store",
        ...(original ? { signal: original } : {}),
      });
      original?.throwIfAborted();
      if (identitySignal && endIdentity && identityAccount) {
        if (response.status === 401) {
          const current = await fetch("/api/platform/identity/session", {
            cache: "no-store",
            signal: AbortSignal.any([original!, AbortSignal.timeout(4000)]),
          });
          original?.throwIfAborted();
          const session = current.ok
            ? SessionSchema.parse(await current.json())
            : undefined;
          original?.throwIfAborted();
          if (
            current.status === 401 ||
            (session &&
              (session.accountId !== identityAccount ||
                session.sessionId !== identitySession))
          )
            endIdentity();
        } else if (response.status === 409) {
          const code = ((await response.clone().json()) as ErrorBody).error
            ?.code;
          original?.throwIfAborted();
          if (
            [
              "session_account_changed",
              "session_view_changed",
              "studio_actor_changed",
            ].includes(code ?? "")
          )
            endIdentity();
        }
        original?.throwIfAborted();
      }
      return response;
    },
    [identityAccount, identitySession, identitySignal, endIdentity],
  );
  useEffect(() => {
    if (
      !identitySignal ||
      !identityAccount ||
      !identitySession ||
      !isSessionEnded
    )
      return;
    if (
      legacyDraftSession.current?.accountId !== identityAccount ||
      legacyDraftSession.current.sessionId !== identitySession
    )
      legacyDraftSession.current = {
        accountId: identityAccount,
        sessionId: identitySession,
        allowed: readDraft(`w2-session:${identityAccount}`) === identitySession,
      };
    const dispose = () => {
      ++fetchSequence.current;
      ++sourceFileSequence.current;
      actorKey.current = null;
      pendingKeys.current.clear();
      // The canonical boundary disposes private React state on navigation and
      // effect restart too. Only its original genuine session end deletes the
      // stored buffers that the same continuing session may recover.
      if (isSessionEnded()) purgeStoredDrafts(identityAccount, identitySession);
    };
    if (identitySignal.aborted) dispose();
    else {
      // Ordinary view disposal retains this genuine session's own namespace.
      // Canonical identity cleanup owns the legacy presentation marker.
      identitySignal.addEventListener("abort", dispose, { once: true });
    }
    return () => identitySignal.removeEventListener("abort", dispose);
  }, [identityAccount, identitySession, identitySignal, isSessionEnded]);
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
        // A successful current-account read settles only its own outage notice.
        // Provider/action refusals and unsaved-draft conflicts remain visible.
        const readFailure = stateReadFailure.current;
        stateReadFailure.current = null;
        if (readFailure !== null) {
          const focused = document.activeElement;
          if (
            focused instanceof HTMLElement &&
            errorNotice.current?.contains(focused)
          )
            recoveredReadFocus.current = focused;
          setErrorMessage((current) =>
            current === readFailure ? "" : current,
          );
        }
        const nextActor = identitySession
          ? `${data.actorAccountId}:${identitySession}:${data.creator.id}`
          : `${data.actorAccountId}:${data.creator.id}`;
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
        if (initial && canUseDraft()) {
          setStory(data.interview.story);
          setBoundaries(data.interview.boundaries);
          setStatusText(data.status?.text ?? "");
          const cached = readStoredDraft(
            "w2-source",
            data.actorAccountId,
            data.creator.id,
          );
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
          const interview = readStoredDraft(
            "w2-interview",
            data.actorAccountId,
            data.creator.id,
          );
          if (interview && typeof interview === "object") {
            const stored = interview as {
              story: string;
              boundaries: string;
            };
            setStory(stored.story);
            setBoundaries(stored.boundaries);
          }
          const draft = readStoredDraft(
            "w2-config",
            data.actorAccountId,
            data.creator.id,
          ) as {
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
        if (sequence !== fetchSequence.current || identitySignal?.aborted)
          return null;
        const text = e instanceof Error ? e.message : "Studio is unavailable.";
        setError(text);
        stateReadFailure.current = text;
        return null;
      }
    },
    [
      request,
      identityAccount,
      identitySession,
      identitySignal,
      endIdentity,
      setError,
      canUseDraft,
      readStoredDraft,
    ],
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
    const from = recoveredReadFocus.current;
    recoveredReadFocus.current = null;
    if (
      error ||
      !from ||
      from.isConnected ||
      document.activeElement !== document.body ||
      dialog.current?.open
    )
      return;
    const heading = studioHeading.current;
    if (heading?.isConnected && heading.getClientRects().length)
      heading.focus();
  }, [error]);
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
    writeDraft("w2-source", state.actorAccountId, state.creator.id, {
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
    writeDraft,
  ]);
  useEffect(() => {
    if (!state || identitySignal?.aborted) return;
    writeDraft("w2-interview", state.actorAccountId, state.creator.id, {
      story,
      boundaries,
    });
  }, [
    story,
    boundaries,
    state?.creator.id,
    state?.actorAccountId,
    identitySignal,
    writeDraft,
  ]);
  useEffect(() => {
    if (state && dirty && configuration && !identitySignal?.aborted)
      writeDraft("w2-config", state.actorAccountId, state.creator.id, {
        revision: draftRevision.current,
        configuration,
      });
  }, [
    configuration,
    dirty,
    state?.creator.id,
    state?.actorAccountId,
    identitySignal,
    writeDraft,
  ]);
  useEffect(() => {
    if (
      !(
        state?.capabilities.embeddings &&
        state.sources.some((s) => s.state === "processing")
      ) &&
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
  }, [confirmation, setError]);
  useEffect(() => {
    if (!state || !["test", "versions"].includes(current)) return;
    let cancelled = false;
    let pending: AbortController | undefined;
    const expectedActor = actorKey.current;
    const readable = () =>
      !cancelled &&
      !identitySignal?.aborted &&
      navigator.onLine &&
      document.visibilityState === "visible" &&
      actorKey.current === expectedActor;
    const clear = () => {
      pending?.abort();
      pending = undefined;
      setComparisons({ available: false, items: [] });
      setComparisonReadState(readable() ? "checking" : "unavailable");
    };
    // Poll only while comparisons are on: each read holds the creator's AI
    // workspace row, which an answer in progress also needs. Focus,
    // visibility and reconnect still read once and resume polling if on.
    let timer: ReturnType<typeof setInterval> | undefined;
    const poll = (on: boolean) => {
      if (on && !timer) timer = setInterval(() => void load(), 5000);
      if (!on && timer) {
        clearInterval(timer);
        timer = undefined;
      }
    };
    const load = async () => {
      if (!readable()) {
        clear();
        return;
      }
      if (pending) return;
      const controller = new AbortController();
      pending = controller;
      const signal = AbortSignal.any([
        controller.signal,
        AbortSignal.timeout(5000),
      ]);
      try {
        const response = await request("/api/studio/ai/comparisons", {
          cache: "no-store",
          signal,
          headers: {
            "X-Studio-Actor": `${state.actorAccountId}:${state.creator.id}`,
          },
        });
        if (!response.ok) throw new Error("Comparison read unavailable");
        const result = (await response.json()) as typeof comparisons;
        if (pending === controller && readable() && !signal.aborted) {
          setComparisons(result);
          setComparisonReadState("current");
          poll(result.available);
        }
      } catch {
        if (!cancelled && pending === controller) {
          setComparisons({ available: false, items: [] });
          setComparisonReadState("unavailable");
        }
      } finally {
        if (pending === controller) pending = undefined;
      }
    };
    // A received paraphrase is not an offline permission. Conceal it when the
    // source cannot be revalidated; abandoned responses cannot repopulate it.
    const refresh = () => {
      clear();
      void load();
    };
    refresh();
    poll(true);
    window.addEventListener("online", refresh);
    window.addEventListener("offline", refresh);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    identitySignal?.addEventListener("abort", refresh);
    return () => {
      cancelled = true;
      pending?.abort();
      poll(false);
      window.removeEventListener("online", refresh);
      window.removeEventListener("offline", refresh);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
      identitySignal?.removeEventListener("abort", refresh);
    };
  }, [
    current,
    state?.creator.id,
    state?.actorAccountId,
    request,
    identitySignal,
  ]);
  const api = async (path: string, body?: unknown, method = "POST") => {
    if (!navigator.onLine)
      throw new Error(
        "You’re offline. Your input is saved; reconnect before continuing.",
      );
    const expectedActor = actorKey.current;
    if (!expectedActor || !state)
      throw new Error("Reload Studio with your current creator session.");
    const identity = expectedActor + path + JSON.stringify(body ?? {});
    const key = pendingKeys.current.get(identity) ?? crypto.randomUUID();
    pendingKeys.current.set(identity, key);
    const response = await request(`/api/studio/ai/${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": key,
        // The BFF checks account/creator; the independent captured session
        // header and local actor key retain this view's session lifetime.
        "X-Studio-Actor": `${state.actorAccountId}:${state.creator.id}`,
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
          // Unstarted rows are dropped; a half-written one is kept so the
          // server's validation explains what is missing.
          ...(configuration.faq
            ? {
                faq: configuration.faq.filter(
                  (item) => item.question.trim() || item.answer.trim(),
                ),
              }
            : {}),
        },
      },
      "PUT",
    );
    dirtyRef.current = false;
    draftRevision.current = null;
    writeDraft("w2-config", state.actorAccountId, state.creator.id, null);
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
    if (
      ["Notes", "Requests", "Threads", "Publish", "Team", "More"].includes(name)
    ) {
      const currentCreator = creatorId ?? state?.creator.id;
      return currentCreator
        ? `/studio/${encodeURIComponent(currentCreator)}/${name.toLowerCase()}`
        : "/studio/workspace";
    }
    if (name === "Offers") return "/commerce/offers";
    if (name === "Earnings") return "/commerce/earnings";
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
  return {
    actSource,
    action,
    actorKey,
    aliases,
    api,
    boundaries,
    busy,
    changes,
    comparisonReadState,
    comparisons,
    configuration,
    confirmation,
    confirmationVisible,
    confirmed,
    controlsDisabled,
    creatorId,
    current,
    destination,
    dialog,
    dirty,
    dirtyRef,
    draftEvaluationLink,
    draftRevision,
    edit,
    error,
    errorNotice,
    example,
    exampleEditors,
    exampleInput,
    expiry,
    failAction,
    fetchState,
    historyEnd,
    identity,
    identitySignal,
    loadReview,
    message,
    navNames,
    navigate,
    online,
    paraphrase,
    pendingExampleFocus,
    preview,
    prompt,
    review,
    rights,
    router,
    rule,
    save,
    scopeIds,
    scopeKind,
    section,
    selectedCase,
    setAliases,
    setBoundaries,
    setChanges,
    setConfiguration,
    setConfirmation,
    setConfirmed,
    setDirty,
    setError,
    setExample,
    setExpiry,
    setHistoryEnd,
    setMessage,
    setOlderVersions,
    setParaphrase,
    setPreview,
    setPrompt,
    setReview,
    setRights,
    setRule,
    setScopeIds,
    setScopeKind,
    setSelectedCase,
    setSourceForm,
    setSourceOrigin,
    setSponsorBrand,
    setSponsorExpiry,
    setStatusText,
    setStory,
    setText,
    setTitle,
    sourceFileSequence,
    sourceForm,
    sourceOrigin,
    sourceReviewButtons,
    sourceRows,
    sponsorBrand,
    sponsorExpiry,
    state,
    statusText,
    story,
    studioHeading,
    text,
    title,
    titleFor,
    versionNumber,
    versions,
    writeDraft,
  };
}
export type CreatorAIView = ReturnType<typeof useCreatorAI>;
