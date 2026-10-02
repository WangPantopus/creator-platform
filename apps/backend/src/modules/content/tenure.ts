import type { PoolClient } from "pg";
import {
  ContentTenureRecognition,
  NoteReplyPolicy,
} from "../../../../../packages/api/src/content.js";
import { DomainError, invariant } from "../../core/errors.js";
import type { Actor } from "../identity/adapter.js";
import type {
  AudienceIdentityAuthority,
  AudienceScope,
} from "../identity/audience-scope.js";
import { requestAuthority } from "../identity/request-authority.js";
import { createCommerceTenureReader } from "../commerce/tenure.js";
import type { PaidCoverageJournal } from "../commerce/paid-coverage.js";
import {
  commerceContentAudience,
  type ContentGroupAudienceReader,
} from "../commerce/content-audience.js";
import type { ContentDependencies } from "./service.js";

export const NOTE_REPLY_TENURE_MIGRATION = "0088_w5_reply_tenure_cap";
export const NOTE_REPLY_TENURE_CHECKSUM =
  "b1ec7e9684e5f916253202cf8d6b484376fe3c74dbec63221500e68ecf7fe0ba";

export function baseNoteReplyPolicy(actor: Actor, creatorId: string) {
  return NoteReplyPolicy.parse({
    accountId: actor.accountId,
    creatorId,
    limit: 4000,
    confirmedDays: null,
    milestone: null,
    basis: null,
    historyComplete: false,
    longerRepliesActive: false,
    checkedAt: new Date().toISOString(),
  });
}

/** Creator-side recognition retains the original publisher account. W8's
 * exact pair negatives are prepared for the entire bounded page before the
 * first role/content/membership positive. Team members get no borrowed owner
 * or own-fan scope and receive no private membership recognition. */
export function createContentCreatorTenureHost(input: {
  holdCreatorFanNegativeAuthority: (
    client: PoolClient,
    actor: Actor,
    tuple: { creatorId: string; fanId: string },
  ) => Promise<void>;
  paidCoverage?: PaidCoverageJournal;
}) {
  const pages = new WeakMap<
    PoolClient,
    {
      transaction: string;
      pid: number;
      request: NonNullable<ReturnType<typeof requestAuthority.getStore>>;
      actor: Actor;
      creatorId: string;
      owner: boolean;
      fans: ReadonlySet<string>;
    }
  >();
  async function context(client: PoolClient, actor: Actor) {
    const request = requestAuthority.getStore();
    invariant(
      actor.adultEligible && request?.accountId === actor.accountId,
      "content_session_required",
      "Reopen Studio with your current account.",
    );
    const current = (
      await client.query<{
        account: string;
        session: string;
        transaction: string;
        pid: number;
      }>(
        `SELECT current_setting('app.account_id',true) AS account,
         current_setting('app.identity_session_id',true) AS session,
         pg_current_xact_id()::text AS transaction,pg_backend_pid() AS pid`,
      )
    ).rows[0];
    invariant(
      current?.account === actor.accountId &&
        current.session === request.sessionId,
      "tenure_scope_required",
      "Use the actual current Studio transaction.",
    );
    return { ...current, request };
  }
  const prepareCreatorTenure: NonNullable<
    ContentDependencies["prepareCreatorTenure"]
  > = async (client, actor, creatorId, fanIds) => {
    const current = await context(client, actor),
      old = pages.get(client);
    invariant(
      !old || old.transaction !== current.transaction,
      "tenure_read_order_invalid",
      "Prepare the complete reply page before its positive locks.",
    );
    const fans = [...new Set(fanIds)].sort();
    invariant(
      fans.length <= 51,
      "tenure_page_too_large",
      "Load a bounded reply page.",
    );
    const owner =
      (
        await client.query<{ owned: boolean }>(
          "SELECT account_id=$2 AS owned FROM creator.creator_profile WHERE id=$1",
          [creatorId, actor.accountId],
        )
      ).rows[0]?.owned === true;
    if (owner)
      for (const fanId of fans)
        await input.holdCreatorFanNegativeAuthority(client, actor, {
          creatorId,
          fanId,
        });
    pages.set(client, {
      transaction: current.transaction,
      pid: current.pid,
      request: current.request,
      actor,
      creatorId,
      owner,
      fans: new Set(fans),
    });
  };
  async function retained(
    client: PoolClient,
    actor: Actor,
    creatorId: string,
    fanId: string,
  ) {
    const current = await context(client, actor),
      page = pages.get(client);
    invariant(
      page?.transaction === current.transaction &&
        page.pid === current.pid &&
        page.request === current.request &&
        page.actor === actor &&
        page.creatorId === creatorId &&
        page.fans.has(fanId),
      "tenure_read_order_invalid",
      "Refresh this reply page before reading membership recognition.",
    );
    return page;
  }
  const currentTenure = createCommerceTenureReader(
    async (client, creatorId, fanId) => {
      const page = pages.get(client);
      invariant(
        page,
        "tenure_scope_required",
        "Current creator/fan authority is required.",
      );
      const held = await retained(client, page.actor, creatorId, fanId);
      invariant(
        held.owner,
        "tenure_scope_required",
        "Only the actual creator can read this recognition.",
      );
    },
    input.paidCoverage,
  );
  const creatorTenure: NonNullable<
    ContentDependencies["creatorTenure"]
  > = async (client, actor, creatorId, fanId) => {
    const page = await retained(client, actor, creatorId, fanId);
    if (!page.owner) return null;
    const tenure = await currentTenure(client, creatorId, fanId);
    const now = (
      await client.query<{ checked_at: Date }>(
        "SELECT clock_timestamp() AS checked_at",
      )
    ).rows[0]!.checked_at;
    const since = tenure.since === null ? NaN : Date.parse(tenure.since);
    if (!tenure.continuous || !Number.isFinite(since) || since > now.getTime())
      return null;
    const confirmedDays = Math.floor((now.getTime() - since) / 86_400_000);
    return ContentTenureRecognition.parse({
      confirmedDays,
      milestone:
        confirmedDays >= 365
          ? 365
          : confirmedDays >= 100
            ? 100
            : confirmedDays >= 50
              ? 50
              : null,
      basis: tenure.basis,
      historyComplete: false,
      checkedAt: now.toISOString(),
    });
  };
  return { prepareCreatorTenure, creatorTenure };
}

/** Own-fan recognition only. The actual W1 scope must be prepared before any
 * content/quote/packet or membership/grant locks. Later W4 audience and tenure
 * callbacks reuse its retained identity on the exact transaction; they cannot
 * create a fresh positive identity lease below business locks. Creator reads
 * of another fan require W8's separate actual pair authority, not this scope.
 */
export function createContentTenureHost(input: {
  audienceIdentity: AudienceIdentityAuthority;
  paidCoverage?: PaidCoverageJournal;
  groups?: ContentGroupAudienceReader;
}) {
  const requests = new WeakMap<object, Map<string, AudienceScope>>();
  const prepareAudienceRequest: NonNullable<
    ContentDependencies["prepareAudienceRequest"]
  > = async (actor, creatorId) => {
    const authority = requestAuthority.getStore();
    if (!actor.adultEligible || authority?.accountId !== actor.accountId)
      throw new DomainError(
        "content_session_required",
        "Reopen this content with your current account.",
        401,
      );
    let prepared = requests.get(authority);
    if (!prepared) {
      prepared = new Map();
      requests.set(authority, prepared);
    }
    if (!prepared.has(creatorId))
      prepared.set(
        creatorId,
        await input.audienceIdentity.open(actor, creatorId),
      );
  };
  const scopes = new WeakMap<
    PoolClient,
    {
      transaction: string;
      sessionId: string;
      scope: AudienceScope;
      actor: Actor;
    }
  >();
  async function context(client: PoolClient, actor: Actor) {
    const authority = requestAuthority.getStore();
    if (!actor.adultEligible || authority?.accountId !== actor.accountId)
      throw new DomainError(
        "content_session_required",
        "Reopen this content with your current account.",
        401,
      );
    const current = (
      await client.query<{ account: string | null; transaction: string }>(
        "SELECT nullif(current_setting('app.account_id',true),'') AS account,pg_current_xact_id()::text AS transaction",
      )
    ).rows[0];
    invariant(
      current?.account === actor.accountId && current.transaction,
      "audience_scope_required",
      "Membership recognition requires the actual reading transaction.",
    );
    return { transaction: current.transaction, sessionId: authority.sessionId };
  }
  const prepare: NonNullable<
    ContentDependencies["prepareAudienceRead"]
  > = async (client, actor, creatorId) => {
    const current = await context(client, actor),
      held = scopes.get(client);
    if (
      held?.transaction === current.transaction &&
      held.sessionId === current.sessionId &&
      held.scope.actorAccountId === actor.accountId &&
      held.scope.creatorId === creatorId
    )
      return;
    invariant(
      !held || held.transaction !== current.transaction,
      "audience_read_order_invalid",
      "Keep one actual audience family on the reading transaction.",
    );
    // Scope issuance completes before acquiring the content pool client. Never
    // hold every pool connection while waiting for the issuer's extra client.
    const authority = requestAuthority.getStore();
    const scope = authority
      ? requests.get(authority)?.get(creatorId)
      : undefined;
    invariant(
      scope?.actorAccountId === actor.accountId,
      "audience_read_order_invalid",
      "Prepare current audience identity before opening the reading transaction.",
    );
    await input.audienceIdentity.authorizeInTransaction(scope, client);
    scopes.set(client, { ...current, scope, actor });
  };
  async function retained(client: PoolClient, actor: Actor, creatorId: string) {
    const current = await context(client, actor),
      held = scopes.get(client);
    invariant(
      held?.transaction === current.transaction &&
        held.sessionId === current.sessionId &&
        held.scope.actorAccountId === actor.accountId &&
        held.scope.creatorId === creatorId,
      "audience_read_order_invalid",
      "Prepare current membership identity before reading content.",
    );
    return held.scope;
  }
  const currentTenure = createCommerceTenureReader(
    async (client, creatorId, fanId) => {
      const held = scopes.get(client);
      invariant(
        held,
        "tenure_scope_required",
        "Current membership identity is required.",
      );
      const scope = await retained(client, held.actor, creatorId);
      invariant(
        scope.fanId === fanId,
        "tenure_scope_required",
        "Read only your own membership tenure.",
      );
    },
    input.paidCoverage,
  );
  const replyPolicy: NonNullable<ContentDependencies["replyPolicy"]> = async (
    client,
    actor,
    creatorId,
  ) => {
    await prepare(client, actor, creatorId);
    const scope = await retained(client, actor, creatorId);
    const tenure = await currentTenure(client, creatorId, scope.fanId);
    const now = (
      await client.query<{ checked_at: Date; cap_active: boolean }>(
        `SELECT clock_timestamp() AS checked_at,
           EXISTS(SELECT 1 FROM creator.schema_migration WHERE version=$1 AND checksum=$2)
           AND EXISTS(SELECT 1 FROM pg_constraint
             WHERE conrelid='creator.content_reply'::regclass AND conname='content_reply_tenure_text_check'
             AND contype='c' AND convalidated
             AND pg_get_constraintdef(oid)='CHECK (((length(text) >= 1) AND (length(text) <= 12000)))') AS cap_active`,
        [NOTE_REPLY_TENURE_MIGRATION, NOTE_REPLY_TENURE_CHECKSUM],
      )
    ).rows[0]!;
    const since = tenure.since === null ? NaN : Date.parse(tenure.since);
    const confirmedDays =
      tenure.continuous &&
      Number.isFinite(since) &&
      since <= now.checked_at.getTime()
        ? Math.floor((now.checked_at.getTime() - since) / 86_400_000)
        : null;
    const milestone =
      confirmedDays === null || confirmedDays < 50
        ? null
        : confirmedDays >= 365
          ? 365
          : confirmedDays >= 100
            ? 100
            : 50;
    const limit =
      !now.cap_active || milestone === null
        ? 4000
        : milestone === 365
          ? 12000
          : milestone === 100
            ? 8000
            : 6000;
    return NoteReplyPolicy.parse({
      accountId: actor.accountId,
      creatorId,
      limit,
      confirmedDays,
      milestone,
      basis: tenure.basis,
      historyComplete: false,
      longerRepliesActive: now.cap_active === true,
      checkedAt: now.checked_at.toISOString(),
    });
  };
  const paidAudience: NonNullable<ContentDependencies["paidAudience"]> = (
    client,
    actor,
    creatorId,
    audience,
  ) =>
    commerceContentAudience(
      client,
      actor,
      creatorId,
      audience,
      async (heldClient, actualActor, currentCreatorId, fanId) => {
        const scope = await retained(heldClient, actualActor, currentCreatorId);
        invariant(
          scope.fanId === fanId,
          "audience_scope_required",
          "Read only your own membership audience.",
        );
      },
      input.groups,
    );
  return {
    prepareAudienceRequest,
    prepareAudienceRead: prepare,
    replyPolicy,
    paidAudience,
  };
}
