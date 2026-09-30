import type { PoolClient } from "pg";
import type { Actor } from "./adapter.js";

export interface ThreadAuthority {
  creatorAccountId: string;
  fanAccountId: string;
  creatorName: string;
  triage: boolean;
  verified: boolean;
}
export interface IdentityRead {
  threadAuthority(
    actor: Actor,
    creatorId: string,
    fanId: string,
    client: PoolClient,
  ): Promise<ThreadAuthority | null>;
}
export class PostgresIdentityRead implements IdentityRead {
  async threadAuthority(
    actor: Actor,
    creatorId: string,
    fanId: string,
    client: PoolClient,
  ): Promise<ThreadAuthority | null> {
    const result = await client.query<{
      creator_account: string;
      fan_account: string;
      display_name: string;
      verification: string;
      triage: boolean;
    }>(
      `SELECT c.account_id AS creator_account,c.display_name,c.verification, f.account_id AS fan_account,
        EXISTS(SELECT 1 FROM creator.team_membership tm WHERE tm.creator_id=c.id AND tm.account_id=$3 AND tm.revoked_at IS NULL AND 'triage'=ANY(tm.roles)) AS triage
        FROM creator.creator_profile c CROSS JOIN creator.fan_profile f WHERE c.id=$1 AND f.id=$2`,
      [creatorId, fanId, actor.accountId],
    );
    const row = result.rows[0];
    return row
      ? {
          creatorAccountId: row.creator_account,
          fanAccountId: row.fan_account,
          creatorName: row.display_name,
          triage: row.triage,
          verified: row.verification === "verified",
        }
      : null;
  }
}
