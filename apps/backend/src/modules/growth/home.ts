import { copy, formatCopy } from "@qelvora/copy";
import { z } from "zod";
import type { Actor } from "../identity/adapter.js";
import type { AccessService } from "../access/scope.js";
import type { Database } from "../../db/database.js";
import type { SignedActService } from "../identity/signed-acts.js";
import { DomainError } from "../../core/errors.js";
import type { GrowthOwners, HomeEntry } from "./contracts.js";

/** W3's current account() directory contains family metadata, never messages. */
export interface ConversationHomeDirectory {
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
    .array(z.object({ id: z.uuid(), creatorId: z.uuid(), fanId: z.uuid() }))
    .max(100),
  nextCursor: z.uuid().nullable().optional(),
});

/** Retained families use the existing private thread destination from W7.
 * Their issued scope, rather than public profile publication, authorizes the read.
 * Minimal private Home read through fresh issued fan scopes. The host can
 * compose this with W4 request/W6 call entries; no analytics receives text. */
export function canonicalConversationHome(
  conversation: ConversationHomeDirectory,
  access: AccessService,
  database: Database,
  signing: Pick<SignedActService, "publicVerification">,
): GrowthOwners["home"] {
  return async (actor) => {
    const entries: z.infer<typeof Directory>["threads"] = [];
    const seen = new Set<string>();
    let fanId: string | undefined, cursor: string | undefined;
    // W3 now returns at most50 relationships per page. Read two authorized
    // pages rather than silently treating the first page as the whole account.
    for (let page = 0; page < 2; page++) {
      const directory = Directory.parse(
        await conversation.account(actor, cursor),
      );
      if (fanId && fanId !== directory.fan.id)
        throw new DomainError(
          "home_scope_invalid",
          copy.growthErrorPrivateReplyUnavailable,
          503,
        );
      fanId = directory.fan.id;
      for (const entry of directory.threads) {
        if (seen.has(entry.id) || entry.fanId !== fanId)
          throw new DomainError(
            "home_scope_invalid",
            copy.growthErrorPrivateReplyUnavailable,
            503,
          );
        seen.add(entry.id);
        entries.push(entry);
      }
      cursor = directory.nextCursor ?? undefined;
      if (entries.length > 100 || (cursor && page === 1))
        throw new DomainError(
          "home_directory_limit",
          copy.growthErrorPrivateReplyUnavailable,
          503,
        );
      if (!cursor) break;
      if (!directory.threads.length || !seen.has(cursor))
        throw new DomainError(
          "home_scope_invalid",
          copy.growthErrorPrivateReplyUnavailable,
          503,
        );
    }
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
        const row = await database.withThread(scope, async (client) => {
          const thread = (
            await client.query(
              "SELECT privacy_notice_at FROM creator.thread WHERE id=$1 AND creator_id=$2 AND fan_id=$3",
              [scope.threadId, scope.creatorId, scope.fanId],
            )
          ).rows[0];
          const message = (
            await client.query(
              "SELECT author_kind,text,created_at,signed_act_id,signed_content_hash FROM creator.message WHERE thread_id=$1 AND creator_id=$2 AND fan_id=$3 AND delivery_state='delivered' ORDER BY sequence DESC LIMIT 1",
              [scope.threadId, scope.creatorId, scope.fanId],
            )
          ).rows[0];
          return { thread, message };
        });
        if (!row.thread) continue;
        const message = row.message;
        let label: string = copy.growthSystem;
        let preview = message?.text.slice(0, 240) ?? "";
        if (message?.author_kind === "fan") label = copy.navYou;
        else if (message?.author_kind === "ai")
          label = formatCopy("aiAuthor", { name: scope.creatorName });
        else if (message?.author_kind === "team")
          label = formatCopy("growthCreatorTeam", { name: scope.creatorName });
        else if (message && message.author_kind !== "system") {
          const signature = message.signed_act_id
            ? await signing.publicVerification(message.signed_act_id)
            : null;
          if (
            signature?.status !== "valid" ||
            signature.contentHash !== message.signed_content_hash
          )
            preview = copy.growthUpdateUnavailable;
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
          destination: `/threads/${scope.creatorId}/${scope.fanId}`,
          updatedAt: new Date(
            message?.created_at ?? row.thread.privacy_notice_at,
          ).toISOString(),
          kind: "thread",
        });
      } catch (error) {
        // A deleted/denied family can remain briefly in W3's directory. Skip
        // only that known denial; session/provider/schema failures stay visible.
        if (error instanceof DomainError && error.code === "thread_unavailable")
          continue;
        throw error;
      }
    }
    return result.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  };
}
