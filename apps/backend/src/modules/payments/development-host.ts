import pg from "pg";
import type { Router } from "express";
import type { BackendConfig } from "../../config.js";
import type { BackendRuntime } from "../../integration.js";
import type { CommerceService } from "../commerce/service.js";
import type { PantopusIdentityAdapter } from "../identity/adapter.js";
import { createStripeInboxRouter } from "./inbox.js";
import { createDevelopmentCommerceRecovery } from "./recovery.js";

type Recovery = Awaited<ReturnType<typeof createDevelopmentCommerceRecovery>>;

function flag(env: NodeJS.ProcessEnv, name: string, fallback: boolean) {
  const value = env[name];
  if (value === undefined) return fallback;
  if (value === "true" || value === "false") return value === "true";
  throw new Error(`${name} must be true or false.`);
}

function loopbackDatabase(value: string | undefined) {
  if (!value) return false;
  try {
    const url = new URL(value);
    return (
      ["postgres:", "postgresql:"].includes(url.protocol) &&
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) &&
      !url.search &&
      !url.hash
    );
  } catch {
    return false;
  }
}

/**
 * The stock development host owns recovery alongside its actual commerce
 * service. It never creates another service, identity directory or database.
 * The optional inbox URL is a separate restricted claimant; the due scan does
 * not need it. Production hosts need their own issued work index and authority.
 */
export async function createDevelopmentCommerceHost(input: {
  config: BackendConfig;
  runtime: BackendRuntime;
  identity: PantopusIdentityAdapter;
  service: CommerceService;
  /** Mounted by createConfiguredBackend before its JSON/session middleware. */
  stripeIngress: Router;
  env?: NodeJS.ProcessEnv;
}) {
  const env = input.env ?? process.env;
  const enabled = flag(env, "COMMERCE_RECOVERY_ENABLED", true);
  if (
    env.NODE_ENV !== "development" ||
    input.identity.mode !== "development" ||
    input.config.identityAdapter !== "development" ||
    !loopbackDatabase(input.config.databaseUrl) ||
    (env.COMMERCE_INBOX_DATABASE_URL &&
      !loopbackDatabase(env.COMMERCE_INBOX_DATABASE_URL))
  )
    throw new Error(
      "The development commerce host requires development identity and loopback databases.",
    );
  const intervalMs = Number(env.COMMERCE_RECOVERY_INTERVAL_MS ?? 15_000);
  if (
    !Number.isSafeInteger(intervalMs) ||
    intervalMs < 200 ||
    intervalMs > 300_000
  )
    throw new Error(
      "COMMERCE_RECOVERY_INTERVAL_MS must be an integer from 200 to 300000.",
    );
  if (!enabled && env.COMMERCE_INBOX_DATABASE_URL)
    throw new Error(
      "The commerce inbox claimant requires commerce recovery to be enabled.",
    );
  if (env.COMMERCE_INBOX_DATABASE_URL) {
    const core = new URL(input.config.databaseUrl!);
    const claimant = new URL(env.COMMERCE_INBOX_DATABASE_URL);
    if (
      claimant.hostname !== core.hostname ||
      (claimant.port || "5432") !== (core.port || "5432") ||
      claimant.pathname !== core.pathname ||
      !claimant.username ||
      claimant.username === core.username
    )
      throw new Error(
        "The commerce inbox must use a separate restricted login on the canonical database.",
      );
  }

  // Ingress is independent of claiming: verified notifications can wait in the
  // inbox while the unregistered claimant role is unavailable. Due recovery
  // still queries the provider's current state instead of trusting event order.
  if (env.STRIPE_WEBHOOK_SECRET)
    input.stripeIngress.use(
      createStripeInboxRouter(
        input.runtime.pool,
        env.STRIPE_WEBHOOK_SECRET,
        env.STRIPE_COLLECTION_ACCOUNT ?? "platform",
      ),
    );
  let inbox: pg.Pool | undefined;
  let recovery: Recovery | undefined;
  let closing: Promise<void> | undefined;
  const close = () => {
    closing ??= (async () => {
      try {
        await recovery?.close();
      } finally {
        await inbox?.end();
      }
    })();
    return closing;
  };
  try {
    if (enabled && env.COMMERCE_INBOX_DATABASE_URL) {
      inbox = new pg.Pool({
        connectionString: env.COMMERCE_INBOX_DATABASE_URL,
        max: 2,
        connectionTimeoutMillis: 5000,
        statement_timeout: 5000,
      });
      // pg discards failed idle clients before emitting. Do not let a dropped
      // inbox connection kill the host, and never log its connection details.
      inbox.on("error", () => {
        console.error(
          "An idle commerce inbox connection failed and was discarded.",
        );
      });
      const role = (
        await inbox.query<{ qualified: boolean }>(
          `SELECT session_user=current_user AND r.rolcanlogin AND r.rolname='creator_commerce_inbox'
            AND NOT (r.rolsuper OR r.rolcreatedb OR r.rolcreaterole OR r.rolinherit OR r.rolbypassrls OR r.rolreplication)
            AND NOT EXISTS(SELECT 1 FROM pg_auth_members m WHERE m.member=r.oid)
            AND NOT EXISTS(SELECT 1 FROM pg_class c WHERE c.relowner=r.oid)
            AND NOT EXISTS(SELECT 1 FROM pg_namespace n WHERE n.nspowner=r.oid)
            AND NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.proowner=r.oid)
            AND has_schema_privilege(current_user,'creator','USAGE')
            AND NOT has_schema_privilege(current_user,'creator','CREATE')
            AND NOT EXISTS(SELECT FROM unnest(ARRAY['provider','event_id','event_type','object_ref','received_at','state','lease_until','attempt']) needed(name)
              WHERE NOT has_column_privilege(current_user,'creator.commerce_provider_inbox',needed.name,'SELECT'))
            AND NOT EXISTS(SELECT FROM unnest(ARRAY['state','lease_until','attempt','error_code']) needed(name)
              WHERE NOT has_column_privilege(current_user,'creator.commerce_provider_inbox',needed.name,'UPDATE'))
            AND NOT has_table_privilege(current_user,'creator.commerce_provider_inbox','INSERT,DELETE,TRUNCATE,REFERENCES,TRIGGER')
            AND NOT EXISTS(SELECT FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace,
              LATERAL aclexplode(c.relacl) a WHERE n.nspname IN('creator','growth','creator_trust') AND a.grantee=r.oid)
            AND NOT EXISTS(SELECT FROM pg_attribute att JOIN pg_class c ON c.oid=att.attrelid
              JOIN pg_namespace n ON n.oid=c.relnamespace,LATERAL aclexplode(att.attacl) a
              WHERE n.nspname IN('creator','growth','creator_trust') AND a.grantee=r.oid
                AND (n.nspname<>'creator' OR c.relname<>'commerce_provider_inbox' OR a.is_grantable
                  OR NOT ((a.privilege_type='SELECT' AND att.attname=ANY(ARRAY['provider','event_id','event_type','object_ref','received_at','state','lease_until','attempt']))
                    OR (a.privilege_type='UPDATE' AND att.attname=ANY(ARRAY['state','lease_until','attempt','error_code'])))))
            AND NOT EXISTS(SELECT FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace,
              LATERAL aclexplode(p.proacl) a WHERE n.nspname IN('creator','growth','creator_trust') AND a.grantee=r.oid) AS qualified
           FROM pg_roles r WHERE r.rolname=current_user`,
        )
      ).rows[0];
      if (!role?.qualified)
        throw new Error(
          "Commerce notification claiming requires the restricted creator_commerce_inbox login.",
        );
    }
    if (enabled)
      recovery = await createDevelopmentCommerceRecovery({
        service: input.service,
        pool: input.runtime.pool,
        identity: input.identity,
        intervalMs,
        ...(inbox ? { inbox } : {}),
      });
    return {
      start() {
        if (closing || !recovery) return;
        recovery.start();
        process.stdout.write(
          `Commerce scheduler: a recovery pass every ${intervalMs} ms on the development database${inbox ? ", claiming notifications" : ""}.\n`,
        );
      },
      close,
    };
  } catch (error) {
    try {
      await close();
    } catch (cleanup) {
      throw new AggregateError(
        [error, cleanup],
        "Commerce development host preparation and cleanup failed.",
      );
    }
    throw error;
  }
}
