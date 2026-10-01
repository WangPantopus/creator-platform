import type { Pool, PoolClient } from "pg";
import { DomainError, invariant } from "../../core/errors.js";
import { contentHash } from "../../core/canonical.js";
import type { PreparedGenerationJournal } from "./generation-journal.js";
import {
  assertCurrentSession,
  requestAuthority,
} from "../identity/request-authority.js";
import {
  DraftConfig,
  type Configuration,
  type Evaluation,
  type License,
  type Source,
  type Version,
} from "../../../../../packages/api/src/agent/contracts.js";

export type CreatorScope = Readonly<{
  creatorId: string;
  accountId: string;
  development: boolean;
}>;
export type Workspace = {
  creator_id: string;
  revision: number;
  configuration: Configuration;
  interview: { story: string; boundaries: string; audioConsent: boolean };
  current_status: { text: string; expiresAt: string } | null;
  live_version_id: string | null;
  paused: boolean;
  deleted_at: Date | null;
};
export class AgentRepository {
  constructor(
    readonly pool: Pool,
    readonly usageJournal?: PreparedGenerationJournal,
  ) {
    usageJournal?.assertPool(pool);
  }
  async transaction<T>(
    scope: CreatorScope,
    work: (
      client: PoolClient,
      workspace: Workspace,
      creator: { id: string; name: string; verification: string },
    ) => Promise<T>,
    allowDeleted = false,
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        "SELECT set_config('app.creator_id',$1,true),set_config('app.account_id',$2,true)",
        [scope.creatorId, scope.accountId],
      );
      const authority = requestAuthority.getStore();
      if (authority) {
        // Fan generation can use the creator's repository scope. Hold the
        // actual HTTP actor's session, then restore the repository account.
        await client.query("SELECT set_config('app.account_id',$1,true)", [
          authority.accountId,
        ]);
        try {
          await assertCurrentSession(client, authority.accountId);
        } finally {
          await client.query("SELECT set_config('app.account_id',$1,true)", [
            scope.accountId,
          ]);
        }
      }
      const tombstone = await client.query(
        "SELECT 1 FROM creator.ai_tombstone WHERE creator_id=$1",
        [scope.creatorId],
      );
      invariant(
        allowDeleted || !tombstone.rowCount,
        "ai_deleted",
        "This AI has been deleted.",
      );
      const result = await client.query<{
        id: string;
        name: string;
        verification: string;
      }>(
        "SELECT id,display_name AS name,verification FROM creator.creator_profile WHERE id=$1 AND account_id=$2 FOR SHARE",
        [scope.creatorId, scope.accountId],
      );
      invariant(
        result.rows[0],
        "creator_required",
        "Only the creator can configure this AI.",
      );
      await client.query(
        "SELECT set_config('app.creator_id',$1,true),set_config('app.account_id',$2,true)",
        [scope.creatorId, scope.accountId],
      );
      if (!tombstone.rowCount)
        await client.query(
          "INSERT INTO creator.ai_workspace(creator_id,configuration) VALUES($1,$2) ON CONFLICT DO NOTHING",
          [scope.creatorId, DraftConfig.parse({})],
        );
      const row = await client.query<Workspace>(
        "SELECT * FROM creator.ai_workspace WHERE creator_id=$1 FOR UPDATE",
        [scope.creatorId],
      );
      invariant(
        row.rows[0] && (allowDeleted || !row.rows[0].deleted_at),
        "ai_deleted",
        "This AI has been deleted.",
      );
      const value = await work(client, row.rows[0], result.rows[0]);
      await client.query("COMMIT");
      return value;
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }
  async command<T>(
    scope: CreatorScope,
    key: string,
    body: unknown,
    work: (
      client: PoolClient,
      workspace: Workspace,
      creator: { id: string; name: string; verification: string },
    ) => Promise<T>,
  ): Promise<T> {
    if (!/^[a-zA-Z0-9_-]{8,128}$/u.test(key))
      throw new DomainError(
        "idempotency_required",
        "A valid action key is required.",
        400,
      );
    return this.transaction(
      scope,
      async (client, workspace, creator) => {
        const hash = contentHash(body);
        const existing = await client.query<{
          request_hash: string;
          response: T;
        }>(
          "SELECT request_hash,response FROM creator.ai_command WHERE creator_id=$1 AND account_id=$2 AND key=$3",
          [scope.creatorId, scope.accountId, key],
        );
        if (existing.rows[0]) {
          invariant(
            existing.rows[0].request_hash === hash,
            "action_conflict",
            "That action key was used for different content.",
          );
          return existing.rows[0].response;
        }
        invariant(
          !workspace.deleted_at,
          "ai_deleted",
          "This AI has been deleted.",
        );
        const response = await work(client, workspace, creator);
        await client.query(
          "INSERT INTO creator.ai_command(creator_id,account_id,key,request_hash,response) VALUES($1,$2,$3,$4,$5)",
          [
            scope.creatorId,
            scope.accountId,
            key,
            hash,
            JSON.stringify(response),
          ],
        );
        return response;
      },
      true,
    );
  }
}
export function exactRevision(workspace: Workspace, expected: number) {
  if (workspace.revision !== expected)
    throw new DomainError(
      "draft_changed",
      "Your draft changed. Refresh before continuing; your input is preserved.",
      409,
    );
}
export async function bump(client: PoolClient, creatorId: string) {
  await client.query(
    "UPDATE creator.ai_workspace SET revision=revision+1,updated_at=now() WHERE creator_id=$1",
    [creatorId],
  );
}
export async function event(
  client: PoolClient,
  creatorId: string,
  type: string,
  revision: number,
  payload: Record<string, unknown>,
) {
  await client.query(
    "INSERT INTO creator.ai_event(creator_id,type,revision,payload) VALUES($1,$2,$3,$4)",
    [creatorId, type, revision, { schemaVersion: 1, ...payload }],
  );
}
export async function sourceRows(
  client: PoolClient,
  creatorId: string,
): Promise<Source[]> {
  const rows = await client.query(
    `SELECT id,revision,title,origin,origin_reference AS "originReference",audience,rights_evidence AS "rightsEvidence",expires_at AS "expiresAt",state,index_state AS "indexState",progress,error,content_hash AS "contentHash",created_at AS "createdAt",reviewed_at AS "reviewedAt" FROM creator.ai_source WHERE creator_id=$1 ORDER BY created_at DESC LIMIT 201`,
    [creatorId],
  );
  return JSON.parse(JSON.stringify(rows.rows)) as Source[];
}
export async function licenseRow(
  client: PoolClient,
  creatorId: string,
): Promise<License | null> {
  const rows = await client.query<{ document: License }>(
    "SELECT document FROM creator.ai_license WHERE creator_id=$1",
    [creatorId],
  );
  return rows.rows[0]?.document ?? null;
}
export function licensed(
  license: License | null,
  use: "text_ai" | "ai_voice" = "text_ai",
) {
  return Boolean(
    license &&
      license.state === "active" &&
      Date.parse(license.termEndsAt) > Date.now() &&
      license.permittedUses.includes(use) &&
      (use !== "ai_voice" || license.voiceConsentReference),
  );
}
export async function evaluationRow(
  client: PoolClient,
  creatorId: string,
): Promise<Evaluation | null> {
  const rows = await client.query(
    `SELECT id,revision,fingerprint,state,cases,created_at AS "createdAt",completed_at AS "completedAt" FROM creator.ai_evaluation WHERE creator_id=$1 ORDER BY created_at DESC LIMIT 1`,
    [creatorId],
  );
  return rows.rows[0]
    ? (JSON.parse(JSON.stringify(rows.rows[0])) as Evaluation)
    : null;
}
export async function versionRows(
  client: PoolClient,
  creatorId: string,
  beforeNumber: number | null = null,
): Promise<Version[]> {
  const rows = await client.query(
    `SELECT id,number,state,configuration,compiled_hash AS "compiledHash",source_set AS "sourceSet",pipeline_hash AS "pipelineHash",evaluation_id AS "evaluationId",changes,published_at AS "publishedAt" FROM creator.ai_version WHERE creator_id=$1 AND ($2::integer IS NULL OR number<$2) ORDER BY number DESC LIMIT 100`,
    [creatorId, beforeNumber],
  );
  return JSON.parse(JSON.stringify(rows.rows)) as Version[];
}

/** A display page is never the authority for the live pointer or rollback. */
export async function versionRow(
  client: PoolClient,
  creatorId: string,
  id: string | null,
): Promise<Version | null> {
  if (!id) return null;
  const rows = await client.query(
    `SELECT id,number,state,configuration,compiled_hash AS "compiledHash",source_set AS "sourceSet",pipeline_hash AS "pipelineHash",evaluation_id AS "evaluationId",changes,published_at AS "publishedAt" FROM creator.ai_version WHERE creator_id=$1 AND id=$2`,
    [creatorId, id],
  );
  return rows.rows[0]
    ? (JSON.parse(JSON.stringify(rows.rows[0])) as Version)
    : null;
}
