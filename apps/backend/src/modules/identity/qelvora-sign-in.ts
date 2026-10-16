import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { DomainError } from "../../core/errors.js";
import type { PantopusIdentityAdapter } from "./adapter.js";
import { verifyIdToken, type VerifiedIdToken } from "./id-token.js";
import {
  exchangeCode,
  providerSettingsFromEnvironment,
  revokeToken,
  type ProviderSettings,
  type SignInPlatform,
  type SignInProvider,
} from "./providers.js";

/** The age screen's copy is not approved yet; the version names that. */
export const AGE_COPY_VERSION = "age-screen-pending-copy-review";
export type Admitted = Readonly<{
  accountId: string;
  grantToken: string;
  authenticatedAt: Date;
}>;
/** Writes the session for an admitted account on the same transaction. */
export type IssueSession = (
  client: PoolClient,
  admitted: Admitted,
) => Promise<string>;
export type SignInStep =
  | { status: "signed_in"; token: string; returnTo: string }
  | { status: "age_required"; ageContinuationId: string; expiresAt: string };

type RefreshToken = { token: string; clientId: string };
type Continuation = {
  id: string;
  kind: "web" | "native" | "age";
  provider: SignInProvider;
  platform: SignInPlatform;
  return_to: string;
  state_hash: string | null;
  nonce: string | null;
  account_id: string | null;
  identity_id: string | null;
  authenticated_at: Date | null;
};
const sha256 = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const refused = (code: string, message: string, status: number) =>
  new DomainError(code, message, status);
// Every token, code or nonce failure gives the same answer and no reason.
const failed = () =>
  refused(
    "continuation_failed",
    "This sign-in could not be completed. Start again.",
    401,
  );
const expired = () =>
  refused(
    "continuation_expired",
    "This sign-in request expired. Start again.",
    403,
  );
const underage = () =>
  refused(
    "adult_eligibility_required",
    "This app is available to adults aged 18 and over.",
    403,
  );

/** Whole years since a real calendar date, in UTC; null for an impossible or
 * future date. */
export function yearsOld(date: string, now = new Date()): number | null {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const born = new Date(Date.UTC(y, m - 1, d));
  if (
    born.getUTCFullYear() !== y ||
    born.getUTCMonth() !== m - 1 ||
    born.getUTCDate() !== d ||
    born > now
  )
    return null;
  const before =
    now.getUTCMonth() + 1 < m ||
    (now.getUTCMonth() + 1 === m && now.getUTCDate() < d);
  return now.getUTCFullYear() - y - (before ? 1 : 0);
}

/** Option D: a Qelvora-owned sign-in with Apple and Google. A verified provider
 * identity maps to a random Qelvora account id; the 18+ gate sits between
 * that identity and any session. As an adapter it resolves the opaque grant
 * behind a Qelvora session on every request, with no cache. */
export class QelvoraSignIn implements PantopusIdentityAdapter {
  readonly mode = "qelvora" as const;
  constructor(
    private readonly pool: Pool,
    private readonly key: Buffer,
    private readonly providers: ReadonlyMap<SignInProvider, ProviderSettings>,
    private readonly webOrigin: string,
  ) {}
  static fromEnvironment(
    pool: Pool,
    key: Buffer,
    env: NodeJS.ProcessEnv = process.env,
  ): QelvoraSignIn | undefined {
    const providers = providerSettingsFromEnvironment(env);
    return providers
      ? new QelvoraSignIn(
          pool,
          key,
          providers,
          env.WEB_ORIGIN ?? "http://localhost:3000",
        )
      : undefined;
  }
  get enabled(): readonly SignInProvider[] {
    return [...this.providers.keys()];
  }
  async beginSession(): Promise<{ redirectUrl: string }> {
    throw refused(
      "sign_in_provider_required",
      "Choose Apple or Google to continue.",
      400,
    );
  }
  async resolveSession(token: string) {
    const row = (
      await this.pool.query<{
        account_id: string;
        state: string;
        attested: boolean;
        minor: boolean;
      }>(
        `SELECT g.account_id,a.state,
         EXISTS(SELECT 1 FROM creator.age_signal s WHERE s.account_id=g.account_id AND s.source='attestation' AND s.result='adult') AS attested,
         EXISTS(SELECT 1 FROM creator.age_signal s WHERE s.account_id=g.account_id AND s.result='under_18') AS minor
         FROM creator.identity_grant g JOIN creator.account a ON a.id=g.account_id
         WHERE g.token_hash=$1 AND g.revoked_at IS NULL AND g.expires_at>now()`,
        [sha256(token)],
      )
    ).rows[0];
    if (!row || row.state !== "active")
      throw refused("session_invalid", "Sign in again.", 401);
    return {
      accountId: row.account_id,
      adultEligible: row.attested && !row.minor,
    };
  }
  /** Account deletion: ends the app's authorization at the provider with
   * every stored refresh token (Apple requires this when an account is
   * deleted). */
  async revokeAtProvider(provider: SignInProvider, cipher: string) {
    const settings = this.providers.get(provider);
    if (!settings)
      throw refused(
        "identity_sign_in_unconfigured",
        `${provider} sign-in is not configured on this host, so its token cannot be revoked.`,
        503,
      );
    const tokens = this.refreshTokens(cipher);
    for (const item of tokens) await revokeToken(settings, item);
    return tokens.length;
  }
  /** The provider's email address, for the person's own export. */
  revealEmail(cipher: string) {
    return this.open(cipher);
  }
  /** Sign out everywhere also ends every provider grant of the account. */
  async revokeGrants(accountId: string) {
    await this.pool.query(
      "UPDATE creator.identity_grant SET revoked_at=now() WHERE account_id=$1 AND revoked_at IS NULL",
      [accountId],
    );
  }

  async startWeb(input: {
    returnTo: string;
    provider: SignInProvider;
    reauthenticate?: boolean;
  }) {
    const settings = this.settings(input.provider);
    const state = randomBytes(32).toString("base64url");
    const nonce = randomBytes(32).toString("base64url");
    const saved = await this.pool.query<{ id: string }>(
      "INSERT INTO creator.sign_in_continuation(kind,provider,platform,return_to,state_hash,nonce,reauthenticate,expires_at) VALUES('web',$1,'web',$2,$3,$4,$5,now()+interval '5 minutes') RETURNING id",
      [
        input.provider,
        input.returnTo,
        sha256(state),
        nonce,
        input.reauthenticate === true,
      ],
    );
    const url = new URL(settings.endpoints.authorize);
    const query: Record<string, string> = {
      client_id: settings.audiences.web!,
      redirect_uri: this.redirectUri(input.provider),
      response_type: "code",
      state,
      nonce,
      ...(input.provider === "google"
        ? {
            scope: "openid email",
            code_challenge: createHash("sha256")
              .update(this.verifier(state))
              .digest("base64url"),
            code_challenge_method: "S256",
            prompt: "select_account",
            ...(input.reauthenticate ? { max_age: "0" } : {}),
          }
        : { scope: "email", response_mode: "form_post" }),
    };
    for (const [name, value] of Object.entries(query))
      url.searchParams.set(name, value);
    return { redirectUrl: url.href, continuationId: saved.rows[0]!.id };
  }
  async completeWeb(
    input: { continuationId: string; code: string; state?: string },
    issue: IssueSession,
  ): Promise<SignInStep> {
    const continuation = await this.take(input.continuationId, "web");
    const supplied = Buffer.from(sha256(input.state ?? ""));
    if (!timingSafeEqual(supplied, Buffer.from(continuation.state_hash ?? "")))
      throw refused(
        "identity_state_invalid",
        "This sign-in callback does not belong to your request.",
        403,
      );
    const settings = this.settings(continuation.provider);
    const tokens = await exchangeCode(settings, {
      code: input.code,
      clientId: settings.audiences.web!,
      redirectUri: this.redirectUri(continuation.provider),
      ...(continuation.provider === "google"
        ? { codeVerifier: this.verifier(input.state!) }
        : {}),
    });
    if (!tokens) throw failed();
    const verified = await verifyIdToken(tokens.id_token, {
      issuers: settings.endpoints.issuers,
      audience: settings.audiences.web!,
      nonce: continuation.nonce!,
      hashedNonce: false,
      keys: settings.keys,
    });
    if (!verified) throw failed();
    return this.admit(
      continuation,
      verified,
      tokens.refresh_token
        ? { token: tokens.refresh_token, clientId: settings.audiences.web! }
        : undefined,
      issue,
    );
  }

  async startNative(input: {
    provider: SignInProvider;
    platform: "ios" | "android";
    returnTo?: string;
  }) {
    const settings = this.settings(input.provider);
    if (!settings.audiences[input.platform])
      throw refused(
        "sign_in_provider_unavailable",
        "This sign-in option is not available here.",
        400,
      );
    const nonce = randomBytes(32).toString("base64url");
    const saved = await this.pool.query<{ id: string; expires_at: Date }>(
      "INSERT INTO creator.sign_in_continuation(kind,provider,platform,return_to,nonce,expires_at) VALUES('native',$1,$2,$3,$4,now()+interval '5 minutes') RETURNING id,expires_at",
      [input.provider, input.platform, input.returnTo ?? "/home", nonce],
    );
    return {
      continuationId: saved.rows[0]!.id,
      nonce,
      expiresAt: saved.rows[0]!.expires_at.toISOString(),
    };
  }
  async completeNative(
    input: {
      continuationId: string;
      provider: SignInProvider;
      idToken: string;
      authorizationCode?: string;
    },
    issue: IssueSession,
  ): Promise<SignInStep> {
    const continuation = await this.take(input.continuationId, "native");
    if (continuation.provider !== input.provider) throw expired();
    const settings = this.settings(continuation.provider);
    const audience = settings.audiences[continuation.platform];
    if (!audience) throw failed();
    const verified = await verifyIdToken(input.idToken, {
      issuers: settings.endpoints.issuers,
      audience,
      nonce: continuation.nonce!,
      hashedNonce:
        continuation.provider === "apple" && continuation.platform === "ios",
      keys: settings.keys,
    });
    if (!verified) throw failed();
    // Apple's refresh token lets account deletion revoke the grant at Apple.
    // Sign-in does not depend on it.
    const refresh =
      continuation.provider === "apple" && input.authorizationCode
        ? (
            await exchangeCode(settings, {
              code: input.authorizationCode,
              clientId: audience,
            }).catch(() => null)
          )?.refresh_token
        : undefined;
    return this.admit(
      continuation,
      verified,
      refresh ? { token: refresh, clientId: audience } : undefined,
      issue,
    );
  }

  /** The age step. A date that does not exist is refused without using the
   * step. Under 18, from the date or a platform signal, locks this provider
   * identity for good; an adult platform report is never proof. Nothing that
   * identifies a person under 18 is kept (founder's default, 2026-10-16): the
   * email goes, a stored refresh token goes once revoked at the provider, and
   * the account closes. The lock (a keyed hash) and the under-18 result
   * (never a date) stay. */
  async confirmAge(
    input: {
      ageContinuationId: string;
      birthDate: string;
      platformSignal?: {
        source: "apple_declared_age_range" | "google_play_age_signals";
        under18: boolean;
      };
    },
    issue: IssueSession,
  ): Promise<SignInStep> {
    const years = yearsOld(input.birthDate);
    if (years === null)
      throw refused(
        "invalid_request",
        "The request does not match the API contract.",
        400,
      );
    const continuation = await this.take(input.ageContinuationId, "age").catch(
      () => {
        throw refused(
          "age_confirmation_expired",
          "This step expired. Sign in again.",
          403,
        );
      },
    );
    // Revoke before the transaction, as account deletion does: a token
    // deleted first could never be revoked. A failure keeps the token.
    let revoked: string | null = null;
    if (years < 18 || input.platformSignal?.under18) {
      const held = (
        await this.pool.query<{
          provider: SignInProvider;
          provider_refresh_cipher: string | null;
        }>(
          "SELECT provider,provider_refresh_cipher FROM creator.account_identity WHERE id=$1 AND account_id=$2",
          [continuation.identity_id, continuation.account_id],
        )
      ).rows[0];
      if (held?.provider_refresh_cipher)
        revoked = await this.revokeAtProvider(
          held.provider,
          held.provider_refresh_cipher,
        )
          .then(() => held.provider_refresh_cipher)
          .catch(() => null);
    }
    const outcome = await this.transaction(async (client) => {
      const accountId = continuation.account_id!;
      await this.lock(client, `qelvora-account:${accountId}`);
      const identity = (
        await client.query<{ provider: string; subject_hmac: string }>(
          "SELECT provider,subject_hmac FROM creator.account_identity WHERE id=$1 AND account_id=$2",
          [continuation.identity_id, accountId],
        )
      ).rows[0];
      if (!identity) throw expired();
      const record = (source: string, result: "adult" | "under_18") =>
        client.query(
          "INSERT INTO creator.age_signal(account_id,source,result,copy_version) VALUES($1,$2,$3,$4)",
          [accountId, source, result, AGE_COPY_VERSION],
        );
      await record("attestation", years >= 18 ? "adult" : "under_18");
      if (input.platformSignal?.under18)
        await record(input.platformSignal.source, "under_18");
      if (years < 18 || input.platformSignal?.under18) {
        await client.query(
          "INSERT INTO creator.age_lock(provider,subject_hmac) VALUES($1,$2) ON CONFLICT DO NOTHING",
          [identity.provider, identity.subject_hmac],
        );
        await client.query(
          "UPDATE creator.account_identity SET email_cipher=NULL,provider_refresh_cipher=CASE WHEN provider_refresh_cipher IS NOT DISTINCT FROM $3 THEN NULL ELSE provider_refresh_cipher END WHERE id=$1 AND account_id=$2",
          [continuation.identity_id, accountId, revoked],
        );
        await client.query(
          "UPDATE creator.identity_grant SET revoked_at=now() WHERE account_id=$1 AND revoked_at IS NULL",
          [accountId],
        );
        await client.query(
          "UPDATE creator.account SET state='deleted',deleted_at=now() WHERE id=$1 AND state='active'",
          [accountId],
        );
        return "underage" as const;
      }
      if ((await this.ageState(client, accountId)).minor)
        return "underage" as const;
      const token = await issue(
        client,
        await this.grant(client, {
          accountId,
          identityId: continuation.identity_id!,
          authenticatedAt: continuation.authenticated_at!,
        }),
      );
      return {
        status: "signed_in" as const,
        token,
        returnTo: continuation.return_to,
      };
    });
    if (outcome === "underage") throw underage();
    return outcome;
  }

  private async admit(
    continuation: Continuation,
    verified: VerifiedIdToken,
    refreshToken: RefreshToken | undefined,
    issue: IssueSession,
  ): Promise<SignInStep> {
    const provider = continuation.provider;
    const subject = createHmac("sha256", this.key)
      .update(`qelvora-subject:${provider}:${verified.subject}`)
      .digest("hex");
    return this.transaction(async (client) => {
      // Two completions for one person at once make one account.
      await this.lock(client, `qelvora-identity:${provider}:${subject}`);
      const locked = await client.query(
        "SELECT 1 FROM creator.age_lock WHERE provider=$1 AND subject_hmac=$2",
        [provider, subject],
      );
      if (locked.rowCount) throw underage();
      const email = verified.email ? this.seal(verified.email) : null;
      // One refresh token per client (web and each app), with the client it
      // was issued to, so deletion can revoke every one of them.
      const held = refreshToken
        ? (
            await client.query<{ provider_refresh_cipher: string | null }>(
              "SELECT provider_refresh_cipher FROM creator.account_identity WHERE provider=$1 AND subject_hmac=$2 FOR UPDATE",
              [provider, subject],
            )
          ).rows[0]?.provider_refresh_cipher
        : null;
      const refresh = refreshToken
        ? this.seal(
            JSON.stringify([
              ...(held ? this.refreshTokens(held) : []).filter(
                (item) => item.clientId !== refreshToken.clientId,
              ),
              refreshToken,
            ]),
          )
        : null;
      let identity = (
        await client.query<{ id: string; account_id: string; state: string }>(
          `UPDATE creator.account_identity i SET last_used_at=now(),email_cipher=coalesce($3,email_cipher),
           provider_refresh_cipher=coalesce($4,provider_refresh_cipher)
           FROM creator.account a WHERE a.id=i.account_id AND i.provider=$1 AND i.subject_hmac=$2
           RETURNING i.id,i.account_id,a.state`,
          [provider, subject, email, refresh],
        )
      ).rows[0];
      if (!identity) {
        const account = await client.query<{ id: string }>(
          "INSERT INTO creator.account DEFAULT VALUES RETURNING id",
        );
        identity = (
          await client.query<{
            id: string;
            account_id: string;
            state: string;
          }>(
            "INSERT INTO creator.account_identity(account_id,provider,subject_hmac,email_cipher,provider_refresh_cipher) VALUES($1,$2,$3,$4,$5) RETURNING id,account_id,'active' AS state",
            [
              account.rows[0]!.id,
              provider,
              subject,
              email,
              refreshToken ? this.seal(JSON.stringify([refreshToken])) : null,
            ],
          )
        ).rows[0]!;
      }
      if (identity.state !== "active")
        throw refused("scope_revoked", "This scope is closed.", 403);
      const age = await this.ageState(client, identity.account_id);
      if (age.minor) throw underage();
      if (age.attested)
        return {
          status: "signed_in" as const,
          token: await issue(
            client,
            await this.grant(client, {
              accountId: identity.account_id,
              identityId: identity.id,
              authenticatedAt: verified.authenticatedAt,
            }),
          ),
          returnTo: continuation.return_to,
        };
      const step = await client.query<{ id: string; expires_at: Date }>(
        "INSERT INTO creator.sign_in_continuation(kind,provider,platform,return_to,account_id,identity_id,authenticated_at,expires_at) VALUES('age',$1,$2,$3,$4,$5,$6,now()+interval '10 minutes') RETURNING id,expires_at",
        [
          provider,
          continuation.platform,
          continuation.return_to,
          identity.account_id,
          identity.id,
          verified.authenticatedAt,
        ],
      );
      return {
        status: "age_required" as const,
        ageContinuationId: step.rows[0]!.id,
        expiresAt: step.rows[0]!.expires_at.toISOString(),
      };
    });
  }
  private async grant(
    client: PoolClient,
    input: { accountId: string; identityId: string; authenticatedAt: Date },
  ): Promise<Admitted> {
    const grantToken = randomBytes(32).toString("base64url");
    await client.query(
      "INSERT INTO creator.identity_grant(account_id,identity_id,token_hash,authenticated_at,expires_at) VALUES($1,$2,$3,$4,now()+interval '7 days')",
      [
        input.accountId,
        input.identityId,
        sha256(grantToken),
        input.authenticatedAt,
      ],
    );
    return {
      accountId: input.accountId,
      grantToken,
      authenticatedAt: input.authenticatedAt,
    };
  }
  private async ageState(client: PoolClient, accountId: string) {
    return (
      await client.query<{ attested: boolean; minor: boolean }>(
        `SELECT EXISTS(SELECT 1 FROM creator.age_signal WHERE account_id=$1 AND source='attestation' AND result='adult') AS attested,
         EXISTS(SELECT 1 FROM creator.age_signal WHERE account_id=$1 AND result='under_18') AS minor`,
        [accountId],
      )
    ).rows[0]!;
  }
  /** Single use, whatever the outcome: the step is spent before any check. */
  private async take(id: string, kind: Continuation["kind"]) {
    const row = (
      await this.pool.query<Continuation>(
        "UPDATE creator.sign_in_continuation SET used_at=now() WHERE id=$1 AND kind=$2 AND used_at IS NULL AND expires_at>now() RETURNING id,kind,provider,platform,return_to,state_hash,nonce,account_id,identity_id,authenticated_at",
        [id, kind],
      )
    ).rows[0];
    if (!row) throw expired();
    return row;
  }
  private async transaction<T>(work: (client: PoolClient) => Promise<T>) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await work(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
  private lock(client: PoolClient, name: string) {
    return client.query(
      "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
      [name],
    );
  }
  private settings(provider: SignInProvider) {
    const settings = this.providers.get(provider);
    if (!settings)
      throw refused(
        "sign_in_provider_unavailable",
        "This sign-in option is not available here.",
        400,
      );
    return settings;
  }
  private redirectUri(provider: SignInProvider) {
    return new URL(`/api/auth/callback/${provider}`, this.webOrigin).href;
  }
  private verifier(state: string) {
    return createHmac("sha256", this.key)
      .update(`qelvora-pkce:${state}`)
      .digest("base64url");
  }
  private refreshTokens(cipher: string) {
    return JSON.parse(this.open(cipher)) as RefreshToken[];
  }
  private open(value: string) {
    const data = Buffer.from(value, "base64url");
    const decipher = createDecipheriv(
      "aes-256-gcm",
      this.key,
      data.subarray(0, 12),
    );
    decipher.setAuthTag(data.subarray(data.length - 16));
    return Buffer.concat([
      decipher.update(data.subarray(12, data.length - 16)),
      decipher.final(),
    ]).toString("utf8");
  }
  private seal(value: string) {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    return Buffer.concat([
      iv,
      cipher.update(value),
      cipher.final(),
      cipher.getAuthTag(),
    ]).toString("base64url");
  }
}
