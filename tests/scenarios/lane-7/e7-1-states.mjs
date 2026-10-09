// E7.1 fixtures: every thread state opens on both platforms and shows what the
// server says about it, and live delivery (a Note, a streamed reply, a takeover
// in the middle of a reply, a dropped connection) reaches an open thread.
//   node tests/scenarios/lane-7/e7-1-states.mjs [ios|android]
import * as L from "./lib.mjs";

const THREADS = [
  { n: 1, name: "Maya", control: "ai_active", reason: null },
  { n: 2, name: "Kiln Club", control: "human_active", reason: null },
  {
    n: 3,
    name: "Glazeco",
    control: "ai_paused",
    reason: /AI messaging is paused in this conversation/u,
  },
  {
    n: 4,
    name: "Tom.s Reyes",
    control: "ai_active",
    reason: /Your AI access or allowance is unavailable/u,
  },
  {
    n: 5,
    name: "Ines Duarte",
    control: "ai_active",
    reason: /Review the AI providers before messaging/u,
  },
  {
    n: 6,
    name: "Noor Haddad",
    control: "closed",
    reason: /AI messaging is paused in this conversation/u,
  },
];
const open = (n) =>
  `/threads/c1000000-0000-4000-8000-00000000000${n}/f1000000-0000-4000-8000-000000000001`;
const mark = async () => (await L.log()).at(-1)?.n ?? 0;
const thread = async (handle) =>
  (await L.state()).threads.find(
    (t) => t.creator === handle && t.account === "devon",
  );
const stopHarness = await L.ensureHarness();

for (const p of L.platforms(process.argv[2])) {
  L.stop(p);
  await L.harness("POST", "/__harness/reset");
  await L.harness("POST", "/__harness/flags", {
    replyDelayMs: 300,
    sentenceDelayMs: 2500,
  });
  const waitLog = (since, match, ms) => L.waitForLog(since, match, ms, p);

  // Every state a thread can be in opens from one signed-in fan.
  for (const t of THREADS) {
    const since = await mark();
    if (t.n === 1)
      L.launch(p, "--reset", "--actor", "devon", "--to", open(t.n));
    else L.launch(p, "--to", open(t.n));
    const entries = await waitLog(since, {
      path: /conversations\/c1000000-0000-4000-8000-00000000000\d\/f1/u,
      status: 200,
      account: "devon",
    });
    const screen = await L.waitForText(p, new RegExp(t.name, "u"));
    const reason = t.reason
      ? await L.waitForText(p, t.reason, 8000)
      : { ok: true, text: screen.text };
    L.step(
      p,
      `S${t.n} ${t.name} (${t.control}${t.reason ? ", composer says why" : ""})`,
      L.seen(entries, { status: 200 }).length > 0 && screen.ok && reason.ok,
    );
    L.screenshot(p, `state-${t.n}`);
  }

  // Live delivery into an open thread (Maya's).
  L.launch(p, "--to", open(1));
  await L.waitForText(p, /Maya/u);
  await L.sleep(3000);
  await L.harness("POST", "/__harness/threads/maya/note", {
    text: "Studio note: closed on Monday for a kiln repair.",
  });
  let screen = await L.waitForText(p, /closed on Monday/u, 15000);
  L.step(
    p,
    "L1 a Note posted while the thread is open appears without any action",
    screen.ok,
  );

  // Which reply the harness gives depends on the length of the question, so the
  // two replies below are different and a sentence of one can be told from the other.
  await L.harness("POST", "/__harness/threads/maya/ask", {
    text: "Question from my other device",
  });
  screen = await L.waitForText(p, /That depends on a few things/u, 15000);
  const full = await L.waitForText(
    p,
    /point to the posts that cover it/u,
    20000,
  );
  let reply = await thread("maya");
  for (let i = 0; i < 20 && reply.generating; i += 1) {
    await L.sleep(500);
    reply = await thread("maya");
  }
  L.step(
    p,
    "L2 a reply streams in sentence by sentence and ends delivered once",
    screen.ok &&
      full.ok &&
      reply.messages.filter((m) => /ai delivered: That depends/u.test(m))
        .length === 1 &&
      !reply.generating,
  );

  // Slow the sentences so the takeover lands after the first, however slow the screen read is.
  await L.harness("POST", "/__harness/flags", { sentenceDelayMs: 6000 });
  await L.harness("POST", "/__harness/threads/maya/ask", {
    text: "Another question",
  });
  // The first sentence arrives at 0.3 s and the next at 6.3 s: 1.5 s is between them.
  await L.sleep(1500);
  await L.harness("POST", "/__harness/threads/maya/takeover");
  await L.sleep(6000);
  screen = await L.waitForText(p, /Maya is here/u, 10000);
  const interrupted = await thread("maya");
  L.step(
    p,
    "L3 a takeover in the middle of a reply: the reply stops, the person is announced (INV-03)",
    screen.ok &&
      interrupted.control === "human_active" &&
      interrupted.messages.some((m) =>
        /ai interrupted: Here's how I'd think about that\.$/u.test(m),
      ) &&
      /think about that/u.test(screen.text) &&
      /interrupted/iu.test(screen.text) &&
      !/Start with the simplest change/u.test(screen.text),
  );

  await L.harness("POST", "/__harness/flags", { sentenceDelayMs: 2500 });
  await L.harness("POST", "/__harness/threads/maya/handback");
  screen = await L.waitForText(p, /left the conversation/u, 12000);
  L.step(p, "L4 handing back is announced", screen.ok);

  await L.harness("POST", "/__harness/sockets/close");
  await L.sleep(500);
  await L.harness("POST", "/__harness/threads/maya/note", {
    text: "Second note: the clinic starts at 6pm.",
  });
  screen = await L.waitForText(p, /clinic starts at 6pm/u, 25000);
  const count = (screen.text.match(/clinic starts at 6pm/gu) ?? []).length;
  const stored = (await thread("maya")).messages.filter((m) =>
    /clinic starts at 6pm/u.test(m),
  ).length;
  L.step(
    p,
    "L5 the live connection drops: the app reconnects, catches up, shows the Note once",
    screen.ok && count === 1 && stored === 1,
    `on screen ${count}, stored ${stored}`,
  );
}
await L.harness("POST", "/__harness/flags", {
  replyDelayMs: 500,
  sentenceDelayMs: 450,
});
stopHarness();
L.finish();
