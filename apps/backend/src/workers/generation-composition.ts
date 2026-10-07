import type { Pool } from "pg";
import { invariant } from "../core/errors.js";
import type { Database } from "../db/database.js";
import type { AccessService } from "../modules/access/scope.js";
import { PreparedGenerationAgentInputs } from "../modules/agent/generation-inputs.js";
import { PreparedGenerationAgentMetadata } from "../modules/agent/generation-metadata.js";
import { PreparedGenerationPipeline } from "../modules/agent/generation-pipeline.js";
import { PreparedGenerationProviderAccounting } from "../modules/agent/generation-provider-usage.js";
import { PreparedGenerationRuntimeContext } from "../modules/agent/generation-runtime-context.js";
import { PreparedGenerationGuardrail } from "../modules/agent/generation-guardrail.js";
import type { PreparedGenerationJournal } from "../modules/agent/generation-journal.js";
import { PreparedGenerationTerminalJournal } from "../modules/agent/generation-terminal-journal.js";
import type { AgentService } from "../modules/agent/service.js";
import type { CommerceGenerationAllowance } from "../modules/commerce/generation-allowance.js";
import { CommerceGenerationAudience } from "../modules/commerce/generation-audience.js";
import { CommerceGenerationSafetyTerminalSettlement } from "../modules/commerce/generation-safety-terminal-settlement.js";
import { PreparedContentGenerationOrigins } from "../modules/content/generation-origin.js";
import { PreparedGenerationConversationContext } from "../modules/conversation/generation-context.js";
import { PreparedGenerationConversationOutput } from "../modules/conversation/generation-output.js";
import { PreparedGenerationConversationTerminal } from "../modules/conversation/generation-terminal.js";
import { GenerationIdentityAuthority } from "../modules/identity/generation-scope.js";
import { GenerationTerminalAuthority } from "../modules/identity/generation-terminal.js";
import { requestAuthority } from "../modules/identity/request-authority.js";
import { GenerationWorker, type GenerationWorkerPass } from "./generation.js";

type BoundOwners =
  | "identity"
  | "terminal"
  | "workerPool"
  | "hostPool"
  | "service"
  | "database"
  | "access"
  | "allowance"
  | "journal"
  | "pipeline"
  | "inputs"
  | "origins"
  | "context"
  | "audience"
  | "accounting"
  | "signal";

/** These are independently reviewed host inputs, never task/request JSON or
 * expected hashes learned from the database being qualified. Each original
 * owner checks its registered source, executable and current catalogue. */
export type GenerationWorkerCustody = Readonly<{
  identity: Omit<
    Parameters<typeof GenerationIdentityAuthority.create>[0],
    "pool"
  >;
  terminal: Omit<
    Parameters<typeof GenerationTerminalAuthority.create>[0],
    "pool" | "generation" | "assertSettledInTransaction"
  >;
  inputs: Omit<
    Parameters<typeof PreparedGenerationAgentInputs.prepare>[0],
    BoundOwners
  >;
  origins: Omit<
    Parameters<typeof PreparedContentGenerationOrigins.prepare>[0],
    BoundOwners
  >;
  context: Omit<
    Parameters<typeof PreparedGenerationConversationContext.prepare>[0],
    BoundOwners
  >;
  audience: Omit<
    Parameters<typeof CommerceGenerationAudience.prepare>[0],
    BoundOwners
  >;
  metadata: Omit<
    Parameters<typeof PreparedGenerationAgentMetadata.prepare>[0],
    BoundOwners
  >;
  accounting: Omit<
    Parameters<typeof PreparedGenerationProviderAccounting.prepare>[0],
    BoundOwners
  >;
  retrieval: Omit<
    Parameters<typeof PreparedGenerationRuntimeContext.prepare>[0],
    BoundOwners
  >;
  guardrail: Omit<
    Parameters<typeof PreparedGenerationGuardrail.prepare>[0],
    BoundOwners
  >;
  output: Omit<
    Parameters<typeof PreparedGenerationConversationOutput.prepare>[0],
    BoundOwners
  >;
  terminalJournal: Omit<
    Parameters<typeof PreparedGenerationTerminalJournal.prepare>[0],
    BoundOwners
  >;
  finalization: Omit<
    Parameters<typeof PreparedGenerationConversationTerminal.prepare>[0],
    BoundOwners
  >;
  settlement: Omit<
    Parameters<typeof CommerceGenerationSafetyTerminalSettlement.prepare>[0],
    BoundOwners
  >;
}>;

/** Compose the existing owners once, retaining exact instance identity all the
 * way from inputs to the sole terminal transaction. Pools remain host-owned;
 * failure creates no worker lifetime and never closes another owner's pool. */
export async function prepareGenerationWorker(input: {
  workerPool: Pool;
  database: Database;
  access: AccessService;
  service: AgentService;
  journal: PreparedGenerationJournal;
  allowance: CommerceGenerationAllowance;
  custody: GenerationWorkerCustody;
  signal?: AbortSignal;
}): Promise<GenerationWorker> {
  invariant(
    !requestAuthority.getStore(),
    "generation_worker_required",
    "Prepare the generation host outside interactive request authority.",
  );
  const hostPool = input.database.pool;
  invariant(
    input.service.repository.pool === hostPool &&
      input.access.isForPool(hostPool),
    "generation_worker_host_mismatch",
    "Use the original canonical database, access and Agent owners.",
  );
  input.journal.assertPool(hostPool);
  input.allowance.assertComposition(hostPool, input.access);
  input.signal?.throwIfAborted();
  const identity = await GenerationIdentityAuthority.create({
    ...input.custody.identity,
    pool: input.workerPool,
  });
  const shared = {
    identity,
    workerPool: input.workerPool,
    hostPool,
    service: input.service,
    signal: input.signal,
  };
  input.signal?.throwIfAborted();
  const origins = await PreparedContentGenerationOrigins.prepare({
    ...input.custody.origins,
    ...shared,
    signal: input.signal,
  });
  input.signal?.throwIfAborted();
  const inputs = await PreparedGenerationAgentInputs.prepare({
    ...input.custody.inputs,
    ...shared,
    origins,
  });
  input.signal?.throwIfAborted();
  const context = await PreparedGenerationConversationContext.prepare({
    ...input.custody.context,
    ...shared,
  });
  input.signal?.throwIfAborted();
  const audience = await CommerceGenerationAudience.prepare({
    ...input.custody.audience,
    ...shared,
    database: input.database,
  });
  input.signal?.throwIfAborted();
  const metadata = await PreparedGenerationAgentMetadata.prepare({
    ...input.custody.metadata,
    ...shared,
    inputs,
    audience,
  });
  input.signal?.throwIfAborted();
  const accounting = await PreparedGenerationProviderAccounting.prepare({
    ...input.custody.accounting,
    ...shared,
    inputs,
    context,
    journal: input.journal,
  });
  input.signal?.throwIfAborted();
  const retrieval = await PreparedGenerationRuntimeContext.prepare({
    ...input.custody.retrieval,
    ...shared,
    inputs,
    context,
    accounting,
  });
  input.signal?.throwIfAborted();
  const guardrail = await PreparedGenerationGuardrail.prepare({
    ...input.custody.guardrail,
    ...shared,
    inputs,
    context,
  });
  input.signal?.throwIfAborted();
  const pipeline = PreparedGenerationPipeline.prepare({
    ...shared,
    inputs,
    context,
    audience,
    metadata,
    accounting,
    retrieval,
    guardrail,
  });
  input.signal?.throwIfAborted();
  const output = await PreparedGenerationConversationOutput.prepare({
    ...input.custody.output,
    ...shared,
    pipeline,
  });
  input.signal?.throwIfAborted();

  // W1's sole COMMIT calls the actual W4 owner prepared below. Until that
  // owner exists, this closure refuses every attempt to finalize a scope.
  const prepared: {
    settlement?: CommerceGenerationSafetyTerminalSettlement;
  } = {};
  const terminal = await GenerationTerminalAuthority.create({
    ...input.custody.terminal,
    pool: input.workerPool,
    generation: identity,
    assertSettledInTransaction: async (client, scope) => {
      invariant(
        prepared.settlement,
        "generation_settlement_unconfigured",
        "Original financial settlement is unavailable.",
      );
      await prepared.settlement.assertSettledInTransaction(client, scope);
    },
  });
  input.signal?.throwIfAborted();
  const terminalJournal = await PreparedGenerationTerminalJournal.prepare({
    ...input.custody.terminalJournal,
    ...shared,
    terminal,
    journal: input.journal,
  });
  input.signal?.throwIfAborted();
  const finalization = await PreparedGenerationConversationTerminal.prepare({
    ...input.custody.finalization,
    ...shared,
    terminal,
  });
  input.signal?.throwIfAborted();
  const settlement = await CommerceGenerationSafetyTerminalSettlement.prepare({
    ...input.custody.settlement,
    ...shared,
    terminal,
    access: input.access,
    allowance: input.allowance,
    journal: terminalJournal,
  });
  prepared.settlement = settlement;
  return GenerationWorker.prepare({
    ...shared,
    pipeline,
    output,
    terminal,
    finalization,
    settlement,
    signal: input.signal,
  });
}

/** Host startup seam. The caller retains pool ownership and observes `done`;
 * shutdown awaits this lifetime before either original pool may be closed. */
export async function startGenerationWorker(
  input: Parameters<typeof prepareGenerationWorker>[0],
  onPass?: (result: GenerationWorkerPass) => void,
) {
  const controller = new AbortController();
  const signal = input.signal
    ? AbortSignal.any([input.signal, controller.signal])
    : controller.signal;
  const worker = await prepareGenerationWorker({ ...input, signal });
  const done = worker.run(signal, onPass);
  // A caller may inspect startup state before awaiting done. Keep the original
  // rejection available through done/close without an unhandled rejection gap.
  void done.catch(() => {});
  return Object.freeze({
    done,
    close(): Promise<void> {
      controller.abort();
      return done;
    },
  });
}
