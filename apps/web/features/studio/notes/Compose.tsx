"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AuthorLabel, Notice } from "@qelvora/ui-web";
import type { SignedActCommand } from "@qelvora/api";
import type {
  ContentBody,
  ContentView,
  PrivateNoteReply,
} from "../../../../../packages/api/src/content";
import { SignedActReview } from "../../identity/signing";
import { CreatorVoiceRecording } from "../../media/VoiceRecorder";
import { PhotoAttachment } from "../PhotoAttachment";
import { PostVoiceAttachment } from "../PostVoiceAttachment";
import { StudioFailure, studioRequest } from "../api";
import { Feedback, useAction } from "../shared/action";
import { contentStateLabel, key, time } from "../shared/format";
import { Modal } from "../shared/Modal";
import type { Creator, Page } from "../shared/types";
const emptyBody = (kind: ContentBody["kind"] = "note"): ContentBody => ({
  kind,
  title: "",
  text: "",
  audience: { kind: "members" },
  media: [],
  nameToken: false,
  showAudienceCount: false,
  aiUseIntent: false,
  scheduledAt: null,
  quote: null,
  packetId: null,
});
const scheduleInput = (value: string | null) => {
  if (!value) return "";
  const date = new Date(value);
  const part = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${part(date.getMonth() + 1)}-${part(date.getDate())}T${part(date.getHours())}:${part(date.getMinutes())}`;
};
export function Compose({
  creator,
  id,
  onDone,
  post = false,
}: {
  creator: Creator;
  id?: string;
  onDone: () => void;
  post?: boolean;
}) {
  const hasDraftRole =
    creator.owned ||
    creator.roles.includes("drafter") ||
    creator.roles.includes("publisher");
  const canDraft = creator.verification === "verified" && hasDraftRole;
  const canPublish =
    creator.verification === "verified" &&
    (creator.owned || creator.roles.includes("publisher"));
  const [document, setDocument] = useState<ContentBody>(
      emptyBody(post ? "post" : "note"),
    ),
    [saved, setSaved] = useState<{ id: string; version: number } | null>(null),
    [review, setReview] = useState<{
      command: SignedActCommand;
      view: ContentView;
    } | null>(null),
    [liveCatalog, setLiveCatalog] = useState<{
      available: boolean;
      items: (NonNullable<ContentBody["live"]> & { replayReady: boolean })[];
    } | null>(null),
    [catalog, setCatalog] = useState<{
      audienceCountsAvailable: boolean;
      tiers: { id: string; name: string }[];
      groups: { id: string; name: string }[];
    } | null>(null),
    [pendingPublication, setPendingPublication] = useState<{
      id: string;
      version: number;
      signedActId: string;
      idempotencyKey: string;
    } | null>(null),
    [schedule, setSchedule] = useState(""),
    [draftChanged, setDraftChanged] = useState(false),
    [currentDraft, setCurrentDraft] = useState<ContentView | null>(null),
    noteInput = useRef<HTMLTextAreaElement>(null),
    [voiceObjectId, setVoiceObjectId] = useState<string | null>(null),
    voiceTrigger = useRef<HTMLButtonElement>(null),
    [photoObjectId, setPhotoObjectId] = useState<string | null>(null),
    action = useAction(),
    draftId = useRef<string | null>(null),
    savedDocument = useRef<string | null>(null),
    operation = useRef<{ body: string; key: string } | null>(null);
  const pendingStorage = `w5.pendingPublication:${creator.viewerAccountId}:${creator.id}`;
  const clearPending = () => {
    sessionStorage.removeItem(pendingStorage);
    setPendingPublication(null);
  };
  const draftReady = !id || saved?.id === id;
  const useSavedDraft = (value: ContentView) => {
    savedDocument.current = JSON.stringify(value.document);
    setDocument(value.document);
    setSchedule(scheduleInput(value.document.scheduledAt));
    setSaved({ id: value.id, version: value.version });
    draftId.current = value.id;
    operation.current = null;
    setReview(null);
    setDraftChanged(false);
    setCurrentDraft(null);
  };
  const loadDraft = async () => {
    if (!id) return;
    const value = await studioRequest<ContentView>(
      "content",
      `${creator.id}/${id}/studio`,
      undefined,
      creator.viewerAccountId,
    );
    useSavedDraft(value);
  };
  useEffect(() => {
    if (!hasDraftRole) return;
    // Only opaque command references persist across a reload; no draft or fan text.
    try {
      const stored = sessionStorage.getItem(pendingStorage);
      if (stored) {
        const value = JSON.parse(stored);
        if (
          [value.id, value.signedActId].every(
            (id) => typeof id === "string" && /^[a-f0-9-]{36}$/.test(id),
          ) &&
          Number.isInteger(value.version) &&
          value.version > 0 &&
          typeof value.idempotencyKey === "string" &&
          value.idempotencyKey.length >= 8
        ) {
          setPendingPublication(value);
          draftId.current = value.id;
          void action.run(async () => {
            const view = await studioRequest<ContentView>(
              "content",
              `${creator.id}/${value.id}/studio`,
            );
            setDocument(view.document);
            setSchedule(scheduleInput(view.document.scheduledAt));
            savedDocument.current = JSON.stringify(view.document);
            setSaved({ id: view.id, version: view.version });
            setReview({
              view,
              command: {
                actType: view.document.kind === "note" ? "broadcast" : "reply",
                subjectId: view.id,
                content: {
                  kind: "content_publication",
                  creatorId: creator.id,
                  version: value.version,
                  document: view.document,
                },
              },
            });
          });
        }
      }
    } catch {
      sessionStorage.removeItem(pendingStorage);
    }
    void studioRequest<typeof liveCatalog>(
      "content",
      `${creator.id}/studio/live`,
    )
      .then(setLiveCatalog)
      .catch(() => setLiveCatalog(null));
    void studioRequest<typeof catalog>("studio", `${creator.id}/audiences`)
      .then(setCatalog)
      .catch(() => setCatalog(null));
    if (id) void action.run(loadDraft);
    else {
      const query = new URLSearchParams(location.search);
      const packetId = query.get("packet");
      if (packetId) setDocument({ ...emptyBody("public_answer"), packetId });
      const quoteId = query.get("quote");
      if (quoteId)
        void action.run(async () => {
          const data = await studioRequest<Page<PrivateNoteReply>>(
              "content",
              `${creator.id}/studio/replies`,
            ),
            reply = data.items.find((r) => r.id === quoteId);
          if (!reply?.consent.shareText)
            throw new Error(
              "Current sharing consent is required. Ask the fan to choose sharing from their own reply.",
            );
          setDocument({
            ...emptyBody("quote_reply"),
            quote: { replyId: reply.id, consentVersion: reply.consent.version },
          });
        });
    }
  }, [creator.id, id, hasDraftRole]);
  const edit = (update: Partial<ContentBody>) => {
    if (!hasDraftRole || !draftReady || pendingPublication) return;
    setDocument((d) => ({ ...d, ...update }));
    action.setNotice("");
    setReview(null);
  };
  const save = async (documentOverride = document) => {
    if (!draftReady) throw new Error("Wait for the saved draft to load.");
    if (!canDraft)
      throw new Error(
        "A verified creator and a current drafting role are required to save this draft. Your local text is kept.",
      );
    if (pendingPublication)
      throw new Error(
        "Check the pending publication before saving another revision.",
      );
    draftId.current ??= key();
    const body = {
        id: draftId.current,
        expectedVersion: saved?.version ?? 0,
        document: documentOverride,
      },
      snapshot = JSON.stringify(body);
    if (operation.current?.body !== snapshot)
      operation.current = { body: snapshot, key: key() };
    try {
      const result = await studioRequest<{ id: string; version: number }>(
        "content",
        `${creator.id}/drafts`,
        { ...body, idempotencyKey: operation.current.key },
        creator.viewerAccountId,
      );
      savedDocument.current = JSON.stringify(documentOverride);
      setSaved(result);
      setDraftChanged(false);
      operation.current = null;
      return result;
    } catch (failure) {
      if (
        failure instanceof StudioFailure &&
        failure.code === "content_changed"
      ) {
        setDraftChanged(true);
        setReview(null);
      }
      throw failure;
    }
  };
  const plannedAnswer = !!document.planRef;
  const chooseAudienceIds =
    !plannedAnswer && ["tiers", "groups"].includes(document.audience.kind);
  const chooseKind =
    post &&
    !plannedAnswer &&
    !document.quote &&
    !document.packetId &&
    document.kind !== "public_answer";
  if (!hasDraftRole)
    return (
      <section className="w5-compose">
        <header className="w5-compose-head">
          <Link href={`/studio/${creator.id}/notes`}>Notes</Link>
          <strong>{post ? "Publish" : "Note draft"}</strong>
          <span />
        </header>
        <div className="w5-gutter">
          <Notice tone="error" title="Content editing unavailable">
            Your current role does not allow creating or editing content. Ask
            the creator to review your roles before preparing a draft.
          </Notice>
          <Link
            className="qv-btn qv-btn--secondary"
            href={`/studio/${creator.id}/notes`}
          >
            Return to Notes
          </Link>
        </div>
      </section>
    );
  if (!draftReady)
    return (
      <section className="w5-compose">
        <header className="w5-compose-head">
          <Link href={`/studio/${creator.id}/notes`}>Cancel</Link>
          <strong>{post ? "Publish" : "Edit Note"}</strong>
          <span />
        </header>
        <Feedback action={action} />
        {!action.error && <p role="status">Loading saved draft…</p>}
        <button
          className="qv-btn qv-btn--secondary"
          aria-busy={action.busy}
          onClick={() => void action.run(loadDraft)}
        >
          Retry loading draft
        </button>
      </section>
    );
  return (
    <section className="w5-compose">
      <header className="w5-compose-head">
        <Link href={`/studio/${creator.id}/notes`}>Cancel</Link>
        <strong>{post ? "Publish" : id ? "Edit Note" : "New Note"}</strong>
        <span />
      </header>
      <Feedback action={action} />
      {draftChanged && (
        <div className="w5-gutter">
          <p className="qv-help">
            A newer revision is saved. Your local edits are kept. Review the
            saved draft before choosing which revision to edit.
          </p>
          <button
            className="qv-btn qv-btn--secondary"
            disabled={action.busy}
            onClick={() =>
              void action.run(async () => {
                const value = await studioRequest<ContentView>(
                  "content",
                  `${creator.id}/${draftId.current}/studio`,
                  undefined,
                  creator.viewerAccountId,
                );
                setCurrentDraft(value);
              })
            }
          >
            Review saved draft
          </button>
        </div>
      )}
      {creator.verification !== "verified" && (
        <Notice title="Creator verification">
          Current creator status: {creator.verification.replaceAll("_", " ")}.
          You can write locally. Saving, attaching media and publishing require
          a verified creator.
        </Notice>
      )}
      <div className="w5-gutter">
        <span className="qv-meta">TO</span>
        <div className="qv-seg w5-audience" role="group" aria-label="Audience">
          {(post
            ? ["public", "followers", "members", "tiers", "groups"]
            : ["followers", "members", "tiers"]
          ).map((kind) => (
            <button
              key={kind}
              type="button"
              aria-pressed={document.audience.kind === kind}
              disabled={plannedAnswer}
              onClick={() => {
                if (document.audience.kind === kind) return;
                edit({
                  audience:
                    kind === "tiers" || kind === "groups"
                      ? { kind, ids: [] }
                      : { kind: kind as "public" | "followers" | "members" },
                });
              }}
            >
              {kind === "members"
                ? "All members"
                : kind[0]!.toUpperCase() + kind.slice(1)}
            </button>
          ))}
        </div>
        {chooseAudienceIds && (
          <fieldset className="w5-field">
            <legend>Select {document.audience.kind}</legend>
            {!catalog && (
              <p>
                Current audience options are unavailable. Refresh after
                reconnecting.
              </p>
            )}
            {catalog?.[document.audience.kind as "tiers" | "groups"].map(
              (option) => (
                <label key={option.id}>
                  <input
                    type="checkbox"
                    checked={
                      "ids" in document.audience &&
                      document.audience.ids.includes(option.id)
                    }
                    onChange={(e) => {
                      const ids =
                        "ids" in document.audience ? document.audience.ids : [];
                      edit({
                        audience: {
                          kind: document.audience.kind as "tiers" | "groups",
                          ids: e.target.checked
                            ? [...ids, option.id]
                            : ids.filter((id) => id !== option.id),
                        },
                      });
                    }}
                  />
                  {option.name}
                </label>
              ),
            )}
            {catalog?.[document.audience.kind as "tiers" | "groups"].length ===
              0 && (
              <p>
                No current {document.audience.kind} are available. Configure
                Offers first.
              </p>
            )}
          </fieldset>
        )}
        {plannedAnswer && (
          <p className="qv-help">
            This answer keeps its original request audience. To change that
            audience, revise the fulfillment plan in Requests.
          </p>
        )}
        <p className="qv-help">
          {creator.owned ? (
            <>
              It's labeled “{creator.display_name} · to{" "}
              {document.audience.kind === "members"
                ? "all members"
                : document.audience.kind}
              ” everywhere.
            </>
          ) : document.kind === "post" ? (
            `A team publication stays labeled “${creator.display_name}'s team · ${creator.memberHandle}”.`
          ) : (
            `Your team can prepare this draft. ${creator.display_name} must review and personally sign it.`
          )}
        </p>
      </div>
      {chooseKind && (
        <div className="w5-gutter w5-field">
          <label htmlFor="content-kind">Library entry</label>
          <select
            id="content-kind"
            value={document.kind}
            onChange={(e) =>
              edit({
                kind: e.target.value as ContentBody["kind"],
                live: null,
              })
            }
          >
            <option value="post">Post</option>
            <option value="live">Scheduled live session</option>
            <option value="replay">Replay</option>
          </select>
          {["live", "replay"].includes(document.kind) && (
            <>
              <label htmlFor="live-session">Session from Live</label>
              <select
                id="live-session"
                disabled={!liveCatalog?.available}
                value={document.live?.sessionId ?? ""}
                onChange={(e) => {
                  const session = liveCatalog?.items.find(
                    (s) => s.sessionId === e.target.value,
                  );
                  if (session) {
                    const live = {
                      sessionId: session.sessionId,
                      startsAt: session.startsAt,
                      endsAt: session.endsAt,
                      replayContentId: session.replayContentId,
                    };
                    edit({ live });
                  }
                }}
              >
                <option value="">Choose a session</option>
                {liveCatalog?.items
                  .filter((s) => document.kind !== "replay" || s.replayReady)
                  .map((s) => (
                    <option key={s.sessionId} value={s.sessionId}>
                      {new Date(s.startsAt).toLocaleString()} —{" "}
                      {new Date(s.endsAt).toLocaleString()}
                    </option>
                  ))}
              </select>
              <p>
                Choose the audience separately for each replay. A live entry
                points to the scheduled session.
              </p>
              {!liveCatalog?.available && (
                <Notice title="Live sessions unavailable">
                  The live service is not connected. Schedule a session in Live,
                  then return when the session list is available.
                </Notice>
              )}
            </>
          )}
        </div>
      )}
      {post && (
        <label className="w5-field w5-gutter">
          Title
          <input
            maxLength={180}
            value={document.title}
            onChange={(e) => edit({ title: e.target.value })}
          />
        </label>
      )}
      <div className={`w5-editor ${creator.owned ? "qv-on-maya" : ""}`}>
        <AuthorLabel
          kind={
            creator.owned
              ? post
                ? "human_creator"
                : "human_broadcast"
              : "team"
          }
          name={creator.display_name}
          audience={document.audience.kind}
          member={creator.memberHandle ?? "Team draft"}
          onMaya={creator.owned}
        />
        <label className="qv-sr" htmlFor="note-text">
          {post ? "Your post" : "Your Note"}
        </label>
        <textarea
          ref={noteInput}
          id="note-text"
          autoFocus={!!id}
          rows={5}
          maxLength={20000}
          value={document.text}
          onChange={(e) => edit({ text: e.target.value })}
          placeholder="Write in your own words"
        />
        <div className="w5-actions">
          <button
            className="qv-btn qv-btn--quiet"
            type="button"
            disabled={
              !canDraft || !creator.owned || action.busy || !!pendingPublication
            }
            onClick={() =>
              void action.run(async () => {
                const current = await save();
                setPhotoObjectId(current.id);
              })
            }
          >
            Photo
          </button>
          <button
            ref={voiceTrigger}
            className="qv-btn qv-btn--quiet"
            type="button"
            disabled={
              !canDraft ||
              !creator.owned ||
              action.busy ||
              !!pendingPublication ||
              !["note", "post"].includes(document.kind)
            }
            onClick={() =>
              void action.run(async () => {
                const current = await save();
                setVoiceObjectId(current.id);
              })
            }
          >
            {document.kind === "note" ? "Voice · up to 60 s" : "Voice"}
          </button>
        </div>
      </div>
      <label className="w5-source-row">
        <input
          type="checkbox"
          checked={document.aiUseIntent}
          disabled={(plannedAnswer || !creator.owned) && !document.aiUseIntent}
          onChange={(e) => edit({ aiUseIntent: e.target.checked })}
        />
        <span>
          <strong>Let my AI use this</strong>
          <span className="qv-help">
            {plannedAnswer
              ? "AI reuse of this answer needs a separate current approval, which is unavailable."
              : creator.owned
                ? "Adds a source candidate for this same audience. Approve it separately in My AI."
                : "The creator must confirm AI reuse for this revision. Team edits can remove that intent."}
          </span>
        </span>
      </label>
      <label className="w5-toggle">
        Show audience size
        <input
          type="checkbox"
          checked={document.showAudienceCount}
          disabled={
            !catalog?.audienceCountsAvailable && !document.showAudienceCount
          }
          onChange={(e) => edit({ showAudienceCount: e.target.checked })}
        />
      </label>
      {!catalog?.audienceCountsAvailable && (
        <p className="w5-gutter qv-help">
          Current audience size is unavailable.
        </p>
      )}
      {!post && (
        <label className="w5-toggle">
          Use the fan's name token
          <input
            type="checkbox"
            checked={document.nameToken}
            onChange={(e) => edit({ nameToken: e.target.checked })}
          />
        </label>
      )}
      {document.nameToken && (
        <p className="w5-gutter qv-help">
          Use {"{name}"} in your Note. It displays the fan’s public handle.
          Every copy keeps the broadcast label; the immutable signed original
          remains available.
        </p>
      )}
      <label className="w5-field w5-gutter">
        Schedule in your time zone
        <input
          type="datetime-local"
          value={schedule}
          onChange={(e) => {
            setSchedule(e.target.value);
            edit({
              scheduledAt: e.target.value
                ? new Date(e.target.value).toISOString()
                : null,
            });
          }}
        />
      </label>
      <div className="w5-compose-bottom">
        <div className="w5-actions">
          <button
            className="qv-btn qv-btn--secondary"
            disabled={
              !canDraft ||
              action.busy ||
              !!pendingPublication ||
              (!document.text.trim() && !document.media.length) ||
              (["live", "replay"].includes(document.kind) && !document.live)
            }
            onClick={() =>
              void action.run(async () => {
                const result = await save();
                action.setNotice(
                  `Draft revision ${result.version} saved. Editing invalidates the signing preview.`,
                );
              })
            }
          >
            Save draft
          </button>
          <button
            className={`qv-btn ${creator.owned ? "qv-btn--maya" : "qv-btn--secondary"}`}
            disabled={
              (!creator.owned &&
                (!creator.roles.includes("publisher") ||
                  document.kind !== "post" ||
                  document.media.length > 0)) ||
              !canPublish ||
              action.busy ||
              !!pendingPublication ||
              (!document.text.trim() && !document.media.length) ||
              (["live", "replay"].includes(document.kind) && !document.live)
            }
            onClick={() =>
              void action.run(async () => {
                if (!canPublish)
                  throw new Error(
                    "Current creator verification and a publishing role are required.",
                  );
                const result = await save();
                if (creator.owned)
                  setReview(
                    await studioRequest(
                      "content",
                      `${creator.id}/${result.id}/review`,
                    ),
                  );
                else {
                  await studioRequest(
                    "content",
                    `${creator.id}/${result.id}/team-publish`,
                    { version: result.version, idempotencyKey: key() },
                    creator.viewerAccountId,
                  );
                  onDone();
                }
              })
            }
          >
            {creator.owned
              ? "Review and sign"
              : document.kind !== "post" || document.media.length > 0
                ? "Creator signature required"
                : !creator.roles.includes("publisher")
                  ? "Publishing role required"
                  : "Publish as team"}
          </button>
        </div>
        {saved && (
          <p className="qv-meta">
            {savedDocument.current === JSON.stringify(document)
              ? "SAVED · REVISION "
              : "UNSAVED CHANGES · BASED ON REVISION "}
            {saved.version}
          </p>
        )}
      </div>
      {currentDraft && (
        <Modal
          title="Saved draft changed"
          onClose={() => setCurrentDraft(null)}
          restoreFocusTo={noteInput}
        >
          <p className="qv-meta">
            {contentStateLabel(currentDraft.state)} · revision{" "}
            {currentDraft.version}
          </p>
          <p>Audience: {currentDraft.audienceLabel}</p>
          {currentDraft.document.title && (
            <h3>{currentDraft.document.title}</h3>
          )}
          <label className="w5-field">
            Saved {post ? "post" : "Note"}
            <textarea readOnly rows={5} value={currentDraft.document.text} />
          </label>
          <p>
            Schedule:{" "}
            {currentDraft.document.scheduledAt
              ? time(currentDraft.document.scheduledAt)
              : "Not scheduled"}
          </p>
          <p>
            AI reuse intent:{" "}
            {currentDraft.document.aiUseIntent
              ? "Requested · separate approval required"
              : "Off"}
          </p>
          <p className="qv-help">
            Loading this revision replaces your local edits. Keeping your edits
            on this revision leaves them unsaved and invalidates the signing
            preview. Saving checks the current revision again.
          </p>
          <div className="w5-actions">
            <button
              className="qv-btn qv-btn--secondary"
              onClick={() => {
                useSavedDraft(currentDraft);
                action.setNotice(
                  "Saved revision loaded. Review it before signing.",
                );
              }}
            >
              Load saved revision
            </button>
            <button
              className="qv-btn qv-btn--secondary"
              disabled={
                currentDraft.state !== "draft" ||
                !!currentDraft.document.planRef ||
                !!document.planRef
              }
              onClick={() => {
                savedDocument.current = JSON.stringify(currentDraft.document);
                setSaved({
                  id: currentDraft.id,
                  version: currentDraft.version,
                });
                operation.current = null;
                setReview(null);
                setDraftChanged(false);
                setCurrentDraft(null);
                action.setNotice(
                  "Your local edits are kept on the current revision. Save when ready.",
                );
              }}
            >
              Keep my edits on this revision
            </button>
            <button
              className="qv-btn qv-btn--quiet"
              onClick={() => setCurrentDraft(null)}
            >
              Keep editing without changes
            </button>
          </div>
        </Modal>
      )}
      {review && canPublish && (
        <Modal
          restoreFocusTo={noteInput}
          title={
            document.scheduledAt
              ? "Review scheduled publication"
              : "Review and post"
          }
          onClose={() => {
            if (!pendingPublication) setReview(null);
          }}
        >
          <p className="qv-help">
            Audience: {review.view.audienceLabel}. AI use remains subject to a
            separate source approval.
          </p>
          {!pendingPublication && (
            <p className="qv-meta">
              Signature preview · this draft has not been signed or posted.
            </p>
          )}
          {pendingPublication ? (
            <div role="status">
              <p>
                The publication response is pending. Check its current state or
                retry the same signed command.
              </p>
              <button
                disabled={action.busy}
                onClick={() =>
                  void action.run(async () => {
                    const value = await studioRequest<ContentView>(
                      "content",
                      `${creator.id}/${pendingPublication.id}/studio`,
                    );
                    if (
                      value.version === pendingPublication.version &&
                      value.signedActId === pendingPublication.signedActId &&
                      ["published", "scheduled"].includes(value.state)
                    ) {
                      clearPending();
                      onDone();
                    } else
                      throw new Error(
                        "Publication is not confirmed. Retry the same command below; no new signature is needed.",
                      );
                  })
                }
              >
                Check publication
              </button>
              <button
                disabled={action.busy}
                onClick={() =>
                  void action.run(async () => {
                    const { id, ...command } = pendingPublication;
                    await studioRequest(
                      "content",
                      `${creator.id}/${id}/publish`,
                      command,
                      creator.viewerAccountId,
                    );
                    clearPending();
                    onDone();
                  })
                }
              >
                Retry same publication
              </button>
              <Feedback action={action} />
            </div>
          ) : (
            <SignedActReview
              creatorId={creator.id}
              creatorName={creator.display_name}
              command={review.command}
              text={review.view.document.text}
              title="Review exact publication"
              rows={[
                ["Audience", review.view.audienceLabel],
                [
                  "Publish",
                  document.scheduledAt ? time(document.scheduledAt) : "Now",
                ],
                ...(document.media.length
                  ? [
                      [
                        "Media",
                        "Processed attachments. Delivery waits for verified media credentials.",
                      ] as [string, string],
                    ]
                  : []),
              ]}
              onSigned={async (signedActId) => {
                const command = {
                  id: review.view.id,
                  version: review.view.version,
                  signedActId,
                  idempotencyKey: key(),
                };
                sessionStorage.setItem(pendingStorage, JSON.stringify(command));
                setPendingPublication(command);
                await studioRequest(
                  "content",
                  `${creator.id}/${command.id}/publish`,
                  {
                    version: command.version,
                    signedActId: command.signedActId,
                    idempotencyKey: command.idempotencyKey,
                  },
                  creator.viewerAccountId,
                );
                clearPending();
                onDone();
              }}
            />
          )}
        </Modal>
      )}
      {voiceObjectId && canDraft && (
        <Modal
          title="Your own voice"
          onClose={() => setVoiceObjectId(null)}
          restoreFocusTo={voiceTrigger}
        >
          {(() => {
            const Recorder =
              document.kind === "post"
                ? PostVoiceAttachment
                : CreatorVoiceRecording;
            return (
              <Recorder
                embedded
                creatorId={creator.id}
                expectedAccountId={creator.viewerAccountId}
                creatorName={creator.display_name}
                objectId={voiceObjectId}
                onReady={(asset, evidence) => {
                  edit({
                    media: [
                      ...document.media.filter(
                        (item) => item.assetId !== asset.id,
                      ),
                      {
                        assetId: evidence.assetId,
                        version: evidence.version,
                        sha256: evidence.sha256,
                        kind: "voice",
                        alt: "",
                      },
                    ],
                  });
                  action.setNotice(
                    "Processed voice added. Save the draft, then review and sign the complete publication.",
                  );
                }}
                beforeDiscard={async (assetId) => {
                  if (!document.media.some((item) => item.assetId === assetId))
                    return;
                  const next = {
                    ...document,
                    media: document.media.filter(
                      (item) => item.assetId !== assetId,
                    ),
                  };
                  await save(next);
                  edit(next);
                }}
              />
            );
          })()}
        </Modal>
      )}
      {photoObjectId && canDraft && (
        <Modal title="Photo" onClose={() => setPhotoObjectId(null)}>
          <PhotoAttachment
            key={`${creator.viewerAccountId}/${creator.id}/${photoObjectId}`}
            creatorId={creator.id}
            expectedAccountId={creator.viewerAccountId}
            objectId={photoObjectId}
            onReady={(asset, alt) => {
              edit({
                media: [
                  ...document.media.filter((item) => item.assetId !== asset.id),
                  {
                    assetId: asset.id,
                    version: asset.version,
                    sha256: asset.sha256,
                    kind: "photo",
                    alt,
                  },
                ],
              });
              setPhotoObjectId(null);
              action.setNotice(
                "Processed photo added. Save the draft, then review the complete publication.",
              );
            }}
            beforeDiscard={async (assetId) => {
              if (!document.media.some((item) => item.assetId === assetId))
                return;
              const next = {
                ...document,
                media: document.media.filter(
                  (item) => item.assetId !== assetId,
                ),
              };
              await save(next);
              edit(next);
            }}
          />
        </Modal>
      )}
    </section>
  );
}
