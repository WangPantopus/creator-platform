import { invitationCard } from "../../../../features/growth/invitation-card";

export const dynamic = "force-dynamic";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return invitationCard((await params).id);
}
