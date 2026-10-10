// The fake API's world: who can sign in, which creators exist, and one
// conversation per state a thread can be in. Synthetic data only (the sample
// names Maya, Kiln Club, Glazeco and Devon are sample content, not product
// naming). Every shape here is checked against the real contracts by
// check-contract.mjs.
import { readFileSync } from "node:fs";

const copyTable = JSON.parse(
  readFileSync(
    new URL("../../../../config/copy.json", import.meta.url),
    "utf8",
  ),
);
/** Strings the real server formats from config/copy.json, formatted the same way. */
export const copy = (key, vars = {}) =>
  (copyTable[key] ?? key).replace(
    /\{(\w+)\}/gu,
    (_, name) => vars[name] ?? `{${name}}`,
  );

/** Valid, stable UUIDs: `kind` is eight hex digits, `n` the entity number. */
export const uid = (kind, n) =>
  `${kind}-0000-4000-8000-${String(n).padStart(12, "0")}`;
export const ids = {
  account: (n) => uid("a1000000", n),
  fan: (n) => uid("f1000000", n),
  creatorAccount: (n) => uid("ca000000", n),
  creator: (n) => uid("c1000000", n),
  thread: (n) => uid("71000000", n),
  message: (n) => uid("e1000000", n),
  signed: (n) => uid("5a000000", n),
  post: (n) => uid("b1000000", n),
  note: (n) => uid("d1000000", n),
};

export const POLICY = {
  version: "harness-providers-1",
  providers: [
    {
      name: "Synthetic provider",
      termsUrl: "https://example.invalid/terms",
      noTraining: true,
      noRetention: true,
    },
  ],
  verified: true,
};

/** The accounts the sign-in chooser offers. Every fan sees the same creators;
 * only Devon has conversations, so each state is one thread away. */
export const PERSONAS = [
  {
    n: 1,
    key: "devon",
    label: "Harness: Devon, a fan with every thread state",
    fan: { handle: "devon_k", intro: "Hobby potter in Leeds." },
    threads: true,
    follows: ["maya", "kilnclub"],
  },
  {
    n: 2,
    key: "priya",
    label: "Harness: Priya, a fan with nothing yet",
    fan: { handle: "priya_n", intro: "" },
    threads: false,
    follows: [],
  },
  {
    n: 3,
    key: "newfan",
    label: "Harness: a new fan who has not chosen a handle",
    fan: null,
    threads: false,
    follows: [],
  },
  {
    n: 4,
    key: "maya",
    label: "Harness: Maya, a creator account",
    fan: { handle: "maya_fan", intro: "" },
    creator: { handle: "maya", displayName: "Maya" },
    threads: false,
    follows: [],
  },
  {
    n: 5,
    key: "minor",
    label: "Harness: an account under 18 (refused)",
    fan: null,
    adult: false,
    threads: false,
    follows: [],
  },
];

const CREATORS = [
  {
    n: 1,
    handle: "maya",
    name: "Maya",
    category: "Crafts",
    mode: "expert_and_companion",
    state: "published",
    topics: ["glazing", "kiln firing", "studio life"],
    bio: "Potter in Leeds. Teaches glaze chemistry and runs a Friday studio clinic.",
    capacity:
      "Maya answers written replies within 2 days · 3 of 5 left this week.",
    membership: "Studio member",
  },
  {
    n: 2,
    handle: "kilnclub",
    name: "Kiln Club",
    category: "Crafts",
    mode: "expert",
    state: "published",
    topics: ["firing schedules", "kiln repair"],
    bio: "A small team that fires other people's work and answers kiln questions.",
    capacity:
      "The team answers written replies within 3 days · 5 of 8 left this week.",
    membership: null,
  },
  {
    n: 3,
    handle: "glazeco",
    name: "Glazeco",
    category: "Crafts",
    mode: "expert",
    state: "paused",
    topics: ["glaze supplies"],
    bio: "Glaze supplier. Answers are paused while the studio restocks.",
    capacity: "Paused until the restock is done.",
    membership: null,
  },
  {
    n: 4,
    handle: "tomasreyes",
    name: "Tomás Reyes",
    category: "Crafts",
    mode: "expert",
    state: "published",
    topics: ["letterpress", "type design"],
    bio: "Letterpress printer and type designer.",
    capacity:
      "Tomás answers written replies within 4 days · 1 of 3 left this week.",
    membership: null,
  },
  {
    n: 5,
    handle: "inesduarte",
    name: "Ines Duarte",
    category: "Music",
    mode: "companion",
    state: "published",
    topics: ["fado", "voice practice"],
    bio: "Fado singer. Writes about daily practice.",
    capacity:
      "Ines answers written replies within 5 days · 2 of 4 left this week.",
    membership: null,
  },
  {
    n: 6,
    handle: "noorhaddad",
    name: "Noor Haddad",
    category: "Food",
    mode: "expert_and_companion",
    state: "published",
    topics: ["bread", "fermentation"],
    bio: "Baker. Sourdough notes and a weekly question hour.",
    capacity:
      "Noor answers written replies within 2 days · 4 of 6 left this week.",
    membership: null,
  },
  {
    n: 7,
    handle: "lenapark",
    name: "Lena Park",
    category: "Crafts",
    mode: "companion",
    state: "published",
    topics: ["weaving"],
    bio: "Weaver. Draft patterns and loom questions.",
    capacity:
      "Lena answers written replies within 3 days · 6 of 6 left this week.",
    membership: null,
  },
];

/** One conversation per state. `rich` has every message kind the contract allows. */
const THREADS = [
  { n: 1, creator: "maya", control: "ai_active", rich: true },
  { n: 2, creator: "kilnclub", control: "human_active", epoch: 2 },
  { n: 3, creator: "glazeco", control: "ai_paused", epoch: 1 },
  { n: 4, creator: "tomasreyes", control: "ai_active", access: false },
  { n: 5, creator: "inesduarte", control: "ai_active", consent: false },
  { n: 6, creator: "noorhaddad", control: "closed", epoch: 3 },
];

const POSTS = {
  maya: [
    {
      n: 1,
      title: "Why celadon pinholes",
      body: "Pinholes in celadon usually come from gas escaping a thin glaze layer. Slow the cooling and check the bisque temperature before blaming the glaze.\n\nI test every new batch on three tiles first.",
      kind: "human_creator",
      ai: true,
    },
    {
      n: 2,
      title: "Friday glaze clinic is back",
      body: "Bring one test tile and your firing notes. Followers get the first places.",
      kind: "human_broadcast",
      ai: false,
    },
  ],
};

const iso = (ms) => new Date(ms).toISOString();

export function createWorld({ now = () => Date.now() } = {}) {
  const world = {
    startedAt: Date.now(),
    clockOffsetMs: 0,
    now: () => now() + world.clockOffsetMs,
    log: [],
    requestCount: 0,
    faults: [],
    timers: new Set(),
    sockets: new Set(),
    sessions: new Map(),
    continuations: new Map(),
    accounts: new Map(),
    creators: new Map(),
    threads: new Map(),
    notifications: [],
    follows: new Map(),
    devices: [],
    preferences: new Map(),
    nextMessage: 100,
    sessionSeq: 0,
    replyDelayMs: 500,
    sentenceDelayMs: 450,
    generationAvailable: true,
    policy: structuredClone(POLICY),
  };
  seed(world);
  return world;
}

export function seed(world) {
  for (const t of world.timers) clearTimeout(t);
  world.timers.clear();
  for (const socket of world.sockets) socket.close(1013, "Harness reset");
  for (const key of [
    "sessions",
    "continuations",
    "accounts",
    "creators",
    "threads",
    "follows",
    "preferences",
  ])
    world[key].clear();
  world.notifications = [];
  world.devices = [];
  world.faults = [];
  world.generationAvailable = true;
  world.policy = structuredClone(POLICY);
  world.clockOffsetMs = 0;
  for (const c of CREATORS) {
    world.creators.set(ids.creator(c.n), {
      id: ids.creator(c.n),
      accountId: ids.creatorAccount(c.n),
      handle: c.handle,
      name: c.name,
      state: c.state,
      public: {
        id: ids.creator(c.n),
        version: 1,
        handle: c.handle,
        name: c.name,
        biography: c.bio,
        category: c.category,
        mode: c.mode,
        state: c.state,
        verified: true,
        topics: c.topics,
        sourceSummary: `${c.topics.length} sources from ${c.name}'s own posts and notes.`,
        reliability: "Usually answers within the stated time.",
        capacity: c.capacity,
        presence:
          c.state === "paused" ? "Paused for now." : "Active this week.",
        photoCaption: `${c.name}, in the studio`,
        membershipLabel: c.membership,
        accessLines: [
          "You can: talk with their AI for free.",
          "Included: answers that cite their own work.",
          "By request: a signed reply from them.",
          "Changes: they can step in at any time.",
        ],
        updatedAt: iso(world.startedAt),
      },
      posts: (POSTS[c.handle] ?? []).map((p) => ({
        id: ids.post(p.n),
        creatorId: ids.creator(c.n),
        version: 1,
        state: "published",
        audience: "public",
        title: p.title,
        body: p.body,
        authorKind: p.kind,
        authorLabel:
          p.kind === "human_broadcast"
            ? copy("noteAudience", { name: c.name, audience: "followers" })
            : c.name,
        signedActId: ids.signed(p.n),
        publishedAt: iso(world.startedAt - (3 - p.n) * 86_400_000),
        aiContextEligible: p.ai,
      })),
    });
  }
  for (const p of PERSONAS) {
    const account = {
      id: ids.account(p.n),
      key: p.key,
      label: p.label,
      adult: p.adult !== false,
      fan: p.fan && {
        id: ids.fan(p.n),
        handle: p.fan.handle,
        intro: p.fan.intro,
        version: 1,
      },
      creator: p.creator && {
        id: ids.creator(1),
        handle: p.creator.handle,
        displayName: p.creator.displayName,
        verification: "verified",
        version: 1,
      },
    };
    world.accounts.set(account.id, account);
    world.follows.set(
      account.id,
      new Set(
        p.follows.map(
          (h) => [...world.creators.values()].find((c) => c.handle === h).id,
        ),
      ),
    );
    if (p.threads) for (const t of THREADS) addThread(world, account, t);
  }
  addNotifications(world, world.accounts.get(ids.account(1)));
}

let signedCounter = 100;
export function addMessage(world, thread, authorKind, text, extra = {}) {
  const message = {
    id: ids.message(world.nextMessage++),
    threadId: thread.id,
    authorKind,
    text,
    deliveryState: "delivered",
    controlEpoch: thread.epoch,
    sequence: thread.messages.length + 1,
    signedActId: [
      "approved_draft",
      "human_creator",
      "human_call",
      "human_broadcast",
      "human_reaction",
    ].includes(authorKind)
      ? ids.signed(signedCounter++)
      : null,
    authorAccountId:
      authorKind === "fan"
        ? thread.fanAccountId
        : [
              "human_creator",
              "human_broadcast",
              "human_reaction",
              "team",
            ].includes(authorKind)
          ? thread.creatorAccountId
          : null,
    citations: [],
    createdAt: iso(world.now() - (extra.minutesAgo ?? 0) * 60_000),
    member: authorKind === "team" ? "Sam, triage" : null,
    offTheRecord: false,
    version: 1,
    ...extra.fields,
  };
  thread.messages.push(message);
  thread.revision += 1;
  // A reply that is still being written has no frame yet: its sentences are the frames.
  if (message.deliveryState !== "generating")
    frame(
      thread,
      extra.frameKind ??
        (message.deliveryState === "delivered" ? "delivered" : "accepted"),
      message,
      extra.frame,
    );
  return message;
}

/** Every change to a thread is one frame; cursors are contiguous (INV-03). */
export function frame(thread, kind, message, extra = {}) {
  thread.cursor += 1;
  const value = {
    threadId: thread.id,
    cursor: thread.cursor,
    epoch: thread.epoch,
    kind,
    messageId: message?.id ?? ids.message(0),
    authorKind: message?.authorKind ?? "system",
    text: message?.text ?? "",
    generationId: null,
    sequence: 0,
    ...extra,
  };
  thread.frames.push(value);
  for (const listener of thread.listeners) listener(value);
  return value;
}

function addThread(world, account, spec) {
  const creator = [...world.creators.values()].find(
    (c) => c.handle === spec.creator,
  );
  const n = spec.n;
  const thread = {
    id: ids.thread(n),
    creatorId: creator.id,
    creatorAccountId: creator.accountId,
    creatorName: creator.name,
    fanId: account.fan.id,
    fanAccountId: account.id,
    fanHandle: account.fan.handle,
    control: spec.control,
    epoch: spec.epoch ?? 0,
    cursor: 0,
    revision: 1,
    messages: [],
    frames: [],
    listeners: new Set(),
    offTheRecord: false,
    introShared: false,
    consentVersion: spec.consent === false ? null : world.policy.version,
    access: spec.access !== false,
    generation: null,
    idempotency: new Map(),
    memory: [],
    privacyNoticeAt: iso(world.now()),
  };
  world.threads.set(`${creator.id}/${account.fan.id}`, thread);
  const first = creator.name;
  addMessage(
    world,
    thread,
    "fan",
    spec.rich
      ? "I keep getting pinholes in my celadon. What am I doing wrong?"
      : "Hello. Where should I start?",
    { minutesAgo: 90 },
  );
  addMessage(
    world,
    thread,
    "ai",
    spec.rich
      ? "Pinholes in celadon usually come from gas escaping a thin glaze layer. Slow the cooling, and check that the bisque firing reached cone 04 before you glaze."
      : `Welcome. I'm ${first}'s AI. Ask me about the work, and I'll point to the posts I'm drawing on.`,
    {
      minutesAgo: 89,
      fields: {
        citations: [ids.post(1)],
        agentVersion: { id: ids.signed(900 + n), hash: "a".repeat(64) },
      },
    },
  );
  if (spec.rich) {
    addMessage(
      world,
      thread,
      "fan",
      "Thanks. What bisque temperature do you use?",
      { minutesAgo: 60 },
    );
    addMessage(
      world,
      thread,
      "approved_draft",
      "I bisque to cone 04 for most clay bodies. The AI drafted this; I read it and approved it.",
      { minutesAgo: 45, fields: { citations: [ids.post(1)] } },
    );
    addMessage(
      world,
      thread,
      "human_broadcast",
      "The Friday glaze clinic is back. Bring one test tile. Followers get the first places.",
      { minutesAgo: 30 },
    );
    addMessage(
      world,
      thread,
      "human_reaction",
      copy("reaction", { name: first }),
      { minutesAgo: 20 },
    );
    addMessage(
      world,
      thread,
      "human_creator",
      "Devon, send me a photo of the tile after the next firing and I'll look at it properly.",
      { minutesAgo: 10 },
    );
    addMessage(world, thread, "system", "Answered publicly.", {
      minutesAgo: 5,
      fields: {
        systemLink: {
          kind: "published_answer",
          creatorId: creator.id,
          contentId: ids.post(1),
          contentVersion: 1,
          label: "Answered publicly.",
        },
      },
    });
    thread.memory.push({
      id: uid("3e000000", 1),
      kind: "fact",
      text: "Fires stoneware to cone 6 in an electric kiln.",
      provenanceMessageId: thread.messages[0].id,
      sensitiveCategory: null,
      state: "remembered",
      editedByFan: false,
      createdAt: iso(world.now() - 3_600_000),
    });
  }
  // A speaker change is announced by the server as a system message (INV-04).
  const announcement = { human_active: "takeover", ai_paused: "aiPaused" }[
    spec.control
  ];
  if (announcement)
    addMessage(world, thread, "system", copy(announcement, { name: first }), {
      minutesAgo: 9,
      frameKind: "control",
      frame: { control: spec.control },
    });
  if (spec.control === "human_active") {
    addMessage(
      world,
      thread,
      "human_creator",
      "I'm in this thread now, so you're talking to me, not the AI.",
      { minutesAgo: 8 },
    );
    addMessage(
      world,
      thread,
      "team",
      "I'm helping Kiln Club with the queue today.",
      { minutesAgo: 6 },
    );
  }
}

function addNotifications(world, account) {
  const maya = [...world.creators.values()].find((c) => c.handle === "maya");
  const kiln = [...world.creators.values()].find(
    (c) => c.handle === "kilnclub",
  );
  const rows = [
    [
      "note",
      "human_broadcast",
      copy("noteAudience", { name: "Maya", audience: "followers" }),
      "The Friday glaze clinic is back. Bring one test tile.",
      `/creators/maya/posts/${ids.post(2)}`,
      maya,
      30,
      false,
    ],
    [
      "reaction",
      "human_reaction",
      copy("reaction", { name: "Maya" }),
      "Maya reacted to your reply.",
      `/creators/maya`,
      maya,
      50,
      false,
    ],
    [
      "approved_draft",
      "approved_draft",
      copy("approvedNotification", { name: "Maya" }),
      "Your bisque question has an approved reply.",
      `/creators/maya`,
      maya,
      120,
      true,
    ],
    [
      "ai_reply",
      "ai",
      copy("aiAuthor", { name: "Kiln Club" }),
      "Your question about firing schedules has a reply.",
      `/creators/kilnclub`,
      kiln,
      300,
      true,
    ],
    [
      "request_status",
      "system",
      copy("growthSystem"),
      "Your request was passed on this one.",
      "/commerce/requests",
      maya,
      1500,
      true,
    ],
  ];
  rows.forEach(
    (
      [type, authorKind, sender, preview, destination, creator, minutes, read],
      index,
    ) => {
      world.notifications.push({
        id: uid("9e000000", index + 1),
        available: true,
        creatorId: creator.id,
        type,
        sender,
        authorKind,
        creatorName: creator.name,
        preview,
        destination,
        readAt: read ? iso(world.now() - (minutes - 5) * 60_000) : null,
        createdAt: iso(world.now() - minutes * 60_000),
        accountId: account.id,
      });
    },
  );
}
