import { z } from "zod";
import type { SignedActCommand } from "../schemas.ts";
import { IdempotencyKey } from "./contracts.ts";

export const CreateReplyDraft = z.strictObject({
  sourceMessageId: z.uuid(),
  sourceMessageVersion: z.number().int().positive(),
  idempotencyKey: IdempotencyKey,
});
export const EditReplyDraft = z.strictObject({
  version: z.number().int().positive(),
  text: z.string().trim().min(1).max(8000),
  idempotencyKey: IdempotencyKey,
});
export const ApproveReplyDraft = z.strictObject({
  version: z.number().int().positive(),
  signedActId: z.uuid(),
  idempotencyKey: IdempotencyKey,
});
export const DeliverApprovedDraft = z.strictObject({
  approvalId: z.uuid(),
  idempotencyKey: IdempotencyKey,
});
export type ReplyDraft = Readonly<{
  id: string;
  threadId: string;
  sourceMessageId: string;
  sourceMessageVersion: number;
  text: string;
  version: number;
  approval: null | {
    id: string;
    approvedAt: string;
    invalidatedAt: string | null;
    deliveredMessageId: string | null;
  };
}>;

/** The creator reviews the exact version, including its provenance, before UV. */
export function replyDraftApprovalCommand(draft: ReplyDraft): SignedActCommand {
  return {
    actType: "approved_draft",
    subjectId: draft.threadId,
    content: {
      text: draft.text,
      approval: {
        draftId: draft.id,
        draftVersion: draft.version,
        sourceMessageId: draft.sourceMessageId,
        sourceMessageVersion: draft.sourceMessageVersion,
      },
    },
  };
}
