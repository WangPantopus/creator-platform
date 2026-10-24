// Stock server/PostgreSQL. Synthetic browser crypto is an outer-edge fixture;
// no fake identity session, registration writer or privacy reader.
import { createECDH, randomBytes, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { ACTORS, call, signIn } from "../lane-2/lib.mjs";
import { expect, step, finish, skip } from "./lib.mjs";
const require = createRequire(
  new URL("../../../apps/backend/package.json", import.meta.url),
);
const { Pool } = require("pg");
const db = new Pool({
  connectionString:
    "postgresql://postgres:foundation-test-only@127.0.0.1:56450/creator_stack",
  max: 2,
});
const api = "http://127.0.0.1:56451";
try {
  const owner = await signIn(api, ACTORS.maya, "/studio/launch");
  const fan = await signIn(api, ACTORS.fanOne);
  const key = createECDH("prime256v1");
  key.generateKeys();
  const installationId = randomUUID();
  const body = {
    installationId,
    platform: "web",
    permission: "granted",
    registrationRevision: 1,
    token: JSON.stringify({
      endpoint: `https://fcm.googleapis.com/wp/lane5-stock-${randomUUID()}`,
      expirationTime: null,
      keys: {
        p256dh: key.getPublicKey().toString("base64url"),
        auth: randomBytes(16).toString("base64url"),
      },
    }),
  };
  const register = (token, value = body) =>
    call(api, "PUT", "/v1/growth/devices", { token, body: value });
  await step(
    "E5.4-stock-registration",
    "real stock creator session registers once; fan and anonymous refused",
    async () => {
      expect((await register(undefined)).status === 401, "anonymous accepted");
      expect((await register(fan.token)).status === 403, "fan accepted");
      const results = await Promise.all([
        register(owner.token),
        register(owner.token),
      ]);
      expect(
        results.every((r) => r.status === 200),
        results.map((r) => `${r.status} ${r.text}`).join(),
      );
      const rows = (
        await db.query(
          "SELECT platform,permission,encrypted_token LIKE 'device-v1:%' AS encrypted FROM growth.device WHERE account_id=$1 AND installation_id=$2",
          [ACTORS.maya, installationId],
        )
      ).rows;
      expect(
        rows.length === 1 &&
          rows[0].platform === "web" &&
          rows[0].permission === "granted" &&
          rows[0].encrypted,
        "stock encrypted binding differs",
      );
      return "two 200s, one encrypted web registration; fan 403; anonymous 401";
    },
  );
  await step(
    "E5.4-stock-revocation",
    "owner revokes by installation ID; stale register cannot restore; newer choice works",
    async () => {
      const revoked = await call(
        api,
        "DELETE",
        `/v1/growth/devices/${installationId}`,
        {
          token: owner.token,
          body: { registrationRevision: 2, platform: "web" },
        },
      );
      expect(
        revoked.status === 200,
        `revoke ${revoked.status}: ${revoked.text}`,
      );
      const row = (
        await db.query(
          "SELECT permission,revoked_at IS NOT NULL revoked FROM growth.device WHERE account_id=$1 AND installation_id=$2",
          [ACTORS.maya, installationId],
        )
      ).rows[0];
      expect(
        row.permission === "denied" && row.revoked,
        "revocation not stored",
      );
      const stale = await register(owner.token);
      expect(
        stale.status === 409 &&
          stale.json?.error?.code === "device_registration_stale",
        `stale ${stale.status}: ${stale.text}`,
      );
      expect(
        (await register(owner.token, { ...body, registrationRevision: 3 }))
          .status === 200,
        "newer choice refused",
      );
      return "DELETE 200; stored denied/revoked; stale 409; newer revision 200";
    },
  );
  await step(
    "E5.4-stock-signout",
    "revoked real session cannot register again",
    async () => {
      expect(
        (
          await call(api, "POST", "/v1/identity/logout", {
            token: owner.token,
            body: {},
          })
        ).status === 200,
        "logout failed",
      );
      expect(
        (await register(owner.token, { ...body, registrationRevision: 4 }))
          .status === 401,
        "signed-out session still registers",
      );
      return "logout 200; old session registration 401";
    },
  );
  skip(
    "E5.4-stock-delivery",
    "real stock provider delivery and browser display",
    "integrator provider composition and lane 6 service worker still absent; separate gateway scenario proves transport only",
  );
} finally {
  await db.end();
}
process.exitCode = finish();
