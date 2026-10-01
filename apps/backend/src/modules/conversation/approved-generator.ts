import { createAgentConversationGenerator } from "../agent/conversation-adapter.js";

/** Register only the prepared W2 runtime with its actual journal and authorities.
 * The previous wrapper could neither admit memory calls nor retain execution
 * custody. The canonical W3 processor must supply the real execution port. */
export function approvedConversationGenerator(
  domain: Parameters<typeof createAgentConversationGenerator>[0],
) {
  return createAgentConversationGenerator(domain);
}
