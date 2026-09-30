import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { mkdir, open, readFile, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { DomainError } from "../../core/errors.js";

const TicketSchema = z.strictObject({
  assetId: z.uuid(),
  accountId: z.uuid(),
  operation: z.enum(["upload", "play"]),
  creatorId: z.uuid(),
  fanId: z.uuid(),
  version: z.number().int().positive(),
  expires: z.number().int(),
  nonce: z.uuid(),
});
type Ticket = z.infer<typeof TicketSchema>;
export class MediaTickets {
  constructor(
    private readonly secret: Buffer,
    private readonly origin: string,
  ) {
    if (secret.byteLength < 32)
      throw new Error("Media signing key must contain at least 32 bytes.");
    const parsed = new URL(origin);
    if (
      origin !== parsed.origin ||
      parsed.username ||
      parsed.password ||
      (parsed.protocol !== "https:" &&
        !(
          parsed.protocol === "http:" &&
          ["localhost", "127.0.0.1"].includes(parsed.hostname)
        ))
    )
      throw new Error("Media ticket origin must use HTTPS or loopback HTTP.");
  }
  issue(input: Omit<Ticket, "expires" | "nonce">, ttlSeconds = 120) {
    if (!Number.isSafeInteger(ttlSeconds) || ttlSeconds < 1 || ttlSeconds > 120)
      throw new Error(
        "Media ticket lifetime must be between 1 and 120 seconds.",
      );
    const value = TicketSchema.parse({
      ...input,
      expires: Math.floor(Date.now() / 1000) + ttlSeconds,
      nonce: randomUUID(),
    });
    const payload = Buffer.from(JSON.stringify(value)).toString("base64url");
    const signature = createHmac("sha256", this.secret)
      .update(payload)
      .digest("base64url");
    return {
      url: `${this.origin}/v1/w6/threads/${input.creatorId}/${input.fanId}/media/${input.assetId}/${input.operation}?ticket=${payload}.${signature}`,
      expiresAt: new Date(value.expires * 1000).toISOString(),
    };
  }
  verify(
    token: string,
    accountId: string,
    assetId: string,
    operation: Ticket["operation"],
  ) {
    if (token.length > 2048)
      throw new DomainError(
        "media_ticket_invalid",
        "Media access has expired.",
        403,
      );
    const [payload, signature, extra] = token.split(".");
    const expected = createHmac("sha256", this.secret)
      .update(payload ?? "")
      .digest();
    const supplied = Buffer.from(signature ?? "", "base64url");
    if (
      extra ||
      supplied.length !== expected.length ||
      !timingSafeEqual(expected, supplied)
    )
      throw new DomainError(
        "media_ticket_invalid",
        "Media access has expired.",
        403,
      );
    let value: Ticket;
    try {
      value = TicketSchema.parse(
        JSON.parse(Buffer.from(payload!, "base64url").toString("utf8")),
      );
    } catch {
      throw new DomainError(
        "media_ticket_invalid",
        "Media access has expired.",
        403,
      );
    }
    if (
      value.accountId !== accountId ||
      value.assetId !== assetId ||
      value.operation !== operation ||
      value.expires <= Math.floor(Date.now() / 1000)
    )
      throw new DomainError(
        "media_ticket_expired",
        "Media access has expired. Request a new link.",
        403,
      );
    return value;
  }
}

/** Private local-volume adapter; production storage supplies equivalent scoped operations. */
export class PrivateMediaStorage {
  constructor(readonly root: string) {
    if (!path.isAbsolute(root))
      throw new Error("Media storage requires an absolute private root.");
  }
  file(
    assetId: string,
    kind: "input" | "output" | "processed" | "manifest" | "thumbnail" = "input",
  ) {
    z.uuid().parse(assetId);
    return path.join(this.root, assetId, kind);
  }
  async putChunk(assetId: string, offset: number, bytes: Buffer) {
    await mkdir(path.dirname(this.file(assetId)), {
      recursive: true,
      mode: 0o700,
    });
    const handle = await open(
      this.file(assetId),
      offset === 0 ? "w" : "r+",
      0o600,
    );
    try {
      // Rewriting at the committed offset recovers a crash between fsync and DB commit.
      await handle.truncate(offset);
      let written = 0;
      while (written < bytes.length) {
        const result = await handle.write(
          bytes,
          written,
          bytes.length - written,
          offset + written,
        );
        if (!result.bytesWritten)
          throw new Error("media_storage_write_incomplete");
        written += result.bytesWritten;
      }
      await handle.sync();
    } finally {
      await handle.close();
    }
  }
  async read(
    assetId: string,
    kind:
      | "input"
      | "output"
      | "processed"
      | "manifest"
      | "thumbnail" = "output",
  ) {
    return readFile(this.file(assetId, kind));
  }
  async size(assetId: string, kind: "input" | "output" = "output") {
    return (await stat(this.file(assetId, kind))).size;
  }
  async put(
    assetId: string,
    kind: "output" | "processed" | "manifest" | "thumbnail",
    bytes: Buffer,
  ) {
    await mkdir(path.dirname(this.file(assetId)), {
      recursive: true,
      mode: 0o700,
    });
    const temporary = `${this.file(assetId, kind)}.${randomUUID()}.pending`;
    const handle = await open(temporary, "wx", 0o600);
    try {
      await handle.writeFile(bytes);
      await handle.sync();
    } finally {
      await handle.close();
    }
    try {
      await rename(temporary, this.file(assetId, kind));
    } finally {
      await rm(temporary, { force: true });
    }
  }
  async delete(assetId: string) {
    await rm(path.dirname(this.file(assetId)), {
      recursive: true,
      force: true,
    });
  }
}
