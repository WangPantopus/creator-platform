import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import type { Pool } from "pg";
import { CompleteIdentitySchema, IdentityContinueSchema } from "@qelvora/api";
import type { Actor, PantopusIdentityAdapter } from "./adapter.js";
import { resolveActor } from "./adapter.js";
import { DomainError, invariant } from "../../core/errors.js";

const hash = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export class SessionService implements PantopusIdentityAdapter {
  readonly mode;
  readonly developmentActors;
  constructor(
    private readonly pool: Pool,
    private readonly upstream: PantopusIdentityAdapter,
    private readonly key: Buffer,
  ) {
    if (key.length !== 32)
      throw new Error("IDENTITY_SESSION_KEY must decode to 32 bytes.");
    this.mode = upstream.mode ?? "pantopus";
    this.developmentActors = upstream.developmentActors;
  }
  private encrypt(token: string) {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    return Buffer.concat([
      iv,
      cipher.update(token),
      cipher.final(),
      cipher.getAuthTag(),
    ]).toString("base64url");
  }
  private decrypt(value: string) {
    const data = Buffer.from(value, "base64url");
    const cipher = createDecipheriv(
      "aes-256-gcm",
      this.key,
      data.subarray(0, 12),
    );
    cipher.setAuthTag(data.subarray(-16));
    return Buffer.concat([
      cipher.update(data.subarray(12, -16)),
      cipher.final(),
    ]).toString();
  }
  private verifier(state: string) {
    return createHmac("sha256", this.key)
      .update("pantopus-pkce:" + state)
      .digest("base64url");
  }
  async beginSession(input: { returnTo: string }) {
    const { returnTo } = IdentityContinueSchema.parse(input);
    invariant(
      this.upstream.completeSession,
      "identity_callback_unconfigured",
      "The identity callback is not connected.",
    );
    const state = randomBytes(32).toString("base64url");
    const saved = await this.pool.query<{ id: string }>(
      "INSERT INTO creator.auth_continuation(return_to,adapter_state,expires_at) VALUES($1,$2,now()+interval '5 minutes') RETURNING id",
      [returnTo, state],
    );
    const result = await this.upstream.beginSession({
      returnTo,
      state,
      continuationId: saved.rows[0]!.id,
      codeChallenge: createHash("sha256")
        .update(this.verifier(state))
        .digest("base64url"),
      reauthenticate: true,
    });
    const redirect = new URL(result.redirectUrl);
    invariant(
      redirect.protocol === "https:" ||
        (this.mode === "development" &&
          ["localhost", "127.0.0.1"].includes(redirect.hostname)),
      "identity_redirect_invalid",
      "The identity redirect is unavailable.",
    );
    redirect.searchParams.set("state", state);
    redirect.searchParams.set("continuationId", saved.rows[0]!.id);
    return { redirectUrl: redirect.href, continuationId: saved.rows[0]!.id };
  }
  async complete(input: unknown) {
    const body = CompleteIdentitySchema.parse(input);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const found = await client.query<{
        return_to: string;
        adapter_state: string;
      }>(
        "SELECT return_to,adapter_state FROM creator.auth_continuation WHERE id=$1 AND expires_at>now() AND used_at IS NULL FOR UPDATE",
        [body.continuationId],
      );
      const continuation = found.rows[0];
      invariant(
        continuation,
        "continuation_expired",
        "This sign-in request expired. Start again.",
      );
      if (this.mode !== "development") {
        const supplied = Buffer.from(body.state ?? "");
        const expected = Buffer.from(continuation.adapter_state);
        invariant(
          supplied.length === expected.length &&
            timingSafeEqual(supplied, expected),
          "identity_state_invalid",
          "This sign-in callback does not belong to your request.",
        );
      }
      const result = await this.upstream.completeSession!({
        code: body.code,
        state: continuation.adapter_state,
        codeVerifier: this.verifier(continuation.adapter_state),
      });
      const actor = await resolveActor(this.upstream, result.token);
      const authenticatedAt =
        this.mode === "development"
          ? new Date()
          : new Date(result.authenticatedAt ?? "");
      invariant(
        Number.isFinite(authenticatedAt.getTime()) &&
          Date.now() - authenticatedAt.getTime() < 300000 &&
          authenticatedAt.getTime() <= Date.now() + 30000,
        "identity_freshness_required",
        "The provider must confirm fresh Pantopus authorization before completing this request.",
      );
      const token = randomBytes(32).toString("base64url");
      const session = await client.query<{ id: string }>(
        "INSERT INTO creator.identity_session(account_id,token_hash,upstream_cipher,mode,expires_at,refresh_until,created_at) VALUES($1,$2,$3,$4,now()+interval '15 minutes',now()+interval '7 days',$5) RETURNING id",
        [
          actor.accountId,
          hash(token),
          this.encrypt(result.token),
          this.mode,
          authenticatedAt,
        ],
      );
      await client.query(
        "UPDATE creator.auth_continuation SET used_at=now() WHERE id=$1",
        [body.continuationId],
      );
      await client.query("COMMIT");
      return {
        token,
        returnTo: continuation.return_to,
        sessionId: session.rows[0]!.id,
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
  async resolveSession(token: string): Promise<Actor> {
    return (await this.resolve(token)).actor;
  }
  async resolve(token: string, refreshing = false) {
    const found = await this.pool.query<{
      id: string;
      account_id: string;
      upstream_cipher: string;
      expires_at: Date;
      created_at: Date;
    }>(
      `SELECT id,account_id,upstream_cipher,expires_at,created_at FROM creator.identity_session WHERE token_hash=$1 AND revoked_at IS NULL AND ${refreshing ? "refresh_until" : "expires_at"}>now()`,
      [hash(token)],
    );
    const row = found.rows[0];
    if (!row)
      throw new DomainError(
        "session_expired",
        "Your session ended. Continue with Pantopus again.",
        401,
      );
    let actor: Actor;
    try {
      actor = await resolveActor(
        this.upstream,
        this.decrypt(row.upstream_cipher),
      );
    } catch (error) {
      await this.pool.query(
        "UPDATE creator.identity_session SET revoked_at=now() WHERE id=$1",
        [row.id],
      );
      void error;
      throw new DomainError(
        "authorization_ended",
        "Your authorization could not be confirmed. Continue with Pantopus again.",
        401,
      );
    }
    if (actor.accountId !== row.account_id) {
      await this.pool.query(
        "UPDATE creator.identity_session SET revoked_at=now() WHERE id=$1",
        [row.id],
      );
      throw new DomainError(
        "session_account_changed",
        "The shared account changed. Sign in again.",
        401,
      );
    }
    return {
      actor,
      sessionId: row.id,
      expiresAt: row.expires_at.toISOString(),
      authenticatedAt: row.created_at,
    };
  }
  async refresh(token: string) {
    const session = await this.resolve(token, true);
    const next = randomBytes(32).toString("base64url");
    const updated = await this.pool.query<{ expires_at: Date }>(
      "UPDATE creator.identity_session SET token_hash=$1,expires_at=LEAST(now()+interval '15 minutes',refresh_until) WHERE id=$2 AND token_hash=$3 AND revoked_at IS NULL RETURNING expires_at",
      [hash(next), session.sessionId, hash(token)],
    );
    if (!updated.rows[0])
      throw new DomainError(
        "session_changed",
        "Your session changed. Sign in again.",
        401,
      );
    return { token: next, expiresAt: updated.rows[0].expires_at.toISOString() };
  }
  async logout(token: string, all = false) {
    if (all) {
      const { actor } = await this.resolve(token, true);
      await this.pool.query(
        "UPDATE creator.identity_session SET revoked_at=now() WHERE account_id=$1 AND revoked_at IS NULL",
        [actor.accountId],
      );
    } else
      await this.pool.query(
        "UPDATE creator.identity_session SET revoked_at=now() WHERE token_hash=$1 AND revoked_at IS NULL",
        [hash(token)],
      );
    return { done: true as const };
  }
}
