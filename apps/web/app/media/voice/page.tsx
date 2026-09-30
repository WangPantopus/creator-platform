import { VoiceRecording } from "../../../features/media/VoiceRecorder";
export default async function VoicePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const uuid = /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/iu;
  const creatorId =
    typeof query.creatorId === "string" && uuid.test(query.creatorId)
      ? query.creatorId
      : undefined;
  const fanId =
    typeof query.fanId === "string" && uuid.test(query.fanId)
      ? query.fanId
      : undefined;
  // D-17 Note voice limit is60 seconds. Personal reply limits come from W4, never a query parameter.
  return (
    <main>
      <VoiceRecording
        creatorId={creatorId}
        fanId={fanId}
        purpose="human_note"
        maxDurationMs={60_000}
      />
    </main>
  );
}
