import { Router } from "express";
import { z } from "zod";
import type { FeatureRegistration } from "../../app.js";
import type { Database } from "../../db/database.js";
import type { AccessService } from "../access/scope.js";
import type { ConversationService } from "../conversation/service.js";
import { DomainError } from "../../core/errors.js";
import {
  CommerceApprovals,
  commerceApprovalSignedSubjects,
} from "./approvals.js";

/** W1/W8 install this only after allocating/applying the additive Approval
 * schema. The same producer powers C02 review, C06 persistence and W3 delivery.
 */
export function createCommerceApprovals(input: {
  database: Database;
  access: AccessService;
  conversation: ConversationService;
}) {
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
  return { approvals, feature, signedSubjects: commerceApprovalSignedSubjects };
}
