// Home, Discover, creator pages, follows, notifications, preferences and push
// registration, in the shapes apps/backend/src/modules/growth returns.
import { Failure } from "../http.mjs";
import { copy } from "../world.mjs";
import { authenticate } from "./identity.mjs";

const DEFAULT_PREFERENCES = {
  push: false,
  email: false,
  hideSensitive: true,
  quietStart: null,
  quietEnd: null,
  timeZone: "UTC",
  mutedCreators: [],
  disabledPushTypes: [],
  disabledEmailTypes: [],
};

const published = (world) =>
  [...world.creators.values()].filter((c) =>
    ["published", "paused"].includes(c.state),
  );
const byHandle = (world, handle) => {
  const creator = published(world).find((c) => c.handle === handle);
  if (!creator)
    throw new Failure(
      404,
      "creator_unavailable",
      copy("growthThisCreatorIsUnavailable"),
    );
  return creator;
};

/** A notification as the API returns it: the account it belongs to stays private. */
const outward = (n) => ({
  id: n.id,
  available: n.available,
  creatorId: n.creatorId,
  type: n.type,
  sender: n.sender,
  authorKind: n.authorKind,
  creatorName: n.creatorName,
  preview: n.preview,
  destination: n.destination,
  readAt: n.readAt,
  createdAt: n.createdAt,
});

/** The label and preview Home shows for a thread: who wrote its last message. */
function homeEntry(world, thread) {
  const last = thread.messages.at(-1);
  const name = thread.creatorName;
  // Nothing delivered yet (a conversation just begun): the system label, no preview.
  const label = !last
    ? copy("growthSystem")
    : last.authorKind === "fan"
      ? copy("navYou")
      : last.authorKind === "ai"
        ? copy("aiAuthor", { name })
        : last.authorKind === "team"
          ? copy("growthCreatorTeam", { name })
          : last.authorKind === "system"
            ? copy("growthSystem")
            : last.authorKind === "approved_draft"
              ? copy("approvedAuthor", { name })
              : name;
  return {
    id: thread.id,
    creatorId: thread.creatorId,
    creatorName: name,
    label,
    preview: last ? Array.from(last.text).slice(0, 240).join("") : "",
    destination: `/threads/${thread.creatorId}/${thread.fanId}`,
    updatedAt: last?.createdAt ?? thread.privacyNoticeAt,
    kind: "thread",
  };
}

export function register(router) {
  router.add("GET", "/v1/growth/public/creators", ({ world, query }) => {
    const q = (query.q ?? "").toLowerCase();
    const category = query.category ?? "";
    const matches = published(world)
      .filter(
        (c) => c.public.state === "published" || c.public.state === "paused",
      )
      .filter((c) => !category || c.public.category === category)
      .filter(
        (c) =>
          !q ||
          `${c.name} ${c.public.biography} ${c.public.topics.join(" ")}`
            .toLowerCase()
            .includes(q),
      )
      .sort((a, b) => a.handle.localeCompare(b.handle));
    return {
      creators: matches.map((c) => c.public),
      hasMore: false,
      nextCursor: null,
    };
  });

  router.add(
    "GET",
    "/v1/growth/public/creators/:handle",
    ({ world, params }) => {
      const creator = byHandle(world, params.handle);
      return { creator: creator.public, posts: creator.posts };
    },
  );

  router.add(
    "GET",
    "/v1/growth/public/creators/:handle/posts/:id",
    ({ world, params }) => {
      const creator = byHandle(world, params.handle);
      const post = creator.posts.find((p) => p.id === params.id);
      if (!post || creator.state !== "published")
        throw new Failure(
          404,
          "post_unavailable",
          copy("growthThisPostIsUnavailable"),
        );
      return { creator: creator.public, post };
    },
  );

  router.add("GET", "/v1/growth/discovery-access", (ctx) => {
    authenticate(ctx);
    return { enabled: false, markers: [] };
  });

  router.add("GET", "/v1/growth/home", (ctx) => {
    const { world } = ctx;
    const { account } = authenticate(ctx);
    const followed = world.follows.get(account.id) ?? new Set();
    const entries = [...world.threads.values()]
      .filter((t) => t.fanAccountId === account.id)
      .map((t) => homeEntry(world, t))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const posts = [...followed]
      .map((id) => world.creators.get(id))
      .flatMap((c) => c.posts.map((post) => ({ post, creator: c.public })))
      .sort((a, b) => b.post.publishedAt.localeCompare(a.post.publishedAt))
      .map(({ post, creator }) => ({
        post: {
          id: post.id,
          creatorId: post.creatorId,
          version: post.version,
          title: post.title,
          authorLabel: post.authorLabel,
          preview: post.body.slice(0, 480),
        },
        creator,
      }));
    return {
      entries,
      posts,
      followingCount: followed.size,
      threadOrder: "activity",
      nextThreadsCursor: null,
      nextPostsCursor: null,
      unread: world.notifications.filter(
        (n) => n.accountId === account.id && !n.readAt,
      ).length,
    };
  });

  router.add("GET", "/v1/growth/follow/:creatorId", (ctx) => {
    const { account } = authenticate(ctx);
    return {
      following: (ctx.world.follows.get(account.id) ?? new Set()).has(
        ctx.params.creatorId,
      ),
    };
  });

  router.add("PUT", "/v1/growth/follow/:creatorId", (ctx) => {
    const { account } = authenticate(ctx);
    const { world, params, body } = ctx;
    const creator = world.creators.get(params.creatorId);
    if (typeof body?.following !== "boolean")
      throw new Failure(
        400,
        "invalid_request",
        "The request does not match the API contract.",
      );
    if (body.following && !creator)
      throw new Failure(
        404,
        "creator_unavailable",
        copy("growthThisCreatorIsUnavailable"),
      );
    const set = world.follows.get(account.id);
    if (body.following) set.add(params.creatorId);
    else set.delete(params.creatorId);
    return { following: body.following };
  });

  router.add("GET", "/v1/growth/notifications", (ctx) => {
    const { account } = authenticate(ctx);
    return {
      notifications: ctx.world.notifications
        .filter((n) => n.accountId === account.id)
        .map(outward),
    };
  });

  const find = (ctx) => {
    const { account } = authenticate(ctx);
    const item = ctx.world.notifications.find(
      (n) => n.id === ctx.params.id && n.accountId === account.id,
    );
    if (!item)
      throw new Failure(
        404,
        "notification_unavailable",
        copy("growthErrorNotificationUnavailable"),
      );
    return item;
  };
  router.add("GET", "/v1/growth/notifications/:id", (ctx) =>
    outward(find(ctx)),
  );
  router.add("PUT", "/v1/growth/notifications/:id/read", (ctx) => {
    const item = find(ctx);
    item.readAt ??= new Date(ctx.world.now()).toISOString();
    return { read: true };
  });

  router.add("GET", "/v1/growth/preferences", (ctx) => {
    const { account } = authenticate(ctx);
    return ctx.world.preferences.get(account.id) ?? DEFAULT_PREFERENCES;
  });
  router.add("PUT", "/v1/growth/preferences", (ctx) => {
    const { account } = authenticate(ctx);
    const next = { ...DEFAULT_PREFERENCES, ...ctx.body };
    if ((next.quietStart === null) !== (next.quietEnd === null))
      throw new Failure(
        400,
        "invalid_request",
        "The request does not match the API contract.",
      );
    ctx.world.preferences.set(account.id, next);
    return next;
  });
  router.add("GET", "/v1/growth/preferences/creators", (ctx) => {
    const { account } = authenticate(ctx);
    const followed = ctx.world.follows.get(account.id) ?? new Set();
    return {
      creators: [...followed].map((id) => ({
        id,
        name: ctx.world.creators.get(id).name,
      })),
    };
  });

  // Push registration is recorded, never delivered: the push gateway is the
  // one fake the founder allows, and it arrives with work package 7.7.
  router.add("PUT", "/v1/growth/devices", (ctx) => {
    const { account } = authenticate(ctx);
    const { installationId, platform, permission, registrationRevision } =
      ctx.body ?? {};
    ctx.world.devices = ctx.world.devices.filter(
      (d) => d.installationId !== installationId,
    );
    ctx.world.devices.push({
      accountId: account.id,
      installationId,
      platform,
      permission,
      registrationRevision,
    });
    return { registered: true };
  });
  router.add("DELETE", "/v1/growth/devices/:id", (ctx) => {
    authenticate(ctx);
    ctx.world.devices = ctx.world.devices.filter(
      (d) => d.installationId !== ctx.params.id,
    );
    return { revoked: true };
  });

  router.add("POST", "/v1/growth/engagement/:kind/claim", (ctx) => {
    authenticate(ctx);
    return { eligible: false };
  });
  router.add("PUT", "/v1/growth/engagement/:kind/choice", (ctx) => {
    authenticate(ctx);
    return { saved: true };
  });
}
