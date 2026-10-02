import { mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import { MEDIA_FILE_CEILING, readMediaFile } from "./files.js";
import { processFile } from "./processor.js";
import type { ContentCredentialSigner } from "./worker.js";

const assertionLabel = "org.pantopus.creator.media";
const Tuple = z.object({
  processedMediaSha256: z.string().regex(/^[a-f0-9]{64}$/u),
  processedMediaBytes: z.number().int().positive().max(MEDIA_FILE_CEILING),
  processedMediaMimeType: z.enum(["audio/mp4", "image/png"]),
  processedMediaDurationMs: z.number().int().positive().nullable(),
});
const Status = z.object({ code: z.string(), url: z.string().optional() });
const Report = z.object({
  active_manifest: z.string().min(1),
  manifests: z.record(
    z.string(),
    z.object({
      format: z.string(),
      assertions: z.array(z.object({ label: z.string(), data: z.unknown() })),
      ingredients: z.array(z.unknown()).optional(),
    }),
  ),
  validation_status: z.array(Status).optional(),
  validation_results: z.object({
    activeManifest: z.object({
      success: z.array(Status),
      failure: z.array(Status),
    }),
    ingredientDeltas: z.array(z.unknown()).optional(),
  }),
});

/** c2patool 0.28.1's parsed report, never a manifest's own `c2paVerified` flag.
 * Require positive trust, signature, assertion and hard-binding evidence. */
export function verifyMediaCredentialReport(
  value: unknown,
  manifest: Record<string, unknown>,
) {
  const report = Report.parse(value);
  const tuple = Tuple.parse(manifest);
  const active = report.manifests[report.active_manifest];
  const validation = report.validation_results.activeManifest;
  const success = validation.success;
  const matches = active?.assertions.filter(
    (assertion) => assertion.label === assertionLabel,
  );
  const signatureURL = `self#jumbf=/c2pa/${report.active_manifest}/c2pa.signature`;
  const assertionURL = `self#jumbf=/c2pa/${report.active_manifest}/c2pa.assertions/${assertionLabel}`;
  if (
    Object.keys(report.manifests).length !== 1 ||
    !active ||
    active.format !== tuple.processedMediaMimeType ||
    (active.ingredients?.length ?? 0) !== 0 ||
    (report.validation_results.ingredientDeltas?.length ?? 0) !== 0 ||
    (report.validation_status?.length ?? 0) !== 0 ||
    validation.failure.length !== 0 ||
    matches?.length !== 1 ||
    !isDeepStrictEqual(matches[0]?.data, manifest) ||
    ![
      "claimSignature.validated",
      "claimSignature.insideValidity",
      "signingCredential.trusted",
    ].every((code) =>
      success.some(
        (status) => status.code === code && status.url === signatureURL,
      ),
    ) ||
    !success.some(
      (status) =>
        status.code === "assertion.hashedURI.match" &&
        status.url === assertionURL,
    ) ||
    !success.some(
      (status) =>
        (tuple.processedMediaMimeType === "audio/mp4"
          ? status.code === "assertion.bmffHash.match"
          : ["assertion.dataHash.match", "assertion.boxesHash.match"].includes(
              status.code,
            )) &&
        status.url?.startsWith(
          `self#jumbf=/c2pa/${report.active_manifest}/c2pa.assertions/c2pa.hash.`,
        ),
    )
  )
    throw new Error("content_credentials_invalid");
}

/** Owned ingestion-pool adapter. An explicit external signer and current,
 * pinned trust-anchor file are mandatory. No built-in development certificate.
 * The HSM/KMS wrapper owns key custody and authentication, not c2patool. */
export class C2PAToolCredentialSigner implements ContentCredentialSigner {
  constructor(
    private readonly config: {
      executable: string;
      signerExecutable: string;
      trustAnchorsFile: string;
      trustAnchorsSha256: string;
      workingDirectory: string;
      maxBytes: number;
    },
  ) {
    if (
      ![
        config.executable,
        config.signerExecutable,
        config.trustAnchorsFile,
        config.workingDirectory,
      ].every(path.isAbsolute) ||
      // c2patool parses signer-path as a command string; accept only one path.
      /\s/u.test(config.signerExecutable) ||
      !/^[a-f0-9]{64}$/u.test(config.trustAnchorsSha256) ||
      !Number.isSafeInteger(config.maxBytes) ||
      config.maxBytes <= 0 ||
      config.maxBytes > MEDIA_FILE_CEILING
    )
      throw new Error("content_credentials_unconfigured");
  }

  async embed(input: {
    file: string;
    manifest: Record<string, unknown>;
    signal: AbortSignal;
  }): Promise<{ bytes: Buffer; verified: true }> {
    // Snapshot the caller's exact payload before awaiting any external work.
    const encoded = JSON.stringify(input.manifest);
    if (Buffer.byteLength(encoded) > 32_768)
      throw new Error("content_credentials_invalid");
    const manifest = JSON.parse(encoded) as Record<string, unknown>;
    const tuple = Tuple.parse(manifest);
    if (
      tuple.processedMediaBytes > this.config.maxBytes ||
      (tuple.processedMediaMimeType === "audio/mp4"
        ? tuple.processedMediaDurationMs === null
        : tuple.processedMediaDurationMs !== null)
    )
      throw new Error("processed_media_integrity_invalid");
    if (input.signal.aborted)
      throw new Error("content_credentials_unavailable");
    const folder = await mkdtemp(
      path.join(this.config.workingDirectory, "c2pa-"),
    );
    const extension =
      tuple.processedMediaMimeType === "audio/mp4" ? "m4a" : "png";
    const source = path.join(folder, `processed.${extension}`);
    const signed = path.join(folder, `signed.${extension}`);
    const settings = path.join(folder, "settings.json");
    const definition = path.join(folder, "manifest.json");
    const anchors = path.join(folder, "trust.pem");
    // Prevent inherited CLI settings, keys and local trust overrides from
    // defeating mandatory external signing or verification.
    const env = Object.fromEntries(
      Object.entries(process.env).filter(
        ([key]) => !key.startsWith("C2PA_") && !key.startsWith("C2PATOOL_"),
      ),
    );
    const run = (args: string[], limit = 524_288) =>
      processFile(this.config.executable, args, limit, 30_000, {
        signal: input.signal,
        env,
        cwd: folder,
      });
    try {
      const version = (await run(["--version"], 1024)).toString("utf8").trim();
      if (version !== "c2patool 0.28.1")
        throw new Error("content_credentials_unavailable");
      await (async () => {
        const original = await readMediaFile(
          input.file,
          this.config.maxBytes,
          {
            bytes: tuple.processedMediaBytes,
            sha256: tuple.processedMediaSha256,
          },
          true,
          input.signal,
        );
        await writeFile(source, original.output, {
          mode: 0o600,
          flag: "wx",
          signal: input.signal,
        });
      })();
      const trust = await readMediaFile(
        this.config.trustAnchorsFile,
        1_048_576,
        undefined,
        true,
        input.signal,
      );
      if (trust.sha256 !== this.config.trustAnchorsSha256)
        throw new Error("content_credentials_unconfigured");
      await writeFile(anchors, trust.output, {
        mode: 0o600,
        flag: "wx",
        signal: input.signal,
      });
      await writeFile(
        settings,
        JSON.stringify({
          builder: { thumbnail: { enabled: false } },
          verify: {
            verify_after_reading: true,
            verify_after_sign: true,
            verify_trust: true,
            verify_timestamp_trust: true,
            remote_manifest_fetch: false,
            ocsp_fetch: true,
          },
        }),
        { mode: 0o600, flag: "wx", signal: input.signal },
      );
      await writeFile(
        definition,
        JSON.stringify({
          claim_generator: "creator-platform/1",
          title: "Signed creator media",
          format: tuple.processedMediaMimeType,
          assertions: [{ label: assertionLabel, data: manifest }],
        }),
        { mode: 0o600, flag: "wx", signal: input.signal },
      );
      await run([
        "--settings",
        settings,
        source,
        "--manifest",
        definition,
        "--signer-path",
        this.config.signerExecutable,
        "--output",
        signed,
        "trust",
        "--trust_anchors",
        anchors,
      ]);
      // Read back the actual delivered file with an independent invocation.
      const report = await run([
        "--settings",
        settings,
        signed,
        "trust",
        "--trust_anchors",
        anchors,
      ]);
      verifyMediaCredentialReport(
        JSON.parse(report.toString("utf8")),
        manifest,
      );
      const result = await readMediaFile(
        signed,
        this.config.maxBytes,
        undefined,
        true,
        input.signal,
      );
      // Re-check the immutable processed copy after external signer execution.
      await readMediaFile(
        source,
        this.config.maxBytes,
        {
          bytes: tuple.processedMediaBytes,
          sha256: tuple.processedMediaSha256,
        },
        false,
        input.signal,
      );
      if (input.signal.aborted)
        throw new Error("content_credentials_unavailable");
      return { bytes: result.output, verified: true };
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
  }
}
