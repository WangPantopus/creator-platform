import { randomBytes, createHash } from "node:crypto";
import type { Actor } from "../identity/adapter.js";
import { invariant } from "../../core/errors.js";
const hash = (token: string) =>
  createHash("sha256").update(token).digest("hex");
/** A one-use, 30-second socket ticket keeps the HttpOnly session out of browser JS.
 * Subsequent batches revalidate the canonical session, not the ticket's old actor. */
export class ConversationSocketTickets {
  private readonly tickets = new Map<
    string,
    { token: string; accountId: string; expires: number }
  >();
  issue(actor: Actor, token: string) {
    const now = Date.now();
    for (const [key, ticket] of this.tickets)
      if (ticket.expires <= now) this.tickets.delete(key);
    invariant(
      this.tickets.size < 10000,
      "realtime_busy",
      "Reconnect in a moment.",
    );
    const ticket = randomBytes(32).toString("base64url");
    this.tickets.set(hash(ticket), {
      token,
      accountId: actor.accountId,
      expires: now + 30000,
    });
    return { ticket, expiresAt: new Date(now + 30000).toISOString() };
  }
  consume(ticket: string) {
    const key = hash(ticket);
    const entry = this.tickets.get(key);
    this.tickets.delete(key);
    invariant(
      entry && entry.expires > Date.now(),
      "ticket_expired",
      "Refresh before reconnecting.",
    );
    return entry.token;
  }
}
export const conversationSocketTickets = new ConversationSocketTickets();
