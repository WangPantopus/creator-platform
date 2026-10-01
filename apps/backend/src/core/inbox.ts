import type { Pool } from "pg";
import { invariant } from "./errors.js";

export interface VerifiedProviderEvent {
  provider: string;
  eventId: string;
  currentStateRef: string;
  payload: unknown;
}
export interface WebhookVerifier {
  verify(
    rawBody: Uint8Array,
    headers: Record<string, string>,
  ): Promise<VerifiedProviderEvent>;
}
export class WebhookInbox {
  constructor(
    private readonly pool: Pool,
    private readonly verifier: WebhookVerifier,
  ) {}
  async receive(
    rawBody: Uint8Array,
    headers: Record<string, string>,
  ): Promise<boolean> {
    const verified = await this.verifier.verify(rawBody, headers);
    invariant(
      verified.eventId && verified.currentStateRef,
      "invalid_provider_event",
      "A verified provider event is required.",
    );
    const result = await this.pool.query(
      "INSERT INTO creator.webhook_inbox(provider,event_id,current_state_ref,payload) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING event_id",
      [
        verified.provider,
        verified.eventId,
        verified.currentStateRef,
        JSON.stringify(verified.payload),
      ],
    );
    return result.rowCount === 1;
  }
  /** Webhook payload order is never used as authoritative provider state. */
  async reconcile(
    provider: string,
    eventId: string,
    fetchCurrent: (reference: string) => Promise<unknown>,
    applyCurrent: (state: unknown, idempotencyKey: string) => Promise<void>,
  ): Promise<void> {
    const result = await this.pool.query<{
      current_state_ref: string;
      processed_at: Date | null;
    }>(
      "SELECT current_state_ref,processed_at FROM creator.webhook_inbox WHERE provider=$1 AND event_id=$2",
      [provider, eventId],
    );
    const record = result.rows[0];
    invariant(
      record,
      "provider_event_missing",
      "The provider event is unavailable.",
    );
    if (record.processed_at) return;
    await applyCurrent(
      await fetchCurrent(record.current_state_ref),
      `${provider}:${eventId}`,
    );
    await this.pool.query(
      "UPDATE creator.webhook_inbox SET processed_at=now() WHERE provider=$1 AND event_id=$2 AND processed_at IS NULL",
      [provider, eventId],
    );
  }
}
