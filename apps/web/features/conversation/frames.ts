import type { Frame } from "@qelvora/api";
import type {
  ConversationMessage,
  ConversationPage,
} from "../../../../packages/api/src/conversation/contracts";

/** Contract C5 on the web thread: what one ordered, visible frame does to the
 * page without a refetch. `ThreadDeliveryGate` has already dropped duplicates,
 * stale-epoch frames (INV-03) and anything past a gap, and the server writes a
 * sentence frame only after the guard approved that sentence. An AI sentence
 * is appended to its message as it arrives; the answer's end marks the message
 * and asks for one refetch to reconcile what frames do not carry (citations,
 * version, feedback). Every other frame (accepted, control, other authors)
 * asks for a refetch, as before. */
export function paintFrame(
  page: ConversationPage,
  frame: Frame,
): { page: ConversationPage; reconcile: boolean } | null {
  if (
    frame.threadId !== page.threadId ||
    frame.epoch !== page.epoch ||
    frame.authorKind !== "ai" ||
    !frame.generationId
  )
    return null;
  const generationSequences = { ...page.generationSequences };
  const at = page.messages.findIndex((m) => m.id === frame.messageId);
  const messages = [...page.messages];
  if (frame.kind === "sentence") {
    if (at >= 0)
      messages[at] = {
        ...messages[at]!,
        text: messages[at]!.text + frame.text,
        deliveryState: "generating",
      };
    else {
      const placeholder: ConversationMessage = {
        id: frame.messageId,
        threadId: frame.threadId,
        authorKind: "ai",
        text: frame.text,
        deliveryState: "generating",
        controlEpoch: frame.epoch,
        sequence: (page.messages.at(-1)?.sequence ?? 0) + 1,
        signedActId: null,
        member: null,
        citations: [],
        createdAt: new Date().toISOString(),
        offTheRecord: page.offTheRecord,
        version: 1,
        agentVersion: null,
      };
      messages.push(placeholder);
    }
    generationSequences[frame.generationId] = frame.sequence;
    return {
      page: { ...page, messages, cursor: frame.cursor, generationSequences },
      reconcile: false,
    };
  }
  if (frame.kind === "delivered" || frame.kind === "interrupted") {
    if (at >= 0) messages[at] = { ...messages[at]!, deliveryState: frame.kind };
    delete generationSequences[frame.generationId];
    return {
      page: { ...page, messages, cursor: frame.cursor, generationSequences },
      reconcile: true,
    };
  }
  return null;
}
