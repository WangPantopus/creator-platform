import { z } from "zod";

const ConfigSchema = z.strictObject({
  port: z.coerce.number().int().min(1).max(65535).default(4100),
  featureEnabled: z.boolean().default(false),
  databaseUrl: z.string().min(1).optional(),
  allowedOrigin: z.url().default("http://localhost:3000"),
  rpId: z.string().default("localhost"),
  identityAdapter: z
    .enum(["unconfigured", "development", "pantopus"])
    .optional(),
  identitySessionKey: z.string().optional(),
  passkeyOrigins: z.array(z.string()).optional(),
});
export type BackendConfig = z.infer<typeof ConfigSchema>;
export function readConfig(
  env: NodeJS.ProcessEnv = process.env,
): BackendConfig {
  if (
    env.CREATOR_FEATURE_ENABLED !== undefined &&
    !["true", "false"].includes(env.CREATOR_FEATURE_ENABLED)
  )
    throw new Error("CREATOR_FEATURE_ENABLED must be true or false");
  return ConfigSchema.parse({
    port: env.PORT ?? 4100,
    featureEnabled: env.CREATOR_FEATURE_ENABLED === "true",
    ...(env.DATABASE_URL ? { databaseUrl: env.DATABASE_URL } : {}),
    allowedOrigin: env.WEB_ORIGIN ?? "http://localhost:3000",
    rpId: env.PASSKEY_RP_ID ?? "localhost",
    identityAdapter: env.IDENTITY_ADAPTER ?? "unconfigured",
    ...(env.IDENTITY_SESSION_KEY
      ? { identitySessionKey: env.IDENTITY_SESSION_KEY }
      : {}),
    ...(env.PASSKEY_ORIGINS
      ? { passkeyOrigins: env.PASSKEY_ORIGINS.split(",") }
      : {}),
  });
}
