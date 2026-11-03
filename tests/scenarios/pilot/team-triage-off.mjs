// Team triage is off for the pilot (founder decision, 2026-11-03): no invitation,
// invitation acceptance or role change grants Triage, through the Studio or the
// identity API, while Drafting, Publishing and Scheduling still work. Run on a
// fresh stack:
//   node infra/local/stack.mjs up --lane N --base-port P
//   PILOT_BASE_PORT=P node tests/scenarios/pilot/team-triage-off.mjs
// Real backend and PostgreSQL. Fakes: the development identity, and SQL rows
// standing in for a membership and an invitation made before triage went off.
import { ACTORS, call, signIn } from "../lane-2/lib.mjs";
import {
  API,
  MAYA,
  account,
  expect,
  fan,
  finish,
  legacyMember,
  roles,
  sql,
  step,
} from "./lib.mjs";

const maya = await signIn(API, ACTORS.maya, "/studio");
const one = await fan(1),
  two = await fan(2);
const as = (token, method, path, body, headers) =>
  call(API, method, path, { token, body, headers });
const refused = (r) => {
  expect(
    r.status === 403 && r.json?.error?.code === "team_role_unavailable",
    `${r.status} ${r.text}`,
  );
  return `${r.status} ${r.json.error.code}`;
};
const ok = (r) => {
  expect(r.status === 200, `${r.status} ${r.text}`);
  return r;
};
const studioInvite = (handle, list) =>
  as(maya.token, "POST", `/v1/studio/${MAYA}/team/invite`, {
    handle,
    roles: list,
  });
const identityInvite = (accountId, list) =>
  as(maya.token, "POST", `/v1/identity/${MAYA}/team/invite`, {
    accountId,
    roles: list,
  });
const change = (n, expectedRoles, list) =>
  as(
    maya.token,
    "POST",
    `/v1/identity/${MAYA}/team/${account(n)}/roles`,
    { expectedRoles, roles: list },
    { "X-Expected-Account-Id": ACTORS.maya },
  );
const remove = (n) =>
  as(maya.token, "POST", `/v1/identity/${MAYA}/team/${account(n)}/remove`, {});
const pending = async (n) =>
  (
    await sql(
      "SELECT count(*)::int AS n FROM creator.team_invitation WHERE creator_id=$1 AND account_id=$2 AND accepted_at IS NULL AND revoked_at IS NULL",
      [MAYA, account(n)],
    )
  )[0].n;

// A repeat run starts with neither fan on the team, through Maya's own removal.
ok(await remove(1));
ok(await remove(2));

await step(
  "T1",
  "a Studio invitation by handle that includes Triage is refused",
  async () => {
    refused(await studioInvite(one.handle, ["triage"]));
    const observed = refused(
      await studioInvite(one.handle, ["drafter", "triage"]),
    );
    expect((await pending(1)) === 0, "an invitation was written");
    return `${observed}, nothing written`;
  },
);
await step(
  "T2",
  "an identity API invitation by account that includes Triage is refused",
  async () => {
    const observed = refused(
      await identityInvite(one.account, ["scheduler", "triage"]),
    );
    expect((await pending(1)) === 0, "an invitation was written");
    return `${observed}, nothing written`;
  },
);
await step(
  "T3",
  "an invitation for Drafting, Publishing and Scheduling is made and accepted",
  async () => {
    const made = ok(
      await studioInvite(one.handle, ["drafter", "publisher", "scheduler"]),
    );
    ok(
      await as(
        one.token,
        "POST",
        `/v1/studio/invitations/${made.json.id}/accept`,
        {},
      ),
    );
    const now = await roles(1);
    expect(now === "drafter,publisher,scheduler", `member roles ${now}`);
    return `member roles ${now}`;
  },
);
await step(
  "T4",
  "a role change that adds Triage to a member is refused",
  async () => {
    const observed = refused(
      await change(
        1,
        ["drafter", "publisher", "scheduler"],
        ["drafter", "publisher", "scheduler", "triage"],
      ),
    );
    const now = await roles(1);
    expect(now === "drafter,publisher,scheduler", `roles became ${now}`);
    return `${observed}, roles stay ${now}`;
  },
);
await step(
  "T5",
  "role changes among Drafting, Publishing and Scheduling still save",
  async () => {
    ok(await change(1, ["drafter", "publisher", "scheduler"], ["drafter"]));
    const first = await roles(1);
    expect(first === "drafter", `roles became ${first}`);
    ok(await change(1, ["drafter"], ["publisher", "scheduler"]));
    const second = await roles(1);
    expect(second === "publisher,scheduler", `roles became ${second}`);
    return `${first}, then ${second}`;
  },
);
await step(
  "T6",
  "an invitation made before triage went off reads but cannot be accepted",
  async () => {
    // Stand-in: a pending invitation written before the pilot turned triage off.
    const [old] = await sql(
      "INSERT INTO creator.team_invitation(creator_id,account_id,roles,expires_at) VALUES($1,$2,ARRAY['drafter','triage'],now()+interval '7 days') RETURNING id",
      [MAYA, two.account],
    );
    const session = ok(await as(two.token, "GET", "/v1/studio/session"));
    expect(
      session.json.invitations.some(
        (i) => i.id === old.id && i.roles.includes("triage"),
      ),
      "the invitation does not read",
    );
    const studio = refused(
      await as(
        two.token,
        "POST",
        `/v1/studio/invitations/${old.id}/accept`,
        {},
      ),
    );
    refused(
      await as(two.token, "POST", `/v1/identity/team/${old.id}/accept`, {}),
    );
    expect((await roles(2)) === "none", "a membership was written");
    ok(await remove(2));
    return `${studio} through the Studio and the identity API, no membership`;
  },
);
await step(
  "T7",
  "a member who already holds Triage reads, cannot keep it through a change, and can drop it",
  async () => {
    await legacyMember(2, ["drafter", "triage"]);
    const team = ok(await as(maya.token, "GET", `/v1/studio/${MAYA}/team`));
    const member = team.json.members.find((m) => m.account_id === two.account);
    expect(member?.roles.includes("triage"), "the member does not read");
    const kept = refused(
      await change(
        2,
        ["drafter", "triage"],
        ["drafter", "publisher", "triage"],
      ),
    );
    ok(await change(2, ["drafter", "triage"], ["drafter"]));
    const now = await roles(2);
    expect(now === "drafter", `roles became ${now}`);
    return `reads ${[...member.roles].sort().join(",")}; keeping it ${kept}; dropped to ${now}`;
  },
);
await step(
  "T8",
  "the seeded member who holds Triage still reads, for Maya and for themself",
  async () => {
    const team = ok(await as(maya.token, "GET", `/v1/studio/${MAYA}/team`));
    const seeded = team.json.members.find((m) => m.account_id === account(4));
    expect(
      seeded?.roles.includes("triage") && seeded.revoked_at === null,
      "the seeded member does not read",
    );
    const four = await signIn(API, account(4), "/studio");
    const session = ok(await as(four.token, "GET", "/v1/studio/session"));
    const own = session.json.creators.find((c) => c.id === MAYA);
    expect(
      own?.roles.includes("triage"),
      "the member's own session does not read",
    );
    return `Maya reads ${[...seeded.roles].sort().join(",")}; the member reads ${[...own.roles].sort().join(",")}`;
  },
);
await finish();
