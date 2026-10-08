import { constants, type Dir } from "node:fs";
import {
  lstat,
  mkdir,
  open,
  opendir,
  realpath,
  rename,
  unlink,
} from "node:fs/promises";
import type { FileHandle } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { dirname, join, isAbsolute, resolve } from "node:path";
import { DomainError } from "../../core/errors.js";
import {
  PrivacyArtifact,
  PrivacyArtifactAttempt,
  type ArtifactBinding,
  type PrivacyArtifactStore,
} from "./privacy-export.js";

/** Opt-in single-host private storage. It provides durable bounded writes and
 * verified reads, not encrypted off-site storage/backup or a deployment approval.
 * The configured directory must already be private to this server's OS user. */
export class PrivateFileArtifacts implements PrivacyArtifactStore {
  private sweepDirectory: Dir | undefined;
  private attemptDirectory: Dir | undefined;
  private scanningAttempts = false;
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
    const owner = process.getuid?.();
    const parent = dirname(this.directory);
    const parentStat = await lstat(parent);
    // The approved parent must already exist and be private. Do not create a
    // chain beneath a shared directory or follow a symlinked ancestor.
    if (
      owner === undefined ||
      !parentStat.isDirectory() ||
      parentStat.isSymbolicLink() ||
      (parentStat.mode & 0o077) !== 0 ||
      parentStat.uid !== owner ||
      (await realpath(parent)) !== resolve(parent)
    )
      throw new Error("artifact_directory_unsafe");
    await mkdir(this.directory, { mode: 0o700 }).catch((error) => {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    });
    const stat = await lstat(this.directory);
    if (
      !stat.isDirectory() ||
      stat.isSymbolicLink() ||
      (stat.mode & 0o077) !== 0 ||
      stat.uid !== owner ||
      (await realpath(this.directory)) !== resolve(this.directory)
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
    const attemptPath = join(this.directory, `${reference}.attempt.json`);
    const attempt = PrivacyArtifactAttempt.parse({
      format: "privacy-attempt-v1",
      reference,
      jobId: input.jobId,
      accountId: input.accountId,
      domain: input.domain,
      leaseToken: input.leaseToken,
      snapshotRef: input.snapshotRef,
      contentType: input.contentType,
      createdAt: new Date().toISOString(),
    });
    const currentAttempt = async () => {
      input.signal.throwIfAborted();
      if (await this.loadAttempt(reference, "removed"))
        throw new Error("export_attempt_removed");
      const current = await this.loadAttempt(reference);
      if (!current || JSON.stringify(current) !== JSON.stringify(attempt))
        throw new Error("export_attempt_invalid");
    };
    // No source bytes exist until this immutable marker is durable. A crash
    // during marker creation can leave metadata only, never untracked fan text.
    const marker = await open(attemptPath, "wx", 0o600);
    let file: FileHandle;
    try {
      try {
        await marker.writeFile(JSON.stringify(attempt));
        await marker.sync();
      } finally {
        await marker.close();
      }
      await this.syncDirectory();
      await currentAttempt();
      file = await open(pending, "wx", 0o600);
    } catch (error) {
      await unlink(attemptPath).catch((cleanup) => {
        if ((cleanup as NodeJS.ErrnoException).code !== "ENOENT") throw cleanup;
      });
      throw error;
    }
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
      const cleanup = await Promise.allSettled(
        [pending, metadataPending, binary, metadata].map((path) =>
          unlink(path).catch((error) => {
            if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
          }),
        ),
      );
      const failures = cleanup.flatMap((result) =>
        result.status === "rejected" ? [result.reason] : [],
      );
      if (failures.length)
        throw new AggregateError(failures, "Export attempt cleanup failed.");
      // The discovery marker is last: interrupted cleanup remains discoverable.
      await unlink(attemptPath).catch((error) => {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      });
      const dir = await open(directory, "r");
      try {
        await dir.sync();
      } finally {
        await dir.close();
      }
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
        await currentAttempt();
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
          await currentAttempt();
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
          // An expired predecessor may have been suspended during file I/O.
          // Recovery's durable removal marker prevents it from recreating an
          // acknowledged-deleted artifact when it eventually resumes.
          await currentAttempt();
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
  private async syncDirectory() {
    const directory = await open(this.directory, "r");
    try {
      await directory.sync();
    } finally {
      await directory.close();
    }
  }
  private async loadAttempt(
    reference: string,
    kind: "attempt" | "removed" = "attempt",
  ) {
    const marker = await open(
      join(this.directory, `${reference}.${kind}.json`),
      constants.O_RDONLY | constants.O_NOFOLLOW,
    ).catch((error) => {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      return undefined;
    });
    if (!marker) return undefined;
    try {
      const stat = await marker.stat();
      if (
        !stat.isFile() ||
        stat.size > 4096 ||
        (stat.mode & 0o077) !== 0 ||
        stat.uid !== process.getuid?.()
      )
        throw new Error("export_attempt_invalid");
      const attempt = PrivacyArtifactAttempt.parse(
        JSON.parse(await marker.readFile("utf8")),
      );
      if (attempt.reference !== reference)
        throw new Error("export_attempt_invalid");
      return attempt;
    } finally {
      await marker.close();
    }
  }
  /** Metadata discovery only; no age or opaque ID authorizes deletion. */
  async attempts(
    signal: AbortSignal,
  ): Promise<readonly PrivacyArtifactAttempt[]> {
    if (this.scanningAttempts) throw new Error("export_attempt_scan_busy");
    this.scanningAttempts = true;
    try {
      signal.throwIfAborted();
      await this.root();
      const directory = (this.attemptDirectory ??= await opendir(
        this.directory,
      ));
      const attempts: PrivacyArtifactAttempt[] = [];
      const seen = new Set<string>();
      for (let visited = 0; visited < 1000 && attempts.length < 20; visited++) {
        signal.throwIfAborted();
        const entry = await directory.read();
        if (!entry) {
          this.attemptDirectory = undefined;
          await directory.close();
          break;
        }
        const match =
          /^([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})\.(attempt|removed)\.json$/u.exec(
            entry.name,
          );
        if (!match) continue;
        const attempt = await this.loadAttempt(
          match[1]!,
          match[2] as "attempt" | "removed",
        );
        if (attempt && !seen.has(attempt.reference)) {
          seen.add(attempt.reference);
          attempts.push(attempt);
        }
      }
      signal.throwIfAborted();
      return attempts;
    } finally {
      this.scanningAttempts = false;
    }
  }
  async *scanAttempts(
    signal: AbortSignal,
  ): AsyncIterable<PrivacyArtifactAttempt> {
    signal.throwIfAborted();
    await this.root();
    const directory = await opendir(this.directory);
    try {
      for (;;) {
        signal.throwIfAborted();
        const entry = await directory.read();
        if (!entry) break;
        const match =
          /^([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})\.(attempt|removed)\.json$/u.exec(
            entry.name,
          );
        if (!match) continue;
        const attempt = await this.loadAttempt(
          match[1]!,
          match[2] as "attempt" | "removed",
        );
        if (attempt) yield attempt;
      }
      signal.throwIfAborted();
    } finally {
      await directory.close();
    }
  }
  /** The actual task owner must have proved the original attempt cannot still
   * write and hold that fence through this call. Partial bytes have no sealed
   * checksum; only this exact, durable private attempt marker names the files. */
  async removeAttempt(value: PrivacyArtifactAttempt, signal: AbortSignal) {
    const expected = PrivacyArtifactAttempt.parse(value);
    signal.throwIfAborted();
    await this.root();
    const actual = await this.loadAttempt(expected.reference);
    const removed = await this.loadAttempt(expected.reference, "removed");
    if (
      (actual && JSON.stringify(actual) !== JSON.stringify(expected)) ||
      (removed && JSON.stringify(removed) !== JSON.stringify(expected))
    )
      throw new Error("export_attempt_invalid");
    const paths = ["partial", "json.partial", "bin", "json"].map((suffix) =>
      join(this.directory, `${expected.reference}.${suffix}`),
    );
    for (const path of paths) {
      const stat = await lstat(path).catch((error) => {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        return undefined;
      });
      if (
        stat &&
        ((!actual && !removed) ||
          !stat.isFile() ||
          stat.isSymbolicLink() ||
          (stat.mode & 0o077) !== 0 ||
          stat.uid !== process.getuid?.())
      )
        throw new Error("export_attempt_invalid");
    }
    signal.throwIfAborted();
    if (!removed && actual) {
      const pending = join(
        this.directory,
        `${expected.reference}.removed.json.partial`,
      );
      const previous = await lstat(pending).catch((error) => {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        return undefined;
      });
      if (previous) {
        if (
          !previous.isFile() ||
          previous.isSymbolicLink() ||
          previous.size > 4096 ||
          (previous.mode & 0o077) !== 0 ||
          previous.uid !== process.getuid?.()
        )
          throw new Error("export_attempt_invalid");
        // The exact original task fence also serializes removal retries. This
        // file contains only an interrupted marker write, never source bytes.
        await unlink(pending);
      }
      const marker = await open(pending, "wx", 0o600);
      try {
        await marker.writeFile(JSON.stringify(expected));
        await marker.sync();
      } finally {
        await marker.close();
      }
      await rename(
        pending,
        join(this.directory, `${expected.reference}.removed.json`),
      );
      await this.syncDirectory();
    }
    // Once cleanup starts, settle every path before reporting cancellation.
    // The marker remains until all possible source-byte paths are gone.
    for (const path of [
      ...paths,
      join(this.directory, `${expected.reference}.attempt.json`),
    ])
      await unlink(path).catch((error) => {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      });
    await this.syncDirectory();
    signal.throwIfAborted();
  }
  /** Forget discovery metadata only after the owner observes its exact completed
   * artifact. This never removes an artifact, partial file or source payload. */
  async forgetAttempt(value: PrivacyArtifactAttempt, signal: AbortSignal) {
    const expected = PrivacyArtifactAttempt.parse(value);
    signal.throwIfAborted();
    await this.root();
    const actual = await this.loadAttempt(expected.reference);
    if (actual && JSON.stringify(actual) !== JSON.stringify(expected))
      throw new Error("export_attempt_invalid");
    signal.throwIfAborted();
    await unlink(
      join(this.directory, `${expected.reference}.attempt.json`),
    ).catch((error) => {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    });
    await this.syncDirectory();
    signal.throwIfAborted();
  }
  /** Exact, idempotent storage cleanup for a separately authorized revocation.
   * Expiry is deliberately not an admission condition: a revoked/expired file
   * still needs removal. Missing files can be an earlier interrupted cleanup;
   * every surviving file must match the original manifest before any unlink.
   * The lifecycle owner, not this method, fences downloads and acknowledges its
   * durable purge task. Already-open readers need that owner's current check. */
  async remove(
    artifact: PrivacyArtifact,
    binding: ArtifactBinding,
    signal: AbortSignal,
  ): Promise<void> {
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
    signal.throwIfAborted();
    await this.root();
    const metadata = join(this.directory, `${expected.reference}.json`);
    const binary = join(this.directory, `${expected.reference}.bin`);
    const attempt = await this.loadAttempt(expected.reference);
    if (
      attempt &&
      (attempt.jobId !== expected.jobId ||
        attempt.accountId !== expected.accountId ||
        attempt.domain !== expected.domain ||
        attempt.snapshotRef !== expected.snapshotRef ||
        attempt.contentType !== expected.contentType)
    )
      throw new Error("export_attempt_invalid");
    const existing = async (path: string) =>
      open(path, constants.O_RDONLY | constants.O_NOFOLLOW).catch((error) => {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        return undefined;
      });
    const meta = await existing(metadata);
    if (meta) {
      try {
        const stat = await meta.stat();
        if (
          !stat.isFile() ||
          stat.size > 4096 ||
          (stat.mode & 0o077) !== 0 ||
          stat.uid !== process.getuid?.()
        )
          throw new Error("export_artifact_invalid");
        const actual = PrivacyArtifact.parse(
          JSON.parse(await meta.readFile("utf8")),
        );
        if (JSON.stringify(actual) !== JSON.stringify(expected))
          throw new Error("export_artifact_invalid");
      } finally {
        await meta.close();
      }
    }
    const file = await existing(binary);
    if (file) {
      try {
        const stat = await file.stat();
        if (
          !stat.isFile() ||
          stat.size !== expected.bytes ||
          (stat.mode & 0o077) !== 0 ||
          stat.uid !== process.getuid?.()
        )
          throw new Error("export_artifact_invalid");
        await this.checksum(file, expected, signal);
      } finally {
        await file.close();
      }
    }
    signal.throwIfAborted();
    // Settle both owned paths after the first unlink, even if cancellation
    // arrives meanwhile. Binary first leaves retryable metadata after a crash.
    for (const path of [
      binary,
      metadata,
      ...(attempt
        ? [join(this.directory, `${expected.reference}.attempt.json`)]
        : []),
    ])
      await unlink(path).catch((error) => {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      });
    const directory = await open(this.directory, "r");
    try {
      await directory.sync();
    } finally {
      await directory.close();
    }
    signal.throwIfAborted();
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
        this.sweepDirectory = undefined;
        await directory.close();
        break;
      }
      if (!entry.isFile()) continue;
      const match =
        /^([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})(\.json|\.bin|\.partial|\.json\.partial|\.attempt\.json|\.removed\.json|\.removed\.json\.partial)$/u.exec(
          entry.name,
        );
      if (!match) continue;
      const path = join(this.directory, entry.name);
      const stat = await lstat(path).catch((error) => {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        return undefined;
      });
      if (
        !stat?.isFile() ||
        (stat.mode & 0o077) !== 0 ||
        stat.uid !== process.getuid?.()
      )
        continue;
      if (match[2] === ".attempt.json" || match[2] === ".removed.json") {
        if (Date.now() - stat.mtimeMs < 7 * 24 * 3600_000) continue;
        let hasBytes = false;
        for (const suffix of ["partial", "json.partial", "bin", "json"])
          if (
            await lstat(join(this.directory, `${match[1]}.${suffix}`)).catch(
              (error) => {
                if ((error as NodeJS.ErrnoException).code !== "ENOENT")
                  throw error;
                return undefined;
              },
            )
          )
            hasBytes = true;
        // Even an interrupted marker write contains no source bytes. Only
        // discard old metadata when every possible payload path is absent.
        if (!hasBytes && stat.uid === process.getuid?.()) {
          await unlink(path);
          removed++;
        }
        continue;
      }
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
    const attempts = this.attemptDirectory;
    this.sweepDirectory = undefined;
    this.attemptDirectory = undefined;
    const closed = await Promise.allSettled([
      directory?.close(),
      attempts?.close(),
    ]);
    const failures = closed.flatMap((result) =>
      result.status === "rejected" ? [result.reason] : [],
    );
    if (failures.length)
      throw new AggregateError(failures, "Export directory cleanup failed.");
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
