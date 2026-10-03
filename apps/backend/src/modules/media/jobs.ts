import type { PoolClient } from "pg";
import { z } from "zod";

/** Wakeups for the separate ingestion pool. Sent with the transaction that made
 * a job claimable, so PostgreSQL delivers them only after that commit. They
 * carry family identifiers only; the worker rereads every row under RLS and
 * its own lease, so a duplicate or stale wakeup is harmless. */
export const MEDIA_JOB_CHANNEL = "w6_media_job";
export const MediaJobSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("thread"),
    assetId: z.uuid(),
    creatorId: z.uuid(),
    fanId: z.uuid(),
    ownerAccountId: z.uuid(),
  }),
  z.strictObject({
    kind: z.literal("creator"),
    assetId: z.uuid(),
    creatorId: z.uuid(),
    ownerAccountId: z.uuid(),
  }),
]);
export type MediaJob = z.infer<typeof MediaJobSchema>;

export async function announceMediaJob(client: PoolClient, job: MediaJob) {
  await client.query("SELECT pg_notify($1,$2)", [
    MEDIA_JOB_CHANNEL,
    JSON.stringify(MediaJobSchema.parse(job)),
  ]);
}
