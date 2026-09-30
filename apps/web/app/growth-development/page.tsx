import { notFound } from "next/navigation";
import { GrowthShell } from "../../features/growth/shell";
import { DevelopmentControls } from "../../features/growth/development";
export const dynamic = "force-dynamic";
export default function Development() {
  if (
    process.env.NODE_ENV === "production" ||
    process.env.QELVORA_GROWTH_DEVELOPMENT !== "true"
  )
    notFound();
  return (
    <GrowthShell>
      <DevelopmentControls />
    </GrowthShell>
  );
}
