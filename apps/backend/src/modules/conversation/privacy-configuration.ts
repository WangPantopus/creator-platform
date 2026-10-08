import review from "../../../../../infra/migrations/reviews/20261007-conversation-privacy.json" with { type: "json" };
import { invariant } from "../../core/errors.js";
import { registeredContentPrivacyProfile } from "../../db/content-privacy-profile.js";
import { registeredMigration } from "../../db/reviewed-migration.js";
import { registeredPublicAIProfile } from "../../db/public-ai-profile.js";
import type { ConversationPrivacyOwnerPorts } from "../trust/privacy-consumers.js";

type Review = Readonly<{
  cursor: NonNullable<
    ConversationPrivacyOwnerPorts["cursorPreparation"]
  >["custody"];
  provenancePurge: NonNullable<
    ConversationPrivacyOwnerPorts["provenancePurgePreparation"]
  >;
}>;

const sources = Object.freeze([
  Object.freeze({ ...review.cursor.source }),
  Object.freeze({ ...review.provenancePurge.source }),
]);
const profiles = Object.freeze(
  Object.fromEntries(
    (["generation", "content"] as const).map((profile) => [
      profile,
      Object.freeze({
        cursor: Object.freeze({
          migration: Object.freeze({
            version: review.cursor.source.version,
            checksum: review.cursor.source.checksum,
          }),
          definitions: Object.freeze({ ...review.cursor.definitions }),
          catalogueChecksum: review.cursor.catalogues[profile],
        }),
        provenancePurge: Object.freeze({
          custody: Object.freeze({
            definitionSha256: review.provenancePurge.definitionSha256,
            catalogueChecksum: review.provenancePurge.catalogues[profile],
            incomingApiCatalogueChecksum:
              review.provenancePurge.incomingApiCatalogues[profile],
          }),
        }),
      } satisfies Review),
    ]),
  ),
);

/** Fixed metadata selected only by reviewed executable source. These values
 * grant no task authority: W8 supplies the original authority and every owner
 * checks its actual held database, permissions and lifetime independently. */
export async function registeredConversationPrivacyReview(
  signal?: AbortSignal,
): Promise<Review | undefined> {
  signal?.throwIfAborted();
  const active = await Promise.all(sources.map(registeredMigration));
  signal?.throwIfAborted();
  if (active.every((migration) => !migration)) return undefined;
  invariant(
    active.every(
      (migration, index) =>
        migration?.version === sources[index]!.version &&
        migration.checksum === sources[index]!.checksum,
    ),
    "conversation_privacy_unconfigured",
    "Both exact reviewed Conversation privacy sources are required.",
  );
  const publicAI = await registeredPublicAIProfile(signal);
  if (publicAI) {
    const base = profiles.content!;
    return Object.freeze({
      cursor: Object.freeze({
        ...base.cursor,
        catalogueChecksum: publicAI.conversationCursorCatalogueChecksum,
      }),
      provenancePurge: Object.freeze({
        custody: Object.freeze({
          ...base.provenancePurge.custody,
          catalogueChecksum: publicAI.provenancePurgeCatalogueChecksum,
          incomingApiCatalogueChecksum:
            publicAI.provenancePurgeIncomingCatalogueChecksum,
        }),
      }),
    });
  }
  return profiles[
    (await registeredContentPrivacyProfile(signal)) ? "content" : "generation"
  ];
}
