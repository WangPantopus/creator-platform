import { IdSchema, PublicSignatureSchema } from "@qelvora/api";
import { copy, formatCopy } from "@qelvora/copy";
import { Button, Notice, Message, ShareCard } from "@qelvora/ui-web";
import { platformFetch } from "../../../lib/session";

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function actLabel(act: string) {
  switch (act) {
    case "reply":
      return copy.identityVerificationActReply;
    case "approved_draft":
      return copy.identityVerificationActApproved;
    case "broadcast":
      return copy.identityVerificationActNote;
    case "reaction":
      return copy.identityVerificationActReaction;
    case "accept":
      return copy.identityVerificationActAcceptance;
    case "correction":
      return copy.identityVerificationActCorrection;
    default:
      return copy.identityVerificationActOther;
  }
}

function statusLabel(
  status: ReturnType<typeof PublicSignatureSchema.parse>["status"],
) {
  return {
    valid: copy.identityVerificationValid,
    key_revoked: copy.identityVerificationKeyRevoked,
    creator_revoked: copy.identityVerificationCreatorRevoked,
    withdrawn: copy.identityVerificationWithdrawn,
  }[status];
}

function Unavailable({
  id,
  missing = false,
}: {
  id: string;
  missing?: boolean;
}) {
  return (
    <main className="public-verification">
      <Notice
        title={
          missing
            ? copy.identityVerificationSignedUnavailableTitle
            : copy.identityVerificationUnavailableTitle
        }
      >
        {missing
          ? copy.identityVerificationMissing
          : copy.identityVerificationFailed}
      </Notice>
      <Button href={`/verify/${id}`} block>
        {copy.retry}
      </Button>
      <Button href="/home" variant="quiet" block>
        {copy.navHome}
      </Button>
    </main>
  );
}

export default async function Verification({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const identifier = IdSchema.safeParse(id);
  if (!identifier.success || id !== id.toLowerCase())
    return (
      <main className="public-verification">
        <Notice title={copy.identityVerificationSignedUnavailableTitle}>
          {copy.identityVerificationInvalidLink}
        </Notice>
        <Button href="/home" variant="quiet" block>
          {copy.navHome}
        </Button>
      </main>
    );
  try {
    const response = await platformFetch(
      `/v1/identity/signed-acts/${id}`,
      {},
      false,
    );
    if (!response.ok)
      return <Unavailable id={id} missing={response.status === 404} />;
    const signature = PublicSignatureSchema.parse(await response.json());
    if (signature.signedActId !== id) return <Unavailable id={id} />;
    const document = record(signature.content);
    const content = record(document?.content);
    const publicContent =
      signature.status !== "withdrawn" &&
      signature.contentAvailable &&
      document?.actType === signature.actType;
    const text =
      publicContent &&
      ["reply", "approved_draft", "broadcast", "correction"].includes(
        signature.actType,
      ) &&
      typeof content?.text === "string"
        ? content.text
        : null;
    const version =
      publicContent &&
      typeof content?.version === "number" &&
      Number.isSafeInteger(content.version) &&
      content.version >= 1
        ? content.version
        : null;
    const approved = signature.actType === "approved_draft";
    const time =
      new Intl.DateTimeFormat("en", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "UTC",
      }).format(new Date(signature.verifiedAt)) + " UTC";
    return (
      <main className="public-verification">
        <span className="qv-meta">/VERIFY/{id.toUpperCase()}</span>
        <div className="verification-title">
          <svg width="40" height="40" viewBox="0 0 16 16" aria-hidden="true">
            <path
              d="M8 1.2l1.6 1.2 2-.2.6 1.9 1.7 1.1-.6 1.9.6 1.9-1.7 1.1-.6 1.9-2-.2L8 14.8l-1.6-1.2-2 .2-.6-1.9-1.7-1.1.6-1.9-.6-1.9 1.7-1.1.6-1.9 2 .2z"
              fill="var(--maya-ink)"
            />
            <path
              d="M5.4 8.2l1.8 1.8 3.5-3.7"
              stroke="var(--ground)"
              strokeWidth="1.4"
              fill="none"
              strokeLinecap="round"
            />
          </svg>
          <h1>{formatCopy("signedBy", { name: signature.creatorName })}</h1>
        </div>
        <p>{signature.explanation}</p>
        {signature.status !== "valid" && (
          <Notice title={statusLabel(signature.status)}>
            {copy.identityVerificationHistoricalUnavailable}
          </Notice>
        )}
        {(signature.actType === "broadcast" ||
          signature.actType === "correction") &&
          text !== null && (
            <p className="qv-help">{actLabel(signature.actType)}</p>
          )}
        {text !== null ? (
          approved ? (
            <Message
              kind="approved_draft"
              name={signature.creatorName}
              signedActId={id}
            >
              {text}
            </Message>
          ) : (
            <ShareCard
              name={signature.creatorName}
              handle={null}
              time={time}
              signedActId={id}
              verify={`/VERIFY/${id.toUpperCase()}`}
            >
              {text}
            </ShareCard>
          )
        ) : (
          <Notice
            title={
              signature.status === "withdrawn"
                ? copy.identityVerificationWithdrawnContentTitle
                : signature.contentAvailable
                  ? copy.identityVerificationMetadataTitle
                  : copy.identityVerificationPrivateTitle
            }
          >
            {signature.status === "withdrawn"
              ? copy.identityVerificationWithdrawnContent
              : signature.contentAvailable
                ? copy.identityVerificationMetadataNotice
                : copy.identityVerificationPrivateNotice}
          </Notice>
        )}
        <dl className="verification-rows">
          <dt>{copy.identityVerificationAuthor}</dt>
          <dd>{signature.creatorName}</dd>
          <dt>{copy.identityVerificationAct}</dt>
          <dd>{actLabel(signature.actType)}</dd>
          {version !== null && (
            <>
              <dt>{copy.identityVerificationContentVersion}</dt>
              <dd>{version}</dd>
            </>
          )}
          <dt>{copy.identityVerificationWrittenBy}</dt>
          <dd>
            {approved
              ? copy.identityVerificationApprovedAuthor
              : text !== null
                ? signature.creatorName
                : copy.identityVerificationAuthorizedOnly}
          </dd>
          <dt>{copy.identityVerificationSigned}</dt>
          <dd>{time}</dd>
          <dt>{copy.identityVerificationStatus}</dt>
          <dd>{statusLabel(signature.status)}</dd>
          <dt>{copy.identityVerificationSharedBy}</dt>
          <dd>{copy.identityVerificationNotDisclosed}</dd>
        </dl>
        <div className="verification-hash">
          {formatCopy("identityVerificationHash", { hash: signature.contentHash })}
        </div>
        <p className="qv-help">{copy.identityVerificationPublicNotice}</p>
        <Button href={`/verify/${id}`} block>
          {copy.identityVerificationRefresh}
        </Button>
        <Button href="/home" variant="quiet" block>
          {copy.navHome}
        </Button>
      </main>
    );
  } catch {
    return <Unavailable id={id} />;
  }
}
