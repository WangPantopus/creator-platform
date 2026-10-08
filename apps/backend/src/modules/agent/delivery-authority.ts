import type { PoolClient } from "pg";
import type {
  License,
  Source,
} from "../../../../../packages/api/src/agent/contracts.js";
import { assertThreadScope, type ThreadScope } from "../access/scope.js";
import { invariant } from "../../core/errors.js";
import { audienceAllows } from "./pipeline.js";
import { versionRow, type Workspace } from "./repository.js";
import type { AgentService } from "./service.js";
import type { ApprovedSentence, AudiencePort } from "./runtime.js";

export type CapturedAgentAuthority = {
  versionId: string;
  versionHash: string;
  audienceRevision: string;
};

/** Uses W3's already scoped transaction, never a second connection or domain write.
 * W2 rows and canonical W1/W4 authority stay locked through durable sentence release. */
export async function assertAgentDelivery(
  service: AgentService,
  audiences: AudiencePort,
  scope: ThreadScope,
  client: PoolClient,
  sentence?: ApprovedSentence,
  captured?: CapturedAgentAuthority,
) {
  assertThreadScope(scope);
  const settings = await client.query<{ valid: boolean }>(
    "SELECT current_setting('app.creator_id',true)=$1 AND current_setting('app.fan_id',true)=$2 AND current_setting('app.account_id',true)=$3 AS valid",
    [scope.creatorId, scope.fanId, scope.actorAccountId],
  );
  invariant(
    settings.rows[0]?.valid,
    "scope_required",
    "A scoped conversation transaction is required.",
  );

  // Profile row locks use its existing owner policy. Restore the actor before
  // calling any producer or releasing content; no policy/privilege is expanded.
  let verified = false;
  try {
    await client.query("SELECT set_config('app.account_id',$1,true)", [
      scope.creatorAccountId,
    ]);
    const creator = await client.query(
      "SELECT 1 FROM creator.creator_profile WHERE id=$1 AND account_id=$2 AND verification='verified' FOR SHARE",
      [scope.creatorId, scope.creatorAccountId],
    );
    verified = creator.rowCount === 1;
  } finally {
    await client.query("SELECT set_config('app.account_id',$1,true)", [
      scope.actorAccountId,
    ]);
  }
  invariant(verified, "creator_paused", "This creator’s AI is paused.");

  const workspace = (
    await client.query<Workspace>(
      "SELECT * FROM creator.ai_workspace WHERE creator_id=$1 FOR SHARE",
      [scope.creatorId],
    )
  ).rows[0];
  invariant(
    workspace &&
      !workspace.deleted_at &&
      !workspace.paused &&
      workspace.live_version_id,
    "ai_paused",
    "The creator has paused this AI.",
  );
  const tombstone = await client.query(
    "SELECT 1 FROM creator.ai_tombstone WHERE creator_id=$1",
    [scope.creatorId],
  );
  invariant(!tombstone.rowCount, "ai_deleted", "This AI has been deleted.");
  const license =
    (
      await client.query<{ document: License }>(
        "SELECT document FROM creator.ai_license WHERE creator_id=$1 FOR SHARE",
        [scope.creatorId],
      )
    ).rows[0]?.document ?? null;
  invariant(
    await service.currentLicense(
      {
        creatorId: scope.creatorId,
        accountId: scope.creatorAccountId,
        development: service.syntheticDevelopmentLicensing,
      },
      license,
      client,
    ),
    "license_expired",
    "Current transaction-bound license authority is required.",
  );
  await client.query(
    "SELECT id FROM creator.ai_version WHERE creator_id=$1 AND id=$2 FOR SHARE",
    [scope.creatorId, workspace.live_version_id],
  );
  const version = await versionRow(
    client,
    scope.creatorId,
    workspace.live_version_id,
  );
  invariant(
    version?.state === "live" &&
      service.pipeline.supportsPublishedEngine(version.pipelineHash),
    "ai_updating",
    "The current evaluated AI version is unavailable or updating.",
  );
  invariant(
    !captured ||
      (captured.versionId === version.id &&
        captured.versionHash === version.compiledHash),
    "version_changed",
    "The creator’s AI changed before provider admission.",
  );
  invariant(
    service.pipeline.model?.pricingConfigured &&
      version.configuration.dailyCostCapMicros > 0,
    "pricing_required",
    "Current provider rates and a positive creator cost cap are required.",
  );

  const sources = (
    await client.query<Source>(
      `SELECT id,revision,content_hash AS "contentHash",state,index_state AS "indexState",expires_at AS "expiresAt",audience
     FROM creator.ai_source WHERE creator_id=$1 AND id=ANY($2::uuid[]) ORDER BY id FOR SHARE`,
      [scope.creatorId, version.sourceSet.map((source) => source.id)],
    )
  ).rows;
  invariant(
    version.sourceSet.every((expected) =>
      sources.some(
        (source) =>
          source.id === expected.id &&
          source.revision === expected.revision &&
          source.contentHash === expected.hash &&
          source.state === "approved" &&
          source.indexState === "ready" &&
          (!source.expiresAt ||
            new Date(source.expiresAt).valueOf() > Date.now()),
      ),
    ),
    "source_revoked",
    "A source changed or was revoked; the creator’s AI is updating.",
  );
  invariant(
    audiences.currentInTransaction,
    "audience_authority_unavailable",
    "Transaction-bound source audience authority is required.",
  );
  const audience = await audiences.currentInTransaction(scope, client);
  invariant(
    Date.parse(audience.validUntil) > Date.now() &&
      (!captured || captured.audienceRevision === audience.revision),
    "access_changed",
    "Source access changed during generation.",
  );

  if (!sentence) return;
  invariant(
    sentence.authorKind === "ai" &&
      sentence.versionId === version.id &&
      sentence.versionHash === version.compiledHash,
    "version_changed",
    "The creator’s AI changed during generation.",
  );
  invariant(
    sentence.text.trim().length > 0 && sentence.citations.length <= 4,
    "sentence_invalid",
    "A bounded approved sentence is required.",
  );
  const citations = (
    await client.query<{
      id: string;
      source_id: string;
      source_revision: number;
    }>(
      "SELECT id,source_id,source_revision FROM creator.ai_chunk WHERE creator_id=$1 AND id=ANY($2::uuid[]) ORDER BY id FOR SHARE",
      [scope.creatorId, sentence.citations],
    )
  ).rows;
  invariant(
    sentence.citations.every((id) =>
      citations.some(
        (citation) =>
          citation.id === id &&
          sources.some(
            (source) =>
              source.id === citation.source_id &&
              source.revision === citation.source_revision &&
              audienceAllows(source.audience, audience),
          ),
      ),
    ),
    "citation_unavailable",
    "A cited passage is no longer accessible to this fan.",
  );
}
