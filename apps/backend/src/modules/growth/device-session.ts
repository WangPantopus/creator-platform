import { createHash } from "node:crypto";
import { z } from "zod";
import { copy } from "@qelvora/copy";
import { DomainError } from "../../core/errors.js";
import { requestAuthority } from "../identity/request-authority.js";
import type { GrowthDatabase } from "./database.js";

const prefix = "device-v1:";
const tombstonePrefix = "device-tombstone-v1:";
const Revision = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);
const Tombstone = z.strictObject({
  version: z.literal(1),
  accountId: z.uuid(),
  installationId: z.uuid(),
  platform: z.enum(["ios", "android"]),
  registrationRevision: Revision,
});
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
    private readonly tombstoneHash: (
      accountId: string,
      installationId: string,
    ) => string,
  ) {}

  capture(
    accountId: string,
    token: string,
    installationId: string,
    platform: "ios" | "android",
    registrationRevision: number,
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
      registrationRevision: Revision.parse(registrationRevision),
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
      registrationRevision: number;
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
    const replay = previous.some((row) => {
      if (
        row.account_id !== accountId ||
        row.installation_id !== input.installationId ||
        !row.encrypted_token.startsWith(prefix)
      )
        return false;
      const old = Registration.parse(
        JSON.parse(this.open(row.encrypted_token.slice(prefix.length))),
      );
      return (
        old.accountId === accountId &&
        old.installationId === row.installation_id &&
        old.sessionId === requestAuthority.getStore()?.sessionId &&
        old.registrationRevision === input.registrationRevision &&
        old.token === input.token &&
        old.platform === input.platform &&
        row.platform === input.platform &&
        row.permission === input.permission &&
        createHash("sha256").update(old.token).digest("hex") === row.token_hash
      );
    });
    for (const row of previous) {
      if (row.installation_id !== input.installationId) continue;
      if (row.encrypted_token.startsWith(tombstonePrefix)) {
        const old = Tombstone.parse(
          JSON.parse(
            this.open(row.encrypted_token.slice(tombstonePrefix.length)),
          ),
        );
        if (
          old.accountId !== row.account_id ||
          old.installationId !== row.installation_id ||
          old.platform !== row.platform ||
          row.token_hash !==
            this.tombstoneHash(row.account_id, row.installation_id)
        )
          throw new DomainError(
            "device_registration_unavailable",
            copy.growthErrorGrowthAuthorityRequired,
            503,
          );
        const deniedReplay =
          old.accountId === accountId &&
          old.platform === input.platform &&
          input.permission === "denied";
        if (
          input.registrationRevision < old.registrationRevision ||
          (input.registrationRevision === old.registrationRevision &&
            !replay &&
            !deniedReplay)
        )
          throw new DomainError(
            "device_registration_stale",
            copy.growthThisActionIsUnavailableToThisAccount,
            409,
          );
        continue;
      }
      if (!row.encrypted_token.startsWith(prefix)) continue;
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
  tombstone(
    accountId: string,
    installationId: string,
    platform: "ios" | "android",
    revision: number,
  ) {
    const value = Tombstone.parse({
      version: 1,
      accountId,
      installationId,
      platform,
      registrationRevision: revision,
    });
    return {
      encrypted: tombstonePrefix + this.seal(JSON.stringify(value)),
      hash: this.tombstoneHash(accountId, installationId),
    };
  }
  revision(row: {
    encrypted_token: string;
    token_hash: string;
    account_id: string;
    installation_id: string;
    platform: string;
  }) {
    const encrypted = row.encrypted_token;
    if (encrypted.startsWith(tombstonePrefix)) {
      const value = Tombstone.parse(
        JSON.parse(this.open(encrypted.slice(tombstonePrefix.length))),
      );
      if (
        value.accountId !== row.account_id ||
        value.installationId !== row.installation_id ||
        value.platform !== row.platform ||
        row.token_hash !==
          this.tombstoneHash(row.account_id, row.installation_id)
      )
        throw new DomainError(
          "device_registration_unavailable",
          copy.growthErrorGrowthAuthorityRequired,
          503,
        );
      return value.registrationRevision;
    }
    if (encrypted.startsWith(prefix)) {
      const value = Registration.parse(
        JSON.parse(this.open(encrypted.slice(prefix.length))),
      );
      if (
        value.accountId !== row.account_id ||
        value.installationId !== row.installation_id ||
        value.platform !== row.platform ||
        createHash("sha256").update(value.token).digest("hex") !==
          row.token_hash
      )
        throw new DomainError(
          "device_registration_unavailable",
          copy.growthErrorGrowthAuthorityRequired,
          503,
        );
      return value.registrationRevision ?? 0;
    }
    return 0;
  }
  async withCurrent<T>(
    accountId: string,
    encrypted: string,
    tokenHash: string,
    installationId: string,
    platform: string,
    work: (token: string, signal: AbortSignal) => Promise<T>,
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
    const signal = AbortSignal.timeout(10000);
    const current = await this.db.transaction(
      this.db.runtime,
      async (client) => {
        await client.query("SELECT set_config('app.account_id',$1,true)", [
          accountId,
        ]);
        const binding = await client.query(
          `SELECT s.id FROM creator.identity_session s
           WHERE s.id=$1 AND s.account_id=$2 AND s.revoked_at IS NULL AND s.refresh_until>clock_timestamp()
           AND EXISTS(SELECT FROM growth.device d WHERE d.account_id=$2 AND d.installation_id=$3 AND d.platform=$4
             AND d.token_hash=$5 AND d.encrypted_token=$6 AND d.permission='granted' AND d.revoked_at IS NULL
             AND d.updated_at>clock_timestamp()-interval '270 days')`,
          [
            registration.sessionId,
            accountId,
            installationId,
            platform,
            tokenHash,
            encrypted,
          ],
        );
        // Access-token refresh retains this session ID. Its refresh window,
        // rather than the short access window, bounds background registration.
        return binding.rowCount === 1;
      },
      signal,
    );
    if (!current) return null;
    // Release the connection before external I/O. This is a fresh submission
    // check, not a promise that a provider can recall an accepted message.
    signal.throwIfAborted();
    return work(registration.token, signal);
  }
}
