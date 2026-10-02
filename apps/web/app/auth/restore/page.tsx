import { redirect } from "next/navigation";
import { ReturnTargetSchema } from "@qelvora/api";
import { copy } from "@qelvora/copy";
import { Notice } from "@qelvora/ui-web";

/** A failed restore keeps the credential and destination available for retry. */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string; resumeHandle?: string }>;
}) {
  const { returnTo, resumeHandle } = await searchParams;
  const parsed = ReturnTargetSchema.safeParse(returnTo);
  if (!parsed.success || (resumeHandle && resumeHandle !== "1"))
    redirect("/auth/continue?error=invalid_return&returnTo=%2Fhome");
  const target = `/api/auth/restore?returnTo=${encodeURIComponent(parsed.data)}${resumeHandle === "1" ? "&resumeHandle=1" : ""}`;
  return (
    <main className="qv route-error">
      <div role="alert">
        <Notice tone="error" title={copy.accountUnavailableTitle}>
          {copy.accountUnavailableBody}
        </Notice>
      </div>
      <a
        className="qv-btn qv-btn--secondary qv-btn--lg qv-btn--block"
        href={target}
      >
        {copy.retry}
      </a>
    </main>
  );
}
