import { redirect } from "next/navigation";
import { currentSession } from "../lib/session";

export default async function Page() {
  const session = await currentSession("/home");
  if (!session) redirect("/auth/continue?returnTo=%2Fhome");
  redirect(session.fan ? "/home" : "/onboarding/handle?returnTo=%2Fhome");
}
