// Deterministic data for the lane 6 Studio stand-in API. Fixed ids, fixed dates,
// no randomness, so two runs against the same web build are identical. Shapes
// follow packages/api/src/{identity,content,studio}.ts; fixture-api.mjs checks
// them against those schemas when it starts.
const uuid = (p, n) =>
  `${p}0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export const ID = {
  account: uuid(1, 1),
  session: uuid(2, 1),
  maya: uuid(5, 1),
  priya: uuid(5, 2),
  glazeco: uuid(5, 3),
  invite: uuid("d", 1),
  fanA: uuid(6, 1),
  fanB: uuid(6, 2),
  fanC: uuid(6, 3),
  thread: uuid("a", 1),
  tier: uuid("e", 1),
  signed: uuid("c", 1),
};
export const NOW = "2026-10-08T12:00:00.000Z";
const FAR = "2030-01-01T00:00:00.000Z";
const PAST = "2026-10-01T09:00:00.000Z";
const handles = {
  [ID.fanA]: "priya_p",
  [ID.fanB]: "devon_k",
  [ID.fanC]: "ines_o",
};

export const session = {
  accountId: ID.account,
  adultEligible: true,
  sessionId: ID.session,
  expiresAt: FAR,
  mode: "development",
  fan: null,
  creator: {
    id: ID.maya,
    handle: "kilnfire",
    displayName: "Maya",
    verification: "verified",
    version: 1,
  },
  teams: [{ creatorId: ID.priya, roles: ["triage", "drafter"] }],
};
export const studioSession = {
  creators: [
    {
      id: ID.maya,
      display_name: "Maya",
      handle: "kilnfire",
      verification: "verified",
      owned: true,
      roles: [],
      memberHandle: null,
      viewerAccountId: ID.account,
    },
    {
      id: ID.priya,
      display_name: "Priya",
      handle: "priyaglaze",
      verification: "verified",
      owned: false,
      roles: ["triage", "drafter"],
      memberHandle: "devon",
      viewerAccountId: ID.account,
    },
  ],
  invitations: [
    {
      id: ID.invite,
      creatorId: ID.glazeco,
      creatorName: "Glazeco",
      roles: ["publisher"],
      expiresAt: FAR,
    },
  ],
  serverTime: NOW,
};

const body = (over) => ({
  kind: "note",
  title: "",
  text: "",
  audience: { kind: "followers" },
  media: [],
  nameToken: false,
  showAudienceCount: false,
  aiUseIntent: false,
  scheduledAt: null,
  quote: null,
  packetId: null,
  ...over,
});
export const view = (n, over = {}, doc = {}) => {
  const document = body(doc);
  return {
    id: uuid(7, n),
    creatorId: ID.maya,
    creatorName: "Maya",
    creatorHandle: "kilnfire",
    teamMember: null,
    displayText: document.text,
    version: 1,
    state: "draft",
    authorKind: document.kind === "note" ? "human_broadcast" : "human_creator",
    authorLabel: "Maya · to followers",
    audienceLabel: "Followers",
    signedActId: null,
    publishedAt: null,
    document,
    audienceCount: null,
    sourceState: "not_requested",
    quotedText: null,
    quotedHandle: null,
    ...over,
  };
};
export const contentItems = [
  view(
    2,
    {
      state: "published",
      version: 2,
      signedActId: ID.signed,
      publishedAt: "2026-10-06T16:00:00.000Z",
      audienceLabel: "All members",
      audienceCount: 42,
    },
    {
      text: "The glaze test came out of the kiln this morning. Slow cooling made the blue deeper than I planned.",
    },
  ),
  view(1, {}, { text: "Draft: studio hours change next week, details soon." }),
  view(
    3,
    { state: "scheduled", audienceLabel: "Followers" },
    { text: "Thursday: a short tour of the new wheel.", scheduledAt: FAR },
  ),
  view(
    4,
    { state: "media_pending", signedActId: ID.signed },
    { text: "Photo of the new bowls, processing." },
  ),
  view(
    5,
    {
      state: "published",
      signedActId: ID.signed,
      publishedAt: "2026-10-03T10:00:00.000Z",
      audienceLabel: "Public",
      authorKind: "human_creator",
      sourceState: "candidate",
    },
    {
      kind: "post",
      title: "How I mix a celadon",
      text: "Notes on the recipe, with ratios.",
      audience: { kind: "public" },
    },
  ),
  view(
    6,
    {},
    {
      kind: "post",
      title: "Firing schedule",
      text: "Draft of the autumn firing schedule.",
      audience: { kind: "public" },
    },
  ),
];
const reply = (n, over = {}) => ({
  safetyState: "allowed",
  safetyReviewAvailable: true,
  read: false,
  id: uuid(8, n),
  contentId: uuid(7, 2),
  fanId: [ID.fanA, ID.fanB, ID.fanC][n % 3],
  handle: "",
  text: "",
  version: 1,
  createdAt: `2026-10-07T0${n}:00:00.000Z`,
  tenure: null,
  consent: { shareText: false, showHandle: false, version: 1 },
  reaction: null,
  ...over,
});
export const replies = [
  reply(1, {
    handle: handles[ID.fanB],
    text: "This changed how I think about cooling. Thank you for sharing it.",
    tenure: {
      confirmedDays: 61,
      milestone: 50,
      basis: "confirmed_paid_periods",
      historyComplete: false,
      checkedAt: NOW,
    },
    consent: { shareText: true, showHandle: true, version: 2 },
  }),
  reply(2, {
    handle: handles[ID.fanC],
    text: "Do you ever fire at cone 6?",
    read: true,
  }),
  reply(3, {
    handle: handles[ID.fanA],
    text: "Loved the photo series.",
    read: true,
    reaction: { kind: "heart", signedActId: ID.signed },
  }),
  reply(4, {
    handle: handles[ID.fanB],
    text: "(withheld)",
    safetyState: "flagged",
  }),
].map((r) => ({ ...r, handle: r.handle || handles[r.fanId] }));
export const thanks = [
  {
    id: uuid("b", 1),
    version: 1,
    target_kind: "content",
    target_id: uuid(7, 2),
    text: "The celadon post helped me fix my glaze.",
    handle: "devon_k",
    created_at: "2026-10-05T08:00:00.000Z",
  },
  {
    id: uuid("b", 2),
    version: 1,
    target_kind: "content",
    target_id: uuid(7, 2),
    text: "",
    handle: null,
    created_at: "2026-10-04T08:00:00.000Z",
  },
];
export const audiences = {
  audienceCountsAvailable: true,
  tiers: [{ id: ID.tier, name: "Studio circle" }],
  groups: [],
};
export const team = {
  members: [
    {
      account_id: uuid(1, 4),
      roles: ["triage", "drafter"],
      revoked_at: null,
      handle: "devon",
    },
    {
      account_id: uuid(1, 5),
      roles: ["publisher"],
      revoked_at: PAST,
      handle: "sam",
    },
  ],
  invitations: [
    {
      id: uuid("d", 2),
      account_id: uuid(1, 6),
      handle: "lena",
      roles: ["scheduler"],
      expires_at: FAR,
      accepted_at: null,
      revoked_at: null,
    },
  ],
};

const item = (n, fan, over = {}, snapshot = {}) => ({
  id: uuid(9, n),
  fan_id: fan,
  handle: handles[fan],
  version: 1,
  state: "submitted",
  payment_state: "requires_capture",
  decision_at: FAR,
  deadline: FAR,
  commitment_id: null,
  commitment_state: null,
  commitment_version: 0,
  due_at: null,
  snapshot: {
    title: "Written reply",
    mode: "written_reply",
    amount: 1200,
    currency: "USD",
    shareable: true,
    ...snapshot,
  },
  disclosure: {
    summary:
      "Can you look at my glaze schedule and tell me where it goes wrong?",
    identity: "handle",
    wholeThread: false,
    attachmentIds: [],
    messages: [{ text: "My glaze crawls at the rim every time." }],
  },
  ...over,
});
export const queueItems = [
  item(2, ID.fanB, {
    state: "accepted",
    payment_state: "captured",
    deadline: PAST,
    commitment_id: uuid(9, 12),
    commitment_state: "due",
    commitment_version: 1,
    due_at: PAST,
  }),
  item(1, ID.fanA),
  item(
    3,
    ID.fanC,
    { state: "more_info" },
    { title: "Voice note", mode: "voice_note", amount: 2000 },
  ),
  item(4, ID.fanA, { state: "offer_pending" }),
];
export const queueMore = [
  item(5, ID.fanB, {}, { title: "Written reply, extended", amount: 1800 }),
];
export const capacity = [
  { title: "Written reply", weekly_limit: 10, used: 4, reserved: 2 },
  { title: "Voice note", weekly_limit: 3, used: 1, reserved: 0 },
];
export const queueCursor = uuid(9, 99);
export const packet = (id) => {
  const found =
    [...queueItems, ...queueMore].find((q) => q.id === id) ?? queueItems[1];
  const accepted = found.state === "accepted";
  return {
    groupModes: [
      {
        id: uuid(9, 21),
        title: "Group answer",
        kind: "group_answer",
        amount: "600",
        currency: "USD",
        version: 1,
      },
    ],
    packet: {
      ...found,
      thread_id: ID.thread,
      creator_id: ID.maya,
      hold_expires_at: FAR,
      accepted_at: accepted ? PAST : null,
      proposed_mode: null,
    },
    commitment: accepted
      ? { id: found.commitment_id, version: 1, state: "due", due_at: PAST }
      : null,
    ledger: [
      {
        kind: "hold",
        amount: found.snapshot.amount,
        currency: "USD",
        cause: "fan_request",
      },
    ],
    share: null,
  };
};
const message = (n, authorKind, text, over = {}) => ({
  id: uuid("f", n),
  threadId: ID.thread,
  authorKind,
  text,
  deliveryState: "delivered",
  controlEpoch: 1,
  sequence: n,
  signedActId: null,
  citations: [],
  createdAt: `2026-10-07T10:0${n}:00.000Z`,
  member: null,
  offTheRecord: false,
  version: 1,
  ...over,
});
export const messages = [
  message(1, "fan", "Why does my celadon run at the rim?"),
  message(
    2,
    "ai",
    "Celadon usually runs when the glaze is applied too thick near the rim. Try thinning it there.",
  ),
  message(
    3,
    "approved_draft",
    "Thin it near the rim and fire a little slower through the peak.",
    { signedActId: ID.signed, member: null },
  ),
  message(
    4,
    "human_creator",
    "I read this. Slower through the peak is the real fix.",
    { signedActId: ID.signed },
  ),
  message(5, "team", "Maya will see this too.", {
    member: "@devon · triage",
    authorAccountId: ID.account,
  }),
];
export const timeline = (control) => ({
  timeline: { threadId: ID.thread, control, epoch: 1, messages },
  authority: "owner",
  creatorName: "Maya",
});
export const deliveries = {
  items: messages.filter((m) => m.authorKind === "human_creator"),
};
export const threadEntries = {
  items: [
    {
      fanId: ID.fanB,
      handle: handles[ID.fanB],
      sources: ["note_reply", "request"],
      updatedAt: "2026-10-07T10:05:00.000Z",
    },
    {
      fanId: ID.fanC,
      handle: handles[ID.fanC],
      sources: ["note_reply"],
      updatedAt: "2026-10-07T09:00:00.000Z",
    },
  ],
  nextCursor: null,
  coverage: "notes_and_requests",
};
export const fixtureIds = new Set([
  ...Object.values(ID),
  ...[
    ...contentItems,
    ...replies,
    ...queueItems,
    ...queueMore,
    ...messages,
  ].map((x) => x.id),
  queueCursor,
  uuid(9, 12),
  uuid(9, 21),
  uuid(1, 4),
  uuid(1, 5),
  uuid(1, 6),
  uuid("d", 2),
  uuid("b", 1),
  uuid("b", 2),
]);
