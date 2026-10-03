import { copy, formatCopy } from "@qelvora/copy";
import { z } from "zod";
import type { Actor } from "../identity/adapter.js";
import type { AccessService } from "../access/scope.js";
import type { Database } from "../../db/database.js";
import type { SignedActService } from "../identity/signed-acts.js";
import { DomainError } from "../../core/errors.js";
import type { GrowthOwners, HomeEntry } from "./contracts.js";
import {
  conversationHomeCursor,
  readConversationHomeCursor,
} from "../conversation/home-cursor.js";
import { deliveredTextCommand } from "../conversation/signed-preview.js";

/** W3's current account() directory contains family metadata, never messages. */
export interface ConversationHomeDirectory {
  accountForHome?(
    actor: Actor,
    cursor?: string,
  ): Promise<{
    fan: { id: string };
    threads: readonly {
      id: string;
      creatorId: string;
      fanId: string;
      activityAt?: string;
    }[];
    nextCursor?: string | null;
    order: "activity" | "directory";
  }>;
  account(
    actor: Actor,
    cursor?: string,
  ): Promise<{
    fan: { id: string };
    threads: readonly { id: string; creatorId: string; fanId: string }[];
    nextCursor?: string | null;
  }>;
}
const Directory = z.object({
  fan: z.object({ id: z.uuid() }),
  threads: z
    .array(
      z.object({
        id: z.uuid(),
        creatorId: z.uuid(),
        fanId: z.uuid(),
        activityAt: z.iso.datetime().optional(),
      }),
    )
    .max(50),
  nextCursor: z.string().min(1).max(256).nullable().optional(),
  order: z.enum(["activity", "directory"]).optional(),
});

/** Minimal private Home read through fresh issued fan scopes. The host can
 * compose this with W4 request/W6 call entries; no analytics receives text. */
export function canonicalConversationHomePage(
  conversation: ConversationHomeDirectory,
  access: AccessService,
  database: Database,
  signing: Pick<SignedActService, "matchesThreadAct">,
  handleFor: (creatorId: string) => Promise<string | null>,
): NonNullable<GrowthOwners["homePage"]> {
  return async (actor, cursor) => {
    const directory = Directory.parse(
      await (conversation.accountForHome?.(actor, cursor) ??
        conversation.account(actor, cursor)),
    );
    const entries = directory.threads;
    const seen = new Set<string>();
    for (const entry of entries) {
      if (
        seen.has(entry.id) ||
        entry.fanId !== directory.fan.id ||
        (directory.order === "activity" && !entry.activityAt)
      )
        throw new DomainError(
          "home_scope_invalid",
          copy.growthErrorPrivateReplyUnavailable,
          503,
        );
      seen.add(entry.id);
    }
    const nextCursor = directory.nextCursor ?? null;
    const position =
      nextCursor && directory.order === "activity"
        ? readConversationHomeCursor(nextCursor)
        : null;
    const nextThreadId = position?.threadId ?? nextCursor;
    if (
      position &&
      (position.threadId !== entries.at(-1)?.id ||
        position.activityAt !== entries.at(-1)?.activityAt)
    )
      throw new DomainError(
        "home_scope_invalid",
        copy.growthErrorPrivateReplyUnavailable,
        503,
      );
    if (
      nextCursor &&
      (!nextThreadId || !seen.has(nextThreadId) || nextCursor === cursor)
    )
      throw new DomainError(
        "home_scope_invalid",
        copy.growthErrorPrivateReplyUnavailable,
        503,
      );
    const result: HomeEntry[] = [];
    for (const entry of entries) {
      try {
        const scope = await access.openThread(
          actor,
          entry.creatorId,
          entry.fanId,
          false,
        );
        if (scope.authority !== "fan" || scope.threadId !== entry.id)
          throw new DomainError(
            "home_scope_invalid",
            copy.growthErrorPrivateReplyUnavailable,
            503,
          );
        const handle = await handleFor(scope.creatorId);
        if (!handle || !/^[a-z0-9_]{3,30}$/u.test(handle)) continue;
        const row = await database.withThread(
          scope,
          async (client) => {
            const thread = (
              await client.query(
                "SELECT privacy_notice_at FROM creator.thread WHERE id=$1 AND creator_id=$2 AND fan_id=$3",
                [scope.threadId, scope.creatorId, scope.fanId],
              )
            ).rows[0];
            const message = (
              await client.query(
                "SELECT author_kind,author_account_id,text,created_at,signed_act_id,signed_content_hash,to_jsonb(m)->'signed_command' AS signed_command,to_jsonb(m)->'approval_id' AS approval_id,to_jsonb(m)->'recording_asset_id' AS recording_asset_id,to_jsonb(m)->'corrects_message_id' AS corrects_message_id,to_jsonb(m)->'corrects_message_version' AS corrects_message_version FROM creator.message m WHERE thread_id=$1 AND creator_id=$2 AND fan_id=$3 AND delivery_state='delivered' ORDER BY sequence DESC LIMIT 1",
                [scope.threadId, scope.creatorId, scope.fanId],
              )
            ).rows[0];
            const command = message
              ? deliveredTextCommand(scope, message)
              : null;
            const signed = Boolean(
              command &&
                typeof message?.signed_act_id === "string" &&
                (await signing.matchesThreadAct(
                  client,
                  scope,
                  message.signed_act_id,
                  command,
                )),
            );
            return { thread, message, signed };
          },
          "read",
        );
        if (!row.thread) continue;
        const message = row.message;
        let label: string = copy.growthSystem;
        let preview = message
          ? Array.from(message.text as string)
              .slice(0, 240)
              .join("")
          : "";
        if (message?.author_kind === "fan") label = copy.navYou;
        else if (message?.author_kind === "ai")
          label = formatCopy("aiAuthor", { name: scope.creatorName });
        else if (message?.author_kind === "team")
          label = formatCopy("growthCreatorTeam", { name: scope.creatorName });
        else if (message && message.author_kind !== "system") {
          if (!row.signed) preview = copy.growthUpdateUnavailable;
          else
            label =
              message.author_kind === "approved_draft"
                ? formatCopy("approvedAuthor", { name: scope.creatorName })
                : scope.creatorName;
        }
        result.push({
          id: scope.threadId,
          creatorId: scope.creatorId,
          creatorName: scope.creatorName,
          label,
          preview,
          destination: `/creators/${handle}/chat`,
          updatedAt:
            entry.activityAt ??
            new Date(
              message?.created_at ?? row.thread.privacy_notice_at,
            ).toISOString(),
          kind: "thread",
          cursor:
            directory.order === "activity" && entry.activityAt
              ? conversationHomeCursor({
                  threadId: entry.id,
                  activityAt: entry.activityAt,
                })
              : undefined,
        });
      } catch (error) {
        // A deleted/denied family can remain briefly in W3's directory. Skip
        // only that known denial; session/provider/schema failures stay visible.
        if (error instanceof DomainError && error.code === "thread_unavailable")
          continue;
        throw error;
      }
    }
    // Only W3's installed activity projection establishes global recency. Older
    // hosts remain UUID paged; sorting that page does not establish global order.
    return {
      entries: result.sort(
        (a, b) =>
          b.updatedAt.localeCompare(a.updatedAt) || b.id.localeCompare(a.id),
      ),
      nextCursor,
      order: directory.order ?? "directory",
    };
  };
}

/** Compatibility for hosts on the original non-paged contract. New hosts must
 * bind homePage so an account beyond this legacy bound stays navigable. */
export function canonicalConversationHome(
  ...dependencies: Parameters<typeof canonicalConversationHomePage>
): GrowthOwners["home"] {
  const read = canonicalConversationHomePage(...dependencies);
  return async (actor) => {
    const first = await read(actor);
    if (!first.nextCursor) return first.entries;
    const second = await read(actor, first.nextCursor);
    if (second.nextCursor)
      throw new DomainError(
        "home_directory_limit",
        copy.growthErrorPrivateReplyUnavailable,
        503,
      );
    return [...first.entries, ...second.entries].sort((a, b) =>
      b.updatedAt.localeCompare(a.updatedAt),
    );
  };
}
