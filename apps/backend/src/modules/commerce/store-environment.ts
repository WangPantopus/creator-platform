import { readFileSync } from "node:fs";
import type { Pool } from "pg";
import { z } from "zod";
import { invariant } from "../../core/errors.js";
import { StoreCatalog, StoreMembershipProviders } from "./stores.js";
import { AppleStoreMembership } from "./apple-store.js";
import { GoogleStoreMembership } from "./google-store.js";

/** Private project/configuration files stay server-side and outside the repo. */
export function readStoreEnvironment(pool: Pool, env: NodeJS.ProcessEnv) {
  const configured = Boolean(
    env.COMMERCE_APPLE_CONFIG_PATH || env.COMMERCE_GOOGLE_CONFIG_PATH,
  );
  if (!configured) return undefined;
  invariant(
    env.COMMERCE_STORE_PRODUCTS_PATH,
    "store_catalog_unconfigured",
    "Configure approved store products with their immutable creator/tier bindings.",
  );
  const catalog = new StoreCatalog(
    pool,
    JSON.parse(readFileSync(env.COMMERCE_STORE_PRODUCTS_PATH!, "utf8")),
  );
  const appleConfig = env.COMMERCE_APPLE_CONFIG_PATH
    ? z
        .strictObject({
          privateKeyPath: z.string().min(1),
          keyId: z.string().min(1),
          issuerId: z.uuid(),
          bundleId: z.string().min(1),
          rootCertificatePaths: z.array(z.string().min(1)).min(1).max(10),
        })
        .parse(JSON.parse(readFileSync(env.COMMERCE_APPLE_CONFIG_PATH, "utf8")))
    : undefined;
  const googleConfig = env.COMMERCE_GOOGLE_CONFIG_PATH
    ? z
        .strictObject({
          keyFile: z.string().min(1),
          packageName: z.string().min(1),
          notificationAudience: z.url(),
          notificationServiceAccount: z.email(),
        })
        .parse(
          JSON.parse(readFileSync(env.COMMERCE_GOOGLE_CONFIG_PATH, "utf8")),
        )
    : undefined;
  const apple = appleConfig
    ? new AppleStoreMembership(catalog, {
        ...appleConfig,
        privateKey: readFileSync(appleConfig.privateKeyPath, "utf8"),
        rootCertificates: appleConfig.rootCertificatePaths.map((path) =>
          readFileSync(path),
        ),
      })
    : undefined;
  const google = googleConfig
    ? new GoogleStoreMembership(catalog, googleConfig)
    : undefined;
  return {
    stores: new StoreMembershipProviders({
      ...(apple ? { apple } : {}),
      ...(google ? { google } : {}),
    }),
    apple,
    google,
  };
}
