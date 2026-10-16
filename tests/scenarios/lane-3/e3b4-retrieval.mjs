// E3B.4 retrieval scenario: fans talk to Maya's AI through the real API while a
// recording edge in front of the model fake keeps every request the backend
// sends, so the scenario sees exactly which text was embedded for retrieval and
// which of Maya's passages reached the reply prompt (the evidence slot).
// Cases: a follow-up finds its evidence; a question outside Maya's materials;
// another fan's thread never enters a query (INV-11, also when two fans send at
// once); a members-only source is never retrieved for a fan without that tier
// (INV-08); a long history does not starve evidence; off the record; a
// 2,000-character previous turn. Fakes: development identity, model fake (or
// the founder's capped gateway with --real), and this recording edge, all at
// the outer edge.
//
// Needs a fresh stack whose backend sends OpenAI-host calls through the edge:
//   sh tests/scenarios/lane-3/fresh-stack.sh --env QELVORA_FAKE_MODEL_URL=http://127.0.0.1:56438
//   node tests/scenarios/lane-3/e3b4-retrieval.mjs [--out run.json] [--compare before.json]
// With the real model (embeddings stay on the fake; the gateway answers):
//   sh tests/scenarios/lane-3/fresh-stack.sh --provider anthropic --model-gateway http://127.0.0.1:56499 \
//     --env QELVORA_FAKE_MODEL_URL=http://127.0.0.1:56438
//   node tests/scenarios/lane-3/e3b4-retrieval.mjs --real
import { createServer, request } from "node:http";
import { readFileSync, writeFileSync } from "node:fs";
import { loadavg } from "node:os";
import {
  API,
  MODEL,
  ACTORS,
  MAYA_CREATOR_ID,
  call,
  closeDb,
  flag,
  key,
  openFan,
  percentile,
  reporter,
  signIn,
  sleep,
  sql,
  watchFrames,
} from "./lib.mjs";

const EDGE_PORT = Number(flag("--edge-port", "56438"));
const real = process.argv.includes("--real");
const delayMs = Number(flag("--delay", "100"));
const { step, advise, finish } = reporter();
const FAN = {
  a: ACTORS.fanOne,
  b: ACTORS.fanTwo,
  c: "10000000-0000-4000-8000-000000000004",
  d: "10000000-0000-4000-8000-000000000005",
  e: "10000000-0000-4000-8000-000000000006",
};
// A tier no fan holds: the stack seeds no tiers or memberships.
const MEMBERS_TIER = "30000000-0000-4000-8000-0000000000b4";

// Maya's synthetic materials, one passage each (under the 1,600-character chunk).
const SOURCES = [
  {
    topic: "glazes",
    title: "The two glazes I keep for cone 6 mugs",
    text: "For cone 6 mugs I keep two glazes on the shelf, and only two. The first glaze is Kiln Club White, a satin white that stays quiet on the outside of a mug and never runs. The second glaze is Ember Celadon, an iron celadon that pools green in the throwing lines and breaks olive brown over the rim. I dip mugs in the white for three seconds. Ember Celadon goes on thinner: one quick dip of about two seconds, because a thick coat of the celadon crawls on the handle. Both glazes are stirred through a sieve before every glazing day.",
  },
  {
    topic: "trimming",
    title: "Trimming a bowl at leather hard",
    text: "A bowl is ready to trim when it is leather hard: the rim holds its shape when you lift the bowl, the clay is cool, and a fingernail leaves a mark without smearing. Center the bowl upside down on the wheel head, tap it true and hold it with three small coils of soft clay. Trim with a sharp loop tool at a slow wheel speed and stop when the foot ring is as thick as the wall. Thin the base gradually rather than in one pass.",
  },
  {
    topic: "wedging",
    title: "Wedging reclaimed clay",
    text: "Reclaimed clay comes out of the bucket uneven, with wet pockets and dry crumbs. Dry the slurry on a plaster bat until it no longer sticks to your palm, then wedge it with ram's head wedging, about fifty turns, until a cut through the middle shows no air pockets or streaks. Air pockets in reclaimed clay are what make pots blow up in the bisque firing, so wedging is not optional for reclaim.",
  },
  {
    topic: "s-cracks",
    title: "Stopping S-cracks in the bottom of a pot",
    text: "S-cracks start in the bottom of a pot where the clay particles never got aligned. First, leave enough clay in the base, about a centimetre. Second, compress the bottom with a rubber rib after opening and again after pulling the walls: press from the centre outward three times. Third, sponge any water out of the bottom before taking the pot off the wheel, because water left in the base dries slowly and pulls the cracks open.",
  },
  {
    topic: "kiln-loading",
    title: "Loading the kiln with witness cones",
    text: "When loading the kiln I put a witness cone pack on the middle shelf, facing the spy hole, and a second pack near the bottom where my kiln fires cooler. The witness cones tell me what heat the work actually received, which the controller cannot. Leave a finger of space between pots and the elements, and never let glazed pots touch each other or the kiln posts on the shelves.",
  },
  {
    topic: "handles",
    title: "Pulling and attaching a mug handle",
    text: "Pull the handle from a carrot of soft clay with a wet hand, then let it stiffen until it holds a curve. Attach the handle when the mug body is soft leather hard, so both pieces shrink together. Score and slip both joins, press the top join firmly, and blend the bottom join with your thumb. Dry the mug upside down under plastic for two days so the handle does not crack away from the body.",
  },
  {
    topic: "drying",
    title: "Drying work slowly",
    text: "Slow drying prevents most cracks. Cover drying work loosely with plastic, open the plastic a little more each day, and keep pots away from heaters and direct sun. A damp box made from a plastic tub with a wet plaster slab holds handles and lids at the same dryness as their bodies.",
  },
  {
    topic: "safety",
    title: "Studio dust safety",
    text: "Dry clay dust contains silica, so I never sweep the studio floor. I wet mop the floor and wipe the tables with a damp sponge at the end of every session, and I wear a fitted respirator when mixing dry glaze materials. Keep food and drink out of the glaze area.",
  },
  {
    topic: "centering",
    title: "Centering on the wheel",
    text: "To center, brace your left elbow against your thigh and cone the clay up and down two or three times before you press it into a low dome. Keep your hands wet but not flooded, and let the wheel run fast while centering and slower when opening. If the clay wobbles under a still hand it is not centered yet.",
  },
  {
    topic: "underglaze",
    title: "Underglaze and wax resist",
    text: "Paint underglaze on greenware or bisque in three thin coats, letting each coat dry to matte before the next. Wax the foot of every pot before glazing so the glaze stops above the shelf line; a hot wax pot gives a cleaner edge than cold wax resist.",
  },
  {
    topic: "members",
    title: "Moonlit Shino (members only)",
    text: "Moonlit Shino is my members-only carbon trap shino recipe. Moonlit Shino is mostly nepheline syenite with spodumene and a little soda ash, applied thick, and the Moonlit Shino glaze is fired to cone 10 in heavy reduction so the soda ash traps carbon under the surface.",
    audience: { kind: "tier", ids: [MEMBERS_TIER] },
  },
];

const DIALOGUES = [
  {
    topic: "glazes",
    first: "Which two glazes do you keep for cone 6 mugs?",
    followUp: "What about the second one?",
  },
  {
    topic: "trimming",
    first: "How do you know a bowl is ready for trimming?",
    followUp: "How long does that usually take?",
  },
  {
    topic: "wedging",
    first: "How should I wedge reclaimed clay?",
    followUp: "Why does that matter?",
  },
  {
    topic: "s-cracks",
    first: "How do you stop S-cracks in the bottom of a pot?",
    followUp: "Can you say more about the second step?",
  },
  {
    topic: "kiln-loading",
    first: "Where do you put witness cones when loading the kiln?",
    followUp: "What happens if I skip that?",
  },
  {
    topic: "handles",
    first: "How do you attach a pulled handle to a mug?",
    followUp: "And when should I do it?",
  },
];

// ---------------------------------------------------------------- recording edge
const recorded = [];
const edge = createServer((req, res) => {
  const parts = [];
  req.on("data", (c) => parts.push(c));
  req.on("end", () => {
    const body = Buffer.concat(parts);
    const entry = { at: performance.now(), path: req.url, body: null };
    try {
      entry.body = JSON.parse(body.toString("utf8"));
    } catch {
      // A body that is not JSON is forwarded unchanged and not inspected.
    }
    recorded.push(entry);
    const target = new URL(MODEL);
    const upstream = request(
      {
        host: target.hostname,
        port: target.port,
        path: req.url,
        method: req.method,
        headers: { ...req.headers, host: target.host },
      },
      (up) => {
        res.writeHead(up.statusCode ?? 502, up.headers);
        const answer = [];
        up.on("data", (c) => {
          if (req.url.startsWith("/v1/embeddings")) answer.push(c);
          res.write(c);
        });
        up.on("end", () => {
          if (answer.length)
            try {
              entry.vectors = JSON.parse(
                Buffer.concat(answer).toString("utf8"),
              ).data.map((d) => d.embedding);
            } catch {
              // Only used for the distance check below.
            }
          res.end();
        });
      },
    );
    upstream.on("error", () => {
      res.writeHead(502);
      res.end();
    });
    upstream.end(body);
  });
});
await new Promise((resolve, reject) => {
  edge.once("error", reject);
  edge.listen(EDGE_PORT, "127.0.0.1", resolve);
});

/** The slots of a reply request (OpenAI: one user turn of "\n\n"-joined slots). */
function replySlots(entry) {
  const content = entry.body?.input?.[0]?.content;
  if (typeof content !== "string") return null;
  const slots = {};
  for (const piece of content.split("\n\n")) {
    try {
      const value = JSON.parse(piece);
      if (value && typeof value === "object" && !Array.isArray(value))
        Object.assign(slots, value);
    } catch {
      // The compiled prefix is not JSON.
    }
  }
  return "slot4" in slots ? slots : null;
}
/** Retrieval queries are single-text embedding requests (ingestion sends batches). */
const isQuery = (e) =>
  e.path.startsWith("/v1/embeddings") &&
  Array.isArray(e.body?.input) &&
  e.body.input.length === 1;

// ---------------------------------------------------------------- Maya's setup
const agent = `/v1/agent/${MAYA_CREATOR_ID}`;
const maya = await signIn(API, ACTORS.maya, "/studio/ai");
const asMaya = (method, path, body) =>
  call(API, method, agent + path, {
    token: maya.token,
    body,
    headers: { "Idempotency-Key": key("e3b4-maya") },
  });
const readState = async () => (await asMaya("GET", "/state")).json;

if (!real) {
  const control = await call(MODEL, "POST", "/__control", {
    body: { mode: "ok", delayMs },
  });
  step(
    "model fake ready",
    control.status === 200,
    `${delayMs} ms per call and chunk`,
  );
}
const sourceIds = new Map();
for (const source of SOURCES) {
  const made = await asMaya("POST", "/sources", {
    title: source.title,
    text: source.text,
    origin: "manual_text",
    audience: source.audience ?? { kind: "public" },
    rightsEvidence: "Synthetic test material written for this scenario.",
    expiresAt: null,
  });
  if (made.status !== 200) {
    step(`source "${source.topic}" created`, false, made.text.slice(0, 160));
    finish();
  }
  sourceIds.set(made.json.id, source.topic);
  const [row] = await sql(
    "SELECT state,revision FROM creator.ai_source WHERE id=$1",
    [made.json.id],
  );
  if (row.state === "candidate") {
    const approved = await asMaya("POST", `/sources/${made.json.id}`, {
      expectedRevision: row.revision,
      action: "approve",
      rightsConfirmed: true,
    });
    if (approved.status !== 200) {
      step(`source "${source.topic}" approved`, false, approved.text);
      finish();
    }
  }
}
let ready = [];
for (let waited = 0; waited < 120; waited += 2) {
  ready = await sql(
    "SELECT id::text FROM creator.ai_source WHERE creator_id=$1 AND state='approved' AND index_state='ready' AND id=ANY($2::uuid[])",
    [MAYA_CREATOR_ID, [...sourceIds.keys()]],
  );
  if (ready.length === SOURCES.length) break;
  await sleep(2000);
}
step(
  "Maya's materials indexed",
  ready.length === SOURCES.length,
  `${ready.length}/${SOURCES.length} sources, one of them for a members tier no fan holds`,
);
let state = await readState();
if (!state.liveVersion) {
  const configuration = {
    mode: "expert",
    tone: "As written",
    styleCard: "",
    examples: [],
    rules: ["Always say you are the creator's AI, never the creator."],
    neverReveal: ["home address"],
    handoff: "Offer to ask Maya to step in when a question needs her.",
    dailyCostCapMicros: 20_000_000,
    sessionNudgeMinutes: 90,
    usefulnessCriteria: "Helpful, specific and honest about being an AI.",
    styleCriteria: "Warm, plain and short.",
  };
  const must = (reply, status, what) => {
    if (reply.status !== status) {
      step(what, false, `${reply.status} ${reply.text.slice(0, 200)}`);
      finish();
    }
  };
  must(
    await asMaya("PUT", "/draft", {
      expectedRevision: state.revision,
      configuration,
    }),
    200,
    "draft",
  );
  must(
    await asMaya("POST", "/license", {
      proofReference: `development-synthetic:${MAYA_CREATOR_ID}`,
      counselVersion: "development-synthetic-unreviewed",
      permittedUses: ["text_ai"],
      termEndsAt: new Date(Date.now() + 365 * 86400_000).toISOString(),
    }),
    200,
    "license",
  );
  state = await readState();
  must(
    await asMaya("POST", "/evaluations", { expectedRevision: state.revision }),
    202,
    "evaluation",
  );
  let evaluation;
  for (
    let waited = 0;
    waited < 300 && (!evaluation || evaluation.state === "running");
    waited += 2
  ) {
    await sleep(2000);
    evaluation = (await readState()).evaluation;
  }
  if (evaluation?.state !== "passed") {
    step("evaluation", false, evaluation?.state ?? "none");
    finish();
  }
  state = await readState();
  must(
    await asMaya("POST", "/publish", {
      expectedRevision: state.revision,
      evaluationId: evaluation.id,
      changes: "E3B.4 retrieval scenario",
    }),
    200,
    "publish",
  );
  state = await readState();
}
const [version] = await sql(
  "SELECT v.pipeline_hash, jsonb_array_length(v.source_set) AS sources FROM creator.ai_version v JOIN creator.ai_workspace w ON w.live_version_id=v.id WHERE w.creator_id=$1",
  [MAYA_CREATOR_ID],
);
step(
  "Maya's expert AI is live with her materials",
  Boolean(state.liveVersion) && version?.sources === SOURCES.length,
  `engine ${version?.pipeline_hash?.slice(0, 12)}, ${version?.sources} sources in the version`,
);

// ---------------------------------------------------------------- conversation
const fans = {};
for (const [name, account] of Object.entries(FAN)) {
  const fan = await openFan(account, `e3b4${name}`);
  fan.name = name;
  fan.watch = watchFrames(fan.token, fan.fan.id);
  await fan.watch.ready;
  fan.sent = 0;
  fans[name] = fan;
}
step("five fans signed in and subscribed", Object.keys(fans).length === 5);

const results = [];
/** What the fan's screen shows for the answer to `text`: its words and citations. */
async function answerTo(fan, text) {
  const page = (await call(API, "GET", fan.thread, { token: fan.token })).json;
  const messages = [...(page?.messages ?? [])].sort(
    (a, b) => a.sequence - b.sequence,
  );
  const at = messages.findLastIndex(
    (m) => m.authorKind === "fan" && m.text === text,
  );
  const after = [];
  for (const m of messages.slice(at + 1)) {
    if (m.authorKind === "fan") break;
    if (m.authorKind === "ai") after.push(m);
  }
  return {
    text: after.map((m) => m.text).join(" "),
    citations: [...new Set(after.flatMap((m) => m.citations ?? []))],
  };
}
async function citationTopics(ids) {
  if (!ids.length) return [];
  const rows = await sql(
    "SELECT id::text, source_id::text FROM creator.ai_chunk WHERE id=ANY($1::uuid[])",
    [ids],
  );
  return ids.map((id) => {
    const row = rows.find((r) => r.id === id);
    return row
      ? (sourceIds.get(row.source_id) ?? row.source_id)
      : `unknown:${id}`;
  });
}
/** Send one message and wait for the answer; return what the model saw. */
async function ask(fan, text, label) {
  const mark = recorded.length;
  const started = performance.now();
  const sent = await call(API, "POST", `${fan.thread}/messages`, {
    token: fan.token,
    body: { idempotencyKey: key("e3b4"), text, clientSequence: ++fan.sent },
  });
  if (sent.status !== 200) {
    const failed = {
      label,
      fan: fan.name,
      text,
      end: "refused",
      cited: [],
      error: `send ${sent.status} ${sent.text.slice(0, 120)}`,
    };
    results.push(failed);
    return failed;
  }
  const g = sent.json.generationId;
  const ends = ["delivered", "interrupted"];
  const first = await fan.watch.until(
    (f) =>
      f.generationId === g &&
      f.authorKind === "ai" &&
      (f.kind === "sentence" || ends.includes(f.kind)),
    180_000,
  );
  const end = await fan.watch.until(
    (f) => f.generationId === g && ends.includes(f.kind),
    180_000,
  );
  const answer = await answerTo(fan, text);
  const entries = recorded.slice(mark);
  const query = entries.find(
    (e) => isQuery(e) && String(e.body.input[0]).endsWith(text),
  );
  const reply = entries
    .map((e) => ({ e, slots: replySlots(e) }))
    .find((x) => x.slots && x.slots.slot8?.message === text);
  const evidence = reply?.slots.slot4?.untrustedEvidence ?? null;
  const result = {
    label,
    fan: fan.name,
    text,
    end: end?.kind ?? "none",
    first: first?.kind === "sentence" ? first.at - started : null,
    query: query ? String(query.body.input[0]) : null,
    vector: query?.vectors?.[0] ?? null,
    evidence:
      evidence?.map((p) => sourceIds.get(p.sourceId) ?? p.sourceId) ?? null,
    history: reply?.slots.slot7?.messages?.length ?? null,
    answerText: answer.text,
    cited: await citationTopics(answer.citations),
  };
  results.push(result);
  return result;
}
const clip = (text, n) =>
  JSON.stringify(text.length > n ? `${text.slice(0, n)}…` : text);
const show = (r) =>
  r.error ??
  `${r.end}; query ${r.query == null ? "not seen" : clip(r.query, 70)}; evidence [${r.evidence?.join(", ") ?? "not seen"}]${real ? `; cited [${r.cited.join(", ")}]` : ""}`;

// Restart: `--restart-phase open`, then stop and start the stack, then
// `--restart-phase follow`. The previous turn comes from the database.
const phase = flag("--restart-phase");
if (phase) {
  const [d] = DIALOGUES;
  if (phase === "open") {
    const opening = await ask(fans.a, d.first, "restart: opening");
    step(
      "opening sent before the restart",
      opening.end === "delivered",
      show(opening),
    );
  } else if (phase === "historical") {
    // A version published before revision 15 keeps its own retrieval.
    const follow = await ask(fans.a, d.followUp, "restart: follow-up");
    step(
      "a version published on revision 14 still answers, embedding the message alone",
      follow.end === "delivered" && follow.query === d.followUp,
      show(follow),
    );
  } else {
    const follow = await ask(fans.a, d.followUp, "restart: follow-up");
    step(
      "after a restart the follow-up is embedded with the turn before it",
      follow.end === "delivered" &&
        follow.query === `${d.first}\n\n${d.followUp}` &&
        follow.evidence?.includes(d.topic),
      show(follow),
    );
  }
  for (const fan of Object.values(fans)) fan.watch.close();
  edge.close();
  await closeDb();
  finish();
}

// 1. Follow-ups find their evidence.
const dialogues = real ? DIALOGUES.slice(0, 1) : DIALOGUES;
let hits = 0;
for (const d of dialogues) {
  const opening = await ask(fans.a, d.first, `${d.topic}: opening`);
  advise(
    `${d.topic}: the opening question finds its passage`,
    opening.evidence?.includes(d.topic) ?? opening.cited.includes(d.topic),
    show(opening),
  );
  const follow = await ask(fans.a, d.followUp, `${d.topic}: follow-up`);
  const hit = real
    ? follow.cited.includes(d.topic)
    : (follow.evidence?.includes(d.topic) ?? false);
  if (hit) hits++;
  advise(
    `${d.topic}: the follow-up "${d.followUp}" finds its passage`,
    hit,
    `${show(follow)}${real ? `; answer ${clip(follow.answerText, 200)}` : ""}`,
  );
}
step(
  "follow-ups find their evidence",
  hits === dialogues.length,
  real
    ? `${hits} of ${dialogues.length} follow-up answers cite their topic's passage`
    : `${hits} of ${dialogues.length} follow-ups had their topic's passage in the evidence slot`,
);

// 2. Nothing in Maya's materials.
const outside = await ask(
  fans.b,
  "What's the best way to patch a bicycle tire?",
  "outside: question",
);
step(
  "a question outside Maya's materials gets no citation",
  outside.end === "delivered" && outside.cited.length === 0,
  `${show(outside)}; answer ${clip(outside.answerText, 220)}`,
);
const outsideFollow = await ask(
  fans.b,
  "And what about the valve?",
  "outside: follow-up",
);
step(
  "its follow-up gets no citation either",
  outsideFollow.end === "delivered" && outsideFollow.cited.length === 0,
  `${show(outsideFollow)}; answer ${clip(outsideFollow.answerText, 220)}`,
);

// 3. INV-08: the members-only passage is never retrieved for a fan without the tier.
const tier = await ask(
  fans.c,
  "What is your Moonlit Shino recipe?",
  "members: question",
);
const tierFollow = await ask(
  fans.c,
  "What cone is it fired to?",
  "members: follow-up",
);
const nearest = tier.vector
  ? await sql(
      "SELECT c.source_id::text FROM creator.ai_chunk c WHERE c.creator_id=$1 AND c.embedding IS NOT NULL ORDER BY c.embedding OPERATOR(public.<=>) $2::vector, c.id LIMIT 1",
      [MAYA_CREATOR_ID, JSON.stringify(tier.vector)],
    )
  : [];
step(
  "without the audience filter the members-only passage would be the nearest",
  sourceIds.get(nearest[0]?.source_id) === "members",
  `nearest over all of Maya's chunks: ${sourceIds.get(nearest[0]?.source_id) ?? "none"}`,
);
step(
  "the members-only passage never reaches a fan without the tier (INV-08)",
  [tier, tierFollow].every(
    (r) =>
      r.end === "delivered" &&
      (real || r.evidence !== null) &&
      !(r.evidence ?? []).includes("members") &&
      !r.cited.includes("members"),
  ),
  `${show(tier)} | ${show(tierFollow)}`,
);

// 4. INV-11: another fan's thread never enters a query.
const fresh = await ask(
  fans.d,
  "What about the second one?",
  "other fan: first message",
);
step(
  "a fan's first message is embedded alone, never with another fan's turn (INV-11)",
  fresh.query === "What about the second one?",
  show(fresh),
);
if (!real) {
  // Two fans with their own earlier turns send follow-ups at the same moment.
  await ask(
    fans.d,
    "Do you put zanzibarite in your clay body?",
    "race: fan d opening",
  );
  await ask(fans.e, "Is quokkastone good for handles?", "race: fan e opening");
  const [rd, re] = await Promise.all([
    ask(fans.d, "Tell me more about that.", "race: fan d follow-up"),
    ask(fans.e, "Tell me more about it.", "race: fan e follow-up"),
  ]);
  step(
    "two fans' simultaneous follow-ups never carry each other's words (INV-11)",
    rd.end === "delivered" &&
      re.end === "delivered" &&
      rd.query !== null &&
      re.query !== null &&
      !rd.query.includes("quokkastone") &&
      !re.query.includes("zanzibarite"),
    `fan d ${clip(rd.query ?? "not seen", 90)}; fan e ${clip(re.query ?? "not seen", 90)}`,
  );
  const own = {
    a: /cone 6 mugs|bowl is ready|reclaimed clay|S-cracks|witness cones|pulled handle/u,
    d: /zanzibarite/u,
    e: /quokkastone/u,
  };
  const leaks = results.filter(
    (r) =>
      r.query &&
      Object.entries(own).some(
        ([owner, words]) => owner !== r.fan && words.test(r.query),
      ),
  );
  step(
    "no query in the whole run carries another fan's words (INV-11)",
    leaks.length === 0,
    `${results.filter((r) => r.query).length} queries checked${leaks.length ? `; leaked into ${leaks.map((r) => r.label).join(", ")}` : ""}`,
  );

  // 5. A long history does not starve evidence.
  const diary =
    "Studio diary, week of firing: I spent the morning sorting buckets, labelling shelves, answering emails about the open studio, and listening to a long podcast about bread. ";
  for (let i = 0; i < 5; i++)
    await ask(
      fans.c,
      `Entry ${i + 1}. ${diary.repeat(12)}`.slice(0, 1990),
      `long history: entry ${i + 1}`,
    );
  const starved = await ask(
    fans.c,
    "Which two glazes do you keep for cone 6 mugs?",
    "long history: question",
  );
  step(
    "after a long history the question still gets its evidence",
    (starved.evidence?.length ?? 0) >= 2 && starved.evidence.includes("glazes"),
    `${starved.evidence?.length ?? 0} passages [${starved.evidence?.join(", ") ?? ""}], ${starved.history} history lines kept`,
  );

  // 6. Off the record: no earlier turn is available, so none is embedded.
  const page = (await call(API, "GET", fans.e.thread, { token: fans.e.token }))
    .json;
  const otr = await call(API, "POST", `${fans.e.thread}/preferences`, {
    token: fans.e.token,
    body: {
      offTheRecord: true,
      introShared: false,
      expectedRevision: page.revision,
    },
  });
  step("fan e goes off the record", otr.status === 200, `${otr.status}`);
  await ask(
    fans.e,
    "How do you know a bowl is ready for trimming?",
    "off the record: opening",
  );
  const otrFollow = await ask(
    fans.e,
    "How long does that usually take?",
    "off the record: follow-up",
  );
  step(
    "off the record, the follow-up is embedded alone",
    otrFollow.query === "How long does that usually take?",
    show(otrFollow),
  );

  // 7. A previous turn at the 2,000-character limit.
  const longTurn =
    `Which glazes do you keep for cone 6 mugs? ${"I am asking because my mugs keep crawling near the handle. ".repeat(40)}`
      .slice(0, 2000)
      .trim();
  const opened = await ask(fans.b, longTurn, "boundary: 2,000-character turn");
  const afterLong = await ask(
    fans.b,
    "What about the second one?",
    "boundary: follow-up",
  );
  step(
    "a 2,000-character previous turn is embedded whole with the follow-up",
    opened.end === "delivered" &&
      afterLong.end === "delivered" &&
      [
        "What about the second one?",
        `${longTurn}\n\nWhat about the second one?`,
      ].includes(afterLong.query),
    `turn ${longTurn.length} characters, query ${afterLong.query?.length ?? 0} characters; ${show(afterLong)}`,
  );
}

const firsts = results.map((r) => r.first).filter((v) => v != null);
const summary = {
  when: new Date().toISOString(),
  load: loadavg()[0],
  real,
  engine: version?.pipeline_hash,
  followUpHits: `${hits}/${dialogues.length}`,
  firstSentence: { p50: percentile(firsts, 50), p95: percentile(firsts, 95) },
  delivered: `${results.filter((r) => r.end === "delivered").length}/${results.length}`,
  results: results.map((r) => ({ ...r, vector: undefined })),
};
process.stdout.write(
  `\nfollow-ups ${summary.followUpHits} | first sentence p50 ${Math.round(summary.firstSentence.p50 ?? 0)} ms p95 ${Math.round(summary.firstSentence.p95 ?? 0)} ms | ${summary.delivered} delivered | load ${summary.load.toFixed(1)}\n`,
);
const out = flag("--out");
if (out) writeFileSync(out, JSON.stringify(summary, null, 2));
const compare = flag("--compare");
if (compare) {
  const before = JSON.parse(readFileSync(compare, "utf8"));
  process.stdout.write(
    `\n${"case".padEnd(32)} ${"evidence before".padEnd(46)} evidence after\n`,
  );
  for (const r of summary.results) {
    const b = before.results.find(
      (x) => x.label === r.label && x.fan === r.fan,
    );
    process.stdout.write(
      `${r.label.padEnd(32)} ${`[${b?.evidence?.join(",") ?? "-"}]`.padEnd(46)} [${r.evidence?.join(",") ?? "-"}]\n`,
    );
  }
}
for (const fan of Object.values(fans)) fan.watch.close();
edge.close();
await closeDb();
finish();
