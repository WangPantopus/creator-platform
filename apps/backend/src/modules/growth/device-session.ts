import { createHash } from "node:crypto";
import { z } from "zod";
import { copy } from "@qelvora/copy";
import { DomainError } from "../../core/errors.js";
import { requestAuthority } from "../identity/request-authority.js";
import type { GrowthDatabase } from "./database.js";

const prefix = "device-v1:";
const Registration = z.strictObject({
  version: z.literal(1),
  accountId: z.uuid(),
  sessionId: z.uuid(),
  installationId: z.uuid(),
  platform: z.enum(["ios", "android"]),
  token: z.string().min(16).max(4096),
  registrationRevision: z
    .number()
    .int()
    .min(1)
    .max(Number.MAX_SAFE_INTEGER)
    .optional(),
});

/** Captures the real request session and later checks its negative lifecycle.
 * This port never issues an Actor, creator grant or interactive ThreadScope. */
export class GrowthDeviceSessions {
  constructor(
    private readonly db: GrowthDatabase,
    private readonly seal: (value: string) => string,
    private readonly open: (value: string) => string,
  ) {}

  capture(
    accountId: string,
    token: string,
    installationId: string,
    platform: "ios" | "android",
    registrationRevision?: number,
  ) {
    const authority = requestAuthority.getStore();
    if (!authority || authority.accountId !== accountId)
      throw new DomainError(
        "device_session_required",
        copy.growthContinueWithPantopusToOpenYourAccountSCurrentState,
        401,
      );
    const registration = Registration.parse({
      version: 1,
      accountId,
      sessionId: authority.sessionId,
      installationId,
      platform,
      token,
      registrationRevision,
    });
    return prefix + this.seal(JSON.stringify(registration));
  }

  assertRegistrationRevision(
    accountId: string,
    input: {
      installationId: string;
      token: string;
      platform: string;
      permission: string;
      registrationRevision?: number;
    },
    previous: {
      encrypted_token: string;
      token_hash: string;
      installation_id: string;
      account_id: string;
      platform: string;
      permission: string;
    }[],
  ) {
    for (const row of previous) {
      if (
        row.installation_id !== input.installationId ||
        !row.encrypted_token.startsWith(prefix)
      )
        continue;
      const old = Registration.parse(
        JSON.parse(this.open(row.encrypted_token.slice(prefix.length))),
      );
      if (
        old.accountId !== row.account_id ||
        old.installationId !== row.installation_id ||
        old.platform !== row.platform ||
        createHash("sha256").update(old.token).digest("hex") !== row.token_hash
      )
        throw new DomainError(
          "device_registration_unavailable",
          copy.growthErrorGrowthAuthorityRequired,
          503,
        );
      if (!old.registrationRevision) continue;
      const revision = input.registrationRevision ?? 0;
      const same =
        old.accountId === accountId &&
        old.sessionId === requestAuthority.getStore()?.sessionId &&
        old.token === input.token &&
        old.platform === input.platform &&
        row.permission === input.permission;
      if (
        revision < old.registrationRevision ||
        (revision === old.registrationRevision && !same)
      )
        throw new DomainError(
          "device_registration_stale",
          copy.growthThisActionIsUnavailableToThisAccount,
          409,
        );
    }
  }
  revokeRegistration(encrypted: string, revision: number) {
    if (!encrypted.startsWith(prefix)) return encrypted;
    const old = Registration.parse(
      JSON.parse(this.open(encrypted.slice(prefix.length))),
    );
    if (revision < (old.registrationRevision ?? 0))
      throw new DomainError(
        "device_registration_stale",
        copy.growthThisActionIsUnavailableToThisAccount,
        409,
      );
    return (
      prefix +
      this.seal(JSON.stringify({ ...old, registrationRevision: revision }))
    );
  }

  async withCurrent<T>(
    accountId: string,
    encrypted: string,
    tokenHash: string,
    installationId: string,
    platform: string,
    work: (token: string) => Promise<T>,
  ): Promise<T | null> {
    if (!encrypted.startsWith(prefix)) return null;
    const registration = Registration.parse(
      JSON.parse(this.open(encrypted.slice(prefix.length))),
    );
    if (
      registration.accountId !== accountId ||
      registration.installationId !== installationId ||
      registration.platform !== platform ||
      createHash("sha256").update(registration.token).digest("hex") !==
        tokenHash
    )
      return null;
    return this.db.transaction(this.db.runtime, async (client) => {
      await client.query("SELECT set_config('app.account_id',$1,true)", [
        accountId,
      ]);
      const current = await client.query(
        "SELECT id FROM creator.identity_session WHERE id=$1 AND account_id=$2 AND revoked_at IS NULL AND refresh_until>clock_timestamp() FOR SHARE",
        [registration.sessionId, accountId],
      );
      if (current.rowCount !== 1) return null;
      // Access-token refresh retains this session ID. Its refresh window,
      // rather than the short access window, bounds background registration.
      // Hold through submission so a completed logout cannot be overtaken.
      return work(registration.token);
    });
  }
}
