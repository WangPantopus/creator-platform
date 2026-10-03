import { z } from "zod";
import { DomainError } from "../../core/errors.js";

const ActivityPosition = z.strictObject({
  threadId: z.uuid(),
  activityAt: z.iso.datetime(),
});
const prefix = "activity-v1:";

/** Directory metadata only. Growth seals this position to the current account;
 * neither this cursor nor a relationship row grants private thread authority. */
export function conversationHomeCursor(
  position: z.infer<typeof ActivityPosition>,
) {
  return (
    prefix +
    Buffer.from(JSON.stringify(ActivityPosition.parse(position))).toString(
      "base64url",
    )
  );
}

export function readConversationHomeCursor(cursor: string) {
  try {
    if (cursor.length > 256 || !cursor.startsWith(prefix))
      throw new Error("cursor_invalid");
    const position = ActivityPosition.parse(
      JSON.parse(
        Buffer.from(cursor.slice(prefix.length), "base64url").toString("utf8"),
      ),
    );
    if (conversationHomeCursor(position) !== cursor)
      throw new Error("cursor_invalid");
    return position;
  } catch {
    throw new DomainError(
      "account_cursor_unavailable",
      "Refresh your conversations before paging.",
      400,
    );
  }
}
