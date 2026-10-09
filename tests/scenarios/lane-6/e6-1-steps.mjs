// The Studio screens and interactions the E6.1 run walks, in order. A step opens one URL
// in a fresh tab (fresh sessionStorage); each shot may act on the page, then is captured.
import { ID } from "./fixtures.mjs";

const M = ID.maya;
const P = ID.priya;
const studio = (creator, path) => `/studio/${creator}/${path}`;
const btn = (p, name, exact = false) => p.getByRole("button", { name, exact });
const editor = (p) => p.locator("#note-text").waitFor({ timeout: 20000 });
const draftId = "70000000-0000-4000-8000-000000000001";

export const steps = [
  {
    id: "workspace",
    url: "/studio/workspace",
    shots: [{ name: "list", ready: "Invitation from Glazeco" }],
  },
  {
    id: "unavailable",
    url: studio("50000000-0000-4000-8000-000000000009", "notes"),
    shots: [{ name: "denied", ready: "Studio unavailable" }],
  },
  {
    id: "notes-owner",
    url: studio(M, "notes"),
    shots: [
      { name: "list", ready: "REPLIES" },
      {
        name: "filter-unread",
        act: (p) => p.getByLabel("Show replies").selectOption("unread"),
      },
      {
        name: "react-dialog",
        act: (p) => btn(p, "React", true).first().click(),
      },
    ],
  },
  {
    id: "notes-empty",
    mode: "empty",
    url: studio(M, "notes"),
    shots: [{ name: "empty", ready: "Your first Note" }],
  },
  {
    id: "notes-team",
    url: studio(P, "notes"),
    shots: [{ name: "list", ready: "REPLIES" }],
  },
  {
    id: "compose-new",
    url: studio(M, "compose"),
    shots: [
      { name: "empty", ready: editor },
      {
        name: "typed",
        act: async (p) => {
          await p
            .locator("#note-text")
            .fill("Kiln opens at nine.\nمرحبا 🔥 Please bring a mug.");
          await btn(p, "Followers").click();
          await p.getByLabel("Show audience size").check();
        },
      },
      {
        name: "saved",
        act: (p) => btn(p, "Save draft").click(),
        ready: "Draft revision 1 saved",
      },
      {
        name: "review-dialog",
        act: (p) => btn(p, "Review and sign").click(),
        ready: "Review and post",
      },
    ],
  },
  {
    id: "compose-edit",
    url: studio(M, `compose/${draftId}`),
    shots: [
      {
        name: "loaded",
        ready: (p) =>
          p.waitForFunction(
            () =>
              document
                .querySelector("#note-text")
                ?.value.startsWith("Draft: studio hours"),
            null,
            { timeout: 20000 },
          ),
      },
    ],
  },
  {
    id: "compose-team",
    url: studio(P, "compose"),
    shots: [
      { name: "empty", ready: editor },
      {
        name: "typed",
        act: (p) =>
          p.locator("#note-text").fill("Team draft for Priya to review."),
      },
    ],
  },
  {
    id: "requests",
    url: studio(M, "requests"),
    shots: [
      { name: "list", ready: "Written reply" },
      {
        name: "filter-due",
        act: (p) => p.getByLabel("Filter").selectOption("due"),
      },
      {
        name: "more",
        act: async (p) => {
          await p.getByLabel("Filter").selectOption("all");
          await btn(p, "More requests").click();
        },
        ready: "Written reply, extended",
      },
    ],
  },
  {
    id: "requests-empty",
    mode: "empty",
    url: studio(M, "requests"),
    shots: [{ name: "empty", ready: "You're up to date" }],
  },
  {
    id: "packet-submitted",
    url: studio(M, `packets/${"90000000-0000-4000-8000-000000000001"}`),
    shots: [
      { name: "detail", ready: "Included in your request" },
      {
        name: "instead",
        act: (p) => p.getByText("Instead", { exact: true }).click(),
      },
      {
        name: "accept-dialog",
        act: (p) => btn(p, "Accept promised service").click(),
        ready: "Review acceptance",
      },
    ],
  },
  {
    id: "packet-accepted",
    url: studio(M, `packets/${"90000000-0000-4000-8000-000000000002"}`),
    shots: [
      { name: "detail", ready: "Fulfill with a delivered reply" },
      {
        name: "deliveries",
        act: (p) => btn(p, "Open audited signed replies").click(),
        ready: "Use this delivered reply",
      },
    ],
  },
  {
    id: "publish",
    url: studio(M, "publish"),
    shots: [
      { name: "list", ready: "Firing schedule" },
      {
        name: "search",
        act: async (p) => {
          await p.getByLabel("Search your library").fill("celadon");
          await p.waitForTimeout(150); // let the page register its 200 ms search delay
          await p.clock.runFor(250);
        },
        ready: "How I mix a celadon",
      },
      {
        name: "new-post",
        act: (p) => btn(p, "New post").click(),
        ready: "Library entry",
      },
    ],
  },
  {
    id: "team-owner",
    url: studio(M, "team"),
    shots: [
      { name: "list", ready: "Invite a team member" },
      {
        name: "role-editor",
        act: (p) => btn(p, "Edit roles for @devon").click(),
        ready: "Review roles for @devon",
      },
    ],
  },
  {
    id: "team-member",
    url: studio(P, "team"),
    shots: [{ name: "list", ready: "Only the creator can invite" }],
  },
  {
    id: "threads-directory",
    url: studio(M, "threads"),
    shots: [{ name: "list", ready: "Open audited conversation" }],
  },
  {
    id: "thread-human",
    url: studio(M, `threads/${ID.fanB}`),
    shots: [
      { name: "timeline", ready: "Your words" },
      {
        name: "review-dialog",
        act: (p) => btn(p, "Review signed reply").click(),
        ready: "Review personal reply",
      },
      {
        name: "never-say-dialog",
        act: async (p) => {
          await p.keyboard.press("Escape");
          await btn(p, "I’d never say that").click();
        },
        ready: "Correct my AI",
      },
      {
        name: "approve-draft-dialog",
        act: async (p) => {
          await p.keyboard.press("Escape");
          await btn(p, "Review an AI-prepared draft").click();
        },
        ready: "Review an AI-prepared draft",
      },
    ],
  },
  {
    id: "thread-ai",
    url: studio(M, `threads/${ID.fanA}`),
    shots: [{ name: "timeline", ready: "Current speaker" }],
  },
  {
    id: "thread-team",
    url: studio(P, `threads/${ID.fanB}`),
    shots: [{ name: "timeline", ready: "Send as Team" }],
  },
  {
    id: "thanks",
    url: studio(M, "thanks"),
    shots: [{ name: "list", ready: "The celadon post helped" }],
  },
  {
    id: "thanks-empty",
    mode: "empty",
    url: studio(M, "thanks"),
    shots: [{ name: "empty", ready: "No shared thanks yet" }],
  },
  {
    id: "more",
    url: studio(M, "more"),
    shots: [{ name: "list", ready: "Verification and account" }],
  },
  {
    id: "suspended",
    url: studio(M, "notes"),
    shots: [
      {
        name: "reconnect",
        loaded: "REPLIES",
        setMode: "outage",
        act: (p) => p.clock.runFor(4100), // the next 4-second role check sees the outage
        ready: "Reconnect to Studio",
      },
      {
        name: "recovered",
        setMode: "default",
        act: async (p) => {
          await btn(p, "Check connection and roles").click();
          await p.waitForLoadState("networkidle"); // finish the role check first
          await p.clock.runFor(4100); // then Notes reads again on its own 4-second check
        },
        ready: "REPLIES",
      },
    ],
  },
];
