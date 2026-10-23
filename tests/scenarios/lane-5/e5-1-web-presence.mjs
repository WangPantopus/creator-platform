// C4 browser workflow against an owned local stack. Reuses lane6 browser helpers.
// Configure LANE6_WEB, LANE6_API, LANE6_DB and optional PRESENCE_MEMBER_ACTOR (6),
// PRESENCE_OUTSIDER_ACTOR (5), PRESENCE_OUT directory. Actor3 owns seeded Maya.
// Synthetic edges: development identity, virtual passkey device, approvedProof
// as external-verification stand-in, and membership rows as purchase stand-in.
// All Note/reply/signature/withdrawal actions use real HTTP/browser entry points.
// --retain-native-fixture leaves one additional signed Note and this run's own
// membership for native read checks, and prints their identifiers (no tokens).
// No held migration or safety approval is invented: 0156 reaction acceptance is
// explicitly not run while its review authority remains reserved_unapplied.
// --pagination requires PRESENCE_PAGINATION_FIXTURE=followers|members and an
// isolated creator. The members fixture uses existing documented purchase/tier
// stand-ins; followers uses the real follow API and needs qualified 0185 custody.
// PRESENCE_PAGINATION_REUSE may name this mode's manifest of 52 task-owned
// Notes on the same stack: each is edited and freshly signed at a new version.
// --pagination-checks-only reuses all 52 still-published versions for browser
// checks and cleanup, without another publication or passkey registration.
import * as L from "../lane-6/e6-2-lib.mjs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
const { expect, step, sql, api, MAYA, WEB } = L;
const out = process.env.PRESENCE_OUT ?? "/tmp/qelvora-presence-web";
const memberActor = Number(process.env.PRESENCE_MEMBER_ACTOR ?? 6);
const outsiderActor = Number(process.env.PRESENCE_OUTSIDER_ACTOR ?? 5);
expect(
  [memberActor, outsiderActor].every(
    (n) => Number.isInteger(n) && n >= 1 && n <= 6 && n !== 3,
  ) && memberActor !== outsiderActor,
  "Use two distinct eligible development fan actors, separate from Maya",
);
expect(
  [WEB, L.API].every((value) =>
    ["localhost", "127.0.0.1"].includes(new URL(value).hostname),
  ),
  "Use only an owned loopback stack",
);
const database = new URL(
  process.env.LANE6_DB ??
    "postgresql://postgres:foundation-test-only@127.0.0.1:56460/creator_stack",
);
expect(
  ["localhost", "127.0.0.1"].includes(database.hostname) &&
    database.pathname.startsWith("/creator_stack"),
  "Use an owned local creator_stack database",
);
const accounts = [3, outsiderActor, memberActor].map(L.account);
// This mode requires a separate, fresh creator fixture. It never changes the
// member/Note retained by the lifecycle scenario for native verification.
if (process.argv.includes("--pagination")) {
  await paginationChecks();
  await L.finish();
}
expect(
  (
    await sql(
      "SELECT id FROM creator_trust.privacy_job WHERE account_id=ANY($1::uuid[]) AND kind='delete'",
      [accounts],
    )
  ).length === 0,
  "A proposed actor has deletion state; stop without changing it",
);
await mkdir(out, { recursive: true });
// Recheck only lifecycle behavior against a retained authorized Note after a UI
// change, without creating another membership, publication, reply or signature.
if (process.argv.includes("--lifecycle-only")) {
  const noteId = process.env.PRESENCE_NOTE_ID;
  expect(/^[a-f0-9-]{36}$/u.test(noteId ?? ""), "PRESENCE_NOTE_ID is required");
  const [fan] = await sql(
    "SELECT id FROM creator.fan_profile WHERE account_id=$1",
    [L.account(memberActor)],
  );
  expect(fan, "The retained fixture fan does not exist");
  const browser = await L.launch(),
    eligible = await L.phone(browser);
  await login(eligible.page, memberActor, `/threads/${MAYA}/${fan.id}`);
  const selector = `[data-presence-id="${noteId}"]`;
  await eligible.page.locator(selector).waitFor();
  await lifecycleChecks(eligible, selector);
  await L.finish(browser);
}
const member = await L.fan(memberActor),
  outsider = await L.fan(outsiderActor),
  creatorToken = await L.apiSession(3);
expect(
  (
    await sql(
      "SELECT id FROM creator.commerce_membership WHERE creator_id=$1 AND fan_id=$2 AND state IN('active','grace') AND coalesce(grace_end,period_end)>now()",
      [MAYA, outsider.id],
    )
  ).length === 0,
  "Outsider already has membership; leave it untouched",
);
const membership = await L.member(member.id, await L.tier("Presence scenario"));
console.log("OWNED_MEMBERSHIP", JSON.stringify({ run: L.run, ...membership }));
for (const fan of [member, outsider]) {
  const caps = await api("GET", "/v1/conversations/capabilities", fan.token);
  const begun = await api("POST", "/v1/conversations/begin", fan.token, {
    creatorId: MAYA,
    policyVersion: caps.json.providers.version,
    accessNoticeAccepted: true,
    idempotencyKey: crypto.randomUUID(),
  });
  expect(
    begun.status === 200,
    `begin ${begun.status} ${JSON.stringify(begun.json)}`,
  );
}
const browser = await L.launch(),
  creator = await L.phone(browser),
  eligible = await L.phone(browser),
  other = await L.phone(browser),
  anonymous = await L.phone(browser);
async function login(page, n, path) {
  await page.goto(`${WEB}/auth/continue?returnTo=${encodeURIComponent(path)}`);
  await page.getByText("Continue with Pantopus").first().click();
  await page.locator(`button[name="code"][value="${L.account(n)}"]`).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/auth"));
  if (new URL(page.url()).pathname !== path) await page.goto(WEB + path);
}

async function paginationChecks() {
  const actor = Number(process.env.PRESENCE_PAGINATION_FAN_ACTOR ?? 1);
  const fixtureKind = process.env.PRESENCE_PAGINATION_FIXTURE;
  expect(
    ["followers", "members"].includes(fixtureKind),
    "Set PRESENCE_PAGINATION_FIXTURE=followers or members explicitly",
  );
  const reuse = process.env.PRESENCE_PAGINATION_REUSE
    ? JSON.parse(await readFile(process.env.PRESENCE_PAGINATION_REUSE, "utf8"))
    : null;
  const checksOnly = process.argv.includes("--pagination-checks-only");
  if (checksOnly)
    expect(
      reuse?.fixtureKind === fixtureKind,
      "Checks-only requires a matching fixture manifest",
    );
  const fixtureRun = checksOnly ? reuse.run : L.run;
  if (reuse)
    expect(
      reuse.web === WEB &&
        reuse.api === L.API &&
        reuse.creatorId === MAYA &&
        reuse.notes?.length === 52 &&
        new Set(reuse.notes.map((note) => note.id)).size === 52,
      "Reuse only this mode's 52-Note manifest on the exact same stack",
    );
  expect([1, 2, 4, 5, 6].includes(actor), "Use an eligible fan actor");
  expect(
    (
      await sql(
        "SELECT id FROM creator_trust.privacy_job WHERE account_id=ANY($1::uuid[]) AND kind='delete'",
        [[L.account(3), L.account(actor)]],
      )
    ).length === 0,
    "Pagination actors have deletion state; leave them untouched",
  );
  const existing = await sql(
    "SELECT id,version,state FROM creator.content_index WHERE creator_id=$1",
    [MAYA],
  );
  expect(
    reuse
      ? existing.length === 52 &&
          existing.every(
            (row) =>
              ["unpublished", "published"].includes(row.state) &&
              reuse.notes.some(
                (note) => note.id === row.id && note.version === row.version,
              ),
          )
      : existing.length === 0,
    "Use a fresh isolated creator or this mode's exact, unchanged-version manifest",
  );
  if (checksOnly)
    expect(
      existing.every((row) => row.state === "published"),
      "Checks-only requires all52current publications",
    );
  const fan = await L.fan(actor),
    token = await L.apiSession(3);
  if (reuse) expect(reuse.fanId === fan.id, "Reuse requires the original fan");
  const activeMemberships = await sql(
    "SELECT id,grant_id FROM creator.commerce_membership WHERE creator_id=$1 AND fan_id=$2 AND state IN('active','grace') AND coalesce(grace_end,period_end)>now()",
    [MAYA, fan.id],
  );
  const ownActiveMembership =
    fixtureKind === "members" &&
    activeMemberships.length === 1 &&
    activeMemberships[0].id === reuse?.membership?.membership &&
    activeMemberships[0].grant_id === reuse?.membership?.grant;
  expect(
    activeMemberships.length === 0 || ownActiveMembership,
    "Retain unrelated memberships; only this mode's own fixture can be resumed",
  );
  const followPath = `/v1/growth/follow/${MAYA}`;
  if (fixtureKind === "followers") {
    const prior = await api("GET", followPath, fan.token);
    expect(
      prior.status === 200 && prior.json.following === false,
      "Use a fresh non-follower; retain existing follow state",
    );
  }
  const caps = await api("GET", "/v1/conversations/capabilities", fan.token);
  const begun = await api("POST", "/v1/conversations/begin", fan.token, {
    creatorId: MAYA,
    policyVersion: caps.json.providers.version,
    accessNoticeAccepted: true,
    idempotencyKey: crypto.randomUUID(),
  });
  expect(
    begun.status === 200,
    `Pagination conversation begin ${begun.status} ${JSON.stringify(begun.json)}`,
  );
  let membership, excludedTier;
  if (fixtureKind === "followers") {
    const followed = await api("PUT", followPath, fan.token, {
      following: true,
    });
    expect(followed.status === 200, `Follow failed ${followed.status}`);
  } else {
    // Same purchase/tier stand-ins as the original C4 scenario. They establish
    // only this fan's audience; every Note and signature remains a real act.
    membership = ownActiveMembership
      ? reuse.membership
      : await L.member(fan.id, await L.tier("Pagination reader"));
    excludedTier = checksOnly
      ? reuse.excludedTier
      : await L.tier("Pagination excluded");
    console.log(
      "OWNED_MEMBERSHIP",
      JSON.stringify({ run: L.run, ...membership, excludedTier }),
    );
  }
  await mkdir(out, { recursive: true });
  const browser = await L.launch(),
    creator = await L.phone(browser),
    reader = await L.phone(browser),
    notes = [];
  const fixturePath = `${out}/pagination-fixture.json`;
  const saveFixture = () =>
    writeFile(
      fixturePath,
      JSON.stringify(
        {
          run: fixtureRun,
          web: WEB,
          api: L.API,
          creatorId: MAYA,
          fanId: fan.id,
          fixtureKind,
          membership,
          excludedTier,
          notes,
        },
        null,
        2,
      ) + "\n",
      { mode: 0o600 },
    );
  const retract = async (note) => {
    const command = {
      version: note.version,
      idempotencyKey: crypto.randomUUID(),
    };
    let result;
    for (let attempt = 0; attempt < 3; attempt++) {
      result = await api(
        "POST",
        `/v1/content/${MAYA}/${note.id}/unpublish`,
        token,
        command,
      );
      if (result.status < 500) break;
      console.log(
        `RETRY unpublish ${note.id} ${result.status} ${result.json?.error?.code}`,
      );
      await L.sleep(300);
    }
    expect(
      result.status === 200,
      `Unpublish ${note.id}: ${result.status} ${JSON.stringify(result.json)}`,
    );
    note.retracted = true;
    await saveFixture();
  };
  try {
    if (checksOnly)
      notes.push(...reuse.notes.map((note) => ({ ...note, retracted: false })));
    else {
      await login(creator.page, 3, `/studio/${MAYA}/today`);
      await L.approvedProof(); // External-verification stand-in only.
      await L.registerPasskey(creator.page); // Real browser registration.
    }
    // Each publication uses Compose, exact-content review and a new browser
    // passkey assertion. No credentials, signatures, content or reviews are
    // inserted in SQL. Audience fixture kind is explicit in the manifest.
    for (let index = 0; !checksOnly && index < 52; index++) {
      const visible = index === 0 || index === 51;
      const audience =
        fixtureKind === "followers"
          ? visible
            ? "Followers"
            : "All members"
          : visible
            ? "All members"
            : "Tiers";
      const text = `Pagination ${L.run} ${index}: ${visible ? "eligible" : "outside audience"} Note`;
      const previous = reuse?.notes[index];
      await creator.page.goto(
        `${WEB}/studio/${MAYA}/compose${previous ? `/${previous.id}` : ""}?from=today`,
      );
      await creator.page
        .getByRole("button", { name: audience, exact: true })
        .click();
      if (audience === "Tiers")
        await creator.page
          .getByLabel(`Pagination excluded ${L.run}`, { exact: true })
          .check();
      await creator.page.locator("#note-text").fill(text);
      await creator.page
        .getByRole("button", { name: "Review and sign", exact: true })
        .click();
      await creator.page
        .getByRole("button", { name: "Sign with your passkey", exact: true })
        .click();
      await creator.page.waitForURL((u) => u.pathname.endsWith("/today"));
      const [note] = await sql(
        "SELECT i.id,i.version,i.state,p.signed_act_id FROM creator.content_index i JOIN creator.content_revision r ON r.content_id=i.id AND r.version=i.version JOIN creator.content_publication p ON p.content_id=i.id AND p.version=i.version WHERE i.creator_id=$1 AND r.document->>'text'=$2",
        [MAYA, text],
      );
      expect(
        note?.state === "published" && note.signed_act_id,
        "Publication missing",
      );
      if (previous)
        expect(
          note.id === previous.id &&
            note.version > previous.version &&
            note.signed_act_id !== previous.signed_act_id,
          "Reused Note requires a newly signed version",
        );
      notes.push({ ...note, text, visible });
      await saveFixture();
      console.log(`PUBLISHED pagination ${index + 1}/52 ${note.id}`);
      if (index === 0) {
        const read = await api(
          "GET",
          `/v1/content/${MAYA}/presence?limit=50`,
          fan.token,
        );
        expect(
          read.status === 200 &&
            read.json.items.some((item) => item.id === note.id),
          `PAGINATION_AUDIENCE_BLOCKED ${read.status} ${JSON.stringify(read.json)}; stop before publishing the remaining51Notes`,
        );
      }
    }
    const oldest = notes[0],
      newest = notes[51];
    const item = (note) =>
      reader.page.locator(`[data-presence-id="${note.id}"]`);
    const path = `/threads/${MAYA}/${fan.id}`;
    const page = (before) =>
      api(
        "GET",
        `/v1/content/${MAYA}/presence?limit=50${before ? `&before=${encodeURIComponent(before)}` : ""}`,
        fan.token,
      );
    const noIneligibleText = async () => {
      expect(
        (await reader.page
          .getByText(`Pagination ${fixtureRun}`, { exact: false })
          .filter({ hasText: "outside audience" })
          .count()) === 0,
        "Ineligible Note text leaked",
      );
    };
    await step(
      "C4-pagination-window",
      "52 real publications produce two audience-filtered candidate windows",
      async () => {
        const first = await page();
        expect(
          first.status === 200,
          `Presence read ${first.status} ${JSON.stringify(first.json)}`,
        );
        expect(
          first.status === 200 &&
            first.json.items.length === 1 &&
            first.json.items[0].id === newest.id &&
            first.json.nextBefore,
          "First candidate window differs",
        );
        const older = await page(first.json.nextBefore);
        expect(
          older.status === 200 &&
            older.json.items.length === 1 &&
            older.json.items[0].id === oldest.id &&
            older.json.nextBefore === null,
          "Older candidate window differs",
        );
        return `${fixtureKind}: newest eligible Note + cursor; older: oldest eligible Note, end`;
      },
    );
    await login(reader.page, actor, path);
    await step(
      "C4-pagination-browser",
      "Earlier messages reveals the older signed Note without duplicates or audience leakage",
      async () => {
        await item(newest).waitFor();
        expect(
          (await item(oldest).count()) === 0,
          "Older Note appeared before pagination",
        );
        // Observe a real automatic request in flight; no response is mocked,
        // delayed or substituted. This fixture's50candidate scan is measurable.
        const refresh = await reader.page.waitForRequest(
          (request) => request.url().includes(`/api/content/${MAYA}/presence?`),
          { timeout: 10_000 },
        );
        let finished = false;
        const response = refresh.response().then((value) => {
          finished = true;
          return value;
        });
        const earlier = reader.page.getByRole("button", {
          name: "Earlier messages",
          exact: true,
        });
        expect(
          await earlier.isEnabled(),
          "Automatic refresh disabled pagination",
        );
        await earlier.click();
        expect(
          !finished,
          "Refresh already ended; queued-click premise was not exercised",
        );
        expect(
          await earlier.isDisabled(),
          "Explicit pagination did not prevent duplicate clicks",
        );
        expect((await response)?.status() === 200, "Automatic refresh failed");
        await item(oldest).waitFor();
        expect(
          (await item(newest).count()) === 1 &&
            (await item(oldest).count()) === 1,
          "Duplicate or missing Note",
        );
        expect(
          (await item(oldest)
            .locator("a")
            .filter({ hasText: "Signed by Maya" })
            .getAttribute("href")) === `/verify/${oldest.signed_act_id}`,
          "Older signature target differs",
        );
        await noIneligibleText();
        await reader.page.screenshot({ path: `${out}/pagination-older.png` });
      },
    );
    await retract(newest);
    await step(
      "C4-pagination-empty",
      "an empty eligible first page keeps its cursor and the browser can reach the older Note",
      async () => {
        const first = await page();
        expect(
          first.status === 200 &&
            first.json.items.length === 0 &&
            first.json.nextBefore,
          "Expected empty eligible window with cursor",
        );
        await reader.page.reload();
        const earlier = reader.page.getByRole("button", {
          name: "Earlier messages",
          exact: true,
        });
        await earlier.waitFor();
        expect(
          (await item(oldest).count()) === 0,
          "Empty initial page included older Note",
        );
        await earlier.click();
        await item(oldest).waitFor();
        expect(
          (await item(newest).count()) === 0,
          "Retracted latest Note returned",
        );
        await noIneligibleText();
        await reader.page.screenshot({
          path: `${out}/pagination-empty-then-older.png`,
        });
        return `empty window followed opaque cursor to ${oldest.id}`;
      },
    );
    await step(
      "C4-pagination-retraction",
      "refresh removes a retracted Note from the loaded older window",
      async () => {
        await item(oldest).waitFor(); // A never-visible Note is not retraction evidence.
        await retract(oldest);
        await item(oldest).waitFor({ state: "detached", timeout: 10_000 });
        await noIneligibleText();
      },
    );
  } finally {
    await browser.close(); // Stop this scenario's polling before bounded cleanup.
    // Preserve all records/signatures as evidence; unpublish only this run's
    // Notes and restore only the follow relationship created above.
    await step(
      "C4-pagination-cleanup",
      "own publications and audience fixture are withdrawn",
      async () => {
        for (const note of notes) if (!note.retracted) await retract(note);
        if (membership) await L.leave(membership);
        else {
          const unfollowed = await api("PUT", followPath, fan.token, {
            following: false,
          });
          expect(
            unfollowed.status === 200,
            `Unfollow failed ${unfollowed.status}`,
          );
        }
        return `${notes.length} owned Notes retained unpublished; ${fixtureKind} fixture ended`;
      },
    );
  }
}
const memberPath = `/threads/${MAYA}/${member.id}`,
  outsiderPath = `/threads/${MAYA}/${outsider.id}`;
await login(creator.page, 3, `/studio/${MAYA}/today`);
await L.approvedProof(); // Synthetic external-verification edge; real browser registration/signing follows.
await L.registerPasskey(creator.page);
const words = `Presence ${L.run}: a signed Note.\n\nمرحبا بالجميع 🔥`;
await creator.page.goto(`${WEB}/studio/${MAYA}/compose?from=today`);
await creator.page.locator("#note-text").fill(words);
await creator.page
  .getByRole("button", { name: "Review and sign", exact: true })
  .click();
await creator.page
  .getByRole("button", { name: "Sign with your passkey", exact: true })
  .click();
await creator.page.waitForURL((u) => u.pathname.endsWith("/today"));
const [note] = await sql(
  "SELECT i.id,i.version,i.state,p.signed_act_id FROM creator.content_index i JOIN creator.content_revision r ON r.content_id=i.id AND r.version=i.version JOIN creator.content_publication p ON p.content_id=i.id AND p.version=i.version WHERE i.creator_id=$1 AND r.document->>'text'=$2",
  [MAYA, words],
);
expect(note?.state === "published", "No published Note");
const selector = `[data-presence-id="${note.id}"]`;
await login(eligible.page, memberActor, memberPath);
await step(
  "C4-web-member",
  "member sees signed Note and private-reply destination",
  async () => {
    await eligible.page.locator(selector).waitFor();
    expect(
      (await eligible.page
        .locator(`${selector} .qv-note`)
        .getAttribute("aria-label")) === "Maya · to all members",
      "Exact author label missing",
    );
    expect(
      (await eligible.page
        .locator(`${selector} .qv-note__body > p`)
        .innerText()) === words,
      "Paragraphs differ",
    );
    expect(
      (await eligible.page
        .locator(`${selector} a`)
        .filter({ hasText: "Signed by Maya" })
        .getAttribute("href")) === `/verify/${note.signed_act_id}`,
      "Signature target differs",
    );
    expect(
      (await eligible.page
        .getByRole("link", { name: "Reply to Maya's Note", exact: true })
        .last()
        .getAttribute("href")) === `/content/${MAYA}/${note.id}`,
      "Private reply target differs",
    );
    return `${note.id}, signed ${note.signed_act_id}`;
  },
);
await step(
  "C4-web-themes",
  "phone Light and Night keep authorship and avoid horizontal overflow",
  async () => {
    for (const theme of ["light", "night"]) {
      await eligible.page.evaluate(
        (t) => (document.documentElement.dataset.theme = t),
        theme,
      );
      await eligible.page.locator(selector).scrollIntoViewIfNeeded();
      expect(
        await eligible.page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        "Horizontal overflow",
      );
      await eligible.page.screenshot({ path: `${out}/${theme}.png` });
    }
  },
);
let reply;
await step(
  "C4-web-pending-reply",
  "private reply stays pending without registered safety-review authority",
  async () => {
    await eligible.page
      .locator(`${selector} a`)
      .filter({ hasText: "Reply to Maya's Note" })
      .click();
    const replyText = `Private kiln reply ${L.run}`;
    await eligible.page.locator("#private-reply").fill(replyText);
    await eligible.page
      .getByRole("button", { name: "Send private reply", exact: true })
      .click();
    await eligible.page.getByText(replyText, { exact: true }).waitFor();
    await eligible.page
      .getByText(
        "Waiting for safety review. It has not reached the creator’s feed.",
      )
      .waitFor();
    [reply] = await sql(
      "SELECT r.id,r.version,q.state FROM creator.content_reply r JOIN creator.content_reply_review q ON q.reply_id=r.id WHERE r.content_id=$1 AND r.text=$2",
      [note.id, replyText],
    );
    expect(reply?.state === "pending", "Unreviewed reply became visible");
    const signed = await api(
      "POST",
      `/v1/identity/${MAYA}/signed-acts/begin`,
      creatorToken,
      {
        command: {
          actType: "reaction",
          subjectId: reply.id,
          content: {
            kind: "content_reaction",
            creatorId: MAYA,
            replyVersion: reply.version,
            reaction: "heart",
          },
        },
      },
    );
    expect(
      signed.status >= 400,
      `Unreviewed reaction signing ${signed.status}`,
    );
    expect(
      (
        await sql(
          "SELECT reply_id FROM creator.content_reaction WHERE reply_id=$1",
          [reply.id],
        )
      ).length === 0,
      "Unreviewed reaction stored",
    );
    return `pending; reaction signing refused ${signed.status} ${signed.json.error?.code}`;
  },
);
await L.note(
  "C4-web-reaction",
  "signed reaction and reaction withdrawal are not run",
  async () =>
    "0156_w8_reply_review remains reserved_unapplied; creator_trust.reply_review is absent. No approval was fabricated.",
);
await eligible.page.goto(WEB + memberPath);
await eligible.page.locator(selector).waitFor();
await step(
  "C4-web-outsider",
  "non-member sees no Note; signed-out BFF denies access",
  async () => {
    await login(other.page, outsiderActor, outsiderPath);
    const response = await other.page.request.get(
      `${WEB}/api/content/${MAYA}/presence`,
    );
    expect(
      response.status() === 200 &&
        !JSON.stringify(await response.json()).includes(note.id),
      "Outsider C4 leaked",
    );
    expect(
      (await other.page.locator(selector).count()) === 0,
      "Outsider DOM leaked",
    );
    if (reply)
      expect(
        (await other.page
          .locator(`[data-presence-id="${reply.id}"]`)
          .count()) === 0,
        "Other fan sees reaction",
      );
    const signedOut = await anonymous.page.request.get(
      `${WEB}/api/content/${MAYA}/presence`,
    );
    expect(
      signedOut.status() === 401 &&
        !JSON.stringify(await signedOut.json()).includes(words),
      "Signed-out leak",
    );
  },
);
await step(
  "C4-web-age",
  "under18 development actor cannot open a session",
  async () => {
    const start = await api("POST", "/v1/identity/continue", undefined, {
      returnTo: "/home",
    });
    const done = await api("POST", "/v1/identity/complete", undefined, {
      continuationId: start.json.continuationId,
      code: L.account(7),
    });
    expect(done.status === 403 && !done.json.token, `under18 ${done.status}`);
    return `${done.status} ${done.json.error?.code}`;
  },
);
await lifecycleChecks(eligible, selector);
await step(
  "C4-web-reply-withdraw",
  "the author can withdraw a pending private reply",
  async () => {
    expect(reply, "Private reply setup failed");
    const done = await api(
      "POST",
      `/v1/content/${MAYA}/replies/${reply.id}/withdraw`,
      member.token,
      { version: reply.version, idempotencyKey: crypto.randomUUID() },
    );
    expect(done.status === 200, `withdraw ${done.status}`);
    await eligible.page.evaluate(() =>
      window.dispatchEvent(new Event("focus")),
    );
    await eligible.page
      .locator(`[data-presence-id="${reply.id}"]`)
      .waitFor({ state: "detached" });
    expect(
      (
        await sql(
          "SELECT reply_id FROM creator.content_reaction WHERE reply_id=$1",
          [reply.id],
        )
      ).length === 0,
      "Reaction retained",
    );
  },
);
await step(
  "C4-web-retract",
  "creator unpublishes; the next audience read removes the Note",
  async () => {
    const done = await api(
      "POST",
      `/v1/content/${MAYA}/${note.id}/unpublish`,
      creatorToken,
      { version: note.version, idempotencyKey: crypto.randomUUID() },
    );
    expect(done.status === 200, `unpublish ${done.status}`);
    await eligible.page.evaluate(() =>
      window.dispatchEvent(new Event("focus")),
    );
    await eligible.page.locator(selector).waitFor({ state: "detached" });
    const [row] = await sql(
      "SELECT state FROM creator.content_index WHERE id=$1",
      [note.id],
    );
    expect(row.state === "unpublished", `state ${row.state}`);
    expect(
      (await sql("SELECT id FROM creator.message WHERE text=$1", [words]))
        .length === 0,
      "C4 copied into stored messages",
    );
    return row.state;
  },
);
if (process.argv.includes("--retain-native-fixture")) {
  const fixtureText = `Native presence ${L.run}: signed and shared with all members.\n\nThe kiln opens at nine 🔥`;
  await creator.page.goto(`${WEB}/studio/${MAYA}/compose?from=today`);
  await creator.page.locator("#note-text").fill(fixtureText);
  await creator.page
    .getByRole("button", { name: "Review and sign", exact: true })
    .click();
  await creator.page
    .getByRole("button", { name: "Sign with your passkey", exact: true })
    .click();
  await creator.page.waitForURL((u) => u.pathname.endsWith("/today"));
  const [nativeNote] = await sql(
    "SELECT i.id,p.signed_act_id FROM creator.content_index i JOIN creator.content_revision r ON r.content_id=i.id AND r.version=i.version JOIN creator.content_publication p ON p.content_id=i.id AND p.version=i.version WHERE i.creator_id=$1 AND r.document->>'text'=$2",
    [MAYA, fixtureText],
  );
  console.log(
    "NATIVE_FIXTURE",
    JSON.stringify({
      creatorId: MAYA,
      memberFanId: member.id,
      memberAccountId: L.account(memberActor),
      outsiderFanId: outsider.id,
      outsiderAccountId: L.account(outsiderActor),
      note: nativeNote,
      membership,
      text: fixtureText,
    }),
  );
} else await L.leave(membership);
await L.finish(browser);

async function lifecycleChecks(eligible, selector) {
  await step(
    "C4-web-offline",
    "offline conceals projected text and reconnect restores it",
    async () => {
      await eligible.context.setOffline(true);
      await eligible.page.locator(selector).waitFor({ state: "detached" });
      await eligible.context.setOffline(false);
      await eligible.page.locator(selector).waitFor();
    },
  );
  await step(
    "C4-web-lifecycle",
    "pagehide clears projection; pageshow revalidates",
    async () => {
      await eligible.page.evaluate(() =>
        window.dispatchEvent(new PageTransitionEvent("pagehide")),
      );
      await eligible.page.locator(selector).waitFor({ state: "detached" });
      await eligible.page.evaluate(() =>
        window.dispatchEvent(new PageTransitionEvent("pageshow")),
      );
      await eligible.page.locator(selector).waitFor();
    },
  );
  await step(
    "C4-web-failure",
    "transport failure clears projection; Retry recovers",
    async () => {
      const cdp = eligible.cdp;
      await cdp.send("Network.enable");
      await cdp.send("Network.setBlockedURLs", {
        urls: [`${WEB}/api/content/${MAYA}/presence*`],
      });
      await eligible.page.evaluate(() =>
        window.dispatchEvent(new Event("focus")),
      );
      await eligible.page.locator(selector).waitFor({ state: "detached" });
      await eligible.page
        .getByRole("button", { name: "Retry", exact: true })
        .waitFor();
      await cdp.send("Network.setBlockedURLs", { urls: [] });
      await eligible.page
        .getByRole("button", { name: "Retry", exact: true })
        .click();
      await eligible.page.locator(selector).waitFor();
    },
  );
  await step(
    "C4-web-expiry",
    "a stalled audience read cannot extend the five-second current-access window",
    async () => {
      let started;
      const delayed = new Promise((resolve) => {
        started = resolve;
      });
      const pattern = `**/api/content/${MAYA}/presence?*`;
      const delay = async (route) => {
        started();
        await new Promise((resolve) => setTimeout(resolve, 6500));
        await route.continue().catch(() => {});
      };
      await eligible.page.route(pattern, delay);
      const since = Date.now();
      try {
        await delayed;
        await eligible.page
          .locator(selector)
          .waitFor({ state: "detached", timeout: 5500 });
        expect(
          Date.now() - since < 5500,
          "Old audience text outlived its five-second freshness window",
        );
        expect(
          (await eligible.page
            .getByText("You're offline", { exact: true })
            .count()) === 0,
          "The conversation went offline instead of exercising only the C4 expiry",
        );
      } finally {
        await eligible.page.unroute(pattern, delay);
      }
      await eligible.page
        .getByRole("button", { name: "Retry", exact: true })
        .click();
      await eligible.page.locator(selector).waitFor();
    },
  );
}
