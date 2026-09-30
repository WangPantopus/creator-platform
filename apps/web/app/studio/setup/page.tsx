import { redirect } from "next/navigation";
import { currentSession } from "../../../lib/session";
import { CreatorSetup } from "../../../features/identity/setup";
export default async function Page() {
  const session = await currentSession();
  if (!session) redirect("/auth/continue?returnTo=%2Fstudio%2Fsetup");
  return <CreatorSetup initial={session} />;
}
