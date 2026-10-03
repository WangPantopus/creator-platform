import { constants } from "node:fs";
import { open } from "node:fs/promises";
import { createHash } from "node:crypto";

/** The transport ceiling is a resource bound, never approval of a purpose's limits. */
export const MEDIA_FILE_CEILING = 268_435_456;

/** Bound the read itself, including a file which grows after stat. Refuse links,
 * non-files and concurrent writes; keep hashes tied to the descriptor we read. */
export async function readMediaFile(
  file: string,
  maxBytes: number,
  expected?: { bytes: number; sha256: string },
  retainBytes = true,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  if (
    !Number.isSafeInteger(maxBytes) ||
    maxBytes <= 0 ||
    maxBytes > MEDIA_FILE_CEILING ||
    (expected &&
      (!Number.isSafeInteger(expected.bytes) ||
        expected.bytes <= 0 ||
        expected.bytes > maxBytes ||
        !/^[a-f0-9]{64}$/u.test(expected.sha256)))
  )
    throw new Error("media_integrity_invalid");
  // A FIFO must not block open before we can reject its non-file descriptor.
  const handle = await open(
    file,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  try {
    signal?.throwIfAborted();
    const before = await handle.stat();
    if (
      !before.isFile() ||
      before.size <= 0 ||
      before.size > maxBytes ||
      (expected && before.size !== expected.bytes)
    )
      throw new Error("media_integrity_invalid");
    const hash = createHash("sha256");
    const chunks: Buffer[] = [];
    let bytes = 0;
    for await (const chunk of handle.createReadStream({
      autoClose: false,
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(30_000)])
        : AbortSignal.timeout(30_000),
    })) {
      bytes += chunk.length;
      if (bytes > maxBytes || bytes > before.size)
        throw new Error("media_integrity_invalid");
      hash.update(chunk);
      if (retainBytes) chunks.push(chunk);
    }
    const after = await handle.stat();
    const sha256 = hash.digest("hex");
    if (
      bytes !== before.size ||
      after.size !== before.size ||
      after.mtimeMs !== before.mtimeMs ||
      after.ctimeMs !== before.ctimeMs ||
      (expected && (bytes !== expected.bytes || sha256 !== expected.sha256))
    )
      throw new Error("media_integrity_invalid");
    return {
      bytes,
      sha256,
      output: Buffer.concat(chunks, retainBytes ? bytes : 0),
    };
  } finally {
    await handle.close();
  }
}
