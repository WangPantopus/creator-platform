import {
  createHash,
  createPublicKey,
  verify,
  type KeyObject,
} from "node:crypto";
import { z } from "zod";
import { DomainError } from "../../core/errors.js";

const KeySetSchema = z.object({
  keys: z.array(z.record(z.string(), z.unknown())).max(50),
});

/** A provider's published signing keys: cached for an hour, refetched at most
 * once a minute when a token names a key we have not seen. */
export class ProviderKeySet {
  private keys = new Map<string, KeyObject>();
  private fetchedAt = 0;
  private pending: Promise<void> | undefined;
  constructor(private readonly url: string) {}
  async key(kid: string): Promise<KeyObject | undefined> {
    const age = Date.now() - this.fetchedAt;
    if (age > 3_600_000 || (!this.keys.has(kid) && age > 60_000))
      await this.refresh();
    return this.keys.get(kid);
  }
  private refresh() {
    this.pending ??= (async () => {
      try {
        const response = await fetch(this.url, {
          signal: AbortSignal.timeout(5000),
          cache: "no-store",
        });
        if (!response.ok)
          throw new Error(`key set answered ${response.status}`);
        const next = new Map<string, KeyObject>();
        for (const jwk of KeySetSchema.parse(await response.json()).keys)
          if (
            jwk.kty === "RSA" &&
            typeof jwk.kid === "string" &&
            (jwk.alg === undefined || jwk.alg === "RS256") &&
            (jwk.use === undefined || jwk.use === "sig")
          )
            next.set(
              jwk.kid,
              createPublicKey({ key: jwk as never, format: "jwk" }),
            );
        this.keys = next;
        this.fetchedAt = Date.now();
      } catch (cause) {
        throw new DomainError(
          "identity_provider_unavailable",
          "Sign-in is unavailable right now. Try again in a moment.",
          503,
          { cause },
        );
      } finally {
        this.pending = undefined;
      }
    })();
    return this.pending;
  }
}

export type VerifiedIdToken = Readonly<{
  subject: string;
  email: string | undefined;
  authenticatedAt: Date;
}>;

const Claims = z.object({
  iss: z.string(),
  aud: z.string(),
  sub: z.string().min(1).max(255),
  iat: z.number(),
  exp: z.number(),
  nonce: z.string().optional(),
  auth_time: z.number().optional(),
  email: z.string().max(320).optional(),
  email_verified: z.union([z.boolean(), z.enum(["true", "false"])]).optional(),
});

/** Every check of the sign-in decision pack, section 5. Any failure returns
 * null and never says which check failed. A key set that cannot be fetched
 * throws identity_provider_unavailable instead. */
export async function verifyIdToken(
  token: string,
  expected: {
    issuers: readonly string[];
    audience: string;
    nonce: string;
    /** iOS Apple sign-in puts SHA-256(nonce), as lowercase hex, in the token. */
    hashedNonce: boolean;
    keys: ProviderKeySet;
  },
): Promise<VerifiedIdToken | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [head, body, signature] = parts as [string, string, string];
  let header: { alg?: unknown; kid?: unknown };
  let claims: z.infer<typeof Claims>;
  try {
    header = JSON.parse(Buffer.from(head, "base64url").toString());
    const parsed = Claims.safeParse(
      JSON.parse(Buffer.from(body, "base64url").toString()),
    );
    if (!parsed.success) return null;
    claims = parsed.data;
  } catch {
    return null;
  }
  if (header.alg !== "RS256" || typeof header.kid !== "string") return null;
  const key = await expected.keys.key(header.kid);
  if (
    !key ||
    !verify(
      "RSA-SHA256",
      Buffer.from(`${head}.${body}`),
      key,
      Buffer.from(signature, "base64url"),
    )
  )
    return null;
  const now = Date.now() / 1000;
  const authenticated = claims.auth_time ?? claims.iat;
  const nonce = expected.hashedNonce
    ? createHash("sha256").update(expected.nonce).digest("hex")
    : expected.nonce;
  if (
    !expected.issuers.includes(claims.iss) ||
    claims.aud !== expected.audience ||
    claims.exp <= now - 60 ||
    claims.iat > now + 30 ||
    claims.iat < now - 600 ||
    authenticated < now - 300 ||
    authenticated > now + 30 ||
    claims.nonce !== nonce ||
    (claims.email !== undefined &&
      claims.email_verified !== true &&
      claims.email_verified !== "true")
  )
    return null;
  return Object.freeze({
    subject: claims.sub,
    email: claims.email,
    authenticatedAt: new Date(authenticated * 1000),
  });
}
