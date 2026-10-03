import type { QueryConfig } from "pg";
import { z } from "zod";
import { DomainError } from "../../core/errors.js";
import { contentHash } from "../../core/canonical.js";
import { querySettlementUncertain } from "../../core/query-settlement.js";
import {
  isConfiguredBackendRuntime,
  type BackendRuntime,
} from "../../integration.js";
import type { Actor } from "../identity/adapter.js";
import {
  assertHeldCurrentRequestSession,
  holdCurrentRequestSession,
  requestAuthority,
} from "../identity/request-authority.js";
import { ContentHeldClient } from "./held-client-cleanup.js";
import { ContentService } from "./service.js";

const Reference = z.strictObject({
  creatorId: z.uuid(),
  contentId: z.uuid(),
  version: z.int().positive().max(2147483647),
  title: z.string().max(180),
});
const Pointer = Reference.pick({ creatorId: true, contentId: true });

function unavailable(cause?: unknown): DomainError {
  const error = new DomainError(
    "content_entry_unavailable",
    "Current post context is unavailable. Reopen the post and try again.",
    503,
  );
  if (cause !== undefined)
    Object.defineProperty(error, "cause", { value: cause, configurable: true });
  return error;
}

/** W7's structural signed-in request port. The reference supplies no body,
 * processor consent, generation source, background or continuing permission.
 */
export interface CurrentContentPostEntryReader {
  current(input: {
    actor: Actor;
    creatorId: string;
    contentId: string;
  }): Promise<Readonly<z.infer<typeof Reference>> | null>;
}

/** Narrow original fan read for ordinary public Team text posts. This reuses
 * the existing canonical audience issuer; it creates no issuer or permission.
 * Signed creator posts await W1's genuine same-client signature reader. Other
 * content, packets, quotes, groups and media remain outside this first port.
 */
export function createCurrentContentPostEntryReader(
  runtime: BackendRuntime,
  content: ContentService,
): CurrentContentPostEntryReader {
  const audience = runtime.audienceIdentity;
  const pool = runtime.pool;
  const restored = runtime.assertRestoredInTransaction;
  const denied = runtime.assertContentAllowedInTransaction;
  function assertHost() {
    if (
      !isConfiguredBackendRuntime(runtime) ||
      !audience ||
      runtime.audienceIdentity !== audience ||
      !(content instanceof ContentService) ||
      content.pool !== pool ||
      runtime.pool !== pool ||
      !restored ||
      !denied ||
      !Number.isFinite(pool.options.connectionTimeoutMillis) ||
      (pool.options.connectionTimeoutMillis ?? 0) <= 0 ||
      (pool.options.connectionTimeoutMillis ?? 0) > 5000
    )
      throw unavailable();
  }
  assertHost();
  return Object.freeze({
    async current(
      input: Parameters<CurrentContentPostEntryReader["current"]>[0],
    ) {
      assertHost();
      const pointer = Pointer.parse({
        creatorId: input.creatorId,
        contentId: input.contentId,
      });
      const request = requestAuthority.getStore();
      if (
        !input.actor.adultEligible ||
        request?.accountId !== input.actor.accountId
      )
        throw new DomainError(
          "content_entry_session_required",
          "Reopen this post with your current signed-in account.",
          401,
        );
      // Genuine issuance completes before borrowing the domain connection.
      const scope = await audience!.open(input.actor, pointer.creatorId);
      assertHost();
      const client = await pool.connect().catch((cause: unknown) => {
        throw unavailable(cause);
      });
      // This actual host budget is distinct from an incoming request signal.
      const budget = AbortSignal.timeout(5000);
      const held = new ContentHeldClient(client, budget);
      let failure: unknown;
      try {
        await held.begin();
        assertHost();
        await held.run(() =>
          client.query(
            "SET LOCAL statement_timeout='5s'; SET LOCAL lock_timeout='1s'; SET LOCAL idle_in_transaction_session_timeout='5s'",
          ),
        );
        const original = await held.run(() =>
          holdCurrentRequestSession(client, input.actor.accountId),
        );
        await held.run(() => restored!(client));
        await held.run(() =>
          denied!(client, original.actor, pointer.creatorId),
        );
        await held.run(() => audience!.authorizeInTransaction(scope, client));
        assertHost();
        const row = await held.run(() =>
          content.index(client, pointer.creatorId, pointer.contentId),
        );
        if (
          row.kind !== "post" ||
          row.audience.kind !== "public" ||
          row.state !== "published" ||
          !row.published_at ||
          row.packet_id !== null ||
          row.quote_reply_id !== null
        )
          return null;
        await held.run(() =>
          content.authorizeRead(client, original.actor, row),
        );
        const query: QueryConfig & { query_timeout: number } = {
          text: `SELECT i.creator_id AS "creatorId",i.id AS "contentId",i.version,
           r.document->>'title' AS title
           FROM creator.content_index i JOIN creator.content_revision r
            ON r.content_id=i.id AND r.creator_id=i.creator_id AND r.version=i.version
           JOIN creator.content_publication p
            ON p.content_id=i.id AND p.creator_id=i.creator_id AND p.version=i.version
           WHERE i.id=$1 AND i.creator_id=$2 AND i.version=$3
            AND i.kind='post' AND i.state='published' AND i.published_at IS NOT NULL
            AND i.withdrawn_at IS NULL AND i.audience='{"kind":"public"}'::jsonb
            AND i.packet_id IS NULL AND i.quote_reply_id IS NULL
            AND p.author_kind='team' AND p.signed_act_id IS NULL AND p.published_at IS NOT NULL
            AND r.document->>'kind'='post' AND r.document->'audience'=i.audience
            AND r.document->'media'='[]'::jsonb
            AND (r.document->'packetId' IS NULL OR r.document->'packetId'='null'::jsonb)
            AND (r.document->'planRef' IS NULL OR r.document->'planRef'='null'::jsonb)
            AND (r.document->'quote' IS NULL OR r.document->'quote'='null'::jsonb)
            AND (r.document->'live' IS NULL OR r.document->'live'='null'::jsonb)`,
          values: [pointer.contentId, pointer.creatorId, row.version],
          query_timeout: 5000,
        };
        const first = (await held.run(() => client.query(query))).rows[0];
        if (!first) return null;
        const reference = Reference.parse(first);
        assertHost();
        await held.run(() => restored!(client));
        await held.run(() =>
          denied!(client, original.actor, pointer.creatorId),
        );
        const final = (await held.run(() => client.query(query))).rows[0];
        if (
          !final ||
          contentHash(Reference.parse(final)) !== contentHash(reference)
        )
          throw unavailable();
        assertHost();
        await held.run(() => assertHeldCurrentRequestSession(original, client));
        await held.commit();
        return Object.freeze(reference);
      } catch (cause) {
        failure = cause;
        if (budget.aborted || querySettlementUncertain(cause))
          throw unavailable(cause);
        throw cause;
      } finally {
        await held.settle(failure);
      }
    },
  });
}
