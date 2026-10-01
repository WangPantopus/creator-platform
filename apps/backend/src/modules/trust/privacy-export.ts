import { createHash } from "node:crypto";
import { z } from "zod";
import { DomainError } from "../../core/errors.js";
import {
  PrivacyDomains,
  type PrivacyDomain,
  type PrivacyHook,
} from "./contracts.js";

const snapshot = z.string().trim().min(8).max(200);
const contentType = z.enum([
  "application/x-ndjson",
  "application/zip",
  "application/octet-stream",
]);
const counts = {
  chunks: z.number().int().nonnegative().safe(),
  bytes: z.number().int().nonnegative().safe(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
};
export const PrivacyArtifact = z.strictObject({
  format: z.literal("privacy-stream-v1"),
  reference: z.uuid(),
  jobId: z.uuid(),
  accountId: z.uuid(),
  domain: z.enum(PrivacyDomains),
  snapshotRef: snapshot,
  contentType,
  ...counts,
  expiresAt: z.iso.datetime(),
});
export type PrivacyArtifact = z.infer<typeof PrivacyArtifact>;
export type ExportJob = Parameters<PrivacyHook["run"]>[0];
/** The owner must hold a stable source snapshot through iterator exhaustion and
 * attest its full checksum/count. A short page or a closed iterator is not proof
 * that the owner's source was exhausted. Each chunk is at most one MiB. */
export type PrivacyExportStream = {
  snapshotRef: string;
  contentType: z.infer<typeof contentType>;
  chunks: AsyncIterable<{ sequence: number; data: Uint8Array }>;
  finish(): Promise<{
    complete: true;
    sourceExhausted: true;
    snapshotRef: string;
    chunks: number;
    bytes: number;
    sha256: string;
  }>;
};
export type ArtifactBinding = {
  jobId: string;
  accountId: string;
  domain: PrivacyDomain;
};
/** Private storage must durably seal bytes, verify persisted content, and reopen
 * only this exact binding. References are opaque IDs, never public URLs/paths.
 * The coordinator's authority/expiry checks are still mandatory at download. */
export interface PrivacyArtifactStore {
  begin(
    input: ArtifactBinding & {
      leaseToken: string;
      snapshotRef: string;
      contentType: PrivacyArtifact["contentType"];
      signal: AbortSignal;
    },
  ): Promise<{
    write(data: Uint8Array): Promise<void>;
    seal(
      summary: Pick<PrivacyArtifact, "chunks" | "bytes" | "sha256">,
    ): Promise<PrivacyArtifact>;
    abort(): Promise<void>;
  }>;
  verify(
    artifact: PrivacyArtifact,
    binding: ArtifactBinding,
    signal: AbortSignal,
  ): Promise<void>;
  read(
    artifact: PrivacyArtifact,
    binding: ArtifactBinding,
    signal: AbortSignal,
  ): AsyncIterable<Uint8Array>;
  sweep?(): Promise<void>;
  close?(): Promise<void>;
}
export async function consumePrivacyExport(input: {
  job: ExportJob;
  domain: PrivacyDomain;
  stream: PrivacyExportStream;
  store: PrivacyArtifactStore | undefined;
  signal: AbortSignal;
  verifyLease: () => Promise<unknown>;
}): Promise<PrivacyArtifact> {
  if (!input.store)
    throw new DomainError(
      "privacy_artifact_unconfigured",
      "Protected export storage is not configured.",
      503,
    );
  if (input.job.kind !== "export" || !input.job.leaseToken)
    throw new Error("export_stream_invalid");
  const snapshotRef = snapshot.parse(input.stream.snapshotRef);
  const type = contentType.parse(input.stream.contentType);
  input.signal.throwIfAborted();
  await input.verifyLease();
  const binding = {
    jobId: input.job.jobId,
    accountId: input.job.accountId,
    domain: input.domain,
  };
  const sink = await input.store.begin({
    ...binding,
    leaseToken: input.job.leaseToken,
    snapshotRef,
    contentType: type,
    signal: input.signal,
  });
  let chunks = 0;
  let bytes = 0;
  const hash = createHash("sha256");
  try {
    for await (const chunk of input.stream.chunks) {
      input.signal.throwIfAborted();
      if (
        chunk.sequence !== chunks ||
        !(chunk.data instanceof Uint8Array) ||
        chunk.data.byteLength === 0 ||
        chunk.data.byteLength > 1024 * 1024
      )
        throw new Error("export_stream_invalid");
      bytes += chunk.data.byteLength;
      // Explicit capacity refusal, never a truncated successful artifact.
      if (bytes > 1024 * 1024 * 1024) throw new Error("artifact_too_large");
      await input.verifyLease();
      await sink.write(chunk.data);
      hash.update(chunk.data);
      chunks++;
    }
    input.signal.throwIfAborted();
    const summary = { chunks, bytes, sha256: hash.digest("hex") };
    const owner = z
      .strictObject({
        complete: z.literal(true),
        sourceExhausted: z.literal(true),
        snapshotRef: snapshot,
        ...counts,
      })
      .parse(await input.stream.finish());
    if (
      owner.snapshotRef !== snapshotRef ||
      owner.chunks !== chunks ||
      owner.bytes !== bytes ||
      owner.sha256 !== summary.sha256
    )
      throw new Error("export_stream_incomplete");
    input.signal.throwIfAborted();
    await input.verifyLease();
    const artifact = PrivacyArtifact.parse(await sink.seal(summary));
    if (
      artifact.jobId !== binding.jobId ||
      artifact.accountId !== binding.accountId ||
      artifact.domain !== binding.domain ||
      artifact.snapshotRef !== snapshotRef ||
      artifact.contentType !== type ||
      artifact.chunks !== chunks ||
      artifact.bytes !== bytes ||
      artifact.sha256 !== summary.sha256
    )
      throw new Error("export_artifact_invalid");
    await input.store.verify(artifact, binding, input.signal);
    input.signal.throwIfAborted();
    await input.verifyLease();
    return artifact;
  } catch (error) {
    await sink.abort().catch(() => {});
    throw error;
  }
}
