import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import type pg from "pg";

/** Wave-registered sources a fresh fixture never activates: migrate-trust
 * bootstraps the canonical 61 only. A source whose one dependency is the
 * canonical schema is installed from its exact registered bytes, as the full
 * host would; while it is unregistered, nothing is installed. */
export async function installRegisteredSource(admin: pg.Pool, path: string) {
  const root = new URL("../../../../", import.meta.url);
  const registry = JSON.parse(
    await readFile(new URL("infra/migrations.json", root), "utf8"),
  ) as { migrations: { path: string; sourceSha256: string }[] };
  const entry = registry.migrations.find((m) => m.path === path);
  if (!entry) return;
  const sql = await readFile(new URL(path, root), "utf8");
  if (createHash("sha256").update(sql).digest("hex") !== entry.sourceSha256)
    throw new Error(`The registered source changed: ${path}.`);
  await admin.query(sql);
}

/** Lane 4, WP 4.1: the database refuses a capture nobody accepted. */
export const CAPTURE_GUARD =
  "apps/backend/src/modules/commerce/schema-capture-guard.sql";
/** Lane 1, WP 1.5 (0256): a lost passkey retires; signing reads retired_at. */
export const PASSKEY_RETIREMENT =
  "apps/backend/src/modules/identity/pending-passkey-retirement.sql";
