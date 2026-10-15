# Lane 1 · WP 1.6 · The ops console and the Note-reply queue

Written 2026-10-15 by lane 1, from runs on lane 1's stack with the development identity's reviewers
(supervisor, support reviewer, verification reviewer) and system Chrome.

## 1. What already works (E1.6)

The console (`apps/web/app/ops`) and the trust API (`modules/trust`) from earlier work already do
most of what the pilot needs:

- **Roles:** queues are limited by role. A fan, a creator, or a reviewer from another queue is
  refused with `ops_role_required`.
- **Lists:** they show case numbers and categories, never the report's words.
- **Opening a case:** a case is unreadable until a reviewer opens it with a written reason. Access
  lasts at most 15 minutes. Both the opening and every evidence read are logged with the reason and
  the reviewer. The fan sees that their report was opened (`/v1/trust/access-history`).
- **Decisions:** a confirmation shows the reason before anything is recorded. Decisions are
  attributed. When two reviewers decide at once, one wins and the other gets `409 stale_case`. A
  repeated decision with the same key returns the same result.
- **Category rules:** a crisis report is urgent whatever the fan has paid for (INV-19). A refund
  needs a request record. Verification, pause, license and suspension decisions need a supervisor.
  Both parties get the reason in their trust inbox.
- **Limits:** reports are limited to 20 an hour per reporter (crisis is exempt), and a fan can only
  report a creator they have a conversation with.

## 2. What this pull request changes

- **A reviewer can no longer open or decide a case about their own account**
  (`modules/trust/service.ts`, `independentReviewer`). That covers a case they filed, a creator's
  own verification, and any report about their creator profile. The answer is
  `403 independent_reviewer_required`. Before, the support reviewer, who is also the creator Devon,
  could open and close his own case.
- **A stuck effect now shows why** (`modules/trust/worker.ts`). The trust worker recorded every
  failed effect as `effect_hook_error`, so a pause that never completes could not be diagnosed. It
  now keeps the domain's own error code. Codes are identifiers and carry no personal data.

## 3. Gaps found, and what each needs

| #   | Gap                                                                                                                                                                                                                                                                                                                           | Evidence                                                                       | Owner           | Needs                                                |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | --------------- | ---------------------------------------------------- |
| G1  | **A pause never completes.** `pause_creator` closes the creator's conversations at once (a trust restriction) and pauses the AI, but the case waits forever: the effect must settle the creator's open paid requests, and nothing implements that (`commerce_lifecycle_unconfigured`, `modules/trust/development.ts:382-389`) | E1.6 run: `action_pending: agent.pause=retry: commerce_lifecycle_unconfigured` | lane 4, founder | Decision P1 below, then lane 4 builds the settlement |
| G2  | **There is no unpause.** No decision or endpoint lifts the restriction or resumes the AI. Even the creator cannot republish over a paused version on a development host (`shadow_feed_unconfigured`)                                                                                                                          | Run, and the resolution list in `modules/trust/contracts.ts`                   | lanes 1 and 3   | Decision P2 below                                    |
| G3  | Each reviewer sees only their own access log; no supervisor can see every reviewer's accesses                                                                                                                                                                                                                                 | `opsAudits` filters on the caller                                              | lane 1          | Proposal O1 below (new wording)                      |
| G4  | Ops reviewers exist only as seeded rows; nothing adds or removes one, and with option D they will be Qelvora account ids                                                                                                                                                                                                      | `creator_trust.ops_member`                                                     | lane 1          | Proposal O2 below                                    |
| G5  | **Every Note reply waits for a human.** The reviewer opens a case and answers `pending` until an ops reviewer allows or flags it (`creator_trust.review_note_reply`, migration 0069). 200 replies are 200 manual cases                                                                                                        | E1.7 brief; code                                                               | lane 1, founder | Decision R1 below                                    |
| G6  | A creator's trust action can fail with a 2-second lock timeout while their AI is generating a reply (the generation transaction holds the creator's row)                                                                                                                                                                      | A verification report: `503 service_unavailable`, `database_lock_timeout`      | lane 3          | Ticket                                               |

## 4. Decisions for the founder

| #   | Question                                                             | Proposed default                                                                                                                                                                                                                                                                                                                                         |
| --- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1  | When ops pauses a creator, what happens to their open paid requests? | Requests not yet accepted: release the hold, nothing charged. Accepted but not delivered: keep the deadline, and refund automatically if it passes (the existing rule). Lane 4 builds it. This is money semantics, so it is yours                                                                                                                        |
| P2  | Who can lift a pause, and does the AI come back by itself?           | A supervisor lifts it from the pause case, with a reason sent to the creator. The restriction ends and the AI returns to the version that was live. If its license or proof lapsed meanwhile, the creator must republish. Lane 1 builds the decision; lane 3 adds "resume" to the agent                                                                  |
| R1  | When is a Note reply "clean" enough to deliver without a person?     | A local check with no new processor: no crisis or self-harm language (those go to a case at once, INV-19), no threat, slur or harassment terms from a reviewed list, and no links or contact details. Anything else waits for ops. Using the model provider on replies would need the consent text to cover it, so not for the pilot. Counsel to confirm |
| O1  | Supervisor-wide access log                                           | Supervisors see every reviewer's accesses in their queues, with who made each one. Proposed wording: "Every reviewer's latest 100 case access and action records."                                                                                                                                                                                       |
| O2  | Adding and removing ops reviewers                                    | For the pilot, a runbook command the founder runs (account id, queues, supervisor or not, expiry). A screen later                                                                                                                                                                                                                                        |

## 5. Runs

- `tests/scenarios/lane-1/e1-6-ops.mjs` (API), on a fresh stack: 24 pass. With `--with-pause`,
  the pause case does not resolve (G1, a failure) and unpause is not run (G2). The pause leaves
  the creator paused, so reset the stack afterwards.
- `tests/scenarios/lane-1/e1-6-console.mjs` (the console in Chrome): 8 of 8.
