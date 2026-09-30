import { redirect } from "next/navigation";
import { currentSession } from "../../../lib/session";
import { AccountPanel } from "../../../features/identity/account";
export default async function Page() {
  const session = await currentSession();
  if (!session) redirect("/auth/continue?returnTo=%2Fidentity%2Faccount");
  return (
    <main className="foundation">
      <AccountPanel initial={session} />
    </main>
  );
}
