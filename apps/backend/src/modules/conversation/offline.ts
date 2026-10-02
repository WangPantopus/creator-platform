import type { PoolClient } from "pg";
import { assertThreadScope, type ThreadScope } from "../access/scope.js";
import { requestAuthority } from "../identity/request-authority.js";
import { contentHash } from "../../core/canonical.js";
import { DomainError } from "../../core/errors.js";
function offlineInvariant(
  condition: unknown,
  code: string,
  message: string,
  status: number,
): asserts condition {
  if (!condition) throw new DomainError(code, message, status);
}
import {
  ConversationOfflineSnapshotSchema,
  type ConversationPage,
  type ConversationOfflineSnapshot,
} from "../../../../../packages/api/src/conversation/contracts.js";

/** The caller must hold the actual participant/session/denial and licensed
 * source authority on this transaction before invoking the issuer. */
export class ConversationOfflineIssuer {
  readonly origin: string;
  constructor(origin: string, environment: string | undefined) {
    const url = new URL(origin);
    offlineInvariant(
      url.origin === origin &&
        !url.username &&
        !url.password &&
        (url.protocol === "https:" ||
          (environment === "development" &&
            url.protocol === "http:" &&
            ["localhost", "127.0.0.1"].includes(url.hostname))),
      "offline_issuer_invalid",
      "Offline reading requires this host's trusted origin.",
      503,
    );
    this.origin = origin;
  }

  async issue(
    scope: ThreadScope,
    client: PoolClient,
    page: ConversationPage,
    providerPolicyVersion: string,
  ): Promise<ConversationOfflineSnapshot> {
    assertThreadScope(scope);
    const authority = requestAuthority.getStore();
    offlineInvariant(
      authority &&
        authority.accountId === scope.actorAccountId &&
        scope.authority === "fan" &&
        scope.fanAccountId === authority.accountId,
      "offline_session_required",
      "Reconnect with this conversation's account.",
      401,
    );
    offlineInvariant(
      page.threadId === scope.threadId &&
        page.creatorId === scope.creatorId &&
        page.fanId === scope.fanId &&
        page.consentCurrent &&
        !page.offTheRecord,
      "offline_unavailable",
      "This conversation cannot be saved for offline reading.",
      403,
    );
    const times = (
      await client.query<{ issued_at: Date; expires_at: Date }>(
        `WITH issued AS MATERIALIZED (SELECT clock_timestamp() AS at)
       SELECT issued.at AS issued_at,
       LEAST(issued.at+interval '5 seconds',session.expires_at) AS expires_at
       FROM creator.identity_session session CROSS JOIN issued
       WHERE session.id=$1 AND session.account_id=$2
       AND session.revoked_at IS NULL AND session.expires_at>issued.at FOR SHARE OF session`,
        [authority.sessionId, authority.accountId],
      )
    ).rows[0];
    offlineInvariant(
      times && times.expires_at > times.issued_at,
      "offline_session_required",
      "Reconnect with this conversation's account.",
      401,
    );
    // The cache holds only already visible immutable text. Off-the-record
    // messages and recordings (including access URLs) never enter it.
    const messages = page.messages
      .filter(
        (message) =>
          !message.offTheRecord &&
          !message.recording &&
          ["accepted", "delivered", "interrupted"].includes(
            message.deliveryState,
          ),
      )
      .map((message) => ({ ...message, feedback: null }));
    const saved = {
      ...page,
      messages,
      canSend: false,
      before: null,
      generationSequences: {},
      feedbackPolicy: null,
      unavailableReason: "You're offline. Reconnect to send.",
    };
    while (
      Buffer.byteLength(JSON.stringify(saved), "utf8") > 131072 &&
      messages.length
    )
      messages.shift();
    return ConversationOfflineSnapshotSchema.parse({
      lease: {
        issuer: this.origin,
        accountId: authority.accountId,
        sessionBinding: contentHash({
          purpose: "conversation-offline-session-v1",
          issuer: this.origin,
          accountId: authority.accountId,
          sessionId: authority.sessionId,
        }),
        threadId: scope.threadId,
        creatorId: scope.creatorId,
        fanId: scope.fanId,
        revision: page.revision,
        epoch: page.epoch,
        cursor: page.cursor,
        policyVersion: "conversation-offline-five-seconds-v1",
        providerPolicyVersion,
        issuedAt: times.issued_at.toISOString(),
        expiresAt: times.expires_at.toISOString(),
        messages: messages.map((message) => ({
          id: message.id,
          version: message.version,
        })),
      },
      page: saved,
    });
  }
}
