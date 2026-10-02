import type { Pool } from "pg";
import type { Database } from "../../db/database.js";
import type {
  AccessService,
  ScopeRestrictionInTransaction,
} from "../access/scope.js";
import type { ConversationService } from "../conversation/service.js";
import { DomainError } from "../../core/errors.js";
import { createContentStudio } from "../content/integration.js";
import type { ContentDependencies } from "../content/service.js";
import type { StudioService } from "../studio/service.js";
import { createCommercePublicationPermission } from "./publication.js";
import { createCommerceApprovals } from "./approval-registration.js";

/** Explicit W1/W8 composition after canonical schema custody. Default hosts
 * remain unavailable; schema presence cannot substitute for current authority.
 */
export async function createCommerceStudio(input: {
  pool: Pool;
  owners: ConstructorParameters<typeof StudioService>[1];
  dependencies: ContentDependencies &
    Required<Pick<ContentDependencies, "assertAllowed">>;
  assertScopeAllowedInTransaction: ScopeRestrictionInTransaction;
  approvals?: {
    database: Database;
    access: AccessService;
    conversation: ConversationService;
    migration: { version: string; checksum: string };
  };
}) {
  const tables = [
    "content_index",
    "content_revision",
    "content_reply",
    "content_reply_review",
    "content_reply_read",
    "content_consent_history",
    "content_fan_effect",
    "content_tombstone",
    "studio_reply_draft",
  ];
  if (input.approvals) tables.push("commerce_reply_draft", "commerce_approval");
  const installed = await input.pool.query<{ ready: boolean }>(
    "SELECT bool_and(to_regclass('creator.' || name) IS NOT NULL) AS ready FROM unnest($1::text[]) AS name",
    [tables],
  );
  const columns = await input.pool.query<{ ready: boolean }>(
    `SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='creator' AND table_name='studio_reply_draft' AND column_name='thread_id')
     AND ($1::boolean=false OR (EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='creator' AND table_name='creator_profile' AND column_name='commerce_approval_epoch')
     AND EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='creator' AND table_name='passkey_credential' AND column_name='commerce_approval_epoch'))) AS ready`,
    [Boolean(input.approvals)],
  );
  if (!installed.rows[0]?.ready || !columns.rows[0]?.ready)
    throw new DomainError(
      "studio_schema_unconfigured",
      "Studio requires its complete registered schema before it can be enabled.",
      503,
    );
  if (
    input.approvals &&
    (input.approvals.database.pool !== input.pool ||
      input.approvals.access !== input.owners.access ||
      input.approvals.conversation !== input.owners.conversation)
  )
    throw new Error(
      "Studio and Approval must use the same canonical conversation and access services.",
    );
  const content = createContentStudio({
    pool: input.pool,
    owners: input.owners,
    dependencies: {
      ...input.dependencies,
      publicPacket: createCommercePublicationPermission(
        input.assertScopeAllowedInTransaction,
      ),
    },
  });
  const approval = input.approvals
    ? await createCommerceApprovals(input.approvals)
    : undefined;
  return {
    ...content,
    approvals: approval?.approvals,
    features: [...content.features, ...(approval ? [approval.feature] : [])],
    signedSubjects: [
      content.signedSubjects,
      ...(approval ? [approval.signedSubjects] : []),
    ],
  };
}
