import Link from "next/link";
import { redirect } from "next/navigation";
import { Notice } from "@qelvora/ui-web";

export default async function YourAccount({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const context = await searchParams;
  if (Object.keys(context).length === 0) redirect("/identity/account");
  return (
    <main className="qv" style={{ maxWidth: 640, margin: "auto", padding: 16 }}>
      <Notice title="Account link unavailable">
        This link needs the current account view, which is not connected in this
        workspace. The original context is kept in this URL.
      </Notice>
      <Link className="qv-btn qv-btn--secondary" href="/identity/account">
        Open general account
      </Link>
    </main>
  );
}
