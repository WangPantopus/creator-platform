import { createPrivateKey, sign, type KeyObject } from "node:crypto";
import { z } from "zod";
import { DomainError } from "../../core/errors.js";
import { ProviderKeySet } from "./id-token.js";

export type SignInProvider = "apple" | "google";
export type SignInPlatform = "web" | "ios" | "android";

type Endpoints = Readonly<{
  authorize: string;
  token: string;
  keys: string;
  revoke: string;
  issuers: readonly string[];
}>;
const PROVIDER_ENDPOINTS: Record<SignInProvider, Endpoints> = {
  apple: {
    authorize: "https://appleid.apple.com/auth/authorize",
    token: "https://appleid.apple.com/auth/token",
    keys: "https://appleid.apple.com/auth/keys",
    revoke: "https://appleid.apple.com/auth/revoke",
    issuers: ["https://appleid.apple.com"],
  },
  google: {
    authorize: "https://accounts.google.com/o/oauth2/v2/auth",
    token: "https://oauth2.googleapis.com/token",
    keys: "https://www.googleapis.com/oauth2/v3/certs",
    revoke: "https://oauth2.googleapis.com/revoke",
    issuers: ["https://accounts.google.com", "accounts.google.com"],
  },
};
// A local fake serves the same paths under one loopback origin.
const FAKE_PATHS: Record<SignInProvider, Omit<Endpoints, "issuers">> = {
  apple: {
    authorize: "/apple/auth/authorize",
    token: "/apple/auth/token",
    keys: "/apple/auth/keys",
    revoke: "/apple/auth/revoke",
  },
  google: {
    authorize: "/google/o/oauth2/v2/auth",
    token: "/google/token",
    keys: "/google/oauth2/v3/certs",
    revoke: "/google/revoke",
  },
};

export type ProviderSettings = Readonly<{
  provider: SignInProvider;
  endpoints: Endpoints;
  keys: ProviderKeySet;
  /** The ID-token audience for each platform this provider serves. */
  audiences: Readonly<Partial<Record<SignInPlatform, string>>>;
  clientSecret(clientId: string): string;
}>;

const loopback = (value: string) =>
  ["localhost", "127.0.0.1", "[::1]"].includes(new URL(value).hostname);

/** Apple's client secret is a short ES256 JWT signed with the team's key. */
function appleSecret(teamId: string, keyId: string, key: KeyObject) {
  return (clientId: string) => {
    const now = Math.floor(Date.now() / 1000);
    const part = (value: unknown) =>
      Buffer.from(JSON.stringify(value)).toString("base64url");
    const data = `${part({ alg: "ES256", kid: keyId })}.${part({
      iss: teamId,
      iat: now,
      exp: now + 300,
      aud: "https://appleid.apple.com",
      sub: clientId,
    })}`;
    const signature = sign("sha256", Buffer.from(data), {
      key,
      dsaEncoding: "ieee-p1363",
    }).toString("base64url");
    return `${data}.${signature}`;
  };
}

/** Reads the enabled providers from the environment. Returns undefined when
 * QELVORA_SIGN_IN is unset. A fake provider origin is accepted only on a
 * loopback development host; real client ids are then optional. */
export function providerSettingsFromEnvironment(
  env: NodeJS.ProcessEnv,
): Map<SignInProvider, ProviderSettings> | undefined {
  if (!env.QELVORA_SIGN_IN) return undefined;
  const enabled = z
    .array(z.enum(["apple", "google"]))
    .min(1)
    .parse(env.QELVORA_SIGN_IN.split(",").map((value) => value.trim()));
  const fake = env.QELVORA_SIGN_IN_FAKE_PROVIDER;
  if (
    fake &&
    (env.NODE_ENV !== "development" ||
      !loopback(fake) ||
      !loopback(env.WEB_ORIGIN ?? "http://localhost:3000"))
  )
    throw new Error(
      "A fake sign-in provider requires NODE_ENV=development and loopback origins.",
    );
  const value = (name: string, fallback: string) => {
    const found = env[name] ?? (fake ? fallback : undefined);
    if (!found) throw new Error(`${name} is required for Qelvora sign-in.`);
    return found;
  };
  const settings = new Map<SignInProvider, ProviderSettings>();
  for (const provider of enabled) {
    const paths = FAKE_PATHS[provider];
    const endpoints: Endpoints = fake
      ? {
          authorize: new URL(paths.authorize, fake).href,
          token: new URL(paths.token, fake).href,
          keys: new URL(paths.keys, fake).href,
          revoke: new URL(paths.revoke, fake).href,
          issuers: PROVIDER_ENDPOINTS[provider].issuers,
        }
      : PROVIDER_ENDPOINTS[provider];
    if (provider === "google") {
      const secret = value(
        "QELVORA_GOOGLE_WEB_CLIENT_SECRET",
        "fake-google-web-secret",
      );
      settings.set(provider, {
        provider,
        endpoints,
        keys: new ProviderKeySet(endpoints.keys),
        audiences: {
          web: value(
            "QELVORA_GOOGLE_WEB_CLIENT_ID",
            "fake-google-web.apps.googleusercontent.com",
          ),
          ios: value(
            "QELVORA_GOOGLE_IOS_CLIENT_ID",
            "fake-google-ios.apps.googleusercontent.com",
          ),
          android: value(
            "QELVORA_GOOGLE_ANDROID_CLIENT_ID",
            "fake-google-android.apps.googleusercontent.com",
          ),
        },
        clientSecret: () => secret,
      });
    } else {
      const key = createPrivateKey(
        Buffer.from(value("QELVORA_APPLE_PRIVATE_KEY_B64", ""), "base64"),
      );
      settings.set(provider, {
        provider,
        endpoints,
        keys: new ProviderKeySet(endpoints.keys),
        audiences: {
          web: value("QELVORA_APPLE_SERVICES_ID", "fake.qelvora.web"),
          ios: env.QELVORA_APPLE_BUNDLE_ID ?? "com.pantopus.qelvora",
        },
        clientSecret: appleSecret(
          value("QELVORA_APPLE_TEAM_ID", "FAKETEAM01"),
          value("QELVORA_APPLE_KEY_ID", "FAKEKEY001"),
          key,
        ),
      });
    }
  }
  return settings;
}

const TokenResponse = z.object({
  id_token: z.string().min(1).max(8192),
  refresh_token: z.string().min(1).max(4096).optional(),
});
/** Exchanges an authorization code. A 4xx is a refused code (null); a network
 * failure or 5xx is the provider being unavailable. */
export async function exchangeCode(
  settings: ProviderSettings,
  input: {
    code: string;
    clientId: string;
    redirectUri?: string;
    codeVerifier?: string;
  },
): Promise<z.infer<typeof TokenResponse> | null> {
  let response: Response;
  try {
    response = await fetch(settings.endpoints.token, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: input.code,
        client_id: input.clientId,
        client_secret: settings.clientSecret(input.clientId),
        ...(input.redirectUri ? { redirect_uri: input.redirectUri } : {}),
        ...(input.codeVerifier ? { code_verifier: input.codeVerifier } : {}),
      }),
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
  } catch (cause) {
    throw new DomainError(
      "identity_provider_unavailable",
      "Sign-in is unavailable right now. Try again in a moment.",
      503,
      { cause },
    );
  }
  if (response.status >= 500)
    throw new DomainError(
      "identity_provider_unavailable",
      "Sign-in is unavailable right now. Try again in a moment.",
      503,
    );
  if (!response.ok) return null;
  const parsed = TokenResponse.safeParse(
    await response.json().catch(() => ({})),
  );
  return parsed.success ? parsed.data : null;
}

/** Ends the app's authorization at the provider with the refresh token it
 * issued to `clientId`. Apple answers 200 even for a token that is already
 * invalid (RFC 7009), so only a 200 counts there; Google answers 400
 * invalid_token for one, which counts as done. A network failure, 429 or 5xx
 * is the provider being unavailable; any other refusal means this host's
 * provider configuration is wrong and retrying alone cannot fix it. */
export async function revokeToken(
  settings: ProviderSettings,
  input: { token: string; clientId: string },
): Promise<void> {
  let response: Response;
  try {
    response = await fetch(settings.endpoints.revoke, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams(
        settings.provider === "apple"
          ? {
              client_id: input.clientId,
              client_secret: settings.clientSecret(input.clientId),
              token: input.token,
              token_type_hint: "refresh_token",
            }
          : { token: input.token },
      ),
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
  } catch (cause) {
    throw new DomainError(
      "identity_provider_unavailable",
      "The sign-in provider is unavailable right now.",
      503,
      { cause },
    );
  }
  if (response.status >= 500 || response.status === 429)
    throw new DomainError(
      "identity_provider_unavailable",
      "The sign-in provider is unavailable right now.",
      503,
    );
  if (response.ok) return;
  const error = z
    .object({ error: z.string().max(200) })
    .safeParse(await response.json().catch(() => ({})));
  if (
    settings.provider === "google" &&
    response.status === 400 &&
    error.data?.error === "invalid_token"
  )
    return;
  throw new DomainError(
    "identity_provider_revocation_refused",
    `The ${settings.provider} provider refused to revoke a token (${response.status} ${error.data?.error ?? "no error code"}).`,
    503,
  );
}
