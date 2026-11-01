import review from "../../../../infra/migrations/reviews/20261022-workspace-lock.json" with { type: "json" };
import { registeredMigration } from "./reviewed-migration.js";

type Receipt = Readonly<{
  migration: Readonly<{ version: string; checksum: string }>;
  signature: string;
  owner: string;
  definitionChecksum: string;
}>;

export const workspaceLockSource = Object.freeze({ ...review.sources[0]! });
export const workspaceLockTerminalReceipt =
  "creator.generation_agent_journal_receipt(uuid,uuid)";

/** This wave replaces only four named definitions, with the same owners.
 * Its mixed input/terminal source never makes every function a terminal one.
 */
export function reviewedWorkspaceLockReceipt(receipt: Receipt): boolean {
  const definition = (
    review.generationDefinitions as Readonly<
      Record<
        string,
        Readonly<{ source: string; owner: string; definitionChecksum: string }>
      >
    >
  )[receipt.signature];
  return (
    definition !== undefined &&
    definition.source === workspaceLockSource.version &&
    receipt.migration.version === workspaceLockSource.version &&
    receipt.migration.checksum === workspaceLockSource.checksum &&
    receipt.owner === definition.owner &&
    receipt.definitionChecksum === definition.definitionChecksum
  );
}

/** Preparation must prove executable registration, not merely a ledger row.
 * Held-client guards separately check the actual installed definition/ACL.
 */
export async function registeredWorkspaceLockReceipt(
  receipt: Receipt,
): Promise<boolean> {
  if (!reviewedWorkspaceLockReceipt(receipt)) return false;
  const active = await registeredMigration(workspaceLockSource);
  return (
    active?.version === workspaceLockSource.version &&
    active.checksum === workspaceLockSource.checksum
  );
}
