import { constants, type Dir } from "node:fs";
import { lstat, mkdir, open, opendir, rename, unlink } from "node:fs/promises";
import type { FileHandle } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { join, isAbsolute } from "node:path";
import { DomainError } from "../../core/errors.js";
import {
  PrivacyArtifact,
  type ArtifactBinding,
  type PrivacyArtifactStore,
} from "./privacy-export.js";

/** Opt-in single-host private storage. It provides durable bounded writes and
 * verified reads, not encrypted off-site storage/backup or a deployment approval.
 * The configured directory must already be private to this server's OS user. */
export class PrivateFileArtifacts implements PrivacyArtifactStore {
  private sweepDirectory: Dir | undefined;
  constructor(readonly directory: string) {
    if (!isAbsolute(directory)) throw new Error("artifact_directory_invalid");
  }
  /** Validate the actual private directory before a host advertises this store. */
  static async prepare(directory: string) {
    const store = new PrivateFileArtifacts(directory);
    await store.root();
    return store;
  }
  private async root() {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const stat = await lstat(this.directory);
    if (
      !stat.isDirectory() ||
      stat.isSymbolicLink() ||
      (stat.mode & 0o077) !== 0 ||
      (process.getuid && stat.uid !== process.getuid())
    )
      throw new Error("artifact_directory_unsafe");
  }
  async begin(input: Parameters<PrivacyArtifactStore["begin"]>[0]) {
    input.signal.throwIfAborted();
    await this.root();
    const directory = this.directory;
    const reference = randomUUID();
    const pending = join(this.directory, `${reference}.partial`);
    const metadataPending = join(this.directory, `${reference}.json.partial`);
    const binary = join(this.directory, `${reference}.bin`);
    const metadata = join(this.directory, `${reference}.json`);
    const file = await open(pending, "wx", 0o600);
    const hash = createHash("sha256");
    let chunks = 0;
    let bytes = 0;
    let closed = false;
    let sealed = false;
    let busy = false;
    const abort = async () => {
      if (!closed) {
        closed = true;
        await file.close();
      }
      // All names were minted by this attempt; no prior artifact is replaced.
      await Promise.all(
        [pending, metadataPending, binary, metadata].map((path) =>
          unlink(path).catch((error) => {
            if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
          }),
        ),
      );
    };
    return {
      async write(data: Uint8Array) {
        input.signal.throwIfAborted();
        if (
          closed ||
          busy ||
          data.byteLength === 0 ||
          data.byteLength > 1024 * 1024 ||
          bytes + data.byteLength > 1024 * 1024 * 1024
        )
          throw new Error("export_stream_invalid");
        busy = true;
        try {
          let offset = 0;
          while (offset < data.byteLength) {
            input.signal.throwIfAborted();
            const written = await file.write(
              data,
              offset,
              data.byteLength - offset,
            );
            if (written.bytesWritten === 0)
              throw new Error("export_artifact_incomplete");
            offset += written.bytesWritten;
          }
          hash.update(data);
          bytes += data.byteLength;
          chunks++;
        } finally {
          busy = false;
        }
      },
      async seal(
        summary: Pick<PrivacyArtifact, "chunks" | "bytes" | "sha256">,
      ) {
        input.signal.throwIfAborted();
        if (
          closed ||
          sealed ||
          busy ||
          summary.bytes !== bytes ||
          summary.chunks !== chunks ||
          summary.sha256 !== hash.digest("hex")
        )
          throw new Error("export_artifact_incomplete");
        const artifact = PrivacyArtifact.parse({
          format: "privacy-stream-v1",
          reference,
          jobId: input.jobId,
          accountId: input.accountId,
          domain: input.domain,
          snapshotRef: input.snapshotRef,
          contentType: input.contentType,
          ...summary,
          expiresAt: new Date(Date.now() + 7 * 24 * 3600_000).toISOString(),
        });
        try {
          await file.sync();
          await file.close();
          closed = true;
          const meta = await open(metadataPending, "wx", 0o600);
          try {
            await meta.writeFile(JSON.stringify(artifact));
            await meta.sync();
          } finally {
            await meta.close();
          }
          input.signal.throwIfAborted();
          await rename(pending, binary);
          await rename(metadataPending, metadata);
          const dir = await open(directory, "r");
          try {
            await dir.sync();
          } finally {
            await dir.close();
          }
          sealed = true;
          return artifact;
        } catch (error) {
          await abort();
          throw error;
        }
      },
      abort,
    };
  }
  private async load(
    artifact: PrivacyArtifact,
    binding: ArtifactBinding,
    signal: AbortSignal,
  ) {
    const expected = PrivacyArtifact.parse(artifact);
    if (
      expected.jobId !== binding.jobId ||
      expected.accountId !== binding.accountId ||
      expected.domain !== binding.domain
    )
      throw new DomainError(
        "export_artifact_unavailable",
        "This export artifact is unavailable.",
        404,
      );
    if (Date.now() >= new Date(expected.expiresAt).getTime())
      throw new DomainError(
        "export_expired",
        "This export expired. Request a new export.",
        410,
      );
    signal.throwIfAborted();
    await this.root();
    const meta = await open(
      join(this.directory, `${expected.reference}.json`),
      constants.O_RDONLY | constants.O_NOFOLLOW,
    );
    let actual: PrivacyArtifact;
    try {
      const stat = await meta.stat();
      if (
        !stat.isFile() ||
        stat.size > 4096 ||
        (stat.mode & 0o077) !== 0 ||
        (process.getuid && stat.uid !== process.getuid())
      )
        throw new Error("export_artifact_invalid");
      actual = PrivacyArtifact.parse(JSON.parse(await meta.readFile("utf8")));
    } finally {
      await meta.close();
    }
    if (JSON.stringify(actual) !== JSON.stringify(expected))
      throw new Error("export_artifact_invalid");
    const file = await open(
      join(this.directory, `${expected.reference}.bin`),
      constants.O_RDONLY | constants.O_NOFOLLOW,
    );
    try {
      const stat = await file.stat();
      if (
        !stat.isFile() ||
        stat.size !== expected.bytes ||
        (stat.mode & 0o077) !== 0 ||
        (process.getuid && stat.uid !== process.getuid())
      )
        throw new Error("export_artifact_invalid");
      await this.checksum(file, expected, signal);
      return { file, artifact: expected };
    } catch (error) {
      await file.close();
      throw error;
    }
  }
  private async checksum(
    file: FileHandle,
    artifact: PrivacyArtifact,
    signal: AbortSignal,
  ) {
    const buffer = Buffer.alloc(64 * 1024);
    const hash = createHash("sha256");
    let position = 0;
    while (true) {
      signal.throwIfAborted();
      const part = await file.read(buffer, 0, buffer.byteLength, position);
      if (part.bytesRead === 0) break;
      hash.update(buffer.subarray(0, part.bytesRead));
      position += part.bytesRead;
    }
    if (position !== artifact.bytes || hash.digest("hex") !== artifact.sha256)
      throw new Error("export_artifact_invalid");
  }
  async verify(
    artifact: PrivacyArtifact,
    binding: ArtifactBinding,
    signal: AbortSignal,
  ) {
    const loaded = await this.load(artifact, binding, signal);
    await loaded.file.close();
  }
  /** Bounded expiry of this store's own sealed artifacts and abandoned attempts.
   * Receipts/tombstones are in PostgreSQL and are never touched by this sweep. */
  async sweep() {
    await this.root();
    const directory = (this.sweepDirectory ??= await opendir(this.directory));
    let removed = 0;
    for (let visited = 0; visited < 1000; visited++) {
      if (removed >= 100) break;
      const entry = await directory.read();
      if (!entry) {
        await this.close();
        break;
      }
      if (!entry.isFile()) continue;
      const match =
        /^([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})(\.json|\.bin|\.partial|\.json\.partial)$/u.exec(
          entry.name,
        );
      if (!match) continue;
      const path = join(this.directory, entry.name);
      const stat = await lstat(path);
      if (!stat.isFile() || (stat.mode & 0o077) !== 0) continue;
      if (match[2] !== ".json") {
        if (Date.now() - stat.mtimeMs >= 7 * 24 * 3600_000) {
          if (match[2] === ".bin") {
            const metadata = await lstat(
              join(this.directory, `${match[1]}.json`),
            ).catch((error) => {
              if ((error as NodeJS.ErrnoException).code !== "ENOENT")
                throw error;
              return undefined;
            });
            if (metadata) continue;
          }
          await unlink(path);
          removed++;
        }
        continue;
      }
      const meta = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
      let artifact: PrivacyArtifact;
      try {
        if ((await meta.stat()).size > 4096)
          throw new Error("export_artifact_invalid");
        artifact = PrivacyArtifact.parse(
          JSON.parse(await meta.readFile("utf8")),
        );
      } finally {
        await meta.close();
      }
      if (artifact.reference !== match[1])
        throw new Error("export_artifact_invalid");
      if (Date.now() < new Date(artifact.expiresAt).getTime()) continue;
      await unlink(join(this.directory, `${artifact.reference}.bin`)).catch(
        (error) => {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        },
      );
      await unlink(path);
      removed++;
    }
  }
  async close() {
    const directory = this.sweepDirectory;
    this.sweepDirectory = undefined;
    await directory?.close();
  }
  async *read(
    artifact: PrivacyArtifact,
    binding: ArtifactBinding,
    signal: AbortSignal,
  ) {
    const loaded = await this.load(artifact, binding, signal);
    try {
      let position = 0;
      const hash = createHash("sha256");
      while (position < loaded.artifact.bytes) {
        signal.throwIfAborted();
        if (Date.now() >= new Date(loaded.artifact.expiresAt).getTime())
          throw new DomainError(
            "export_expired",
            "This export expired. Request a new export.",
            410,
          );
        const buffer = Buffer.alloc(
          Math.min(64 * 1024, loaded.artifact.bytes - position),
        );
        const part = await loaded.file.read(
          buffer,
          0,
          buffer.byteLength,
          position,
        );
        if (!part.bytesRead) throw new Error("export_artifact_incomplete");
        const data = buffer.subarray(0, part.bytesRead);
        position += part.bytesRead;
        hash.update(data);
        yield data;
      }
      if (hash.digest("hex") !== loaded.artifact.sha256)
        throw new Error("export_artifact_invalid");
    } finally {
      await loaded.file.close();
    }
  }
}
