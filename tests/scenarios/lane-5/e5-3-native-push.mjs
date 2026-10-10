// Real HTTP sessions/content/growth/PostgreSQL and native FCM adapter.
// Edge fakes: development identity, software passkey, completed membership
// fixtures, local FCM acceptance/offline/clock, and retry available_at clock.
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import {
  closeDb,
  delay,
  expect,
  finish,
  http,
  inbox,
  publishNote,
  runEffects,
  seedCreator,
  seedFan,
  seedMembership,
  seedTier,
  setPreferences,
  signIn,
  skip,
  sql,
  step,
  waitFor,
} from "./lib.mjs";
const gateway = async (path, method = "GET") =>
  (await fetch(`http://127.0.0.1:56453/${path}`, { method })).json();
const proofFile = "/tmp/qelvora-lane5-native-proof.json"; // IDs and counts only, no sessions/tokens.
if (process.argv.includes("--restart")) {
  const proof = JSON.parse(readFileSync(proofFile, "utf8"));
  await step(
    "E5.3-restart",
    "real host restart preserves sent and uncertain receipts without resending",
    async () => {
      await delay(7000);
      const sent = (
        await sql(
          "SELECT count(*)::int n FROM growth.provider_receipt WHERE state='sent'",
        )
      ).rows[0].n;
      const unknown = (
        await sql(
          "SELECT count(*)::int n FROM growth.provider_receipt WHERE state='unknown'",
        )
      ).rows[0].n;
      expect(
        sent === proof.sent && unknown === proof.unknown,
        `receipt counts ${sent}/${unknown}`,
      );
      expect(
        (await gateway("sent")).length === 0,
        "gateway received a repeated submission after restart",
      );
      const fan = await signIn(3610);
      expect((await inbox(fan)).length >= 3, "inbox did not survive restart");
      return `${sent} sent, ${unknown} unknown; zero new gateway submissions`;
    },
  );
  await closeDb();
  process.exit(finish());
}
const maya = await seedCreator(3600, "maya_native", "Maya");
const tier = await seedTier(maya.id, "Members");
const fan = await seedFan(3610, "fan_native");
const off = await seedFan(3611, "off_native");
const gone = await seedFan(3612, "gone_native");
const stranger = await seedFan(3613, "stranger_native");
for (const member of [fan, off, gone])
  await seedMembership(maya.id, member.id, tier);
for (const member of [fan, gone]) await setPreferences(member);
const device = (token, permission = "granted") => ({
  installationId: randomUUID(),
  platform: "android",
  token,
  permission,
  registrationRevision: 1,
});
const register = (who, value) =>
  http("PUT", "/v1/growth/devices", who.token, value);
const primary = device("lane5-primary-synthetic-token");
const secondary = device("lane5-secondary-synthetic-token");
await step(
  "E5.3-register",
  "two devices, repeated registration and token length boundary",
  async () => {
    const results = await Promise.all([
      register(fan, primary),
      register(fan, primary),
      register(fan, secondary),
    ]);
    expect(
      results.every((r) => r.status === 200),
      JSON.stringify(results),
    );
    const tooShort = await register(fan, device("short"));
    expect(tooShort.status === 400, `short token status ${tooShort.status}`);
    const count = (
      await sql(
        "SELECT count(*)::int n FROM growth.device WHERE account_id=$1",
        [fan.accountId],
      )
    ).rows[0].n;
    expect(count === 2, `stored ${count} registrations`);
    return "three concurrent calls made two rows; short token refused";
  },
);
for (const [who, value] of [
  [fan, device("invalid-lane5-synthetic-token")],
  [fan, device("denied-lane5-synthetic-token", "denied")],
  [off, device("off-lane5-synthetic-token")],
  [gone, device("signed-out-lane5-synthetic-token")],
]) {
  const r = await register(who, value);
  expect(r.status === 200, `fixture registration ${JSON.stringify(r)}`);
}
const logout = await http("POST", "/v1/identity/logout", gone.token, {});
expect(logout.status === 200, `logout ${logout.status}`);
const noticeFor = async (note) =>
  (
    await sql(
      `SELECT n.id,d.id AS delivery_id,d.state,d.attempts,d.last_error FROM growth.notification n JOIN growth.delivery d ON d.notification_id=n.id JOIN growth.producer_relay r ON r.id=n.event_id WHERE r.envelope->>'aggregateId'=$1 AND n.account_id=$2 AND d.channel='push'`,
      [note.id, fan.accountId],
    )
  ).rows[0];
const sentFor = async (note) => {
  const n = await noticeFor(note);
  return (
    n &&
    (await gateway("sent")).filter(
      (x) => x.message.data.notificationId === n.id,
    )
  );
};
const settled = (note) =>
  waitFor(
    "native delivery",
    async () => (await noticeFor(note))?.state === "sent",
    40000,
  );
const first = await publishNote(
  maya,
  "Private member words never belong in push data.",
  { kind: "members" },
);
await step(
  "E5.3-offline",
  "native adapter accepts opaque IDs for two offline devices",
  async () => {
    await settled(first);
    const submitted = await sentFor(first);
    expect(submitted.length === 2, `submissions ${submitted.length}`);
    expect(
      (await gateway("delivered")).length === 0,
      "offline device already received data",
    );
    for (const { message } of submitted) {
      expect(message.android.ttl === "86400s", `TTL ${message.android.ttl}`);
      expect(
        Object.keys(message.data).join() === "notificationId" &&
          !message.notification,
        "push includes display words",
      );
      expect(
        !/Private member|Maya|creators|preview/u.test(JSON.stringify(message)),
        "payload leaks content or destination",
      );
    }
    await gateway("online", "PUT");
    expect(
      (await gateway("delivered")).length === 2,
      "retained IDs not released on reconnect",
    );
    return "two retained IDs; 86400-second TTL; zero display words; two released on reconnect";
  },
);
await step(
  "E5.3-controls",
  "permission denied, default push off, signed-out and invalid devices get no submission",
  async () => {
    const all = await gateway("sent");
    expect(
      all.every((x) =>
        [primary.token, secondary.token].includes(x.message.token),
      ),
      "an ineligible registration was submitted",
    );
    const revoked = (
      await sql(
        "SELECT count(*)::int n FROM growth.device WHERE revoked_at IS NOT NULL",
      )
    ).rows[0].n;
    const invalid = (
      await sql(
        "SELECT count(*)::int n FROM growth.provider_receipt WHERE state='invalid'",
      )
    ).rows[0].n;
    expect(
      revoked >= 3 && invalid === 1,
      `revoked=${revoked} invalid=${invalid}`,
    );
    expect(
      (await http("GET", "/v1/growth/notifications", gone.token)).status ===
        401,
      "signed-out session still works",
    );
    return `${revoked} revoked/denied registrations; one invalid-token receipt`;
  },
);
await step(
  "E5.3-tap",
  "ID lookup requires the current recipient; three repeated effects do not resend",
  async () => {
    const n = await noticeFor(first);
    const own = await http(
      "GET",
      `/v1/growth/notifications/${n.id}`,
      fan.token,
    );
    const wrong = await http(
      "GET",
      `/v1/growth/notifications/${n.id}`,
      stranger.token,
    );
    const anonymous = await http("GET", `/v1/growth/notifications/${n.id}`);
    expect(
      own.status === 200 && wrong.status === 404 && anonymous.status === 401,
      `statuses ${own.status}/${wrong.status}/${anonymous.status}`,
    );
    expect(
      (
        await Promise.all([
          runEffects(maya),
          runEffects(maya),
          runEffects(maya),
        ])
      ).every((r) => r.status === 200),
      "effects failed",
    );
    await delay(2500);
    expect((await sentFor(first)).length === 2, "duplicate native submission");
    return "recipient 200, wrong account 404, anonymous 401; unchanged two submissions";
  },
);
await step(
  "E5.3-withdrawn",
  "an already submitted ID stops resolving after its Note is withdrawn",
  async () => {
    const n = await noticeFor(first);
    const r = await http(
      "POST",
      `/v1/content/${maya.id}/${first.id}/unpublish`,
      maya.token,
      { version: 1, idempotencyKey: `unpublish-${first.id}` },
    );
    expect(r.status === 200, `unpublish ${r.status}`);
    const gone = await http(
      "GET",
      `/v1/growth/notifications/${n.id}`,
      fan.token,
    );
    expect(gone.status === 404, `withdrawn ID lookup ${gone.status}`);
    expect(
      (await sentFor(first)).length === 2,
      "withdrawal caused another submission",
    );
    return "unpublish 200; old push ID 404; no new submission";
  },
);
await step(
  "E5.3-expiry",
  "fake gateway expires the ID at one day while offline",
  async () => {
    await gateway("offline", "PUT");
    const second = await publishNote(maya, "A second member Note.", {
      kind: "members",
    });
    await settled(second);
    const before = (await gateway("delivered")).length;
    await gateway("advance-day", "PUT");
    await gateway("online", "PUT");
    expect(
      (await gateway("delivered")).length === before,
      "expired IDs delivered",
    );
    return "two accepted IDs expired; neither released";
  },
);
await step(
  "E5.3-retry",
  "gateway 503 is retried after recovery without duplicate acceptance",
  async () => {
    await gateway("down", "PUT");
    const third = await publishNote(maya, "A third member Note.", {
      kind: "members",
    });
    const failed = await waitFor(
      "503 attempt",
      async () => {
        const n = await noticeFor(third);
        return n?.state === "queued" && n.attempts > 0 && n.last_error && n;
      },
      30000,
    );
    expect((await sentFor(third)).length === 0, "accepted during outage");
    await gateway("up", "PUT");
    // Outer-edge clock: make the scheduled retry due without waiting a minute.
    await sql("UPDATE growth.delivery SET available_at=now() WHERE id=$1", [
      failed.delivery_id,
    ]);
    await settled(third);
    expect(
      (await sentFor(third)).length === 2,
      "not exactly one accepted submission per device",
    );
    return "503 queued with no acceptance; recovery accepted each device once";
  },
);
await step(
  "E5.3-unknown",
  "missing provider receipt stays uncertain and never resends",
  async () => {
    await gateway("unknown", "PUT");
    const fourth = await publishNote(maya, "A fourth member Note.", {
      kind: "members",
    });
    const n = await waitFor(
      "uncertain receipt",
      async () => {
        const n = await noticeFor(fourth);
        return (
          n &&
          (
            await sql(
              "SELECT 1 FROM growth.provider_receipt WHERE delivery_id=$1 AND state='unknown'",
              [n.delivery_id],
            )
          ).rowCount &&
          n
        );
      },
      30000,
    );
    expect(
      (await sentFor(fourth)).length === 1,
      "unexpected uncertain submission count",
    );
    await gateway("up", "PUT");
    await sql("UPDATE growth.delivery SET available_at=now() WHERE id=$1", [
      n.delivery_id,
    ]);
    await delay(4000);
    expect((await sentFor(fourth)).length === 1, "uncertain delivery resent");
    return "one uncertain receipt retained; no replay";
  },
);
const counts = (
  await sql(
    "SELECT count(*) FILTER(WHERE state='sent')::int sent,count(*) FILTER(WHERE state='unknown')::int unknown FROM growth.provider_receipt",
  )
).rows[0];
writeFileSync(proofFile, JSON.stringify(counts));
skip(
  "E5.3-device",
  "real Android offline delivery and OS presentation",
  "local gateway only; no physical device or Google account",
);
skip(
  "E5.3-ios",
  "iOS retained push",
  "founder approved hold pending lane 7 safe background presentation",
);
await closeDb();
process.exit(finish());
