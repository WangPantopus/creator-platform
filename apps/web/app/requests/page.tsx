import { redirect } from "next/navigation";

/** The shared account shell publishes this destination. Resolve it through
 * the existing account-bound Commerce Requests consumer. */
export default function RequestsPage() {
  redirect("/commerce/requests");
}
