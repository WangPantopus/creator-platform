import { AsyncLocalStorage } from "node:async_hooks";
import type { PoolClient } from "pg";
import { invariant } from "../../core/errors.js";
import type { AgentRepository, CreatorScope } from "./repository.js";

type OriginalComparisonSource = Readonly<{
  repository: AgentRepository;
  scope: CreatorScope;
  signal: AbortSignal;
  assertCurrent(client: PoolClient): Promise<void>;
}>;
const current = new AsyncLocalStorage<OriginalComparisonSource>();

/** Keep the historical engine's prompts/configuration intact while its shared
 * journal admits every remote call under the original comparison source. This
 * is server orchestration, never an HTTP capability or a new fan Actor. */
export function withComparisonProviderSource<T>(
  source: OriginalComparisonSource,
  work: () => Promise<T>,
): Promise<T> {
  invariant(
    !current.getStore(),
    "comparison_source_nested",
    "Use one original comparison source per provider operation.",
  );
  return current.run(Object.freeze({ ...source }), work);
}

export function comparisonProviderAdmission(
  repository: AgentRepository,
  scope: CreatorScope,
  category: string,
) {
  const source = current.getStore();
  if (!source) return undefined;
  invariant(
    source.repository === repository &&
      source.scope.creatorId === scope.creatorId &&
      source.scope.accountId === scope.accountId &&
      source.scope.development === scope.development &&
      (category === "shadow" || category === "evaluation"),
    "comparison_source_changed",
    "Provider processing must retain its original comparison source.",
  );
  return <T>(journal: (client: PoolClient) => Promise<T>) =>
    repository.transaction(
      source.scope,
      async (client) => {
        // The source owner installs the final read on this same transaction. The
        // journal row commits only after that final gate, before any provider I/O.
        await source.assertCurrent(client);
        return journal(client);
      },
      false,
      source.signal,
    );
}
