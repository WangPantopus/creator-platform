"use client";
import { useEffect, useRef, useState } from "react";
import { CallChip, Countdown } from "@qelvora/ui-web";
import type {
  CallSession,
  CallConsentPurpose,
} from "../../../../packages/api/src/session";
import { mediaRequest, MediaRequestError } from "../media/api";
import { webCallTransport, type WebCallTransport } from "./transport";
import "../media/media.css";

const clock = (ms: number) =>
  `${String(Math.floor(ms / 60_000)).padStart(2, "0")}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}`;
export function CallView({
  creatorId,
  fanId,
  sessionId,
  actorAccountId,
}: {
  creatorId: string;
  fanId: string;
  sessionId: string;
  actorAccountId: string | null;
}) {
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
    const refresh = async () => {
      if (fetching) return;
      fetching = true;
      try {
        const value = await mediaRequest<CallSession>(root);
        if (active) {
          setSession((prior) =>
            prior && prior.id === value.id && prior.version > value.version
              ? prior
              : value,
          );
          setStale(false);
          setFetchError(null);
        }
      } catch (e) {
        if (active) {
          if (
            e instanceof MediaRequestError &&
            [401, 403, 404].includes(e.status)
          ) {
            disconnectMedia();
            setSession(null);
          }
          setStale(true);
          setFetchError(
            e instanceof Error ? e.message : "The call is unavailable.",
          );
        }
      } finally {
        fetching = false;
      }
    };
    void refresh();
    const timer = setInterval(() => {
      void refresh();
    }, 1000);
    return () => {
      active = false;
      clearInterval(timer);
      disconnectMedia();
    };
  }, [root]);
  useEffect(() => {
    if (session && ["ending", "ended", "cancelled"].includes(session.state)) {
      disconnectMedia();
    }
  }, [session?.state]);
  async function preflight() {
    if (
      !session ||
      !role ||
      busy ||
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
      if (epoch !== mediaEpoch.current) {
        current.getTracks().forEach((track) => track.stop());
        return;
      }
      stream.current = current;
      setPreviewing(true);
      setCamera(session?.mediaMode === "video");
      if (video.current) video.current.srcObject = current;
    } catch {
      if (epoch !== mediaEpoch.current) return;
      setError(
        "Camera or microphone access is off or unavailable. Check your device settings and try again.",
      );
    }
  }
  useEffect(() => {
    if (previewing && video.current && stream.current)
      video.current.srcObject = stream.current;
  }, [previewing]);
  async function join() {
    if (!role || busy || stale) return;
    if (transport.current && localState !== "disconnected") return;
    setError(null);
    const adapter = webCallTransport();
    if (!adapter) {
      setError("Calling is not connected yet. Your booking is unchanged.");
      return;
    }
    setBusy(true);
    const epoch = ++mediaEpoch.current;
    try {
      const token = await mediaRequest<{ token: string; url: string }>(
        `${root}/join`,
        { method: "POST", body: "{}" },
      );
      if (epoch !== mediaEpoch.current) return;
      transport.current = adapter;
      await adapter.connect({
        ...token,
        microphone: stream.current,
        camera,
        onRemote: (value) => {
          if (epoch === mediaEpoch.current) setRemoteMedia(value);
        },
        onState: (value) => {
          if (epoch === mediaEpoch.current) setLocalState(value);
        },
      });
      if (epoch !== mediaEpoch.current) await adapter.disconnect();
    } catch (e) {
      await adapter.disconnect().catch(() => undefined);
      if (epoch !== mediaEpoch.current) return;
      transport.current = null;
      setLocalState("disconnected");
      setError(
        e instanceof Error
          ? e.message
          : "Connection failed. Rejoin the same call.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function consent(purpose: CallConsentPurpose, granted: boolean) {
    if (!session || !role || busy || stale) return;
    setError(null);
    setBusy(true);
    try {
      setSession(
        await mediaRequest<CallSession>(`${root}/consent`, {
          method: "POST",
          body: JSON.stringify({
            purpose,
            granted,
            expectedVersion: session.version,
            idempotencyKey: crypto.randomUUID(),
          }),
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Consent could not be saved.");
    } finally {
      setBusy(false);
    }
  }
  async function end(choice: "end_by_choice" | "technical_problem") {
    if (!session || !role || busy || stale) return;
    setError(null);
    setBusy(true);
    try {
      setSession(
        await mediaRequest<CallSession>(`${root}/end`, {
          method: "POST",
          body: JSON.stringify({
            expectedVersion: session.version,
            ...(role === "fan" ? { fanChoice: choice } : {}),
            idempotencyKey: crypto.randomUUID(),
          }),
        }),
      );
      await transport.current?.disconnect();
      setLeaving(false);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "The call could not be ended. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function summaryAction(action: "summary-note" | "delete-summary") {
    if (!session || !role || busy || stale) return;
    setError(null);
    setBusy(true);
    try {
      setSession(
        await mediaRequest<CallSession>(`${root}/${action}`, {
          method: "POST",
          body: JSON.stringify({
            expectedVersion: session.version,
            idempotencyKey: crypto.randomUUID(),
            ...(action === "summary-note" ? { note: summaryNote } : {}),
          }),
        }),
      );
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "The summary could not be changed.",
      );
    } finally {
      setBusy(false);
    }
  }
  if (!session)
    return (
      <main className="w6-call">
        <span className="qv-meta">CALL</span>
        <h1>{fetchError ? "This call is unavailable" : "Opening your call"}</h1>
        <p className="w6-notice" role="status">
          {fetchError ?? "Checking the booking and participant access."}
        </p>
        <a
          className="qv-btn qv-btn--secondary"
          href={`/api/auth/continue?returnTo=${encodeURIComponent(`/calls/${creatorId}/${fanId}/${sessionId}`)}`}
        >
          Continue with Pantopus
        </a>
        <a href="/support">Get help</a>
      </main>
    );
  const ended = session.state === "ended" || session.state === "cancelled";
  const live = ["connected", "reconnecting", "ending"].includes(session.state);
  const outcomeCopy = {
    completed: `You spoke with ${session.creatorName} for ${Math.floor(session.connectedMilliseconds / 60_000)} minutes${Math.floor(session.connectedMilliseconds / 1000) % 60 ? ` ${Math.floor(session.connectedMilliseconds / 1000) % 60} seconds` : ""}.`,
    partial: `${session.creatorName} had to end early.`,
    creator_no_show: `${session.creatorName} did not join.`,
    fan_no_show: "You missed the call.",
    technical_failure: "The call ended because of a technical problem.",
  };
  return (
    <main
      className={`w6-call ${live ? "w6-call--live" : ended ? "w6-call--after" : "w6-call--before"}`}
    >
      {!live && (
        <span className="qv-meta">
          {session.durationSeconds / 60}-MINUTE{" "}
          {session.mediaMode.toUpperCase()} CALL
        </span>
      )}
      {ended ? (
        <>
          <h1>
            {session.state === "cancelled"
              ? "This call was cancelled."
              : session.outcome
                ? outcomeCopy[session.outcome]
                : "Call outcome is being reconciled."}
          </h1>
        </>
      ) : !live ? (
        <h1>
          {new Intl.DateTimeFormat(undefined, {
            weekday: "long",
            hour: "2-digit",
            minute: "2-digit",
          }).format(new Date(session.scheduledAt))}{" "}
          with {session.creatorName}
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
            ? "Recording requested · waiting for provider confirmation"
            : session.recordingState === "stopping"
              ? "Recording is stopping · awaiting provider confirmation"
              : "Recording state could not be confirmed"}
        </p>
      )}
      {!connected && !ended && (
        <Countdown tone="soon">
          {session.state === "reconnecting"
            ? `Reconnecting · ${clock(Math.max(0, session.reconnectBudgetSeconds * 1000 - session.reconnectUsedMilliseconds))} allowance left`
            : Date.parse(session.serverNow) < Date.parse(session.scheduledAt)
              ? `Starts in ${clock(Date.parse(session.scheduledAt) - Date.parse(session.serverNow))}`
              : session.state === "ending"
                ? "Ending · confirming provider history"
                : "Waiting for both participants"}
        </Countdown>
      )}
      {stale && (
        <p className="w6-notice" role="status">
          Connection lost · displayed times are from the last server update.
        </p>
      )}
      {error && (
        <p className="w6-notice" role="status">
          {error}
        </p>
      )}
      {!live && !ended && (
        <>
          <section className="w6-card w6-call-facts">
            <dl>
              <dt>Length</dt>
              <dd>
                {session.durationSeconds / 60} minutes, fixed · no overtime
                charge
              </dd>
              <dt>Shared with {session.creatorName}</dt>
              <dd>{session.packet.summary}</dd>
              <dt>Attachments</dt>
              <dd>{session.packet.attachmentIds.length} shared files</dd>
              <dt>Recording</dt>
              <dd>
                {["on", "stopping"].includes(session.recordingState)
                  ? "Recording"
                  : session.recordingState === "off"
                    ? "Off"
                    : "Awaiting confirmation"}
              </dd>
              <dt>If either of you drops</dt>
              <dd>
                Timer pauses, up to {session.reconnectBudgetSeconds / 60} min
                total
              </dd>
              <dt>Time zone</dt>
              <dd>{Intl.DateTimeFormat().resolvedOptions().timeZone}</dd>
              <dt>Request</dt>
              <dd className="qv-mono">{session.commitmentId}</dd>
            </dl>
          </section>
          <p className="qv-help">
            Joining early starts nothing. If {session.creatorName} doesn&apos;t
            join within {session.graceSeconds / 60} minutes of the appointment,
            the booking is sent for a full refund. A fan no-show is charged as
            agreed.
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
                  ? "The fan's live video"
                  : `${session.creatorName}'s live video`
              }
            />
          ) : (
            <span>
              {session.state === "reconnecting"
                ? "Reconnecting · timer paused"
                : "Private device check"}
            </span>
          )}
          <span className="w6-video-label">
            {session.mediaMode.toUpperCase()} ·{" "}
            {role === "creator" ? "FAN" : session.creatorName.toUpperCase()}
          </span>
          <div className="w6-self-video">
            <video
              ref={video}
              autoPlay
              muted
              playsInline
              aria-label="Your private camera preview"
              hidden={!previewing}
            />
            <span>YOU</span>
          </div>
          {live && !connected && (
            <p className="w6-video-status" role="status">
              {session.state === "reconnecting"
                ? "Reconnecting · timer paused"
                : "Ending · confirming provider history"}
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
              void transport.current
                ?.microphone(muted)
                .then(() => setMuted(!muted))
                .catch(() => setError("Microphone change failed."));
            }}
          >
            {muted ? "Unmute" : "Mute"}
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
              void transport.current
                ?.camera(!camera)
                .then(() => setCamera(!camera))
                .catch(() => setError("Camera change failed."));
            }}
          >
            Camera
          </button>
          <a
            className="qv-btn qv-btn--secondary"
            href={`/support?sessionId=${session.id}`}
          >
            Report
          </a>
          <button
            className="qv-btn qv-btn--secondary"
            disabled={busy || stale || !role}
            onClick={() => setLeaving(true)}
          >
            Leave
          </button>
        </div>
      )}
      {(live || ended) && (
        <section className="w6-card">
          <strong>
            {session.state === "ended"
              ? "Both of you can get a short summary"
              : "Separate permissions"}
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
                    ? "I'd like a summary"
                    : purpose === "recording"
                      ? "Allow recording"
                      : purpose === "content_reuse"
                        ? "Allow content reuse"
                        : "Allow use as an AI source"}
                </span>
                <input
                  type="checkbox"
                  disabled={busy || stale || !role}
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
            Each purpose needs both people&apos;s permission. Without recording
            permission, a summary uses only the packet and a creator-typed note.
            Either of you can delete it.
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
                  Your post-call note
                </label>
                <textarea
                  id="creator-summary-note"
                  maxLength={8000}
                  value={summaryNote}
                  onChange={(event) => setSummaryNote(event.target.value)}
                />
                <button
                  className="qv-btn qv-btn--secondary"
                  disabled={busy || stale || !role}
                  onClick={() => {
                    void summaryAction("summary-note");
                  }}
                >
                  Save note for summary
                </button>
              </>
            )}
          {session.summaryState === "pending" && (
            <p role="status">
              Summary queued · available when its provider completes.
            </p>
          )}
          {session.summary && (
            <button
              className="qv-btn qv-btn--quiet"
              disabled={busy || stale || !role}
              onClick={() => {
                void summaryAction("delete-summary");
              }}
            >
              Delete this summary
            </button>
          )}
        </section>
      )}
      {session.state === "ended" && (
        <section className="w6-card">
          <strong>Call receipt</strong>
          <dl>
            <dt>Connected</dt>
            <dd>
              {clock(session.connectedMilliseconds)} of{" "}
              {clock(session.durationSeconds * 1000)}
            </dd>
            <dt>Outcome</dt>
            <dd>{session.outcome?.replaceAll("_", " ")}</dd>
            <dt>Recording</dt>
            <dd>
              {session.recordingOccurred
                ? "Recording occurred · check the consent history"
                : "No recording was confirmed"}
            </dd>
            <dt>Settlement</dt>
            <dd>
              <a
                href={`/commerce/receipt?commitmentId=${session.commitmentId}`}
              >
                View the reconciled receipt
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
              (transport.current !== null && localState !== "disconnected")
            }
            onClick={() => {
              void join();
            }}
          >
            Enter the waiting room
          </button>
          <button
            className="qv-btn qv-btn--quiet"
            disabled={busy || stale || !role}
            onClick={() => {
              void preflight();
            }}
          >
            Check camera and microphone
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
            <h2 id="leave-title">End this call?</h2>
            <p>
              {role === "fan"
                ? "Ending by choice counts as your completed call. A technical problem is sent for reconciliation."
                : "Ending before enough connected time sends this call for partial-delivery reconciliation."}
            </p>
            <button
              className="qv-btn qv-btn--secondary"
              disabled={busy || stale || !role}
              onClick={() => {
                void end("end_by_choice");
              }}
            >
              {role === "fan" ? "End by choice" : "End call"}
            </button>
            {role === "fan" && (
              <button
                className="qv-btn qv-btn--secondary"
                disabled={busy || stale || !role}
                onClick={() => {
                  void end("technical_problem");
                }}
              >
                Technical problem
              </button>
            )}
            <button
              className="qv-btn qv-btn--quiet"
              onClick={() => setLeaving(false)}
            >
              Stay in the call
            </button>
          </section>
        </dialog>
      )}
    </main>
  );
}
