import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Router } from "express";
import { z } from "zod";
import type { FeatureRegistration } from "../../app.js";
import type { Database } from "../../db/database.js";
import type { AccessService } from "../access/scope.js";
import type { ConversationService } from "../conversation/service.js";
import { DomainError, invariant } from "../../core/errors.js";
import {
  CommerceApprovals,
  commerceApprovalSignedSubjects,
} from "./approvals.js";

/** W1/W8 install this only after allocating/applying the additive Approval
 * schema. The same producer powers C02 review, C06 persistence and W3 delivery.
 */
export const COMMERCE_APPROVAL_MIGRATION = "0044_w4_personal_approval";
const approvalSource = {
  owner: "W4",
  path: "apps/backend/src/modules/commerce/schema-approval.sql",
  checksum: "4480936ea99adbc954f1e3444673772922c49e6dab8b9cce9351cf6d61c493fb",
} as const;
declare const __QELVORA_REGISTERED_MIGRATION_SOURCES__:
  | Readonly<Record<string, { owner: string; path: string; checksum: string }>>
  | undefined;

/** Hosts consume executable source custody before supplying the real graph.
 * A table or database ledger entry alone never enables personal Approval.
 * Shipping bundles retain these pins without needing a deployed source tree.
 */
export async function registeredCommerceApprovalMigration() {
  let source: { owner: string; path: string; checksum: string } | undefined;
  if (typeof __QELVORA_REGISTERED_MIGRATION_SOURCES__ !== "undefined") {
    source = Object.hasOwn(
      __QELVORA_REGISTERED_MIGRATION_SOURCES__,
      COMMERCE_APPROVAL_MIGRATION,
    )
      ? __QELVORA_REGISTERED_MIGRATION_SOURCES__[COMMERCE_APPROVAL_MIGRATION]
      : undefined;
  } else {
    const root = new URL("../../../../../", import.meta.url);
    const registry = z
      .object({
        migrations: z.array(
          z.object({
            version: z.string(),
            owner: z.string(),
            path: z.string(),
          }),
        ),
      })
      .parse(
        JSON.parse(
          await readFile(new URL("infra/migrations.json", root), "utf8"),
        ),
      );
    const entries = registry.migrations.filter(
      (entry) => entry.version === COMMERCE_APPROVAL_MIGRATION,
    );
    invariant(
      entries.length <= 1,
      "approval_unconfigured",
      "Personal Approval requires one exact executable migration.",
    );
    const entry = entries[0];
    if (entry) {
      invariant(
        entry.owner === approvalSource.owner &&
          entry.path === approvalSource.path,
        "approval_unconfigured",
        "Personal Approval requires its original registered source.",
      );
      source = {
        owner: entry.owner,
        path: entry.path,
        checksum: createHash("sha256")
          .update(await readFile(new URL(entry.path, root)))
          .digest("hex"),
      };
    }
  }
  if (!source) return undefined;
  invariant(
    source.owner === approvalSource.owner &&
      source.path === approvalSource.path &&
      source.checksum === approvalSource.checksum,
    "approval_unconfigured",
    "Personal Approval requires its original executable source custody.",
  );
  return Object.freeze({
    version: COMMERCE_APPROVAL_MIGRATION,
    checksum: source.checksum,
  });
}

export async function createCommerceApprovals(input: {
  database: Database;
  access: AccessService;
  conversation: ConversationService;
  migration: { version: string; checksum: string };
}) {
  const registered = await registeredCommerceApprovalMigration();
  invariant(
    registered &&
      input.migration.version === registered.version &&
      input.migration.checksum === registered.checksum,
    "approval_unconfigured",
    "Personal Approval requires its exact activated migration.",
  );
  invariant(
    input.access.isForPool(input.database.pool) &&
      input.conversation.isFor(input.database, input.access) &&
      input.access.threadScopeInTransactionAvailable &&
      input.database.threadScopeInTransactionAvailable,
    "approval_authority_unconfigured",
    "Personal Approval requires one conversation graph with held current authority.",
  );
  await input.database.assertRuntimeRole();
  const ready = (
    await input.database.pool.query<{ ready: boolean }>(
      `SELECT EXISTS(SELECT 1 FROM creator.schema_migration WHERE version=$1 AND checksum=$2)
       AND (SELECT count(*)=2 FROM pg_class t JOIN pg_namespace n ON n.oid=t.relnamespace
        WHERE n.nspname='creator' AND t.relname IN('commerce_reply_draft','commerce_approval')
        AND t.relkind='r' AND t.relrowsecurity AND t.relforcerowsecurity
        AND pg_get_userbyid(t.relowner)='creator_owner'
        AND has_table_privilege(current_user,t.oid,'SELECT')
        AND has_table_privilege(current_user,t.oid,'INSERT')
        AND has_table_privilege(current_user,t.oid,'UPDATE'))
       AND (SELECT count(*)=5 FROM pg_attribute a JOIN pg_class t ON t.oid=a.attrelid
        JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname='creator' AND NOT a.attisdropped
        AND ((t.relname IN('creator_profile','passkey_credential')
          AND a.attname IN('commerce_approval_epoch','commerce_approval_changed_at'))
         OR (t.relname='message' AND a.attname='approval_id')))
       AND (SELECT count(*)=6 FROM pg_trigger trigger JOIN pg_class t ON t.oid=trigger.tgrelid
        JOIN pg_namespace n ON n.oid=t.relnamespace JOIN pg_proc f ON f.oid=trigger.tgfoid
        JOIN (VALUES ('commerce_reply_draft','validate_draft_source'),
          ('commerce_approval','validate_personal_approval'),
          ('commerce_reply_draft','invalidate_draft_approval'),
          ('commerce_approval','freeze_approval_snapshot'),
          ('creator_profile','invalidate_creator_approvals'),
          ('passkey_credential','invalidate_key_approvals')) expected(relation,name)
         ON t.relname=expected.relation AND trigger.tgname=expected.name
        WHERE n.nspname='creator' AND NOT trigger.tgisinternal AND trigger.tgenabled='O'
         AND pg_get_userbyid(f.proowner)='creator_owner') AS ready`,
      [input.migration.version, input.migration.checksum],
    )
  ).rows[0]?.ready;
  invariant(
    ready === true,
    "approval_unconfigured",
    "The current Personal Approval schema is not installed.",
  );
  const approvals = new CommerceApprovals(input.database);
  input.conversation.configureApprovals(approvals);
  const feature: FeatureRegistration = {
    name: "commerce_approvals",
    path: "/v1/commerce-approvals",
    router: ({ actorFor }) => {
      const router = Router();
      const id = (value: unknown) => z.uuid().parse(value);
      const root = "/creators/:creatorId/fans/:fanId/drafts";
      router.use(async (req, _res, next) => {
        const actor = await actorFor(req);
        const expected = req.header("x-commerce-account-id");
        if (expected !== undefined && id(expected) !== actor.accountId)
          throw new DomainError(
            "session_changed",
            "Your account changed. Continue with Pantopus before using this form.",
            409,
          );
        next();
      });
      const scope = async (req: import("express").Request) =>
        input.access.openThread(
          await actorFor(req),
          id(req.params.creatorId),
          id(req.params.fanId),
        );
      router.post(root, async (req, res) =>
        res.json(await approvals.create(await scope(req), req.body)),
      );
      router.get(`${root}/sources`, async (req, res) =>
        res.json(await approvals.sources(await scope(req), req.query)),
      );
      router.get(`${root}/:draftId`, async (req, res) =>
        res.json(
          await approvals.read(await scope(req), id(req.params.draftId)),
        ),
      );
      router.post(`${root}/:draftId/edit`, async (req, res) =>
        res.json(
          await approvals.edit(
            await scope(req),
            id(req.params.draftId),
            req.body,
          ),
        ),
      );
      router.post(`${root}/:draftId/approve`, async (req, res) =>
        res.json(
          await approvals.approve(
            await scope(req),
            id(req.params.draftId),
            req.body,
          ),
        ),
      );
      router.post(
        "/creators/:creatorId/fans/:fanId/deliver",
        async (req, res) =>
          res.json(
            await input.conversation.approvedDraft(await scope(req), req.body),
          ),
      );
      return router;
    },
  };
  const signedSubjects: typeof commerceApprovalSignedSubjects = {
    name: commerceApprovalSignedSubjects.name,
    async prepare(client, actor, creatorId, requested) {
      if (requested.actType !== "approved_draft") return null;
      invariant(
        requested.content &&
          typeof requested.content === "object" &&
          !Array.isArray(requested.content),
        "draft_required",
        "Choose the exact saved draft before signing.",
      );
      const approval = requested.content.approval;
      invariant(
        approval &&
          typeof approval === "object" &&
          !Array.isArray(approval) &&
          typeof approval.draftId === "string",
        "draft_required",
        "Choose the exact saved draft before signing.",
      );
      const pointer = (
        await client.query<{ fan_id: string }>(
          `SELECT d.fan_id FROM creator.commerce_reply_draft d
           JOIN creator.creator_profile owner ON owner.id=d.creator_id
           WHERE d.id=$1 AND d.thread_id=$2 AND d.creator_id=$3 AND owner.account_id=$4`,
          [
            z.uuid().parse(approval.draftId),
            requested.subjectId,
            creatorId,
            actor.accountId,
          ],
        )
      ).rows[0];
      invariant(pointer, "draft_unavailable", "This draft is unavailable.");
      const current = await input.access.openThreadInTransaction(
        client,
        actor,
        creatorId,
        pointer.fan_id,
        false,
        "read",
      );
      invariant(
        current.authority === "creator" &&
          current.threadId === requested.subjectId,
        "creator_required",
        "Only the creator can personally approve this draft.",
      );
      return commerceApprovalSignedSubjects.prepare(
        client,
        actor,
        creatorId,
        requested,
      );
    },
  };
  return { approvals, feature, signedSubjects };
}
