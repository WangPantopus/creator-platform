// Real server/PostgreSQL/identity/content/notification worker/web-push crypto.
// Edge fakes: development identity/software passkey, membership/verification
// fixtures, browser subscription/push gateway and scheduled retry clock only.
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
const proofFile = "/tmp/qelvora-lane5-web-push-proof.json"; // Counts only.
if (process.argv.includes("--restart")) {
  const proof = JSON.parse(readFileSync(proofFile, "utf8"));
  await step(
    "E5.4-web-restart",
    "restart preserves completed/uncertain receipts and encrypted registrations",
    async () => {
      await delay(5000);
      const counts = (
        await sql(
          "SELECT count(*) FILTER(WHERE state='sent')::int sent,count(*) FILTER(WHERE state='unknown')::int unknown FROM growth.provider_receipt",
        )
      ).rows[0];
      expect(
        JSON.stringify(counts) === JSON.stringify(proof),
        "receipt counts changed",
      );
      expect((await gateway("sent")).length === 0, "restart resent a push");
      expect(
        (await inbox(await signIn(3710))).length >= 2,
        "notices lost on restart",
      );
      return `${counts.sent} sent, ${counts.unknown} unknown; no new submissions`;
    },
  );
  await closeDb();
  process.exit(finish());
}
const author = await seedCreator(3700, "author_webpush", "Author");
const tier = await seedTier(author.id, "Members");
const recipients = [];
for (const [i, name] of ["creator", "off", "gone"].entries()) {
  await seedCreator(3710 + i, `${name}_webpush`, name);
  const fan = await seedFan(3710 + i, `${name}_webpush_fan`);
  await seedMembership(author.id, fan.id, tier);
  recipients.push(fan);
}
const [creator, off, gone] = recipients;
const ordinary = await seedFan(3713, "ordinary_webpush");
await setPreferences(creator);
await setPreferences(gone);
const registration = async (name, permission = "granted") => ({
  installationId: randomUUID(),
  platform: "web",
  token: JSON.stringify(await gateway(`subscription/${name}`)),
  permission,
  registrationRevision: 1,
});
const register = (who, input) =>
  http("PUT", "/v1/growth/devices", who.token, input);
const primary = await registration("primary");
const secondary = await registration("secondary");
await step(
  "E5.4-web-registration",
  "current creator can register two browsers; fan cannot; repeated registration is one row",
  async () => {
    const results = await Promise.all([
      register(creator, primary),
      register(creator, primary),
      register(creator, secondary),
    ]);
    expect(
      results.every((r) => r.status === 200),
      results.map((r) => r.status).join(),
    );
    expect(
      (await register(ordinary, await registration("fan"))).status === 403,
      "ordinary fan registered creator web push",
    );
    const row = (
      await sql(
        "SELECT count(*)::int n,bool_and(encrypted_token LIKE 'device-v1:%' AND encrypted_token NOT LIKE '%fcm.googleapis.com%') encrypted FROM growth.device WHERE account_id=$1",
        [creator.accountId],
      )
    ).rows[0];
    expect(
      row.n === 2 && row.encrypted,
      "subscription not stored as two encrypted session bindings",
    );
    return "three successful calls, two encrypted rows; fan 403";
  },
);
await step(
  "E5.4-web-boundary",
  "reject private/unknown/credential endpoints, malformed key and malformed JSON",
  async () => {
    const base = JSON.parse(primary.token);
    for (const endpoint of [
      "http://127.0.0.1/internal",
      "https://127.0.0.1/internal",
      "https://example.com/push",
      "https://fcm.googleapis.com@localhost/push",
      "https://fcm.googleapis.com:8443/push",
      "https://fcm.googleapis.com/push#fragment",
    ]) {
      expect(
        (
          await register(creator, {
            ...primary,
            installationId: randomUUID(),
            token: JSON.stringify({ ...base, endpoint }),
          })
        ).status === 400,
        "unsafe endpoint accepted",
      );
    }
    expect(
      (
        await register(creator, {
          ...primary,
          token: JSON.stringify({
            ...base,
            keys: { ...base.keys, p256dh: "A".repeat(87) },
          }),
        })
      ).status === 400,
      "bad curve key accepted",
    );
    expect(
      (
        await register(creator, {
          ...primary,
          token: "invalid subscription JSON",
        })
      ).status === 400,
      "malformed JSON accepted",
    );
    return "eight invalid subscriptions refused; no network dispatch";
  },
);
for (const [who, name, permission] of [
  [creator, "invalid", "granted"],
  [creator, "denied", "denied"],
  [off, "off", "granted"],
  [gone, "gone", "granted"],
]) {
  const r = await register(who, await registration(name, permission));
  expect(r.status === 200, `register ${name} ${r.status}`);
}
expect(
  (await http("POST", "/v1/identity/logout", gone.token, {})).status === 200,
  "logout failed",
);
const noticeFor = async (note) =>
  (
    await sql(
      "SELECT n.id,d.id delivery_id,d.state,d.attempts,d.last_error FROM growth.notification n JOIN growth.delivery d ON d.notification_id=n.id JOIN growth.producer_relay r ON r.id=n.event_id WHERE r.envelope->>'aggregateId'=$1 AND n.account_id=$2 AND d.channel='push'",
      [note.id, creator.accountId],
    )
  ).rows[0];
const submitted = async (note) => {
  const n = await noticeFor(note);
  return n && (await gateway("sent")).filter((x) => x.notificationId === n.id);
};
const settled = (note) =>
  waitFor(
    "web push settled",
    async () => (await noticeFor(note))?.state === "sent",
    30000,
  );
const first = await publishNote(
  author,
  "Private words must not leave the real account read.",
  { kind: "members" },
);
await step(
  "E5.4-web-crypto",
  "two browsers receive encrypted opaque IDs with verified VAPID signatures",
  async () => {
    await settled(first);
    const sent = await submitted(first);
    expect(
      sent.length === 2 &&
        sent.every((s) => s.encrypted && s.vapidVerified && s.ttl === "86400"),
      "encrypted delivery not proven",
    );
    expect(
      sent
        .map((s) => s.browser)
        .sort()
        .join() === "primary,secondary",
      "ineligible browser received data",
    );
    const invalid = (
      await sql(
        "SELECT count(*)::int n FROM growth.provider_receipt WHERE state='invalid'",
      )
    ).rows[0].n;
    expect(invalid === 1, "410 token not invalidated");
    const revoked = (
      await sql(
        "SELECT count(*)::int n FROM growth.device WHERE revoked_at IS NOT NULL",
      )
    ).rows[0].n;
    expect(revoked >= 3, "denied, signed-out, invalid bindings not retired");
    return "two decrypted IDs; signature/audience/expiry verified; invalid 410 revoked; no private words in encrypted message";
  },
);
await step(
  "E5.4-web-repeat",
  "racing effects do not resend; wrong account cannot resolve ID; withdrawal hides old ID",
  async () => {
    const n = await noticeFor(first);
    expect(
      (await http("GET", `/v1/growth/notifications/${n.id}`, creator.token))
        .status === 200,
      "recipient lookup failed",
    );
    expect(
      (await http("GET", `/v1/growth/notifications/${n.id}`, ordinary.token))
        .status === 404,
      "wrong person resolved ID",
    );
    expect(
      (await http("GET", `/v1/growth/notifications/${n.id}`)).status === 401,
      "anonymous resolved ID",
    );
    await Promise.all([
      runEffects(author),
      runEffects(author),
      runEffects(author),
    ]);
    await delay(1500);
    expect((await submitted(first)).length === 2, "duplicate submissions");
    expect(
      (
        await http(
          "POST",
          `/v1/content/${author.id}/${first.id}/unpublish`,
          author.token,
          { version: 1, idempotencyKey: `unpub-${first.id}` },
        )
      ).status === 200,
      "unpublish failed",
    );
    expect(
      (await http("GET", `/v1/growth/notifications/${n.id}`, creator.token))
        .status === 404,
      "withdrawn ID still resolves",
    );
    return "200/404/401 recipient boundary; repeat unchanged; withdrawn ID 404";
  },
);
await step(
  "E5.4-web-retry",
  "gateway rejection retries once per browser after recovery",
  async () => {
    await gateway("down", "PUT");
    const note = await publishNote(author, "Retry Note.", { kind: "members" });
    const n = await waitFor(
      "503 attempt",
      async () => {
        const n = await noticeFor(note);
        return n?.state === "queued" && n.attempts > 0 && n.last_error && n;
      },
      30000,
    );
    expect((await submitted(note)).length === 0, "accepted during outage");
    await gateway("up", "PUT");
    await sql("UPDATE growth.delivery SET available_at=now() WHERE id=$1", [
      n.delivery_id,
    ]);
    await settled(note);
    expect(
      (await submitted(note)).length === 2,
      "retry duplicated/lost browser push",
    );
    return "503 then two 201s; one per browser";
  },
);
await step(
  "E5.4-web-unknown",
  "an ambiguous nonstandard success never causes a second submission",
  async () => {
    await gateway("unknown", "PUT");
    const note = await publishNote(author, "Unknown receipt Note.", {
      kind: "members",
    });
    const n = await waitFor(
      "unknown receipt",
      async () => {
        const n = await noticeFor(note);
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
    await gateway("up", "PUT");
    await sql("UPDATE growth.delivery SET available_at=now() WHERE id=$1", [
      n.delivery_id,
    ]);
    await delay(2500);
    expect(
      (await submitted(note)).length === 1,
      "ambiguous outcome was resent",
    );
    return "one unknown receipt; no repeat";
  },
);
writeFileSync(
  proofFile,
  JSON.stringify(
    (
      await sql(
        "SELECT count(*) FILTER(WHERE state='sent')::int sent,count(*) FILTER(WHERE state='unknown')::int unknown FROM growth.provider_receipt",
      )
    ).rows[0],
  ),
);
skip(
  "E5.4-web-browser",
  "real browser PushManager and service worker presentation",
  "lane 6 owns Studio worker/account lifecycle; local browser subscription and gateway only",
);
skip(
  "E5.4-web-production",
  "production VAPID keys and gateway",
  "temporary development keys; integrator host wiring and migration registration pending",
);
await closeDb();
process.exit(finish());
