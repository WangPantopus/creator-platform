import type { SignedActCommand } from "@qelvora/api";
import { ConversationCorrectionCommandSchema } from "../../../../../packages/api/src/conversation/contracts.js";
import type { ThreadScope } from "../access/scope.js";
import { contentHash } from "../../core/canonical.js";

/** Read only the actual scoped message. Private commands never become public
 * verification content, and unknown rich publications need their owner proof. */
export function deliveredTextCommand(
  scope: ThreadScope,
  message: Record<string, unknown>,
): SignedActCommand | null {
  if (
    message.author_account_id !== scope.creatorAccountId ||
    typeof message.text !== "string" ||
    message.recording_asset_id != null ||
    message.approval_id != null
  )
    return null;
  let command: SignedActCommand;
  if (message.signed_command != null) {
    const correction = ConversationCorrectionCommandSchema.safeParse(
      message.signed_command,
    );
    if (
      !correction.success ||
      message.author_kind !== "human_creator" ||
      correction.data.subjectId !== message.corrects_message_id ||
      correction.data.content.messageVersion !==
        message.corrects_message_version ||
      correction.data.content.creatorId !== scope.creatorId ||
      correction.data.content.fanId !== scope.fanId ||
      correction.data.content.threadId !== scope.threadId ||
      correction.data.content.text !== message.text
    )
      return null;
    command = correction.data;
  } else {
    const types = {
      human_creator: "reply",
      approved_draft: "approved_draft",
      human_broadcast: "broadcast",
      human_reaction: "reaction",
    } as const;
    const actType = types[message.author_kind as keyof typeof types];
    if (!actType || message.corrects_message_id != null) return null;
    command = {
      actType,
      subjectId: scope.threadId,
      content: { text: message.text },
    };
  }
  return contentHash(command) === message.signed_content_hash ? command : null;
}
