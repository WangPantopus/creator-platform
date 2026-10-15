"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AuditBanner,
  AuthorLabel,
  LabelPreview,
  Notice,
} from "@qelvora/ui-web";
import type { SignedActCommand } from "@qelvora/api";
import {
  ConversationMessageSchema,
  type ConversationMessage,
} from "../../../../../packages/api/src/conversation/contracts";
import { SignedActReview } from "../../identity/signing";
import { VoicePlayer } from "../../media/VoicePlayer";
import { ApprovedReply } from "../ApprovedReply";
import { studioRequest } from "../api";
import { Feedback, useAction } from "../shared/action";
import {
  key,
  money,
  packetStateLabel,
  paymentStateLabel,
  time,
} from "../shared/format";
import { Modal } from "../shared/Modal";
import type { Creator, Packet } from "../shared/types";
export function PacketDetail({
  creator,
  id,
}: {
  creator: Creator;
  id: string;
}) {
  const [detail, setDetail] = useState<Packet | null>(null),
    [text, setText] = useState(""),
    [draftVersion, setDraftVersion] = useState(0),
    [decision, setDecision] = useState<string | null>(null),
    [command, setCommand] = useState<SignedActCommand | null>(null),
    [proposedMode, setProposedMode] = useState(""),
    [approveDraft, setApproveDraft] = useState(false),
    [deliveries, setDeliveries] = useState<ConversationMessage[] | null>(null),
    action = useAction();
  const router = useRouter(),
    edited = useRef(false);
  const load = useCallback(async () => {
    const value = await studioRequest<Packet>(
      "studio",
      `${creator.id}/packets/${id}`,
    );
    setDetail(value);
    if (!edited.current) {
      const draft = await studioRequest<{ text: string; version: number }>(
        "studio",
        `${creator.id}/threads/${value.packet.fan_id}/draft`,
      );
      setText(draft.text);
      setDraftVersion(draft.version);
    }
  }, [creator.id, id]);
  useEffect(() => {
    void action.run(load);
  }, [load]);
  const savePacketDraft = async () => {
    if (!detail) return;
    const saved = await studioRequest<{ version: number }>(
      "studio",
      `${creator.id}/threads/${detail.packet.fan_id}/draft`,
      { text, expectedVersion: draftVersion, idempotencyKey: key() },
      creator.viewerAccountId,
    );
    setDraftVersion(saved.version);
    edited.current = false;
  };
  const decide = async (name: string, signedActId?: string) => {
    if (!detail) return;
    await studioRequest(
      "studio",
      `${creator.id}/packets/${id}/decide`,
      {
        action: name,
        version: detail.packet.version,
        idempotencyKey: key(),
        ...(signedActId ? { signedActId } : {}),
        ...(text ? { text } : {}),
        ...(proposedMode ? { proposedModeId: proposedMode } : {}),
      },
      creator.viewerAccountId,
    );
    setCommand(null);
    setDecision(null);
    await load();
  };
  const signedDecision = async (name: string) => {
    if (!detail) return;
    const mode = detail.groupModes.find((m) => m.id === proposedMode);
    if (name === "group_offer" && !mode)
      throw new Error("Choose a current lower-priced group offer first.");
    setDecision(name);
    setCommand({
      actType: "accept",
      subjectId: detail.packet.thread_id,
      content: {
        packetId: id,
        packetVersion: detail.packet.version,
        snapshot: detail.packet.snapshot,
        action: name,
        ...(name === "group_offer" && mode
          ? {
              proposedMode: {
                id: mode.id,
                kind: mode.kind,
                amount: mode.amount,
                currency: mode.currency,
                version: mode.version,
              },
            }
          : {}),
      },
    });
  };
  return (
    <section className="w5-packet">
      <header className="w5-compose-head">
        <Link href={`/studio/${creator.id}/requests`}>Back</Link>
        <strong>A request</strong>
        <span />
      </header>
      <Feedback action={action} />
      {detail && (
        <>
          <div className="w5-gutter">
            <h1>{detail.packet.snapshot.title}</h1>
            <p className="qv-meta">
              {money(
                detail.packet.snapshot.amount,
                detail.packet.snapshot.currency,
              )}{" "}
              · {packetStateLabel(detail.packet.state)} ·{" "}
              {paymentStateLabel(detail.packet.payment_state)}
            </p>
            <p>
              Decide by {time(detail.packet.decision_at)} · hold expires{" "}
              {time(detail.packet.hold_expires_at)}
            </p>
            <div className="w5-card">
              <h2>Included in your request</h2>
              <p className="w5-fan-text">{detail.packet.disclosure.summary}</p>
              {detail.packet.disclosure.messages?.map((m, i) => (
                <p key={i}>{m.text}</p>
              ))}
              <dl>
                <dt>Shared identity</dt>
                <dd>
                  {detail.packet.disclosure.identity === "shared_intro"
                    ? "Handle and shared introduction"
                    : "Handle"}
                </dd>
                <dt>Conversation selection</dt>
                <dd>
                  {detail.packet.disclosure.wholeThread
                    ? "Fan selected the whole conversation snapshot"
                    : `${detail.packet.disclosure.messages?.length ?? 0} selected messages`}
                </dd>
                <dt>Attachments</dt>
                <dd>
                  {detail.packet.disclosure.attachmentIds?.length ?? 0} selected
                  attachments
                </dd>
              </dl>
              {Boolean(detail.packet.disclosure.attachmentIds?.length) && (
                <Notice title="Attachment access">
                  The media service must provide current attachment access
                  before playback.
                </Notice>
              )}
              <Link
                href={`/studio/${creator.id}/threads/${detail.packet.fan_id}`}
              >
                Open the audited full conversation
              </Link>
            </div>
          </div>
          <div className="w5-gutter">
            <LabelPreview kind="human_creator" name={creator.display_name} />
            <label className="w5-field">
              Your written reply
              <textarea
                value={text}
                onChange={(e) => {
                  edited.current = true;
                  setText(e.target.value);
                  setCommand(null);
                }}
                rows={5}
              />
            </label>
            {detail.commitment && (
              <p className="qv-help">
                Commitment {detail.commitment.state} · due{" "}
                {time(detail.commitment.due_at)}. Only a delivered
                creator-signed reply can fulfill a written commitment.
              </p>
            )}
            <div className="w5-actions">
              {!detail.commitment && (
                <button
                  className="qv-btn qv-btn--maya"
                  disabled={action.busy}
                  onClick={() =>
                    void action.run(() =>
                      signedDecision(
                        detail.packet.snapshot.mode === "voice_note"
                          ? "voice_note"
                          : detail.packet.snapshot.mode.includes("call")
                            ? "offer_times"
                            : "reply_myself",
                      ),
                    )
                  }
                >
                  Accept promised service
                </button>
              )}
              <button
                className="qv-btn qv-btn--secondary"
                disabled={action.busy}
                onClick={() =>
                  void action.run(async () => {
                    await savePacketDraft();
                    router.push(
                      `/studio/${creator.id}/threads/${detail.packet.fan_id}`,
                    );
                  })
                }
              >
                Save reply and open audited thread
              </button>
              <button
                className="qv-btn qv-btn--quiet"
                disabled={action.busy}
                onClick={() =>
                  void action.run(async () => {
                    await savePacketDraft();
                    action.setNotice(
                      `Draft saved · revision ${draftVersion + 1}`,
                    );
                  })
                }
              >
                Save written draft
              </button>
              {detail.packet.snapshot.mode === "voice_note" && (
                <button
                  className="qv-link-btn"
                  onClick={() =>
                    action.setNotice(
                      "Voice replies are unavailable for this request. You can still save your written draft.",
                    )
                  }
                >
                  Record human voice
                </button>
              )}
              {detail.commitment &&
                detail.packet.snapshot.mode.includes("call") && (
                  <Link
                    href={`/studio/calls/${creator.id}/${detail.packet.fan_id}/${detail.commitment.id}`}
                  >
                    Offer times
                  </Link>
                )}
            </div>
            <details className="w5-card">
              <summary>Instead</summary>
              <p className="qv-help">
                Changed modes and prices need the fan's choice. Every action
                goes to the commerce producer.
              </p>
              <label className="w5-field">
                Current lower-priced group offer
                <select
                  value={proposedMode}
                  onChange={(e) => setProposedMode(e.target.value)}
                >
                  <option value="">Choose an offer</option>
                  {detail.groupModes.map((mode) => (
                    <option key={mode.id} value={mode.id}>
                      {mode.title} · {money(Number(mode.amount), mode.currency)}
                    </option>
                  ))}
                </select>
              </label>
              {[
                ["ai_answer", "Let AI answer"],
                ["approve_draft", "Approve exact draft"],
                ["reply_myself", "Reply myself"],
                ["voice_note", "Send human voice"],
                ["offer_times", "Offer times"],
                ["group_offer", "Offer a group answer"],
                ["more_info", "Ask for more information"],
                ["decline", "Decline"],
              ].map(([name, label]) => (
                <button
                  key={name}
                  className="qv-btn qv-btn--secondary"
                  disabled={
                    action.busy ||
                    (name === "approve_draft" &&
                      !creator.owned &&
                      !(
                        creator.roles.includes("triage") &&
                        creator.roles.includes("drafter")
                      ))
                  }
                  onClick={() =>
                    void action.run(async () => {
                      if (["ai_answer", "more_info", "decline"].includes(name!))
                        await decide(name!);
                      else if (name === "approve_draft") setApproveDraft(true);
                      else await signedDecision(name!);
                    })
                  }
                >
                  {label}
                </button>
              ))}
            </details>
            <div className="w5-card">
              {detail.commitment &&
                ["written_reply", "voice_note"].includes(
                  detail.packet.snapshot.mode,
                ) &&
                ["due", "in_progress"].includes(detail.commitment.state) && (
                  <>
                    <h2>
                      {detail.packet.snapshot.mode === "voice_note"
                        ? "Fulfill with a delivered recording"
                        : "Fulfill with a delivered reply"}
                    </h2>
                    <p>
                      Choose your signed reply or recording for this request. It
                      must match the promised service.
                    </p>
                    <button
                      className="qv-btn qv-btn--secondary"
                      disabled={action.busy}
                      onClick={() =>
                        void action.run(async () => {
                          const result = await studioRequest<{
                            items: unknown;
                          }>(
                            "studio",
                            `${creator.id}/packets/${id}/deliveries`,
                          );
                          setDeliveries(
                            ConversationMessageSchema.array()
                              .max(100)
                              .parse(result.items),
                          );
                        })
                      }
                    >
                      Open audited signed replies
                    </button>
                    {deliveries && <AuditBanner />}
                    {deliveries?.map((message) => (
                      <article key={message.id}>
                        <AuthorLabel
                          kind={
                            message.authorKind === "approved_draft"
                              ? "approved_draft"
                              : "human_creator"
                          }
                          name={creator.display_name}
                        />
                        {message.recording?.state === "available" ? (
                          <VoicePlayer
                            asset={message.recording.asset}
                            creatorId={creator.id}
                            fanId={detail.packet.fan_id}
                            creatorName={creator.display_name}
                            time={message.createdAt}
                            expectedAccountId={creator.viewerAccountId}
                          />
                        ) : (
                          <p>{message.text}</p>
                        )}
                        <button
                          className="qv-btn qv-btn--secondary"
                          disabled={action.busy}
                          onClick={() =>
                            void action.run(async () => {
                              await studioRequest(
                                "studio",
                                `${creator.id}/packets/${id}/deliver`,
                                {
                                  messageId: message.id,
                                  version: detail.commitment!.version,
                                  idempotencyKey: key(),
                                },
                                creator.viewerAccountId,
                              );
                              await load();
                              setDeliveries(null);
                            })
                          }
                        >
                          {detail.packet.snapshot.mode === "voice_note"
                            ? "Use this delivered recording"
                            : "Use this delivered reply"}
                        </button>
                      </article>
                    ))}
                    {deliveries?.length === 0 && (
                      <p>
                        {detail.packet.snapshot.mode === "voice_note"
                          ? "No current signed recording is available. Deliver your personal recording in the audited thread first."
                          : "No signed delivered reply is available. Send your personal reply in the audited thread first."}
                      </p>
                    )}
                  </>
                )}
              {detail.packet.state === "accepted" &&
                detail.commitment?.state === "delivered" && (
                  <Link href={`/studio/${creator.id}/publish?packet=${id}`}>
                    Compose a public answer with current sharing permission
                  </Link>
                )}
              <h2>Payment record</h2>
              {detail.ledger.map((l, i) => (
                <p key={i} className="qv-meta">
                  {l.kind} · {money(Number(l.amount), l.currency)} · {l.cause}
                </p>
              ))}
              {!detail.ledger.length && <p>No money movement is recorded.</p>}
            </div>
          </div>
        </>
      )}
      {command && detail && (
        <Modal title="Review acceptance" onClose={() => setCommand(null)}>
          <SignedActReview
            creatorId={creator.id}
            command={command}
            creatorName={creator.display_name}
            text={`Accept ${detail.packet.snapshot.title}`}
            title="Accept the current request"
            rows={[
              [
                "Fan is charged",
                money(
                  detail.packet.snapshot.amount,
                  detail.packet.snapshot.currency,
                ),
              ],
              ["Promised mode", detail.packet.snapshot.title],
            ]}
            onSigned={async (signedActId) => decide(decision!, signedActId)}
          />
        </Modal>
      )}
      {approveDraft && detail && (
        <Modal
          title="Review an AI-prepared draft"
          onClose={() => setApproveDraft(false)}
        >
          <ApprovedReply
            key={`${creator.viewerAccountId}:${creator.id}:${detail.packet.fan_id}`}
            creator={creator}
            fanId={detail.packet.fan_id}
            deliveryAllowed={Boolean(
              detail.commitment &&
                ["due", "in_progress"].includes(detail.commitment.state),
            )}
            deliveryHelp="Accept the promised service before sending this reply. Then use its delivered message to fulfill the current request."
            onDelivered={load}
          />
        </Modal>
      )}
    </section>
  );
}
