import record from "../../../../../infra/migrations/reviews/20261007-agent-export.json" with { type: "json" };
import { invariant } from "../../core/errors.js";
import { registeredMigration } from "../../db/reviewed-migration.js";
import { registeredContentPrivacyProfile } from "../../db/content-privacy-profile.js";
import { registeredPublicAIProfile } from "../../db/public-ai-profile.js";
import type { AgentPrivacyExportReview } from "./privacy-export-snapshot.js";

const source = Object.freeze({ ...record.source });
const definitions = Object.freeze({ ...record.definitions });
const migration = Object.freeze({
  version: source.version,
  checksum: source.checksum,
});
const profiles = Object.freeze({
  generation: Object.freeze({
    migration,
    definitions,
    catalogueChecksum: record.catalogues.generation,
  }),
  content: Object.freeze({
    migration,
    definitions,
    catalogueChecksum: record.catalogues.content,
  }),
});

/** Fixed reviewed metadata only, never a task or permission. The original
 * exporter independently checks the actual database and executable source at
 * preparation and on the held client before production and at EOF. */
export async function registeredAgentPrivacyExportReview(
  signal?: AbortSignal,
): Promise<AgentPrivacyExportReview | undefined> {
  signal?.throwIfAborted();
  const active = await registeredMigration(source);
  signal?.throwIfAborted();
  if (!active) return undefined;
  invariant(
    active.version === source.version && active.checksum === source.checksum,
    "privacy_export_unconfigured",
    "The exact reviewed Agent export source is required.",
  );
  const publicAI = await registeredPublicAIProfile(signal);
  if (publicAI)
    return Object.freeze({
      ...profiles.content,
      catalogueChecksum: publicAI.agentExportCatalogueChecksum,
    });
  return (await registeredContentPrivacyProfile(signal))
    ? profiles.content
    : profiles.generation;
}
