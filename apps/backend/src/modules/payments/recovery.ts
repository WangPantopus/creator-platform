import type { Pool } from "pg";
import type { Database } from "../../db/database.js";
import type { AccessService, ThreadScope } from "../access/scope.js";
import type { PantopusIdentityAdapter } from "../identity/adapter.js";
import type { CommerceService } from "../commerce/service.js";
import {
  CommerceRequestNotifications,
  commerceNoticeEventTypes,
  type CommerceNoticeRecords,
} from "../commerce/notifications.js";
import type { GrowthEventSource, GrowthRelay } from "../growth/relay.js";
import { CommerceRecoveryWorker, type CommerceWorkIndex } from "./inbox.js";
import { DevelopmentCommerceWorkIndex } from "./development-work-index.js";

/**
 * The commerce scheduler: one recovery pass at a time, every `intervalMs`, so
 * that expiry, release, late-delivery refunds and crash recovery happen without
 * anyone tapping. A host starts it after its graph is composed and closes it on
 * shutdown; a pass that is running is awaited, never abandoned.
 */
export function createCommerceRecovery(input: {
  service: CommerceService;
  index: CommerceWorkIndex;
  /** A non-owner pool that may claim provider notifications; omit to rely on the due scan. */
  inbox?: Pool;
  intervalMs?: number;
  onError?: (cause: unknown) => void;
  /** After each pass, hand the request events it made to growth. */
  publish?: () => Promise<void>;
}) {
  const worker = new CommerceRecoveryWorker(
    input.inbox,
    input.service,
    input.index,
  );
  const intervalMs = input.intervalMs ?? 15_000;
  let timer: ReturnType<typeof setInterval> | undefined;
  let pending: Promise<void> | undefined;
  let closed = false;
  const run = () => {
    if (closed || pending) return;
    pending = worker
      .tick()
      .catch((cause: unknown) => input.onError?.(cause))
      .then(() => input.publish?.())
      .catch((cause: unknown) => input.onError?.(cause))
      .finally(() => {
        pending = undefined;
      });
  };
  return {
    worker,
    start() {
      if (closed || timer) return;
      run();
      timer = setInterval(run, intervalMs);
      timer.unref();
    },
    async close() {
      closed = true;
      if (timer) clearInterval(timer);
      await pending;
    },
  };
}

/** Hands request events to growth one conversation at a time: the source
 * records each notice in growth's notice table, the relay enqueues the event,
 * and the event is marked handed over. A conversation that fails is reported
 * and tried again on the next pass; the others still go. */
export function createCommerceNoticePublishing(input: {
  scopes: () => Promise<readonly ThreadScope[]>;
  source: (scope: ThreadScope) => Promise<GrowthEventSource>;
  relay: Pick<GrowthRelay, "pull">;
  onError?: (cause: unknown) => void;
}) {
  return async () => {
    for (const scope of await input.scopes())
      try {
        await input.relay.pull(await input.source(scope), 50);
      } catch (cause) {
        input.onError?.(cause);
      }
  };
}

/** A failure's own code (a SQLSTATE such as 28P01, a domain or Node code), never
 * its message, which can carry connection details or data. */
const codeOf = (cause: unknown) => {
  const code = (cause as { code?: unknown } | null | undefined)?.code;
  return typeof code === "string" && /^[A-Za-z0-9_]{1,64}$/u.test(code)
    ? code
    : "unknown";
};

/** What a failed pass or hand-over writes to the host's log. */
const failure = (event: string, cause: unknown) =>
  JSON.stringify({
    event,
    at: new Date().toISOString(),
    code: codeOf(cause),
    ...(cause instanceof Error && cause.cause !== undefined
      ? { cause: codeOf(cause.cause) }
      : {}),
  });

/**
 * Development only: request notices handed to growth by the scheduler. Two
 * authorities a production host must supply do not exist yet for a background
 * publisher, so this host stands in for them, and says so:
 * - who may be told is "an adult-eligible development account". W8 has no
 *   worker denial for commerce notices: its pair check needs that person's
 *   live session (a ticket to lane 1);
 * - the commerce outbox's privacy registration (export, deletion, retention)
 *   waits on the founder's Q16, and is taken as given here.
 */
function developmentNoticePublishing(
  index: DevelopmentCommerceWorkIndex,
  notices: DevelopmentNotices,
  report: (line: string) => void,
) {
  return createCommerceNoticePublishing({
    scopes: async () => {
      const scopes: ThreadScope[] = [];
      for (const pair of await index.noticePairs(commerceNoticeEventTypes, 20))
        scopes.push(
          await notices.access.openThread(
            pair.actor,
            pair.creatorId,
            pair.fanId,
            false,
          ),
        );
      return scopes;
    },
    source: (scope) =>
      CommerceRequestNotifications.prepare({
        database: notices.database,
        scope,
        assertRecipientAllowed: async (_client, _scope, recipient) =>
          index.actorFor(recipient.accountId) !== null,
        assertPrivacyRegistered: async () => undefined,
        notices: notices.records,
      }),
    relay: notices.relay,
    onError: (cause) =>
      report(failure("commerce_notice_publish_failed", cause)),
  });
}
type DevelopmentNotices = Readonly<{
  /** Growth's relay and notice records (its runtime's `relay` and `notices`). */
  relay: Pick<GrowthRelay, "pull">;
  records: CommerceNoticeRecords;
  access: AccessService;
  database: Database;
}>;

/** The development host's scheduler: scopes come from the development identity adapter. */
export async function createDevelopmentCommerceRecovery(input: {
  service: CommerceService;
  pool: Pool;
  identity: PantopusIdentityAdapter;
  inbox?: Pool;
  intervalMs?: number;
  report?: (line: string) => void;
  /** Hand request events to growth after each pass; omit to keep them. */
  notices?: DevelopmentNotices;
}) {
  const report =
    input.report ?? ((line: string) => process.stderr.write(`${line}\n`));
  const index = await DevelopmentCommerceWorkIndex.create(
    input.pool,
    input.identity,
    report,
  );
  return createCommerceRecovery({
    service: input.service,
    index,
    ...(input.inbox ? { inbox: input.inbox } : {}),
    ...(input.intervalMs ? { intervalMs: input.intervalMs } : {}),
    ...(input.notices
      ? { publish: developmentNoticePublishing(index, input.notices, report) }
      : {}),
    onError: (cause) => report(failure("commerce_recovery_pass_failed", cause)),
  });
}
