import type { Database } from "../../db/database.js";
import { invariant } from "../../core/errors.js";
import type { ThreadScope } from "../access/scope.js";
import { createAgentConversationGenerator } from "../agent/conversation-adapter.js";
import type { createAgentDomain } from "../agent/integration.js";
import type { ConversationGenerator } from "./generation.js";

/** Bind W2's actual constructed domain to this exact W3 database. Preparing this
 * consumer does not approve licensing, allowance, provider terms or migrations. */
export function conversationAgentGenerator(
  database: Database,
  domain: ReturnType<typeof createAgentDomain>,
) {
  invariant(
    domain.service.repository.pool === database.pool,
    "generation_pool_mismatch",
    "Conversation generation requires its actual prepared database pool.",
  );
  const generator = createAgentConversationGenerator(domain);
  generator.journal.assertPool(database.pool);
  const conversationGenerator: ConversationGenerator = generator;
  return Object.freeze({
    generator: conversationGenerator,
    assertReady: generator.assertReady,
    assertApproved: generator.assertApproved,
    citation: (scope: ThreadScope, passageId: string) =>
      database.withThread(scope, (client) =>
        generator.citation(scope, passageId, client),
      ),
  });
}
