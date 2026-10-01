import type { PoolClient } from "pg";
import type { SignedActCommand } from "@qelvora/api";
import type { ProcessedMediaEvidence } from "../../../../../packages/api/src/media.js";
import type { Actor } from "../identity/adapter.js";
import type {
  CreatorIdentityAuthority,
  CreatorScope,
} from "../identity/creator-scope.js";
import { invariant } from "../../core/errors.js";
import type { ContentPublicationMedia } from "./service.js";

/** Exact structural consumer of W6's creator-object publication producer.
 * The host supplies its actual service and the very same W1 scope issuer.
 */
export interface CreatorMediaPublicationProducer {
  readonly identity: CreatorIdentityAuthority;
  evidence(
    scope: CreatorScope,
    client: PoolClient,
    objectId: string,
    assetId: string,
  ): Promise<ProcessedMediaEvidence>;
  attachPublication(
    scope: CreatorScope,
    client: PoolClient,
    objectId: string,
    signedActId: string,
    command: SignedActCommand,
    evidence: readonly ProcessedMediaEvidence[],
  ): Promise<void>;
  readyForPublication(
    scope: CreatorScope,
    client: PoolClient,
    objectId: string,
    evidence: ProcessedMediaEvidence,
    signedActId: string,
  ): Promise<boolean>;
  withdraw(
    scope: CreatorScope,
    client: PoolClient,
    objectId: string,
  ): Promise<void>;
}

export function contentPublicationMedia(
  identity: CreatorIdentityAuthority,
  media: CreatorMediaPublicationProducer,
): ContentPublicationMedia {
  invariant(
    media.identity === identity,
    "media_issuer_mismatch",
    "Content and media require the same current creator authority.",
  );
  const scopes = new WeakMap<PoolClient, CreatorScope>();
  const current = (client: PoolClient, actor: Actor, creatorId: string) => {
    const scope = scopes.get(client);
    invariant(
      scope &&
        scope.accountId === actor.accountId &&
        scope.creatorId === creatorId,
      "media_scope_required",
      "Current creator media authority is required before changing this content.",
    );
    return scope;
  };
  return {
    async authorize(client, actor, creatorId, requirement) {
      scopes.delete(client);
      const scope = await identity.open(actor, creatorId, requirement);
      await identity.authorizeInTransaction(scope, client, requirement);
      scopes.set(client, scope);
    },
    evidence: (client, actor, creatorId, objectId, assetId) =>
      media.evidence(
        current(client, actor, creatorId),
        client,
        objectId,
        assetId,
      ),
    attach: (
      client,
      actor,
      creatorId,
      objectId,
      signedActId,
      command,
      evidence,
    ) =>
      media.attachPublication(
        current(client, actor, creatorId),
        client,
        objectId,
        signedActId,
        command,
        evidence,
      ),
    ready: (client, actor, creatorId, objectId, evidence, signedActId) =>
      media.readyForPublication(
        current(client, actor, creatorId),
        client,
        objectId,
        evidence,
        signedActId,
      ),
    withdraw: (client, actor, creatorId, objectId) =>
      media.withdraw(current(client, actor, creatorId), client, objectId),
  };
}
