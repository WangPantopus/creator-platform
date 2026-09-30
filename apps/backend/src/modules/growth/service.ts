import {
  createHash,
  createHmac,
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";
import { z } from "zod";
import type { Actor } from "../identity/adapter.js";
import { DomainError } from "../../core/errors.js";
import { contentHash } from "../../core/canonical.js";
import {
  PassDiscovery,
  CreatorProjection,
  ContentProjection,
  Destination,
  Preferences,
  defaultPreferences,
  InsightSignal,
  Metric,
  type PublicCreator,
  type GrowthOwners,
  type PublicContent,
  type ShareSource,
} from "./contracts.js";
import type { GrowthDatabase } from "./database.js";
import { Notifications, type DeliveryProvider } from "./notifications.js";

export class GrowthService {
  readonly notifications: Notifications;
  constructor(
    readonly db: GrowthDatabase,
    readonly owners: GrowthOwners,
    private readonly secret: Buffer,
    provider?: DeliveryProvider,
  ) {
    if (secret.length !== 32)
      throw new Error("Growth requires a 32-byte encryption/aggregation key");
    this.notifications = new Notifications(db, owners, provider);
  }
  private pseudonym(creatorId: string, accountId: string, window: string) {
    return createHmac("sha256", this.secret)
      .update(`${creatorId}:${window}:${accountId}`)
      .digest("hex");
  }
  privacySubjectKey(accountId: string) {
    return this.pseudonym("privacy", z.uuid().parse(accountId), "subject");
  }
  seal(value: string) {
    const iv = randomBytes(12),
      cipher = createCipheriv("aes-256-gcm", this.secret, iv);
    const body = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
    return [iv, cipher.getAuthTag(), body]
      .map((b) => b.toString("base64url"))
      .join(".");
  }
  open(value: string) {
    const [iv, tag, body] = value
      .split(".")
      .map((v) => Buffer.from(v, "base64url"));
    if (!iv || !tag || !body) throw new Error("invalid_ciphertext");
    const cipher = createDecipheriv("aes-256-gcm", this.secret, iv);
    cipher.setAuthTag(tag);
    return Buffer.concat([cipher.update(body), cipher.final()]).toString(
      "utf8",
    );
  }
  async projectCreator(input: unknown) {
    const item = CreatorProjection.parse(input);
    await this.db.worker.query(
      `INSERT INTO growth.creator_public(id,version,handle,state,document,updated_at) VALUES($1,$2,$3,$4,$5,$6)
      ON CONFLICT(id) DO UPDATE SET version=excluded.version,handle=excluded.handle,state=excluded.state,document=excluded.document,updated_at=excluded.updated_at WHERE growth.creator_public.version<excluded.version`,
      [item.id, item.version, item.handle, item.state, item, item.updatedAt],
    );
  }
  async projectContent(input: unknown) {
    const item = ContentProjection.parse(input);
    if (item.authorKind !== "team" && !item.signedActId)
      throw new DomainError(
        "signed_content_required",
        "Public named content requires signed evidence.",
      );
    await this.db.worker.query(
      `INSERT INTO growth.content_public(id,creator_id,version,state,document,published_at) VALUES($1,$2,$3,$4,$5,$6)
      ON CONFLICT(id) DO UPDATE SET version=excluded.version,state=excluded.state,document=excluded.document WHERE growth.content_public.version<excluded.version`,
      [
        item.id,
        item.creatorId,
        item.version,
        item.state,
        item,
        item.publishedAt,
      ],
    );
  }
  async discover(query: string, category: string, offset = 0) {
    const q = z.string().max(120).parse(query),
      cat = z.string().max(60).parse(category);
    const result = await this.db.runtime.query(
      `SELECT document FROM growth.creator_public WHERE state IN ('published','paused') AND document->>'verified'='true'
      AND ($1='' OR (document->>'name') ILIKE $2 OR (document->>'biography') ILIKE $2 OR (document->>'topics') ILIKE $2)
      AND ($3='' OR document->>'category'=$3) ORDER BY handle LIMIT 31 OFFSET $4`,
      [
        q,
        `%${q.replace(/[\\%_]/gu, "\\$&")}%`,
        cat,
        z.int().min(0).max(1000).parse(offset),
      ],
    );
    return {
      creators: result.rows
        .slice(0, 30)
        .map((r) => r.document as PublicCreator),
      hasMore: result.rows.length > 30,
    };
  }
  async passDiscovery(actor: Actor) {
    const view = PassDiscovery.parse(await this.owners.discoveryAccess(actor));
    if (!view.enabled) return { enabled: false, markers: [] };
    const publicIds = (
      await this.db.runtime.query(
        "SELECT id FROM growth.creator_public WHERE id=ANY($1::uuid[]) AND state IN ('published','paused') AND document->>'verified'='true'",
        [view.markers.map((marker) => marker.creatorId)],
      )
    ).rows.map((row) => row.id);
    return {
      ...view,
      markers: view.markers.filter((marker) =>
        publicIds.includes(marker.creatorId),
      ),
    };
  }
  /** Public indexing exposes only current verified pages, never invite/share/private objects. */
  async publicIndex(after: string) {
    const cursor = z
      .string()
      .max(160)
      .regex(/^(?:|\/creators\/[a-z0-9_]{3,30}(?:\/posts\/[a-f0-9-]{36})?)$/u)
      .parse(after);
    const result = await this.db.runtime.query(
      `SELECT path,updated_at FROM (
        SELECT '/creators/'||handle AS path,updated_at FROM growth.creator_public WHERE state='published' AND document->>'verified'='true'
        UNION ALL
        SELECT '/creators/'||c.handle||'/posts/'||p.id AS path,GREATEST(c.updated_at,p.published_at) AS updated_at FROM growth.content_public p JOIN growth.creator_public c ON c.id=p.creator_id WHERE p.state='published' AND c.state='published' AND c.document->>'verified'='true'
      ) pages WHERE path>$1 ORDER BY path LIMIT 501`,
      [cursor],
    );
    const pages = result.rows.slice(0, 500).map((row) => ({
      path: row.path as string,
      updatedAt: new Date(row.updated_at).toISOString(),
    }));
    return {
      pages,
      nextCursor:
        result.rows.length > 500 ? pages[pages.length - 1]!.path : null,
    };
  }
  async creator(handle: string) {
    const result = await this.db.runtime.query(
      "SELECT document FROM growth.creator_public WHERE handle=$1 AND state IN ('published','paused') AND document->>'verified'='true'",
      [handle],
    );
    return (result.rows[0]?.document ?? null) as PublicCreator | null;
  }
  async posts(creatorId: string) {
    const result = await this.db.runtime.query(
      "SELECT p.document FROM growth.content_public p JOIN growth.creator_public c ON c.id=p.creator_id WHERE p.creator_id=$1 AND p.state='published' AND c.state='published' AND c.document->>'verified'='true' ORDER BY p.published_at DESC LIMIT 30",
      [creatorId],
    );
    return result.rows.map((r) => r.document as PublicContent);
  }
  async post(handle: string, id: string) {
    const creator = await this.creator(handle);
    if (!creator || creator.state !== "published") return null;
    const result = await this.db.runtime.query(
      "SELECT document FROM growth.content_public WHERE id=$1 AND creator_id=$2 AND state='published'",
      [id, creator.id],
    );
    const post = result.rows[0]?.document as PublicContent | undefined;
    return post ? { creator, post } : null;
  }
  async follow(actor: Actor, creatorId: string, value: boolean) {
    const result = await this.db.runtime.query(
      "SELECT id FROM growth.creator_public WHERE id=$1 AND state IN ('published','paused')",
      [creatorId],
    );
    if (!result.rowCount)
      throw new DomainError(
        "creator_unavailable",
        "This creator is unavailable.",
        404,
      );
    await this.db.actor(actor, null, async (client) => {
      if (value)
        await client.query(
          "INSERT INTO growth.follow(account_id,creator_id) VALUES($1,$2) ON CONFLICT DO NOTHING",
          [actor.accountId, creatorId],
        );
      else
        await client.query(
          "DELETE FROM growth.follow WHERE account_id=$1 AND creator_id=$2",
          [actor.accountId, creatorId],
        );
    });
    return { following: value };
  }
  async following(actor: Actor, creatorId: string) {
    return this.db.actor(actor, null, async (client) => ({
      following: Boolean(
        (
          await client.query(
            "SELECT 1 FROM growth.follow WHERE account_id=$1 AND creator_id=$2",
            [actor.accountId, creatorId],
          )
        ).rowCount,
      ),
    }));
  }
  async preferenceCreators(actor: Actor) {
    return this.db.actor(
      actor,
      null,
      async (client) =>
        (
          await client.query(
            `SELECT DISTINCT c.id,c.document->>'name' AS name FROM growth.creator_public c WHERE c.state IN ('published','paused') AND (c.id IN (SELECT creator_id FROM growth.follow WHERE account_id=$1 UNION SELECT creator_id FROM growth.notification WHERE account_id=$1) OR c.id IN (SELECT jsonb_array_elements_text(document->'mutedCreators')::uuid FROM growth.preference WHERE account_id=$1)) ORDER BY name LIMIT 500`,
            [actor.accountId],
          )
        ).rows,
    );
  }
  async home(actor: Actor) {
    const own = await this.db.actor(actor, null, async (client) => {
      const follows = await client.query(
        "SELECT creator_id FROM growth.follow WHERE account_id=$1",
        [actor.accountId],
      );
      const unread = await client.query(
        "SELECT count(*)::int AS count FROM growth.notification WHERE account_id=$1 AND read_at IS NULL",
        [actor.accountId],
      );
      return {
        ids: follows.rows.map((r) => r.creator_id as string),
        unread: unread.rows[0].count,
      };
    });
    const entries = (await this.owners.home(actor))
      .filter((e) => Destination.safeParse(e.destination).success)
      .sort(
        (a, b) =>
          Number(b.kind !== "thread") - Number(a.kind !== "thread") ||
          b.updatedAt.localeCompare(a.updatedAt),
      );
    const result = await this.db.runtime.query(
      "SELECT p.document,c.document AS creator FROM growth.content_public p JOIN growth.creator_public c ON c.id=p.creator_id WHERE p.creator_id=ANY($1::uuid[]) AND p.state='published' AND c.state='published' AND c.document->>'verified'='true' ORDER BY p.published_at DESC LIMIT 30",
      [own.ids],
    );
    return {
      entries,
      posts: result.rows.map((r) => ({
        post: r.document as PublicContent,
        creator: r.creator as PublicCreator,
      })),
      following: own.ids,
      unread: own.unread,
    };
  }
  async preferences(actor: Actor, input?: unknown) {
    return this.db.actor(actor, null, async (client) => {
      if (input !== undefined) {
        const prefs = Preferences.parse(input);
        await client.query(
          "INSERT INTO growth.preference(account_id,document) VALUES($1,$2) ON CONFLICT(account_id) DO UPDATE SET document=excluded.document,updated_at=now()",
          [actor.accountId, prefs],
        );
        return prefs;
      }
      const result = await client.query(
        "SELECT document FROM growth.preference WHERE account_id=$1",
        [actor.accountId],
      );
      return result.rows[0]?.document ?? defaultPreferences;
    });
  }
  async inbox(actor: Actor) {
    const rows = await this.db.actor(
      actor,
      null,
      async (client) =>
        (
          await client.query(
            "SELECT * FROM growth.notification WHERE account_id=$1 ORDER BY created_at DESC,id LIMIT 100",
            [actor.accountId],
          )
        ).rows,
    );
    return this.notifications.listCurrent(rows);
  }
  async markRead(actor: Actor, id: string) {
    return this.db.actor(actor, null, async (client) => {
      const result = await client.query(
        "UPDATE growth.notification SET read_at=coalesce(read_at,now()) WHERE id=$1 AND account_id=$2 RETURNING id",
        [id, actor.accountId],
      );
      if (!result.rowCount)
        throw new DomainError(
          "notification_unavailable",
          "This update is unavailable.",
          404,
        );
      return { read: true };
    });
  }
  async registerDevice(actor: Actor, input: unknown) {
    const value = z
      .strictObject({
        installationId: z.uuid(),
        platform: z.enum(["ios", "android"]),
        token: z.string().min(16).max(4096),
        permission: z.enum(["granted", "denied"]),
      })
      .parse(input);
    return this.db.actor(actor, null, async (client) => {
      const hash = createHash("sha256").update(value.token).digest("hex");
      const result = await client.query(
        `INSERT INTO growth.device(account_id,installation_id,platform,token_hash,encrypted_token,permission,revoked_at) VALUES($1,$2,$3,$4,$5,$6,CASE WHEN $6='denied' THEN now() ELSE NULL END)
        ON CONFLICT(account_id,installation_id) DO UPDATE SET token_hash=excluded.token_hash,encrypted_token=excluded.encrypted_token,permission=excluded.permission,revoked_at=excluded.revoked_at,updated_at=now() RETURNING id`,
        [
          actor.accountId,
          value.installationId,
          value.platform,
          hash,
          this.seal(value.token),
          value.permission,
        ],
      );
      return { id: result.rows[0].id };
    });
  }
  async revokeDevice(actor: Actor, id: string) {
    await this.db.actor(actor, null, async (client) => {
      await client.query(
        "UPDATE growth.device SET revoked_at=now(),permission='denied' WHERE account_id=$1 AND (id=$2 OR installation_id=$2)",
        [actor.accountId, id],
      );
    });
    return { revoked: true };
  }
  /** W1 supplies a verified email binding. There is no client-authored verification flag. */
  async bindVerifiedEmail(accountId: string, address: string) {
    const email = z.email().parse(address),
      token = randomBytes(32).toString("base64url");
    await this.db.worker.query(
      "INSERT INTO growth.email(account_id,encrypted_address,verified_at,unsubscribe_hash) VALUES($1,$2,now(),$3) ON CONFLICT(account_id) DO UPDATE SET encrypted_address=excluded.encrypted_address,verified_at=now(),bounced_at=NULL,unsubscribed_at=NULL,unsubscribe_hash=excluded.unsubscribe_hash",
      [
        accountId,
        this.seal(email),
        createHash("sha256").update(token).digest("hex"),
      ],
    );
    return { unsubscribeToken: token };
  }
  async unsubscribe(token: string) {
    await this.db.worker.query(
      "UPDATE growth.email SET unsubscribed_at=now() WHERE unsubscribe_hash=$1",
      [createHash("sha256").update(token).digest("hex")],
    );
    return { unsubscribed: true };
  }
  /** Only a signature-verified provider webhook calls this. */
  async bounce(accountId: string) {
    await this.db.worker.query(
      "UPDATE growth.email SET bounced_at=now() WHERE account_id=$1",
      [accountId],
    );
  }
  async createShare(actor: Actor, grantId: string) {
    const source = await this.owners.shareSource(actor, grantId);
    if (!source)
      throw new DomainError(
        "sharing_unavailable",
        "Sharing is not permitted for this reply.",
      );
    const current = await this.owners.shareStatus(grantId, source);
    if (!current.valid)
      throw new DomainError(
        "sharing_unavailable",
        "Sharing is not permitted for this reply.",
      );
    // Canonical W1/W4/W5 adapter attests exact delivered version, creator permission and fan choice.
    return this.db.actor(actor, null, async (client) => {
      const result = await client.query(
        "INSERT INTO growth.share(account_id,grant_id,source_version,source) VALUES($1,$2,$3,$4) ON CONFLICT(grant_id,source_version) DO NOTHING RETURNING id",
        [actor.accountId, grantId, source.version, source],
      );
      if (result.rowCount) return { id: result.rows[0].id };
      const prior = await client.query(
        "SELECT id,source FROM growth.share WHERE grant_id=$1 AND source_version=$2",
        [grantId, source.version],
      );
      if (
        !prior.rowCount ||
        contentHash(prior.rows[0].source) !== contentHash(source)
      )
        throw new DomainError(
          "share_version_conflict",
          "The shared version has changed.",
          409,
        );
      return { id: prior.rows[0].id };
    });
  }
  async share(id: string) {
    const result = await this.db.worker.query(
      "SELECT id,grant_id,source FROM growth.share WHERE id=$1",
      [id],
    );
    if (!result.rowCount) return null;
    const source = result.rows[0].source as ShareSource;
    const status = await this.owners.shareStatus(
      result.rows[0].grant_id,
      source,
    );
    return status.valid
      ? {
          id,
          source: { ...source, correction: status.correction },
          state: "valid" as const,
        }
      : { id, state: "withdrawn" as const };
  }
  async createInvite(actor: Actor, input: unknown) {
    const value = z
        .strictObject({ contextId: z.uuid().nullable() })
        .parse(input),
      creatorId = await this.requireCreator(actor);
    if (value.contextId) {
      const posts = await this.posts(creatorId);
      if (!posts.some((p) => p.id === value.contextId))
        throw new DomainError(
          "context_unavailable",
          "This post is unavailable.",
          404,
        );
    }
    return this.db.actor(actor, creatorId, async (client) => {
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
        [`growth.invites:${actor.accountId}`],
      );
      const count = await client.query(
        "SELECT count(*)::int AS count FROM growth.invite WHERE created_by=$1 AND expires_at>now() AND revoked_at IS NULL",
        [actor.accountId],
      );
      if (count.rows[0].count >= 20)
        throw new DomainError(
          "invite_limit",
          "You already have 20 active invitation links.",
          429,
        );
      const result = await client.query(
        "INSERT INTO growth.invite(creator_id,created_by,context_id,expires_at,campaign) VALUES($1,$2,$3,now()+interval '30 days','creator_launch') RETURNING id,expires_at",
        [creatorId, actor.accountId, value.contextId],
      );
      return result.rows[0];
    });
  }
  async invite(id: string) {
    const result = await this.db.worker.query(
      "SELECT i.context_id,c.document FROM growth.invite i JOIN growth.creator_public c ON c.id=i.creator_id WHERE i.id=$1 AND i.revoked_at IS NULL AND i.expires_at>now() AND c.state='published' AND c.document->>'verified'='true'",
      [id],
    );
    if (!result.rowCount) return null;
    const creator = result.rows[0].document as PublicCreator,
      context = result.rows[0].context_id as string | null;
    if (context && !(await this.post(creator.handle, context))) return null;
    return {
      creator,
      destination: `/creators/${creator.handle}/chat${context ? `?context=${context}` : ""}`,
    };
  }
  async requireCreator(actor: Actor) {
    const id = await this.owners.creatorFor(actor);
    if (!id)
      throw new DomainError(
        "creator_required",
        "This view is available to the creator only.",
      );
    return id;
  }
  /** Privileged W3 ETL supplies categorical signals, never raw conversation text. */
  async signal(input: unknown) {
    const value = InsightSignal.parse(input);
    const date = new Date(`${value.window}T00:00:00Z`);
    if (
      Number.isNaN(date.valueOf()) ||
      date.toISOString().slice(0, 10) !== value.window ||
      date.getUTCDay() !== 1
    )
      throw new DomainError(
        "invalid_window",
        "Insights use Monday-starting weekly windows.",
        400,
      );
    const fanKey = this.pseudonym(
      value.creatorId,
      value.fanAccountId,
      value.window,
    );
    await this.db.transaction(this.db.worker, async (client) => {
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
        [value.creatorId + ":" + value.window],
      );
      if (
        (
          await client.query(
            "SELECT 1 FROM growth.insight_window WHERE creator_id=$1 AND window_start=$2",
            [value.creatorId, value.window],
          )
        ).rowCount
      )
        throw new DomainError(
          "window_closed",
          "This weekly evidence window is already closed.",
          409,
        );
      const saved = await client.query(
        `INSERT INTO growth.insight_signal(id,creator_id,fan_key,subject_key,topic_key,window_start,unresolved,version) VALUES($1,$2,$3,$4,$5,$6,$7,$8)
      ON CONFLICT(creator_id,fan_key,topic_key,window_start) DO UPDATE SET unresolved=excluded.unresolved,version=excluded.version WHERE growth.insight_signal.version<excluded.version RETURNING version`,
        [
          value.id,
          value.creatorId,
          fanKey,
          this.pseudonym("privacy", value.fanAccountId, "subject"),
          value.topicKey,
          value.window,
          value.unresolved,
          value.version,
        ],
      );
      if (!saved.rowCount) {
        const current = await client.query(
          "SELECT version,unresolved FROM growth.insight_signal WHERE creator_id=$1 AND fan_key=$2 AND topic_key=$3 AND window_start=$4",
          [value.creatorId, fanKey, value.topicKey, value.window],
        );
        const row = current.rows[0];
        if (
          row?.version === value.version &&
          row.unresolved !== value.unresolved
        )
          throw new DomainError(
            "signal_version_conflict",
            "A signal version cannot change its meaning.",
            409,
          );
      }
    });
  }
  async closeWindow(creatorId: string, window: string) {
    z.uuid().parse(creatorId);
    const date = new Date(`${window}T00:00:00Z`);
    if (
      Number.isNaN(date.valueOf()) ||
      date.toISOString().slice(0, 10) !== window ||
      date.getUTCDay() !== 1
    )
      throw new DomainError(
        "invalid_window",
        "Insights use Monday-starting weekly windows.",
        400,
      );
    if (date.valueOf() + 7 * 86400000 > Date.now())
      throw new DomainError(
        "window_open",
        "Insights publish after the weekly evidence window closes.",
        409,
      );
    await this.db.transaction(this.db.worker, async (client) => {
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
        [creatorId + ":" + window],
      );
      const closed = await client.query(
        "INSERT INTO growth.insight_window(creator_id,window_start) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING window_start",
        [creatorId, window],
      );
      if (!closed.rowCount) return;
      await client.query(
        `INSERT INTO growth.insight_snapshot(creator_id,window_start,topic_key,fan_count,question_count)
      SELECT creator_id,window_start,topic_key,count(DISTINCT fan_key),count(*) FROM growth.insight_signal WHERE creator_id=$1 AND window_start=$2 AND unresolved GROUP BY creator_id,window_start,topic_key HAVING count(DISTINCT fan_key)>=5 ON CONFLICT DO NOTHING`,
        [creatorId, window],
      );
    });
  }
  async insights(actor: Actor) {
    const creatorId = await this.requireCreator(actor);
    return this.db.actor(actor, creatorId, async (client) =>
      (
        await client.query(
          "SELECT s.window_start,s.topic_key,s.fan_count,s.question_count,r.decision,r.outline FROM growth.insight_snapshot s LEFT JOIN growth.recommendation r USING(creator_id,window_start,topic_key) WHERE s.creator_id=$1 AND s.window_start=(SELECT max(window_start) FROM growth.insight_window WHERE creator_id=$1) ORDER BY s.topic_key LIMIT 30",
          [creatorId],
        )
      ).rows.map((row) => ({
        window: row.window_start,
        topicKey: row.topic_key,
        fanCount: row.fan_count,
        questionCount: row.question_count,
        decision: row.decision,
        outline: row.outline,
      })),
    );
  }
  async recommendation(actor: Actor, input: unknown) {
    const value = z
        .strictObject({
          window: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
          topicKey: z.string().regex(/^[a-z0-9_-]{2,60}$/u),
          decision: z.enum(["accept", "edit", "defer", "dismiss"]),
          outline: z.string().max(2000),
        })
        .parse(input),
      creatorId = await this.requireCreator(actor);
    return this.db.actor(actor, creatorId, async (client) => {
      const snapshot = await client.query(
        "SELECT 1 FROM growth.insight_snapshot WHERE creator_id=$1 AND window_start=$2 AND topic_key=$3",
        [creatorId, value.window, value.topicKey],
      );
      if (!snapshot.rowCount)
        throw new DomainError(
          "insight_unavailable",
          "This insight is unavailable.",
          404,
        );
      await client.query(
        "INSERT INTO growth.recommendation(creator_id,window_start,topic_key,decision,outline) VALUES($1,$2,$3,$4,$5) ON CONFLICT(creator_id,window_start,topic_key) DO UPDATE SET decision=excluded.decision,outline=excluded.outline,updated_at=now()",
        [
          creatorId,
          value.window,
          value.topicKey,
          value.decision,
          value.outline,
        ],
      );
      return { saved: true };
    });
  }
  async publishRecommendation(actor: Actor, input: unknown) {
    const value = z
      .strictObject({
        window: z.string(),
        topicKey: z.string(),
        outline: z.string().max(2000),
      })
      .parse(input);
    const insights = await this.insights(actor);
    if (
      !insights.some(
        (i) =>
          i.topicKey === value.topicKey &&
          new Date(i.window).toISOString().slice(0, 10) === value.window,
      )
    )
      throw new DomainError(
        "insight_unavailable",
        "This insight is unavailable.",
      );
    return this.owners.publishRecommendation(actor, value);
  }
  async measure(actor: Actor, input: unknown) {
    const value = Metric.parse(input);
    if (
      value.role === "creator" &&
      (await this.requireCreator(actor)) !== value.creatorId
    )
      throw new DomainError(
        "creator_required",
        "This outcome is outside your creator scope.",
      );
    await this.db.actor(actor, null, async (client) => {
      const inserted = await client.query(
        "INSERT INTO growth.metric(id,account_id,actor_key,creator_id,type,document) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING RETURNING id",
        [
          value.id,
          actor.accountId,
          this.pseudonym(value.creatorId, actor.accountId, "analytics-v1"),
          value.creatorId,
          value.type,
          value,
        ],
      );
      if (!inserted.rowCount) {
        const prior = (
          await client.query(
            "SELECT document FROM growth.metric WHERE id=$1 AND account_id=$2",
            [value.id, actor.accountId],
          )
        ).rows[0];
        if (!prior || contentHash(prior.document) !== contentHash(value))
          throw new DomainError(
            "metric_id_conflict",
            "This outcome ID already refers to another event.",
            409,
          );
      }
    });
    return { recorded: true };
  }
  async funnel(actor: Actor) {
    const creatorId = await this.requireCreator(actor);
    const result = await this.db.worker.query(
      `SELECT type,count(DISTINCT actor_key)::int AS actors,count(*)::int AS events FROM growth.metric WHERE creator_id=$1 AND occurred_at>=(now() AT TIME ZONE 'UTC')::date-interval '30 days' AND document->>'schemaVersion'='2' AND document->>'capability'='available' AND type<>'capability_unavailable' GROUP BY type HAVING count(DISTINCT actor_key)>=5 ORDER BY type`,
      [creatorId],
    );
    const cohorts = await this.db.worker.query(
      `SELECT document->>'role' AS role,document->>'cohort' AS cohort,document->>'surface' AS surface,document->>'userState' AS user_state,type,count(DISTINCT actor_key)::int AS actors FROM growth.metric WHERE creator_id=$1 AND occurred_at>=(now() AT TIME ZONE 'UTC')::date-interval '30 days' AND document->>'schemaVersion'='2' AND document->>'capability'='available' GROUP BY 1,2,3,4,5 HAVING count(DISTINCT actor_key)>=5 ORDER BY 1,2,3,4,5`,
      [creatorId],
    );
    const returns = [];
    for (const day of [1, 7, 30]) {
      const row = (
        await this.db.worker.query(
          `WITH first_arrivals AS (SELECT actor_key,(min(occurred_at) AT TIME ZONE 'UTC')::date AS started FROM growth.metric WHERE creator_id=$1 AND type='arrival' AND document->>'schemaVersion'='2' AND document->>'capability'='available' GROUP BY actor_key), closed AS (SELECT * FROM first_arrivals WHERE started>=(now() AT TIME ZONE 'UTC')::date-60 AND started<(now() AT TIME ZONE 'UTC')::date-$2::int) SELECT count(*)::int AS eligible,count(*) FILTER(WHERE EXISTS(SELECT 1 FROM growth.metric r WHERE r.creator_id=$1 AND r.actor_key=closed.actor_key AND r.type='return' AND r.document->>'capability'='available' AND (r.occurred_at AT TIME ZONE 'UTC')::date=closed.started+$2::int))::int AS returned FROM closed`,
          [creatorId, day],
        )
      ).rows[0];
      const visible =
        Number(row.eligible) >= 5 &&
        (Number(row.returned) === 0 || Number(row.returned) >= 5);
      returns.push({
        day,
        eligible: Number(row.eligible) >= 5 ? Number(row.eligible) : null,
        returned: visible ? Number(row.returned) : null,
        rate: visible ? Number(row.returned) / Number(row.eligible) : null,
      });
    }
    const useful = (
      await this.db.worker.query(
        `WITH arrivals AS (SELECT actor_key,min(occurred_at) AS started FROM growth.metric WHERE creator_id=$1 AND type='arrival' AND document->>'schemaVersion'='2' AND document->>'capability'='available' GROUP BY actor_key), durations AS (SELECT a.actor_key,extract(epoch FROM min(m.occurred_at)-a.started) AS seconds FROM arrivals a JOIN growth.metric m USING(actor_key) WHERE m.creator_id=$1 AND m.type='useful_answer' AND m.document->>'capability'='available' AND m.occurred_at>=a.started AND a.started>=(now() AT TIME ZONE 'UTC')::date-interval '30 days' GROUP BY a.actor_key,a.started) SELECT count(*)::int AS observations,percentile_cont(0.5) WITHIN GROUP(ORDER BY seconds) AS median_seconds FROM durations`,
        [creatorId],
      )
    ).rows[0];
    return {
      schemaVersion: 2,
      windowDays: 30,
      minimumDistinctActors: 5,
      counts: result.rows,
      cohorts: cohorts.rows,
      returns,
      timeToUsefulAnswerSeconds:
        Number(useful.observations) >= 5 ? Number(useful.median_seconds) : null,
      denominator:
        "Distinct pseudonymous actors per event in the fixed last 30 days. Unavailable capabilities and legacy events are excluded. Cells below five actors are suppressed.",
      retention:
        "D1/D7/D30 use each actor's first available arrival in the last 60 calendar days, only after that UTC return day closes. The numerator is an observed return on that day. Small cohorts and positive numerators below five are suppressed.",
    };
  }
  async experiments(actor: Actor) {
    const creatorId = await this.requireCreator(actor);
    return (
      await this.db.worker.query(
        "SELECT id,hypothesis,success_criterion,stop_criterion,state,approved_at FROM growth.experiment WHERE creator_id=$1 ORDER BY id LIMIT 20",
        [creatorId],
      )
    ).rows;
  }
  async proposeExperiment(actor: Actor, input: unknown) {
    const creatorId = await this.requireCreator(actor),
      value = z
        .strictObject({
          hypothesis: z.string().trim().min(12).max(800),
          successCriterion: z.string().trim().min(12).max(800),
          stopCriterion: z.string().trim().min(12).max(800),
        })
        .parse(input);
    return this.db.transaction(this.db.worker, async (client) => {
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
        [creatorId],
      );
      if (
        Number(
          (
            await client.query(
              "SELECT count(*) AS count FROM growth.experiment WHERE creator_id=$1 AND state='draft'",
              [creatorId],
            )
          ).rows[0].count,
        ) >= 20
      )
        throw new DomainError(
          "experiment_limit",
          "Review your existing draft proposals first.",
          429,
        );
      const result = await client.query(
        "INSERT INTO growth.experiment(creator_id,hypothesis,success_criterion,stop_criterion) VALUES($1,$2,$3,$4) RETURNING id,state",
        [
          creatorId,
          value.hypothesis,
          value.successCriterion,
          value.stopCriterion,
        ],
      );
      return result.rows[0];
    });
  }
  async feedback(actor: Actor, input: unknown) {
    const value = z
      .strictObject({
        category: z.enum([
          "discovery_fit",
          "usefulness",
          "notification",
          "departure",
        ]),
        score: z.int().min(1).max(5).nullable(),
      })
      .parse(input);
    await this.db.actor(actor, null, async (client) => {
      await client.query(
        "INSERT INTO growth.feedback(account_id,category,score) VALUES($1,$2,$3)",
        [actor.accountId, value.category, value.score],
      );
    });
    return { saved: true };
  }
  async privacyDelete(
    accountId: string,
    ownedCreatorIds: readonly string[] = [],
  ) {
    await this.db.transaction(this.db.worker, async (client) => {
      await client.query(
        "UPDATE growth.delivery SET state='suppressed' WHERE account_id=$1 AND state IN ('queued','leased')",
        [accountId],
      );
      for (const table of [
        "follow",
        "preference",
        "device",
        "email",
        "notification",
        "share",
        "metric",
        "feedback",
        "prompt_choice",
        "entry_attribution",
      ]) {
        if (table === "notification")
          await client.query(
            "DELETE FROM growth.delivery WHERE notification_id IN (SELECT id FROM growth.notification WHERE account_id=$1)",
            [accountId],
          );
        await client.query(`DELETE FROM growth.${table} WHERE account_id=$1`, [
          accountId,
        ]);
      }
      await client.query(
        "UPDATE growth.event_inbox SET envelope=jsonb_set(envelope,'{recipients}',coalesce((SELECT jsonb_agg(r) FROM jsonb_array_elements(envelope->'recipients') r WHERE r->>'accountId'<>$1),'[]'::jsonb)) WHERE envelope->'recipients' @> jsonb_build_array(jsonb_build_object('accountId',$1::text))",
        [accountId],
      );
      await client.query(
        "UPDATE growth.event_inbox e SET envelope='{\"erased\":true}'::jsonb WHERE NOT EXISTS(SELECT 1 FROM growth.notification n WHERE n.event_id=e.id)",
      );
      await client.query("DELETE FROM growth.invite WHERE created_by=$1", [
        accountId,
      ]);
      await client.query(
        "DELETE FROM growth.activation_job WHERE creator_account_id=$1",
        [accountId],
      );
      await client.query(
        "DELETE FROM growth.insight_signal WHERE subject_key=$1",
        [this.pseudonym("privacy", accountId, "subject")],
      );
      await client.query(
        "UPDATE growth.impact SET consented_thanks=coalesce((SELECT jsonb_agg(quote) FROM jsonb_array_elements(consented_thanks) quote WHERE quote->>'subjectKey'<>$1),'[]'::jsonb) WHERE consented_thanks @> jsonb_build_array(jsonb_build_object('subjectKey',$1::text))",
        [this.privacySubjectKey(accountId)],
      );
      for (const table of [
        "content_public",
        "insight_signal",
        "insight_snapshot",
        "insight_window",
        "recommendation",
        "impact",
        "activation_job",
        "instagram_reply",
        "experiment",
        "metric",
        "invite",
        "follow",
        "entry_attribution",
      ])
        await client.query(
          `DELETE FROM growth.${table} WHERE creator_id=ANY($1::uuid[])`,
          [ownedCreatorIds],
        );
      await client.query(
        "UPDATE growth.producer_relay SET envelope=jsonb_set(envelope,'{recipients}',coalesce((SELECT jsonb_agg(r) FROM jsonb_array_elements(envelope->'recipients') r WHERE r->>'accountId'<>$1),'[]'::jsonb)) WHERE envelope->'recipients' @> jsonb_build_array(jsonb_build_object('accountId',$1::text))",
        [accountId],
      );
      await client.query(
        "DELETE FROM growth.producer_relay WHERE creator_id=ANY($1::uuid[]) OR envelope->'recipients'='[]'::jsonb",
        [ownedCreatorIds],
      );
      await client.query(
        "DELETE FROM growth.producer_cursor WHERE creator_id=ANY($1::uuid[])",
        [ownedCreatorIds],
      );
      await client.query(
        "DELETE FROM growth.delivery USING growth.notification n WHERE growth.delivery.notification_id=n.id AND n.creator_id=ANY($1::uuid[])",
        [ownedCreatorIds],
      );
      await client.query(
        "UPDATE growth.notification SET sender='System',preview='This update is no longer available.',destination='/notifications' WHERE creator_id=ANY($1::uuid[])",
        [ownedCreatorIds],
      );
      await client.query(
        "DELETE FROM growth.share WHERE source->>'creatorId'=ANY($1::text[])",
        [ownedCreatorIds],
      );
      await client.query(
        "DELETE FROM growth.creator_public WHERE id=ANY($1::uuid[])",
        [ownedCreatorIds],
      );
    });
    return {
      acknowledged: true,
      retained:
        "Irreversibly aggregated closed snapshots contain no identity or text.",
    };
  }
}
