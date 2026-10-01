import Link from "next/link";
import { notFound } from "next/navigation";
import { IdSchema, ReturnTargetSchema } from "@qelvora/api";
import { Notice } from "@qelvora/ui-web";
import { CreatorVoiceRecording } from "../../../features/media/VoiceRecorder";
import { MediaSession } from "../../../features/media/session";
import { IdentitySessionBoundary } from "../../../features/identity/session-boundary";
import { IdentityWelcome } from "../../../features/identity/welcome";
import { currentSession } from "../../../lib/session";

export default async function VoicePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const creatorId = query.creatorId;
  const objectId = query.objectId;
  if (
    Object.keys(query).some(
      (key) => !["creatorId", "objectId"].includes(key),
    ) ||
    (creatorId !== undefined && !IdSchema.safeParse(creatorId).success) ||
    (objectId !== undefined && !IdSchema.safeParse(objectId).success)
  )
    notFound();
  const returnTo =
    typeof creatorId === "string" && typeof objectId === "string"
      ? `/media/voice?creatorId=${creatorId}&objectId=${objectId}`
      : "/media/voice";
  if (!ReturnTargetSchema.safeParse(returnTo).success) notFound();
  const session = await currentSession(returnTo);
  if (!session) return <IdentityWelcome returnTo={returnTo} arrival={null} />;
  return (
    <IdentitySessionBoundary
      key={session.accountId}
      initial={session}
      returnTo={returnTo}
    >
      <main className="qv">
        {typeof creatorId === "string" &&
        typeof objectId === "string" &&
        session.creator?.id === creatorId ? (
          <MediaSession>
            <CreatorVoiceRecording
              creatorId={creatorId}
              objectId={objectId}
              creatorName={session.creator.displayName}
            />
            <p className="qv-help">
              Return to the saved Note in Studio to attach the processed
              recording and review its complete signature.
            </p>
            <Link href={`/studio/${creatorId}/compose/${objectId}`}>
              Open your Note
            </Link>
          </MediaSession>
        ) : (
          <Notice title="Open a saved Note">
            Choose a Note in your own Studio before recording its voice note.
            <Link href="/studio/workspace">Open Studio</Link>
          </Notice>
        )}
      </main>
    </IdentitySessionBoundary>
  );
}
