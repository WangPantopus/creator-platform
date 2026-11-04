// Flags a development account under 18 on lane 7's disposable stack, through
// the backend's own refusal. A development account can't be flagged, so every
// open session of the account now resolves to the under-18 development actor,
// sealed with the stack's own session key as the backend seals a session's
// identity (sessions.ts). The next resolution, at any request or at the
// realtime gateway, refuses it as D-11 and revokes it.
import { execFileSync } from "node:child_process";
import { createCipheriv, randomBytes } from "node:crypto";
import { readFileSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const UNDER_18 = "10000000-0000-4000-8000-000000000007";

/** For the stack whose PostgreSQL container is `postgres`: a function that
 * flags every open session of an account and returns how many it flagged. */
export function stackFlag(postgres) {
  // The stack's own state folder holds its IDENTITY_SESSION_KEY.
  const environment = readFileSync(
    join(
      realpathSync(tmpdir()),
      "qelvora-stack",
      postgres.replace(/^qelvora-|-postgres$/gu, ""),
      "backend.env",
    ),
    "utf8",
  );
  const key = Buffer.from(
    /^IDENTITY_SESSION_KEY=["']?([^"'\n]+)/mu.exec(environment)[1],
    "base64",
  );
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const sealed = Buffer.concat([
    iv,
    cipher.update(`development:${UNDER_18}`),
    cipher.final(),
    cipher.getAuthTag(),
  ]).toString("base64url");
  return (accountId) =>
    Number(
      execFileSync(
        "docker",
        [
          "exec",
          postgres,
          "psql",
          "-U",
          "postgres",
          "-d",
          "creator_stack",
          "-At",
          "-c",
          `WITH flagged AS (UPDATE creator.identity_session SET upstream_cipher='${sealed}' WHERE account_id='${accountId}' AND revoked_at IS NULL RETURNING 1) SELECT count(*) FROM flagged`,
        ],
        { encoding: "utf8" },
      ).trim(),
    );
}
