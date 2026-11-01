// Follower Notes after 0255: a real follow through the Growth API makes a
// followers-only Note readable in the fan's thread (contract C4); a fan who
// does not follow, or who unfollows, cannot read it. Maya signs the Note with a
// virtual passkey in the real Studio composer. Fakes: the development identity
// and lane 6's documented creator-proof stand-in. Disposable stacks only; the
// stack needs Growth (`stack.mjs up --growth`).
//   LANE6_API=… LANE6_WEB=… LANE6_DB=… node tests/scenarios/lane-2/e2-core-follow-check.mjs
// On a stack without 0255, --expect-refused checks that followers are refused.
import * as L from "../lane-6/e6-2-lib.mjs";
const { step, expect, sql, MAYA, WEB } = L;
const refused = process.argv.includes("--expect-refused");

const browser = await L.launch();
const { page } = await L.phone(browser);
const [follower, other] = [await L.fan(1), await L.fan(2)];
await L.approvedProof();
await L.signIn(page, 3, `/studio/${MAYA}/today`);
await L.registerPasskey(page);
const text = `For the people who follow me ${L.run}`;
const follow = (token, following) =>
  L.api("PUT", `/v1/growth/follow/${MAYA}`, token, { following });
async function sees(token) {
  const read = await L.presence(token);
  return { status: read.status, seen: read.items.some((i) => i.text === text) };
}

await step("F-1", "a fan follows Maya through the Growth API", async () => {
  const set = await follow(follower.token, true);
  const read = await L.api("GET", `/v1/growth/follow/${MAYA}`, follower.token);
  expect(
    set.status === 200 && read.json?.following === true,
    `follow ${set.status} ${JSON.stringify(set.json ?? {}).slice(0, 120)}; read ${JSON.stringify(read.json)}`,
  );
  return "following";
});
await step("F-2", "Maya signs a followers-only Note", async () => {
  await page.goto(`${WEB}/studio/${MAYA}/compose?from=today`);
  await page.locator("#note-text").fill(text);
  await page.getByRole("button", { name: "Followers" }).click();
  await page.getByRole("button", { name: "Review and sign" }).click();
  await page.getByRole("button", { name: "Sign with your passkey" }).click();
  await page.waitForURL((u) => u.pathname.endsWith("/today"));
  const [row] = await sql(
    "SELECT i.state,i.audience->>'kind' AS audience FROM creator.content_index i JOIN creator.content_revision r ON r.content_id=i.id AND r.version=i.version WHERE r.document->>'text'=$1",
    [text],
  );
  expect(
    row?.state === "published" && row.audience === "followers",
    JSON.stringify(row),
  );
  return "published to followers";
});
await step(
  "F-3",
  refused
    ? "without 0255, followers cannot read a followers-only Note"
    : "the follower reads it; a fan who does not follow cannot",
  async () => {
    const [a, b] = [await sees(follower.token), await sees(other.token)];
    expect(
      refused ? !a.seen && !b.seen : a.status === 200 && a.seen && !b.seen,
      `follower ${JSON.stringify(a)}; other ${JSON.stringify(b)}`,
    );
    return `follower seen=${a.seen}; other seen=${b.seen}`;
  },
);
if (!refused)
  await step(
    "F-4",
    "after unfollowing, the Note leaves the thread",
    async () => {
      const set = await follow(follower.token, false);
      let a = await sees(follower.token);
      const deadline = Date.now() + 10_000;
      while (a.seen && Date.now() < deadline) {
        await L.sleep(500);
        a = await sees(follower.token);
      }
      expect(
        set.status === 200 && !a.seen,
        `unfollow ${set.status}; ${JSON.stringify(a)}`,
      );
      return "gone after unfollow";
    },
  );
await L.finish(browser);
