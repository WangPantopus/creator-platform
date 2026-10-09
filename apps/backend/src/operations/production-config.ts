import { readFileSync, statSync } from "node:fs";
import { isAbsolute } from "node:path";

/** Settings of the production host (operations/production.ts). Every problem is
 * reported by the setting's name and a fixed code, never by its value: a value
 * can be a credential. A secret is given either directly (NAME) or as the path
 * of a mounted file (NAME_FILE), never both. */

export const DEPLOYMENT_ENVIRONMENTS = [
  "review",
  "staging",
  "production",
] as const;
export type DeploymentEnvironment = (typeof DEPLOYMENT_ENVIRONMENTS)[number];

export type RefusalReason = {
  code:
    | "development_configuration"
    | "missing_setting"
    | "invalid_setting"
    | "conflicting_settings"
    | "unusable_adapter"
    | "unsafe_database_role"
    | "composition_failed";
  /** The setting, adapter slot or database check this is about. */
  key: string;
  /** A fixed phrase, never a value. */
  detail?: string;
};

/** The host will not start. Carries only names and fixed codes, safe to log. */
export class ProductionRefusal extends Error {
  constructor(readonly reasons: readonly RefusalReason[]) {
    super(
      `The production host refused to start: ${reasons
        .map((reason) => `${reason.code}:${reason.key}`)
        .join(", ")}.`,
    );
    this.name = "ProductionRefusal";
  }
}

/** Any of these in a production host's environment is a development setting. */
const DEVELOPMENT_SETTINGS = [
  /^W8_LOCAL_/u,
  /^TRUST_LOCAL_DEVELOPMENT$/u,
  /^TRUST_DEVELOPMENT_/u,
  /^W2_DEVELOPMENT_/u,
  /^W3_DEVELOPMENT_/u,
  /^W3_FAN_GENERATION$/u,
  /^W3_SYNTHETIC_/u,
  /^W2_SYNTHETIC_/u,
  /^QELVORA_FAKE_/u,
  /^QELVORA_GROWTH_DEVELOPMENT$/u,
];

export type ProductionConfig = Readonly<{
  environment: DeploymentEnvironment;
  release: string;
  host: string;
  port: number;
  /** The one exact HTTPS origin of the web app. */
  origin: string;
  rpId: string;
  passkeyOrigins: readonly string[] | undefined;
  databaseUrl: string;
  /** Base64 of exactly 32 bytes. */
  identitySessionKey: string;
  adapterDirectory: string;
  adapterModule: string | undefined;
}>;

declare const __QELVORA_BUILD_REVISION__: string | undefined;

const exactHttpsOrigin = (value: string) => {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      url.pathname === "/" &&
      !url.search &&
      !url.hash &&
      url.origin === value
    );
  } catch {
    return false;
  }
};

/** WebAuthn: the relying-party id is the origin's host or a parent domain of it. */
const rpIdCovers = (rpId: string, host: string) =>
  /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/u.test(
    rpId,
  ) &&
  (host === rpId || host.endsWith(`.${rpId}`));

export function readProductionConfig(
  env: NodeJS.ProcessEnv = process.env,
  cwd: string = process.cwd(),
): ProductionConfig {
  const reasons: RefusalReason[] = [];
  const refuse = (code: RefusalReason["code"], key: string, detail?: string) =>
    reasons.push({ code, key, ...(detail ? { detail } : {}) });

  for (const key of Object.keys(env).sort())
    if (env[key] && DEVELOPMENT_SETTINGS.some((pattern) => pattern.test(key)))
      refuse("development_configuration", key);
  if (env.NODE_ENV !== "production")
    refuse(
      "development_configuration",
      "NODE_ENV",
      env.NODE_ENV ? "must_be_production" : "unset",
    );
  if (env.IDENTITY_ADAPTER !== undefined && env.IDENTITY_ADAPTER !== "pantopus")
    refuse("development_configuration", "IDENTITY_ADAPTER", "must_be_pantopus");

  /** NAME or NAME_FILE; the file is read only if it is a small regular file. */
  const secret = (name: string): string | undefined => {
    const direct = env[name];
    const path = env[`${name}_FILE`];
    if (direct && path) {
      refuse("conflicting_settings", name, "give_the_value_or_the_file");
      return undefined;
    }
    if (path) {
      if (!isAbsolute(path)) {
        refuse("invalid_setting", `${name}_FILE`, "absolute_path_required");
        return undefined;
      }
      try {
        const info = statSync(path);
        if (!info.isFile() || info.size === 0 || info.size > 8192) {
          refuse("invalid_setting", `${name}_FILE`, "not_a_small_file");
          return undefined;
        }
        return readFileSync(path, "utf8").replace(/\s+$/u, "");
      } catch {
        refuse("invalid_setting", `${name}_FILE`, "unreadable");
        return undefined;
      }
    }
    if (!direct) refuse("missing_setting", name);
    return direct || undefined;
  };

  const environment = DEPLOYMENT_ENVIRONMENTS.find(
    (name) => name === env.DEPLOYMENT_ENVIRONMENT,
  );
  if (!environment)
    refuse(
      env.DEPLOYMENT_ENVIRONMENT ? "invalid_setting" : "missing_setting",
      "DEPLOYMENT_ENVIRONMENT",
    );

  const release = env.RELEASE_REVISION ?? "";
  if (!/^[a-f0-9]{40}$/u.test(release))
    refuse(
      release ? "invalid_setting" : "missing_setting",
      "RELEASE_REVISION",
      "forty_hex_digits",
    );
  // A shipped bundle carries the commit it was built from and runs only as
  // that commit. Unbuilt source may run only as a review environment.
  if (typeof __QELVORA_BUILD_REVISION__ !== "undefined") {
    if (release !== __QELVORA_BUILD_REVISION__)
      refuse("invalid_setting", "RELEASE_REVISION", "differs_from_build");
  } else if (environment && environment !== "review")
    refuse("invalid_setting", "DEPLOYMENT_ENVIRONMENT", "unbuilt_source");

  const port = Number(env.PORT ?? 4100);
  if (!Number.isInteger(port) || port < 1024 || port > 65535)
    refuse("invalid_setting", "PORT");
  const host = env.HOST ?? "0.0.0.0";
  if (!/^[A-Za-z0-9.:-]{1,253}$/u.test(host)) refuse("invalid_setting", "HOST");

  const origin = env.WEB_ORIGIN ?? "";
  if (!exactHttpsOrigin(origin))
    refuse(
      origin ? "invalid_setting" : "missing_setting",
      "WEB_ORIGIN",
      "exact_https_origin",
    );
  const rpId = env.PASSKEY_RP_ID ?? "";
  if (origin && exactHttpsOrigin(origin)) {
    if (!rpIdCovers(rpId, new URL(origin).hostname))
      refuse(
        rpId ? "invalid_setting" : "missing_setting",
        "PASSKEY_RP_ID",
        "must_cover_the_web_origin",
      );
  }
  let passkeyOrigins: string[] | undefined;
  if (env.PASSKEY_ORIGINS) {
    passkeyOrigins = env.PASSKEY_ORIGINS.split(",").map((value) =>
      value.trim(),
    );
    if (
      !passkeyOrigins.length ||
      passkeyOrigins.some(
        (value) =>
          !exactHttpsOrigin(value) ||
          !rpIdCovers(rpId, new URL(value).hostname),
      )
    )
      refuse("invalid_setting", "PASSKEY_ORIGINS");
  }

  const databaseUrl = secret("DATABASE_URL");
  if (databaseUrl) {
    try {
      const url = new URL(databaseUrl);
      if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.username)
        refuse("invalid_setting", "DATABASE_URL", "postgres_url_with_role");
      else if (
        environment &&
        environment !== "review" &&
        !["require", "verify-ca", "verify-full"].includes(
          url.searchParams.get("sslmode") ?? "",
        )
      )
        refuse("invalid_setting", "DATABASE_URL", "tls_required");
    } catch {
      refuse("invalid_setting", "DATABASE_URL", "not_a_url");
    }
  }
  const identitySessionKey = secret("IDENTITY_SESSION_KEY");
  if (
    identitySessionKey &&
    Buffer.from(identitySessionKey, "base64").length !== 32
  )
    refuse("invalid_setting", "IDENTITY_SESSION_KEY", "thirty_two_bytes");

  const adapterModule = env.PRODUCTION_ADAPTER_MODULE || undefined;
  if (adapterModule && !/^[A-Za-z0-9._-]+\.mjs$/u.test(adapterModule))
    refuse("invalid_setting", "PRODUCTION_ADAPTER_MODULE", "plain_mjs_name");
  const adapterDirectory = env.PRODUCTION_ADAPTER_DIR || `${cwd}/integrations`;
  if (!isAbsolute(adapterDirectory))
    refuse(
      "invalid_setting",
      "PRODUCTION_ADAPTER_DIR",
      "absolute_path_required",
    );

  if (reasons.length) throw new ProductionRefusal(reasons);
  return Object.freeze({
    environment: environment!,
    release,
    host,
    port,
    origin,
    rpId,
    passkeyOrigins,
    databaseUrl: databaseUrl!,
    identitySessionKey: identitySessionKey!,
    adapterDirectory,
    adapterModule,
  });
}

/** What is safe to write to a log about a valid configuration. */
export function describeConfig(config: ProductionConfig) {
  const database = new URL(config.databaseUrl);
  return {
    environment: config.environment,
    release: config.release,
    host: config.host,
    port: config.port,
    origin: config.origin,
    database: {
      host: database.hostname,
      port: database.port || "5432",
      name: database.pathname.slice(1),
      role: decodeURIComponent(database.username),
    },
    adapterModule: config.adapterModule ?? null,
  };
}
