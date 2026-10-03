"use client";
import { copy, formatCopy } from "@qelvora/copy";
import { useEffect, useRef, useState } from "react";
import { CallChip, Countdown } from "@qelvora/ui-web";
import {
  CallSessionSchema,
  CallAdmissionSchema,
  AdmissionReceiptSchema,
  ConsentCommandSchema,
  EndCallSchema,
  CallSummaryNoteSchema,
  CallRevisionSchema,
  type CallSession,
  type CallConsentPurpose,
} from "../../../../packages/api/src/session";
import { mediaRequest, MediaRequestError } from "../media/api";
import { useIdentityRequest } from "../identity/session-boundary";
import { webCallTransport, type WebCallTransport } from "./transport";
import "../media/media.css";

const clock = (ms: number) =>
  `${String(Math.floor(ms / 60_000)).padStart(2, "0")}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}`;
type CallViewProps = {
  creatorId: string;
  fanId: string;
  sessionId: string;
  actorAccountId: string | null;
};
type CallAction = "consent" | "end" | "summary-note" | "delete-summary";
type PendingCallCommand = Readonly<{
  action: CallAction;
  body: string;
  fallback: string;
}>;
export function CallView(props: CallViewProps) {
  const identity = useIdentityRequest();
  const boundary = useRef({ signal: identity.signal, revision: 0 });
  const [restored, setRestored] = useState(0);
  if (boundary.current.signal !== identity.signal) {
    boundary.current = {
      signal: identity.signal,
      revision: boundary.current.revision + 1,
    };
  }
  useEffect(() => {
    const restore = (event: PageTransitionEvent) => {
      if (event.persisted) setRestored((value) => value + 1);
    };
    window.addEventListener("pageshow", restore);
    return () => window.removeEventListener("pageshow", restore);
  }, []);
  return (
    <CallSessionView
      key={`${identity.session.accountId}/${identity.session.sessionId}/${boundary.current.revision}/${restored}/${props.actorAccountId}/${props.creatorId}/${props.fanId}/${props.sessionId}`}
      {...props}
    />
  );
}
function CallSessionView({
  creatorId,
  fanId,
  sessionId,
  actorAccountId,
}: CallViewProps) {
  const identity = useIdentityRequest();
  const opening = useRef(identity).current;
  const lifetime = useRef<AbortController | null>(null);
  const mutation = useRef<AbortController | null>(null);
  const pendingMutation = useRef<PendingCallCommand | null>(null);
  const projection = useRef<CallSession | null>(null);
  const changingMedia = useRef(false);
  const joining = useRef(false);
  const root = `threads/${creatorId}/${fanId}/calls/${sessionId}`;
  const [session, setSession] = useState<CallSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [busy, setBusy] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [muted, setMuted] = useState(false);
  const [camera, setCamera] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [localState, setLocalState] = useState("disconnected");
  const [remoteMedia, setRemoteMedia] = useState<MediaStream | null>(null);
  const [summaryNote, setSummaryNote] = useState("");
  const [pendingCommand, setPendingCommand] =
    useState<PendingCallCommand | null>(null);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const video = useRef<HTMLVideoElement | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const remote = useRef<HTMLVideoElement | null>(null);
  const transport = useRef<WebCallTransport | null>(null);
  const mediaEpoch = useRef(0);
  function disconnectMedia() {
    mediaEpoch.current++;
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    const adapter = transport.current;
    transport.current = null;
    void adapter?.disconnect().catch(() => undefined);
    if (video.current) video.current.srcObject = null;
    if (remote.current) remote.current.srcObject = null;
    setPreviewing(false);
    setRemoteMedia(null);
    setLocalState("disconnected");
  }
  function currentView(owner = lifetime.current) {
    return (
      owner !== null &&
      owner === lifetime.current &&
      !owner.signal.aborted &&
      !opening.signal.aborted &&
      opening.session.accountId === actorAccountId
    );
  }
  async function callRequest(path: string, init: RequestInit = {}) {
    const owner = lifetime.current;
    if (!currentView(owner))
      throw new DOMException("Call view ended", "AbortError");
    const signal = AbortSignal.any([
      owner!.signal,
      opening.signal,
      AbortSignal.timeout(10_000),
      ...(init.signal ? [init.signal] : []),
    ]);
    const result = await mediaRequest<unknown>(path, {
      ...init,
      expectedAccountId: opening.session.accountId,
      expectedSessionId: opening.session.sessionId,
      signal,
    });
    signal.throwIfAborted();
    if (!currentView(owner))
      throw new DOMException("Call view ended", "AbortError");
    return result;
  }
  function adoptSession(input: unknown) {
    if (!currentView()) throw new DOMException("Call view ended", "AbortError");
    const value = CallSessionSchema.parse(input);
    const prior = projection.current;
    if (
      value.id !== sessionId ||
      value.creatorId !== creatorId ||
      value.fanId !== fanId ||
      ![value.creatorAccountId, value.fanAccountId].includes(
        opening.session.accountId,
      ) ||
      (prior &&
        (prior.commitmentId !== value.commitmentId ||
          prior.threadId !== value.threadId ||
          prior.creatorAccountId !== value.creatorAccountId ||
          prior.fanAccountId !== value.fanAccountId))
    )
      throw new Error(
        copy.w6ThisActionCouldNotCompleteRefreshTheCallBeforeTrying,
      );
    if (
      prior &&
      (prior.version > value.version ||
        (prior.version === value.version &&
          Date.parse(prior.serverNow) > Date.parse(value.serverNow)))
    ) {
      setSession(prior);
      return prior;
    }
    projection.current = value;
    setSession(value);
    return value;
  }
  useEffect(() => {
    const owner = new AbortController();
    lifetime.current = owner;
    const close = () => {
      owner.abort();
      mutation.current?.abort();
      pendingMutation.current = null;
      setPendingCommand(null);
      disconnectMedia();
    };
    window.addEventListener("pagehide", close);
    opening.signal.addEventListener("abort", close);
    if (opening.signal.aborted) close();
    return () => {
      window.removeEventListener("pagehide", close);
      opening.signal.removeEventListener("abort", close);
      close();
      if (lifetime.current === owner) lifetime.current = null;
    };
  }, []);
  const connected =
    session?.state === "connected" && localState === "connected";
  useEffect(() => {
    if (connected && remote.current) remote.current.srcObject = remoteMedia;
  }, [connected, remoteMedia]);
  const leaveDialog = useRef<HTMLDialogElement | null>(null);
  const role =
    session && actorAccountId === session.creatorAccountId
      ? "creator"
      : session && actorAccountId === session.fanAccountId
        ? "fan"
        : null;
  useEffect(() => {
    const dialog = leaveDialog.current;
    if (leaving && dialog && !dialog.open) dialog.showModal();
    else if (!leaving && dialog?.open) dialog.close();
  }, [leaving]);
  useEffect(() => {
    let active = true;
    let fetching = false;
    let retry = true;
    let delay = 1000;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();
    const refresh = async () => {
      if (fetching || !active || document.visibilityState === "hidden") return;
      fetching = true;
      setRefreshing(true);
      try {
        const result = await callRequest(root, {
          signal: controller.signal,
        });
        if (active && currentView()) {
          const value = adoptSession(result);
          setStale(false);
          setFetchError(null);
          // Receipts may still gain a reconciled outcome/summary after closure.
          delay = ["ended", "cancelled"].includes(value.state) ? 30000 : 1000;
        }
      } catch (e) {
        if (active && currentView()) {
          if (
            e instanceof MediaRequestError &&
            [401, 403, 404, 409].includes(e.status)
          ) {
            disconnectMedia();
            setSession(null);
            retry = false;
          }
          if (
            e instanceof MediaRequestError &&
            [
              "calls_unconfigured",
              "call_control_unconfigured",
              "call_provider_unconfigured",
              "call_admission_unverified",
              "call_control_role_invalid",
            ].includes(e.code ?? "")
          )
            retry = false;
          delay = Math.min(delay * 2, 30000);
          setStale(true);
          setFetchError(
            e instanceof MediaRequestError &&
              ["media_unavailable", "media_transport_unavailable"].includes(
                e.code ?? "",
              )
              ? copy.w6ReconnectToRefreshThisCallActionsAreUnavailableUntilAccess
              : e instanceof Error
                ? e.message
                : copy.w6TheCallIsUnavailable,
          );
        }
      } finally {
        fetching = false;
        if (active && currentView()) {
          setRefreshing(false);
          if (retry) timer = setTimeout(() => void refresh(), delay);
        }
      }
    };
    const foreground = () => {
      if (!retry || document.visibilityState === "hidden") return;
      clearTimeout(timer);
      void refresh();
    };
    void refresh();
    document.addEventListener("visibilitychange", foreground);
    return () => {
      active = false;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", foreground);
      controller.abort();
      disconnectMedia();
    };
  }, [root, actorAccountId, refreshVersion]);
  useEffect(() => {
    if (session && ["ending", "ended", "cancelled"].includes(session.state)) {
      disconnectMedia();
    }
  }, [session?.state]);
  async function preflight() {
    if (
      !currentView() ||
      !session ||
      !role ||
      busy ||
      joining.current ||
      changingMedia.current ||
      mutation.current ||
      pendingMutation.current ||
      stale ||
      transport.current ||
      ["ending", "ended", "cancelled"].includes(session.state)
    )
      return;
    const epoch = ++mediaEpoch.current;
    setError(null);
    try {
      stream.current?.getTracks().forEach((t) => t.stop());
      const current = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: session?.mediaMode === "video",
      });
      if (!currentView() || epoch !== mediaEpoch.current) {
        current.getTracks().forEach((track) => track.stop());
        return;
      }
      stream.current = current;
      setPreviewing(true);
      setCamera(session?.mediaMode === "video");
      if (video.current) video.current.srcObject = current;
    } catch {
      if (!currentView() || epoch !== mediaEpoch.current) return;
      setError(copy.w6CameraOrMicrophoneAccessIsOffOrUnavailableCheckYour);
    }
  }
  useEffect(() => {
    if (previewing && video.current && stream.current)
      video.current.srcObject = stream.current;
  }, [previewing]);
  async function join() {
    if (
      !currentView() ||
      !role ||
      busy ||
      stale ||
      joining.current ||
      changingMedia.current ||
      mutation.current ||
      pendingMutation.current
    )
      return;
    if (transport.current && localState !== "disconnected") return;
    setError(null);
    const adapter = webCallTransport();
    if (!adapter) {
      setError(copy.w6CallingIsNotConnectedYetYourBookingIsUnchanged);
      return;
    }
    joining.current = true;
    setBusy(true);
    const epoch = ++mediaEpoch.current;
    try {
      const token = CallAdmissionSchema.parse(
        await callRequest(`${root}/join`, {
          method: "POST",
          body: "{}",
        }),
      );
      if (!currentView() || epoch !== mediaEpoch.current) return;
      if (
        token.sessionId !== sessionId ||
        token.accountId !== actorAccountId ||
        token.role !== role ||
        !Number.isFinite(Date.parse(token.expiresAt)) ||
        Date.parse(token.expiresAt) <= Date.now()
      )
        throw new Error(copy.w6ConnectionFailedRejoinTheSameCall);
      const admission = AdmissionReceiptSchema.parse(
        await callRequest(`${root}/redeem`, {
          method: "POST",
          body: JSON.stringify({ nonce: token.nonce }),
        }),
      );
      if (!currentView() || epoch !== mediaEpoch.current) return;
      if (
        admission.admitted !== true ||
        Date.parse(token.expiresAt) <= Date.now()
      )
        throw new Error(copy.w6ConnectionFailedRejoinTheSameCall);
      transport.current = adapter;
      await adapter.connect({
        ...token,
        microphone: stream.current,
        camera,
        onRemote: (value) => {
          if (currentView() && epoch === mediaEpoch.current)
            setRemoteMedia(value);
        },
        onState: (value) => {
          if (currentView() && epoch === mediaEpoch.current)
            setLocalState(value);
        },
      });
      if (!currentView() || epoch !== mediaEpoch.current)
        await adapter.disconnect();
    } catch (e) {
      await adapter.disconnect().catch(() => undefined);
      if (!currentView() || epoch !== mediaEpoch.current) return;
      transport.current = null;
      setLocalState("disconnected");
      setError(
        e instanceof Error
          ? e.message
          : copy.w6ConnectionFailedRejoinTheSameCall,
      );
    } finally {
      joining.current = false;
      if (currentView()) setBusy(false);
    }
  }
  async function mutate(
    action: CallAction,
    body: Record<string, unknown>,
    fallback: string,
  ) {
    if (pendingMutation.current) return false;
    if (!canMutate()) return false;
    const command = Object.freeze({
      action,
      body: JSON.stringify(body),
      fallback,
    });
    pendingMutation.current = command;
    setPendingCommand(command);
    return sendMutation(command);
  }
  function canMutate() {
    return (
      currentView() &&
      !mutation.current &&
      !joining.current &&
      !changingMedia.current &&
      !busy &&
      !stale &&
      !document.hidden
    );
  }
  async function sendMutation(command: PendingCallCommand) {
    if (!canMutate() || pendingMutation.current !== command) return false;
    const owner = lifetime.current;
    const attempt = new AbortController();
    mutation.current = attempt;
    setError(null);
    setBusy(true);
    try {
      const receipt = CallSessionSchema.parse(
        await callRequest(`${root}/${command.action}`, {
          method: "POST",
          body: command.body,
          signal: attempt.signal,
        }),
      );
      const original: unknown = JSON.parse(command.body);
      let confirmed = false;
      if (command.action === "consent") {
        const body = ConsentCommandSchema.parse(original);
        confirmed =
          receipt.version > body.expectedVersion &&
          receipt.consents.some(
            (value) =>
              value.actorAccountId === opening.session.accountId &&
              value.role === role &&
              value.purpose === body.purpose &&
              value.granted === body.granted,
          );
      } else if (command.action === "end") {
        const body = EndCallSchema.parse(original);
        confirmed =
          receipt.version >= body.expectedVersion &&
          ["ending", "ended", "cancelled"].includes(receipt.state);
      } else if (command.action === "summary-note") {
        const body = CallSummaryNoteSchema.parse(original);
        confirmed =
          receipt.version > body.expectedVersion &&
          receipt.creatorSummaryNote === body.note &&
          receipt.summaryState === "pending";
      } else {
        const body = CallRevisionSchema.parse(original);
        confirmed =
          receipt.version > body.expectedVersion &&
          receipt.summaryState === "deleted" &&
          receipt.summary === null &&
          receipt.creatorSummaryNote === undefined;
      }
      if (!confirmed)
        throw new Error(
          copy.w6ThisActionCouldNotCompleteRefreshTheCallBeforeTrying,
        );
      adoptSession(receipt);
      if (!currentView(owner) || pendingMutation.current !== command)
        return false;
      pendingMutation.current = null;
      setPendingCommand(null);
      if (command.action === "end") {
        disconnectMedia();
        setLeaving(false);
      }
      return true;
    } catch (e) {
      if (currentView(owner) && mutation.current === attempt) {
        // These original transactional refusals prove this command did not
        // commit. A transport failure, malformed receipt or other error does
        // not: retain the exact serialized body/key until its retry confirms.
        if (
          e instanceof MediaRequestError &&
          e.status === 403 &&
          [
            "call_stale",
            "call_consent_unavailable",
            "summary_consent_required",
            "creator_required",
            "fan_end_choice_required",
          ].includes(e.code ?? "")
        ) {
          pendingMutation.current = null;
          setPendingCommand(null);
          setStale(true);
          setRefreshVersion((value) => value + 1);
        }
        setError(e instanceof Error ? e.message : command.fallback);
      }
      return false;
    } finally {
      if (mutation.current === attempt) {
        mutation.current = null;
        if (currentView(owner)) setBusy(false);
      }
    }
  }
  async function consent(purpose: CallConsentPurpose, granted: boolean) {
    if (!session || !role) return;
    await mutate(
      "consent",
      ConsentCommandSchema.parse({
        purpose,
        granted,
        expectedVersion: session.version,
        idempotencyKey: crypto.randomUUID(),
      }),
      copy.w6ConsentCouldNotBeSaved,
    );
  }
  async function end(choice: "end_by_choice" | "technical_problem") {
    if (!session || !role) return;
    await mutate(
      "end",
      EndCallSchema.parse({
        expectedVersion: session.version,
        ...(role === "fan" ? { fanChoice: choice } : {}),
        idempotencyKey: crypto.randomUUID(),
      }),
      copy.w6TheCallCouldNotBeEndedTryAgain,
    );
  }
  async function summaryAction(action: "summary-note" | "delete-summary") {
    if (!session || !role) return;
    await mutate(
      action,
      action === "summary-note"
        ? CallSummaryNoteSchema.parse({
            expectedVersion: session.version,
            idempotencyKey: crypto.randomUUID(),
            note: summaryNote,
          })
        : CallRevisionSchema.parse({
            expectedVersion: session.version,
            idempotencyKey: crypto.randomUUID(),
          }),
      copy.w6TheSummaryCouldNotBeChanged,
    );
  }
  const commandRetry = pendingCommand ? (
    <div className="w6-notice">
      <p role="status">{copy.w6CallActionUnconfirmed}</p>
      <button
        className="qv-btn qv-btn--secondary"
        disabled={busy || stale || !role}
        onClick={() => {
          const original = pendingMutation.current;
          if (original) void sendMutation(original);
        }}
      >
        {copy.w6RetryCallAction}
      </button>
    </div>
  ) : null;
  async function changeMedia(kind: "microphone" | "camera") {
    const adapter = transport.current;
    const epoch = mediaEpoch.current;
    if (
      !currentView() ||
      !adapter ||
      changingMedia.current ||
      joining.current ||
      mutation.current ||
      busy ||
      stale
    )
      return;
    const enabled = kind === "microphone" ? muted : !camera;
    changingMedia.current = true;
    setBusy(true);
    try {
      await adapter[kind](enabled);
      if (
        !currentView() ||
        epoch !== mediaEpoch.current ||
        adapter !== transport.current
      )
        return;
      if (kind === "microphone") setMuted(!enabled);
      else setCamera(enabled);
    } catch {
      if (
        currentView() &&
        epoch === mediaEpoch.current &&
        adapter === transport.current
      )
        setError(
          kind === "microphone"
            ? copy.w6MicrophoneChangeFailed
            : copy.w6CameraChangeFailed,
        );
    } finally {
      changingMedia.current = false;
      if (currentView()) setBusy(false);
    }
  }
  if (!session)
    return (
      <main className="w6-call">
        <span className="qv-meta">{copy.w6CALL}</span>
        <h1>
          {fetchError ? copy.w6ThisCallIsUnavailable : copy.w6OpeningYourCall}
        </h1>
        <p className="w6-notice" role="status">
          {fetchError ?? copy.w6CheckingTheBookingAndParticipantAccess}
        </p>
        {fetchError && (
          <button
            className="qv-btn qv-btn--secondary"
            disabled={refreshing}
            onClick={() => setRefreshVersion((value) => value + 1)}
          >
            {copy.w6RefreshCall}
          </button>
        )}
        <a
          className="qv-btn qv-btn--secondary"
          href={`/api/auth/continue?returnTo=${encodeURIComponent(`/calls/${creatorId}/${fanId}/${sessionId}`)}`}
        >
          {copy.w6ContinueWithPantopus}
        </a>
        <a href="/support">{copy.w6GetHelp}</a>
      </main>
    );
  const ended = session.state === "ended" || session.state === "cancelled";
  const live = ["connected", "reconnecting", "ending"].includes(session.state);
  const outcomeCopy = {
    completed: formatCopy("w6YouSpokeWithForMinutes", {
      value1: session.creatorName,
      value2: Math.floor(session.connectedMilliseconds / 60_000),
      value3:
        Math.floor(session.connectedMilliseconds / 1000) % 60
          ? formatCopy("w6SecondsSuffix", {
              value1: Math.floor(session.connectedMilliseconds / 1000) % 60,
            })
          : "",
    }),
    partial: formatCopy("w6CreatorEndedEarly", { value1: session.creatorName }),
    creator_no_show: formatCopy("w6CreatorDidNotJoin", {
      value1: session.creatorName,
    }),
    fan_no_show: copy.w6YouMissedTheCall,
    technical_failure: copy.w6TheCallEndedBecauseOfATechnicalProblem,
  };
  return (
    <main
      className={`w6-call ${live ? "w6-call--live" : ended ? "w6-call--after" : "w6-call--before"}`}
    >
      {!live && (
        <span className="qv-meta">
          {formatCopy("w6MINUTECALL", {
            value1: session.durationSeconds / 60,
            value2: session.mediaMode.toUpperCase(),
          })}
        </span>
      )}
      {ended ? (
        <>
          <h1>
            {session.state === "cancelled"
              ? copy.w6ThisCallWasCancelled
              : session.outcome
                ? outcomeCopy[session.outcome]
                : copy.w6CallOutcomeIsBeingReconciled}
          </h1>
        </>
      ) : !live ? (
        <h1>
          {formatCopy("w6With", {
            value1: new Intl.DateTimeFormat(undefined, {
              weekday: "long",
              hour: "2-digit",
              minute: "2-digit",
            }).format(new Date(session.scheduledAt)),
            value2: session.creatorName,
          })}
        </h1>
      ) : null}
      {live && (
        <CallChip
          name={session.creatorName}
          time={clock(session.connectedMilliseconds)}
          end={clock(session.durationSeconds * 1000)}
          recording={["on", "stopping"].includes(session.recordingState)}
        />
      )}
      {["starting", "stopping", "blocked"].includes(session.recordingState) && (
        <p className="w6-notice" role="status">
          {session.recordingState === "starting"
            ? copy.w6RecordingRequestedWaitingForProviderConfirmation
            : session.recordingState === "stopping"
              ? copy.w6RecordingIsStoppingAwaitingProviderConfirmation
              : copy.w6RecordingStateCouldNotBeConfirmed}
        </p>
      )}
      {!connected && !ended && (
        <Countdown tone="soon">
          {session.state === "reconnecting"
            ? formatCopy("w6ReconnectingAllowanceLeft", {
                value1: clock(
                  Math.max(
                    0,
                    session.reconnectBudgetSeconds * 1000 -
                      session.reconnectUsedMilliseconds,
                  ),
                ),
              })
            : Date.parse(session.serverNow) < Date.parse(session.scheduledAt)
              ? formatCopy("w6StartsIn", {
                  value1: clock(
                    Date.parse(session.scheduledAt) -
                      Date.parse(session.serverNow),
                  ),
                })
              : session.state === "ending"
                ? copy.w6EndingConfirmingProviderHistory
                : copy.w6WaitingForBothParticipants}
        </Countdown>
      )}
      {stale && (
        <p className="w6-notice" role="status">
          {copy.w6ConnectionLostDisplayedTimesAreFromTheLastServerUpdate}
        </p>
      )}
      {error && (
        <p className="w6-notice" role="status">
          {error}
        </p>
      )}
      {!leaving && commandRetry}
      {!live && !ended && (
        <>
          <section className="w6-card w6-call-facts">
            <dl>
              <dt>{copy.w6Length}</dt>
              <dd>
                {formatCopy("w6MinutesFixedNoOvertimeCharge", {
                  value1: session.durationSeconds / 60,
                })}
              </dd>
              <dt>
                {formatCopy("w6SharedWith", { value1: session.creatorName })}
              </dt>
              <dd>{session.packet.summary}</dd>
              <dt>{copy.w6Attachments}</dt>
              <dd>
                {formatCopy("w6SharedFiles", {
                  value1: session.packet.attachmentIds.length,
                })}
              </dd>
              <dt>{copy.w6Recording}</dt>
              <dd>
                {["on", "stopping"].includes(session.recordingState)
                  ? copy.w6Recording
                  : session.recordingState === "off"
                    ? copy.w6Off
                    : copy.w6AwaitingConfirmation}
              </dd>
              <dt>{copy.w6IfEitherOfYouDrops}</dt>
              <dd>
                {formatCopy("w6TimerPausesUpToMinTotal", {
                  value1: session.reconnectBudgetSeconds / 60,
                })}
              </dd>
              <dt>{copy.w6TimeZone}</dt>
              <dd>{Intl.DateTimeFormat().resolvedOptions().timeZone}</dd>
              <dt>{copy.w6Request}</dt>
              <dd className="qv-mono">{session.commitmentId}</dd>
            </dl>
          </section>
          <p className="qv-help">
            {formatCopy(
              "w6JoiningEarlyStartsNothingIfDoesnTJoinWithinMinutes",
              {
                value1: session.creatorName,
                value2: session.graceSeconds / 60,
              },
            )}
          </p>
        </>
      )}
      {(live || previewing) && (
        <div className="w6-video">
          {live ? (
            <video
              className="w6-remote-video"
              ref={remote}
              autoPlay
              playsInline
              aria-label={
                role === "creator"
                  ? copy.w6TheFanSLiveVideo
                  : formatCopy("w6SLiveVideo", { value1: session.creatorName })
              }
            />
          ) : (
            <span>
              {session.state === "reconnecting"
                ? copy.w6ReconnectingTimerPaused
                : copy.w6PrivateDeviceCheck}
            </span>
          )}
          <span className="w6-video-label">
            {session.mediaMode.toUpperCase()} ·{" "}
            {role === "creator"
              ? copy.w6FAN
              : session.creatorName.toUpperCase()}
          </span>
          <div className="w6-self-video">
            <video
              ref={video}
              autoPlay
              muted
              playsInline
              aria-label={copy.w6YourPrivateCameraPreview}
              hidden={!previewing}
            />
            <span>{copy.w6YOU}</span>
          </div>
          {live && !connected && (
            <p className="w6-video-status" role="status">
              {session.state === "reconnecting"
                ? copy.w6ReconnectingTimerPaused
                : copy.w6EndingConfirmingProviderHistory}
            </p>
          )}
        </div>
      )}
      {live && (
        <div className="w6-controls">
          <button
            className="qv-btn qv-btn--secondary"
            disabled={busy || stale || !transport.current}
            onClick={() => {
              void changeMedia("microphone");
            }}
          >
            {muted ? copy.w6Unmute : copy.w6Mute}
          </button>
          <button
            className="qv-btn qv-btn--secondary"
            disabled={
              busy ||
              stale ||
              !transport.current ||
              session.mediaMode !== "video"
            }
            onClick={() => {
              void changeMedia("camera");
            }}
          >
            {copy.w6Camera}
          </button>
          <a
            className="qv-btn qv-btn--secondary"
            href={`/support?sessionId=${session.id}`}
          >
            {copy.w6Report}
          </a>
          <button
            className="qv-btn qv-btn--secondary"
            disabled={busy || stale || !role}
            onClick={() => setLeaving(true)}
          >
            {copy.w6Leave}
          </button>
        </div>
      )}
      {(live || ended) && (
        <section className="w6-card">
          <strong>
            {session.state === "ended"
              ? copy.w6BothOfYouCanGetAShortSummary
              : copy.w6SeparatePermissions}
          </strong>
          {(["recording", "summary", "content_reuse", "ai_source"] as const)
            .filter((purpose) => {
              const granted = session.consents.some(
                (value) =>
                  value.role === role &&
                  value.purpose === purpose &&
                  value.granted,
              );
              if (session.state === "cancelled") return granted;
              return (
                purpose !== "recording" ||
                !["ending", "ended"].includes(session.state) ||
                granted
              );
            })
            .map((purpose) => (
              <label key={purpose}>
                <span>
                  {purpose === "summary"
                    ? copy.w6IDLikeASummary
                    : purpose === "recording"
                      ? copy.w6AllowRecording
                      : purpose === "content_reuse"
                        ? copy.w6AllowContentReuse
                        : copy.w6AllowUseAsAnAISource}
                </span>
                <input
                  type="checkbox"
                  disabled={busy || stale || !role || pendingCommand !== null}
                  onChange={(event) => {
                    void consent(purpose, event.target.checked);
                  }}
                  checked={session.consents.some(
                    (value) =>
                      value.role === role &&
                      value.purpose === purpose &&
                      value.granted,
                  )}
                />
              </label>
            ))}
          <p className="qv-help">
            {
              copy.w6EachPurposeNeedsBothPeopleSPermissionWithoutRecordingPermission
            }
          </p>
          {session.summary &&
            ["creator", "fan"].every((participant) =>
              session.consents.some(
                (value) =>
                  value.role === participant &&
                  value.purpose === "summary" &&
                  value.granted,
              ),
            ) && <p>{session.summary}</p>}
          {ended &&
            role === "creator" &&
            ["creator", "fan"].every((r) =>
              session.consents.some(
                (c) => c.role === r && c.purpose === "summary" && c.granted,
              ),
            ) && (
              <>
                <label htmlFor="creator-summary-note">
                  {copy.w6YourPostCallNote}
                </label>
                <textarea
                  id="creator-summary-note"
                  maxLength={8000}
                  disabled={busy || stale || pendingCommand !== null}
                  value={summaryNote}
                  onChange={(event) => setSummaryNote(event.target.value)}
                />
                <button
                  className="qv-btn qv-btn--secondary"
                  disabled={busy || stale || !role || pendingCommand !== null}
                  onClick={() => {
                    void summaryAction("summary-note");
                  }}
                >
                  {copy.w6SaveNoteForSummary}
                </button>
              </>
            )}
          {session.summaryState === "pending" && (
            <p role="status">
              {copy.w6SummaryQueuedAvailableWhenItsProviderCompletes}
            </p>
          )}
          {session.summary && (
            <button
              className="qv-btn qv-btn--quiet"
              disabled={busy || stale || !role || pendingCommand !== null}
              onClick={() => {
                void summaryAction("delete-summary");
              }}
            >
              {copy.w6DeleteThisSummary}
            </button>
          )}
        </section>
      )}
      {session.state === "ended" && (
        <section className="w6-card">
          <strong>{copy.w6CallReceipt}</strong>
          <dl>
            <dt>{copy.w6Connected}</dt>
            <dd>
              {formatCopy("w6TimeOfDuration", {
                value1: clock(session.connectedMilliseconds),
                value2: clock(session.durationSeconds * 1000),
              })}
            </dd>
            <dt>{copy.w6Outcome}</dt>
            <dd>{session.outcome?.replaceAll("_", " ")}</dd>
            <dt>{copy.w6Recording}</dt>
            <dd>
              {session.recordingOccurred
                ? copy.w6RecordingOccurredCheckTheConsentHistory
                : copy.w6NoRecordingWasConfirmed}
            </dd>
            <dt>{copy.w6Settlement}</dt>
            <dd>
              <a
                href={`/commerce/receipt?commitmentId=${session.commitmentId}`}
              >
                {copy.w6ViewTheReconciledReceipt}
              </a>
            </dd>
          </dl>
        </section>
      )}
      {!live && !ended && (
        <div className="w6-bottom">
          <button
            className="qv-btn qv-btn--maya qv-btn--lg"
            disabled={
              busy ||
              stale ||
              !role ||
              pendingCommand !== null ||
              (transport.current !== null && localState !== "disconnected")
            }
            onClick={() => {
              void join();
            }}
          >
            {copy.w6EnterTheWaitingRoom}
          </button>
          <button
            className="qv-btn qv-btn--quiet"
            disabled={busy || stale || !role || pendingCommand !== null}
            onClick={() => {
              void preflight();
            }}
          >
            {copy.w6CheckCameraAndMicrophone}
          </button>
        </div>
      )}
      {leaving && (
        <dialog
          ref={leaveDialog}
          className="w6-leave-dialog"
          onCancel={() => setLeaving(false)}
          onClose={() => setLeaving(false)}
        >
          <section
            className="w6-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="leave-title"
          >
            <h2 id="leave-title">{copy.w6EndThisCall}</h2>
            {commandRetry}
            <p>
              {role === "fan"
                ? copy.w6EndingByChoiceCountsAsYourCompletedCallATechnical
                : copy.w6EndingBeforeEnoughConnectedTimeSendsThisCallForPartial}
            </p>
            <button
              className="qv-btn qv-btn--secondary"
              disabled={busy || stale || !role || pendingCommand !== null}
              onClick={() => {
                void end("end_by_choice");
              }}
            >
              {role === "fan" ? copy.w6EndByChoice : copy.w6EndCall}
            </button>
            {role === "fan" && (
              <button
                className="qv-btn qv-btn--secondary"
                disabled={busy || stale || !role || pendingCommand !== null}
                onClick={() => {
                  void end("technical_problem");
                }}
              >
                {copy.w6TechnicalProblem}
              </button>
            )}
            <button
              className="qv-btn qv-btn--quiet"
              onClick={() => setLeaving(false)}
            >
              {copy.w6StayInTheCall}
            </button>
          </section>
        </dialog>
      )}
    </main>
  );
}
