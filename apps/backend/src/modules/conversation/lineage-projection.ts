import type { Pool, PoolClient } from "pg";
import type { ThreadScope } from "../access/scope.js";
import type { ConversationMessage } from "../../../../../packages/api/src/conversation/contracts.js";

/** Read-only consumer contract. The canonical host obtains this port only
 * from an actual registered ConversationLineage instance's projection().
 * An absent prepared instance means absent metadata, never an invented reader.
 * This file brings no feedback writes, held-scope issuance or schema activation
 * into an older Studio consumer. Reads remain on its actual scoped client. */
export interface ConversationLineageProjection {
  assertPool(pool: Pool): void;
  /** Read actual registered row metadata for this bounded existing page. */
  project(
    scope: ThreadScope,
    client: PoolClient,
    messageIds: readonly string[],
  ): Promise<ConversationMessage[]>;
  enrich(
    scope: ThreadScope,
    client: PoolClient,
    messages: readonly ConversationMessage[],
  ): Promise<ConversationMessage[]>;
}
