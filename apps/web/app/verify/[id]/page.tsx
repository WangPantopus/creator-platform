import { IdSchema, PublicSignatureSchema } from "@qelvora/api";
import { Notice, Message, ShareCard } from "@qelvora/ui-web";
import { platformFetch } from "../../../lib/session";

export default async function Verification({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const identifier = IdSchema.safeParse(id);
  if (!identifier.success)
    return (
      <main className="public-verification">
        <Notice title="Signed act unavailable">
          This verification link is invalid.
        </Notice>
      </main>
    );
  try {
    const response = await platformFetch(
      `/v1/identity/signed-acts/${id}`,
      {},
      false,
    );
    if (!response.ok)
      return (
        <main className="public-verification">
          <Notice
            title={
              response.status === 404
                ? "Signed act unavailable"
                : "Verification unavailable"
            }
          >
            {response.status === 404
              ? "This signed act could not be found."
              : "Reconnect and try again. Verification could not be checked."}
          </Notice>
        </main>
      );
    const signature = PublicSignatureSchema.parse(await response.json());
    const document = signature.content as {
      content?: { text?: string; authorKind?: string };
      actType?: string;
    } | null;
    const text =
      typeof document?.content?.text === "string"
        ? document.content.text
        : null;
    const approved =
      signature.actType === "approved_draft" ||
      document?.content?.authorKind === "approved_draft";
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
          <h1>Signed by {signature.creatorName}</h1>
        </div>
        <p>{signature.explanation}</p>
        {signature.status !== "valid" && (
          <Notice
            title={
              signature.status === "withdrawn"
                ? "This card was withdrawn"
                : signature.status === "key_revoked"
                  ? "Signing key revoked"
                  : "Creator verification revoked"
            }
          >
            The historical approval remains recorded. Current authority is
            unavailable.
          </Notice>
        )}
        {text ? (
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
                ? "Content withdrawn"
                : "Private signed act"
            }
          >
            This page shows signature metadata. The act’s private content and
            conversation are not public.
          </Notice>
        )}
        <dl className="verification-rows">
          <dt>Author</dt>
          <dd>{signature.creatorName}</dd>
          <dt>Written by</dt>
          <dd>
            {approved
              ? "AI draft · creator approved"
              : text
                ? signature.creatorName
                : "Shown only with authorized content"}
          </dd>
          <dt>Signed</dt>
          <dd>{time}</dd>
          <dt>Shared by</dt>
          <dd>Not disclosed</dd>
        </dl>
        <div className="verification-hash">
          Exact act hash · SHA-256
          <br />
          {signature.contentHash}
        </div>
        <p className="qv-help">
          Anyone can open this page. It shows authorized content, signature
          provenance and current revocation status, with nothing else from the
          conversation.
        </p>
      </main>
    );
  } catch {
    return (
      <main className="public-verification">
        <Notice title="Verification unavailable">
          Reconnect and try again. Verification could not be checked.
        </Notice>
      </main>
    );
  }
}
