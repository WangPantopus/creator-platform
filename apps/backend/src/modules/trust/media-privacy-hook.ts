import type { Pool } from "pg";
import { invariant } from "../../core/errors.js";
import type { PrivacyHook } from "./contracts.js";
import { privacyTaskAuthority } from "./privacy-authority.js";
import { conversationPrivacyAuthority } from "./conversation-privacy-authority.js";
import { z } from "zod";

type Job = Parameters<PrivacyHook["run"]>[0];
/** Lifecycle metadata uses verified pair RLS, never an interactive grant.
 * Nonempty binary data requires the actual storage/archive adapter. */
export function mediaPrivacyHook(input: {
  runtime: Pool;
  coordinator: Pool;
  exportArchive?: (
    job: Job,
    families: readonly unknown[],
  ) => Promise<{ reference: string; sha256: string; verified: true }>;
}): PrivacyHook {
  const verify = privacyTaskAuthority(input.coordinator);
  const authority = conversationPrivacyAuthority(
    input.runtime,
    input.coordinator,
  );
  return {
    domain: "media",
    async run(job) {
      await verify(job);
      invariant(
        job.kind === "export",
        "media_retention_unconfigured",
        "Media erasure requires the approved storage, call settlement and retention adapters.",
      );
      const families = await authority.families(job);
      const client = await input.runtime.connect();
      const data: unknown[] = [];
      let binaryCount = 0;
      let callCount = 0;
      try {
        await client.query("BEGIN");
        for (const family of families) {
          await authority.assertFamily(client, job, family);
          const pair = [family.creatorId, family.fanId];
          const section: Record<string, unknown> = { ...family };
          const sources = [
            [
              "assets",
              "SELECT id,thread_id,owner_account_id,purpose,state,version,mime_type,bytes,uploaded_bytes,duration_ms,input_sha256,output_sha256,waveform,signed_act_id,provenance,expires_at,failure_code,created_at FROM creator.media_asset WHERE creator_id=$1 AND fan_id=$2",
            ],
            [
              "offers",
              "SELECT id,thread_id,commitment_id,creator_time_zone,fan_time_zone,expires_at,authorization_version,version,state FROM creator.call_offer WHERE creator_id=$1 AND fan_id=$2",
            ],
            [
              "slots",
              "SELECT id,offer_id,starts_at,ends_at,active FROM creator.call_slot WHERE creator_id=$1 AND fan_id=$2",
            ],
            [
              "sessions",
              "SELECT id,thread_id,commitment_id,document,state,version,scheduled_at,hard_end_at,ended_by,fan_ended_by_choice,end_requested_at,revoked_at,last_failure_code FROM creator.call_session WHERE creator_id=$1 AND fan_id=$2",
            ],
            [
              "admissions",
              "SELECT id,session_id,account_id,expires_at,used_at FROM creator.call_admission WHERE creator_id=$1 AND fan_id=$2",
            ],
            [
              "consents",
              "SELECT id,session_id,actor_account_id,role,purpose,granted,created_at FROM creator.call_consent WHERE creator_id=$1 AND fan_id=$2",
            ],
            [
              "events",
              "SELECT id,session_id,type,payload,actor_account_id,created_at FROM creator.call_event WHERE creator_id=$1 AND fan_id=$2",
            ],
            [
              "outcomes",
              "SELECT session_id,evidence,created_at FROM creator.call_outcome WHERE creator_id=$1 AND fan_id=$2",
            ],
            [
              "effects",
              "SELECT id,session_id,kind,completed_at,attempts,failure_code FROM creator.call_effect WHERE creator_id=$1 AND fan_id=$2",
            ],
          ] as const;
          for (const [name, sql] of sources) {
            await verify(job);
            const rows = (await client.query(sql + " LIMIT 1001", pair)).rows;
            invariant(
              rows.length <= 1000,
              "bounded_subjob_required",
              "This media export needs bounded subjobs; no truncated artifact was produced.",
            );
            if (name === "assets")
              binaryCount += rows.filter(
                (row) => row.state !== "deleted",
              ).length;
            if (name === "sessions") callCount += rows.length;
            section[name] = rows;
          }
          data.push(section);
          invariant(
            Buffer.byteLength(JSON.stringify(data)) <= 3_000_000,
            "bounded_subjob_required",
            "This media export needs a protected streaming artifact.",
          );
        }
        await verify(job);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
      const archiveRequired = binaryCount > 0 || callCount > 0;
      invariant(
        !archiveRequired || input.exportArchive,
        "binary_media_export_unconfigured",
        "The export requires actual media binaries and a protected archive adapter.",
      );
      const archive = archiveRequired
        ? z
            .object({
              reference: z.string().min(1).max(2000),
              sha256: z.string().regex(/^[a-f0-9]{64}$/),
              verified: z.literal(true),
            })
            .parse(await input.exportArchive!(job, data))
        : undefined;
      await verify(job);
      return {
        receipt: {
          domain: "media",
          jobId: job.jobId,
          complete: true,
          families: families.length,
          binaryAssets: binaryCount,
        },
        data: { families: data, ...(archive !== undefined ? { archive } : {}) },
      };
    },
  };
}
