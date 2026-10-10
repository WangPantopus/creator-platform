"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { copy } from "@qelvora/copy";
import {
  AuditBanner,
  AuthorLabel,
  EmptyState,
  LabelPreview,
  Message,
  Notice,
} from "@qelvora/ui-web";
import { MessageSchema } from "@qelvora/api";
import { ConversationCorrectionMessageSchema } from "../../../../../packages/api/src/conversation/correction";
import { SignedActReview } from "../../identity/signing";
import { ApprovedReply } from "../ApprovedReply";
import { ConversationVoiceReply } from "../ConversationVoiceReply";
import { CorrectionReply } from "../CorrectionReply";
import { StudioFailure, studioRequest } from "../api";
import { Feedback, useAction } from "../shared/action";
import { key, speakerLabel } from "../shared/format";
import { Modal } from "../shared/Modal";
import type { Creator } from "../shared/types";
import { CorrectionForm } from "./CorrectionForm";
export function Threads({
  creator,
  fanId,
}: {
  creator: Creator;
  fanId?: string;
}) {
  const voiceTrigger = useRef<HTMLButtonElement | null>(null);
  const [voiceReply, setVoiceReply] = useState<{
    fanId: string;
    threadId: string;
  } | null>(null);
  const [voicePending, setVoicePending] = useState(false);
  const [entries, setEntries] = useState<{
      items: {
        fanId: string;
        handle: string;
        sources: string[];
        updatedAt: string;
      }[];
      nextCursor: string | null;
    } | null>(null),
    [filter, setFilter] = useState("all"),
    [data, setData] = useState<{
      timeline: {
        threadId: string;
        control: string;
        epoch: number;
        messages: {
          id: string;
          authorKind: string;
          text: string;
          deliveryState: string;
          signedActId?: string;
          member?: string | null;
          version?: number;
          correction?: unknown;
        }[];
      };
      authority: string;
      creatorName: string;
    } | null>(null),
    [text, setText] = useState(""),
    [draftVersion, setDraftVersion] = useState(0),
    [draftDirty, setDraftDirty] = useState(false),
    [sentMessageId, setSentMessageId] = useState<string | null>(null),
    [review, setReview] = useState(false),
    [approveDraft, setApproveDraft] = useState(false),
    [correction, setCorrection] = useState<string | null>(null),
    [attachedCorrection, setAttachedCorrection] = useState<string | null>(null),
    [attachedVersion, setAttachedVersion] = useState<number | undefined>(
      undefined,
    ),
    [correctionPending, setCorrectionPending] = useState(false),
    [threadCurrent, setThreadCurrent] = useState(false),
    [teamPending, setTeamPending] = useState<{
      idempotencyKey: string;
      draftVersion: number;
      messageId?: string;
    } | null>(null),
    action = useAction();
  const draftEdited = useRef(false),
    threadLoading = useRef(false),
    threadMounted = useRef(false),
    threadGeneration = useRef(0),
    threadCheckedAt = useRef(0),
    directoryCursors = useRef<(string | null)[]>([null]),
    pendingTeam = useRef<typeof teamPending>(null);
  const teamStorage = `w5.team-reply:${creator.viewerAccountId}:${creator.id}:${fanId}`;
  const rememberTeam = useCallback(
    (value: typeof teamPending) => {
      pendingTeam.current = value;
      setTeamPending(value);
      try {
        if (value) sessionStorage.setItem(teamStorage, JSON.stringify(value));
        else sessionStorage.removeItem(teamStorage);
      } catch {
        /* Durable draft still lives with W5. */
      }
    },
    [teamStorage],
  );
  const load = useCallback(async () => {
    if (threadLoading.current) return;
    threadLoading.current = true;
    const generation = threadGeneration.current;
    const started = performance.now();
    try {
      if (fanId) {
        const timeline = await studioRequest<NonNullable<typeof data>>(
          "studio",
          `${creator.id}/threads/${fanId}`,
          undefined,
          creator.viewerAccountId,
        );
        const draft = await studioRequest<{
          text: string;
          version: number;
          sentMessageId: string | null;
        }>(
          "studio",
          `${creator.id}/threads/${fanId}/draft`,
          undefined,
          creator.viewerAccountId,
        );
        if (!threadMounted.current || generation !== threadGeneration.current)
          return;
        setData(timeline);
        const pending = pendingTeam.current;
        if (
          pending?.messageId &&
          draft.version > pending.draftVersion &&
          draft.text === "" &&
          timeline.timeline.messages.some(
            (message) =>
              message.id === pending.messageId &&
              message.authorKind === "team" &&
              message.deliveryState === "delivered",
          )
        )
          rememberTeam(null);
        setSentMessageId(draft.sentMessageId);
        if (!draftEdited.current) {
          setDraftVersion(draft.version);
          setText(draft.text);
        }
      } else {
        const cursor = directoryCursors.current.at(-1);
        const value = await studioRequest<NonNullable<typeof entries>>(
          "studio",
          `${creator.id}/threads${cursor ? `?${new URLSearchParams({ cursor })}` : ""}`,
          undefined,
          creator.viewerAccountId,
        );
        // Refresh one visible bounded page. Earlier private rows are discarded;
        // retaining only their opaque cursors avoids cumulative lease expiry.
        if (!threadMounted.current || generation !== threadGeneration.current)
          return;
        setEntries(value);
      }
      threadCheckedAt.current = started;
      setThreadCurrent(!document.hidden && performance.now() - started < 5000);
    } catch (error) {
      if (threadMounted.current && generation === threadGeneration.current) {
        setThreadCurrent(false);
        if (
          error instanceof StudioFailure &&
          ([401, 403, 404].includes(error.status) ||
            error.code === "session_account_changed" ||
            error.code === "session_changed")
        ) {
          setData(null);
          setEntries(null);
          setText("");
          setReview(false);
          setApproveDraft(false);
          setCorrection(null);
          setAttachedCorrection(null);
          setCorrectionPending(false);
          draftEdited.current = false;
        }
      }
      throw error;
    } finally {
      threadLoading.current = false;
    }
  }, [creator.id, creator.viewerAccountId, fanId, rememberTeam]);
  useEffect(() => {
    threadMounted.current = true;
    try {
      const raw = sessionStorage.getItem(teamStorage),
        value = raw ? (JSON.parse(raw) as typeof teamPending) : null;
      if (
        value &&
        typeof value.idempotencyKey === "string" &&
        /^[a-f0-9-]{36}$/u.test(value.idempotencyKey) &&
        Number.isSafeInteger(value.draftVersion) &&
        value.draftVersion > 0 &&
        (!value.messageId || /^[a-f0-9-]{36}$/u.test(value.messageId))
      )
        rememberTeam(value);
    } catch {
      /* Corrupt metadata cannot select an actor or invent a receipt. */
    }
    void action.run(load);
    const refresh = () => {
        if (!document.hidden) void action.run(load);
      },
      visibility = () => {
        if (document.hidden) {
          threadGeneration.current++;
          setThreadCurrent(false);
        } else refresh();
      },
      polling = setInterval(refresh, 4000),
      expiry = setInterval(() => {
        if (performance.now() - threadCheckedAt.current >= 5000)
          setThreadCurrent(false);
      }, 500);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      threadMounted.current = false;
      threadGeneration.current++;
      clearInterval(polling);
      clearInterval(expiry);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [load, teamStorage, rememberTeam]);
  const sendTeam = async () => {
    if (!fanId || !data || creator.owned) return;
    let command = pendingTeam.current;
    if (!command) {
      const saved = await studioRequest<{ version: number }>(
        "studio",
        `${creator.id}/threads/${fanId}/draft`,
        {
          text: text.trim(),
          expectedVersion: draftVersion,
          idempotencyKey: key(),
        },
        creator.viewerAccountId,
      );
      setDraftVersion(saved.version);
      setDraftDirty(false);
      draftEdited.current = false;
      setText(text.trim());
      command = { idempotencyKey: key(), draftVersion: saved.version };
      rememberTeam(command);
    }
    const saved = await studioRequest<{ text: string; version: number }>(
      "studio",
      `${creator.id}/threads/${fanId}/draft`,
      undefined,
      creator.viewerAccountId,
    );
    if (saved.version !== command.draftVersion)
      throw new Error(
        "The saved draft changed while the Team reply was unconfirmed. Refresh the audited conversation before another send.",
      );
    const message = MessageSchema.pick({
      id: true,
      threadId: true,
      authorKind: true,
      deliveryState: true,
      signedActId: true,
      member: true,
      authorAccountId: true,
    })
      .refine(
        (value) =>
          value.threadId === data.timeline.threadId &&
          value.authorKind === "team" &&
          value.deliveryState === "delivered" &&
          value.signedActId === null &&
          value.authorAccountId === creator.viewerAccountId &&
          typeof value.member === "string" &&
          value.member.length > 0,
      )
      .parse(
        await studioRequest(
          "conversations",
          `${creator.id}/${fanId}/team-replies`,
          { text: saved.text, idempotencyKey: command.idempotencyKey },
          creator.viewerAccountId,
        ),
      );
    rememberTeam({ ...command, messageId: message.id });
    const cleared = await studioRequest<{ version: number }>(
      "studio",
      `${creator.id}/threads/${fanId}/draft`,
      {
        text: "",
        expectedVersion: saved.version,
        idempotencyKey: `clear_${command.idempotencyKey}`,
      },
      creator.viewerAccountId,
    );
    setDraftVersion(cleared.version);
    setText("");
    setDraftDirty(false);
    draftEdited.current = false;
    rememberTeam(null);
    action.setNotice(`Team reply delivered · ${message.id}`);
    await load();
  };
  return (
    <section className="w5-threads">
      <header className="w5-heading">
        <h1>Threads</h1>
        <button
          className="qv-link-btn"
          disabled={action.busy}
          onClick={() => void action.run(load)}
        >
          Refresh conversations
        </button>
      </header>
      <div className="w5-gutter">
        <AuditBanner />
        <Feedback action={action} />
        {!threadCurrent && (
          <p role="status">
            Checking current conversation access. Your draft stays here during a
            connection interruption.
          </p>
        )}
        <div hidden={!threadCurrent} inert={!threadCurrent}>
          {!fanId ? (
            <>
              <p className="qv-help">
                Conversation access is separate from request routing. Every
                full-thread open is recorded for the fan.
              </p>
              <p className="qv-help">
                Conversations linked to your Notes and requests appear here.
              </p>
              <label className="w5-field">
                Show conversations
                <select
                  value={filter}
                  onChange={(event) => setFilter(event.target.value)}
                >
                  <option value="all">All linked conversations</option>
                  <option value="note_reply">Note replies</option>
                  <option value="request">Requests</option>
                </select>
              </label>
              {entries?.items
                .filter(
                  (entry) => filter === "all" || entry.sources.includes(filter),
                )
                .map((entry) => (
                  <article className="w5-card" key={entry.fanId}>
                    <h2>@{entry.handle}</h2>
                    <p className="qv-meta">
                      {entry.sources
                        .map((source) =>
                          source === "note_reply" ? "Note reply" : "Request",
                        )
                        .join(" · ")}
                    </p>
                    <Link
                      className="qv-btn qv-btn--secondary"
                      href={`/studio/${creator.id}/threads/${entry.fanId}`}
                    >
                      Open audited conversation
                    </Link>
                  </article>
                ))}
              {entries?.items.length === 0 && (
                <EmptyState
                  title="No linked conversations"
                  body="Current conversations will appear when fans reply to Notes or send requests."
                />
              )}
              <div className="w5-actions">
                {directoryCursors.current.length > 1 && (
                  <button
                    className="qv-btn qv-btn--secondary"
                    disabled={action.busy}
                    onClick={() =>
                      void action.run(async () => {
                        threadGeneration.current++;
                        setThreadCurrent(false);
                        setEntries(null);
                        directoryCursors.current.pop();
                        await load();
                      })
                    }
                  >
                    Previous conversations
                  </button>
                )}
                {entries?.nextCursor && (
                  <button
                    className="qv-btn qv-btn--secondary"
                    disabled={action.busy}
                    onClick={() =>
                      void action.run(async () => {
                        if (!entries.nextCursor) return;
                        threadGeneration.current++;
                        setThreadCurrent(false);
                        directoryCursors.current.push(entries.nextCursor);
                        setEntries(null);
                        await load();
                      })
                    }
                  >
                    Next conversations
                  </button>
                )}
              </div>
            </>
          ) : (
            data && (
              <>
                <p className="qv-meta">
                  Current speaker ·{" "}
                  {speakerLabel(data.timeline.control, creator.display_name)}
                </p>
                <div className="w5-thread-messages">
                  {data.timeline.messages.map((m) => {
                    const parsed =
                      ConversationCorrectionMessageSchema.safeParse(m);
                    const attachment =
                      parsed.success &&
                      parsed.data.authorKind === "human_creator" &&
                      parsed.data.signedActId
                        ? parsed.data.correction
                        : null;
                    return (
                      <article key={m.id}>
                        <Message
                          kind={m.authorKind as "fan"}
                          name={creator.display_name}
                          signedActId={m.signedActId}
                          member={m.member ?? "Member identity unavailable"}
                          actions={false}
                        >
                          {m.text}
                        </Message>
                        {attachment && (
                          <Notice title="Correction to the AI answer">
                            <p>
                              Original answer · version{" "}
                              {attachment.originalVersion}
                            </p>
                            <button
                              className="qv-btn qv-btn--quiet"
                              onClick={() => {
                                setAttachedVersion(attachment.originalVersion);
                                setAttachedCorrection(
                                  attachment.originalMessageId,
                                );
                              }}
                            >
                              Open original answer
                            </button>
                          </Notice>
                        )}
                        {creator.owned && m.authorKind === "ai" && (
                          <div className="w5-actions">
                            <button
                              className="qv-btn qv-btn--quiet"
                              disabled={
                                !m.text.trim() ||
                                !["delivered", "interrupted"].includes(
                                  m.deliveryState,
                                )
                              }
                              onClick={() => {
                                setAttachedVersion(undefined);
                                setAttachedCorrection(m.id);
                              }}
                            >
                              Correct this answer
                            </button>
                            <button
                              className="qv-btn qv-btn--quiet"
                              onClick={() => setCorrection(m.text)}
                            >
                              I’d never say that
                            </button>
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
                <div className="w5-actions">
                  {[
                    ["takeover", "Take over"],
                    ["handback", "Hand back to AI"],
                    ["pause", "Pause for this fan"],
                  ].map(([op, label]) => (
                    <button
                      key={op}
                      className={`qv-btn ${op === "takeover" ? "qv-btn--maya" : "qv-btn--secondary"}`}
                      disabled={action.busy || !creator.owned}
                      onClick={() =>
                        void action.run(async () => {
                          await studioRequest(
                            "studio",
                            `${creator.id}/threads/${fanId}/${op}`,
                            {
                              idempotencyKey: key(),
                            },
                            creator.viewerAccountId,
                          );
                          await load();
                        })
                      }
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <label className="w5-field">
                  Your words
                  <textarea
                    rows={4}
                    disabled={action.busy || !!teamPending}
                    maxLength={creator.owned ? 20000 : 8000}
                    value={text}
                    onChange={(e) => {
                      setText(e.target.value);
                      setDraftDirty(true);
                      draftEdited.current = true;
                      setReview(false);
                    }}
                  />
                </label>
                <button
                  className="qv-btn qv-btn--secondary"
                  disabled={action.busy || !!teamPending}
                  onClick={() =>
                    void action.run(async () => {
                      const saved = await studioRequest<{ version: number }>(
                        "studio",
                        `${creator.id}/threads/${fanId}/draft`,
                        {
                          text,
                          expectedVersion: draftVersion,
                          idempotencyKey: key(),
                        },
                        creator.viewerAccountId,
                      );
                      setDraftVersion(saved.version);
                      setDraftDirty(false);
                      draftEdited.current = false;
                      setSentMessageId(null);
                      setReview(false);
                    })
                  }
                >
                  Save reply draft
                </button>
                {sentMessageId && (
                  <p className="qv-help">
                    This saved revision was delivered. Edit and save a new
                    revision for another reply.
                  </p>
                )}
                {creator.owned ? (
                  <LabelPreview
                    kind="human_creator"
                    name={creator.display_name}
                  />
                ) : (
                  <AuthorLabel
                    kind="team"
                    name={creator.display_name}
                    member={
                      creator.memberHandle
                        ? `@${creator.memberHandle} · triage`
                        : "Member identity unavailable"
                    }
                  />
                )}
                <button
                  className="qv-btn qv-btn--maya"
                  disabled={
                    !creator.owned ||
                    !text ||
                    Boolean(sentMessageId && !draftDirty) ||
                    data.timeline.control !== "human_active"
                  }
                  onClick={() =>
                    void action.run(async () => {
                      if (draftDirty || !draftVersion) {
                        const saved = await studioRequest<{ version: number }>(
                          "studio",
                          `${creator.id}/threads/${fanId}/draft`,
                          {
                            text,
                            expectedVersion: draftVersion,
                            idempotencyKey: key(),
                          },
                          creator.viewerAccountId,
                        );
                        setDraftVersion(saved.version);
                        setDraftDirty(false);
                        draftEdited.current = false;
                      }
                      setReview(true);
                    })
                  }
                >
                  Review signed reply
                </button>
                {creator.owned && fanId && (
                  <button
                    ref={voiceTrigger}
                    className="qv-btn qv-btn--secondary"
                    disabled={
                      action.busy || data.timeline.control !== "human_active"
                    }
                    onClick={() =>
                      setVoiceReply({ fanId, threadId: data.timeline.threadId })
                    }
                  >
                    {copy.w6RecordAVoiceReply}
                  </button>
                )}
                {!creator.owned && (
                  <>
                    <p className="qv-help">
                      Your reply carries your Team identity. The creator
                      controls personal replies and AI takeover.
                    </p>
                    <button
                      className="qv-btn qv-btn--secondary"
                      disabled={
                        action.busy ||
                        (!text.trim() && !teamPending) ||
                        text.trim().length > 8000 ||
                        data.authority !== "triage" ||
                        data.timeline.control === "closed"
                      }
                      onClick={() => void action.run(sendTeam)}
                    >
                      {teamPending
                        ? "Confirm pending Team reply"
                        : "Send as Team"}
                    </button>
                  </>
                )}
                {(creator.owned ||
                  (creator.roles.includes("triage") &&
                    creator.roles.includes("drafter"))) && (
                  <button
                    className="qv-btn qv-btn--secondary"
                    disabled={action.busy}
                    onClick={() => setApproveDraft(true)}
                  >
                    Review an AI-prepared draft
                  </button>
                )}
                {review && (
                  <Modal
                    title="Review personal reply"
                    onClose={() => setReview(false)}
                  >
                    <SignedActReview
                      creatorId={creator.id}
                      fanId={fanId}
                      command={{
                        actType: "reply",
                        subjectId: data.timeline.threadId,
                        content: { text },
                      }}
                      creatorName={creator.display_name}
                      text={text}
                      title="Send your personal reply"
                      rows={[["Fan sees", creator.display_name]]}
                      onSigned={async (signedActId) => {
                        await studioRequest(
                          "studio",
                          `${creator.id}/threads/${fanId}/send-draft`,
                          {
                            version: draftVersion,
                            signedActId,
                            idempotencyKey: key(),
                          },
                          creator.viewerAccountId,
                        );
                        setText("");
                        draftEdited.current = false;
                        setReview(false);
                        await load();
                      }}
                    />
                  </Modal>
                )}
              </>
            )
          )}
        </div>
      </div>
      <div hidden={!threadCurrent} inert={!threadCurrent}>
        {creator.owned &&
          fanId &&
          data &&
          voiceReply?.fanId === fanId &&
          voiceReply.threadId === data.timeline.threadId && (
            <Modal
              title={copy.w6RecordAVoiceReply}
              closeDisabled={voicePending}
              restoreFocusTo={voiceTrigger}
              onClose={() => setVoiceReply(null)}
            >
              <ConversationVoiceReply
                key={`${creator.viewerAccountId}:${creator.id}:${fanId}:${data.timeline.threadId}`}
                creatorId={creator.id}
                fanId={fanId}
                threadId={data.timeline.threadId}
                creatorName={creator.display_name}
                expectedAccountId={creator.viewerAccountId}
                current={
                  threadCurrent && data.timeline.control === "human_active"
                }
                onPendingChange={setVoicePending}
                onDelivered={() => {
                  setVoiceReply(null);
                  void action
                    .run(load)
                    .then(() => action.setNotice(copy.w6RecordingDelivered));
                }}
              />
            </Modal>
          )}
        {attachedCorrection && fanId && data && (
          <Modal
            title="Correct this answer"
            closeDisabled={correctionPending}
            onClose={() => setAttachedCorrection(null)}
          >
            <CorrectionReply
              key={`${creator.viewerAccountId}:${creator.id}:${fanId}:${attachedCorrection}:${attachedVersion ?? "current"}`}
              creator={creator}
              fanId={fanId}
              threadId={data.timeline.threadId}
              originalMessageId={attachedCorrection}
              originalVersion={attachedVersion}
              onDelivered={load}
              onPendingChange={setCorrectionPending}
            />
          </Modal>
        )}
        {correction !== null && (
          <Modal title="Correct my AI" onClose={() => setCorrection(null)}>
            <CorrectionForm creator={creator} answer={correction} />
          </Modal>
        )}
        {approveDraft && fanId && data && (
          <Modal
            title="Review an AI-prepared draft"
            onClose={() => setApproveDraft(false)}
          >
            <ApprovedReply
              key={`${creator.viewerAccountId}:${creator.id}:${fanId}`}
              creator={creator}
              fanId={fanId}
              deliveryAllowed={data.timeline.control === "human_active"}
              deliveryHelp="Take over this conversation before sending the personally approved reply."
              onDelivered={load}
            />
          </Modal>
        )}
      </div>
    </section>
  );
}
