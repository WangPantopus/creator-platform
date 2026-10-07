# Invitation availability refusal

Actual Launch Kit operation found a raw database failure: a verified local creator without a published Growth projection could attempt invitation creation; its insert violated the creator_public foreign key and became generic503. No invitation was created.

Before changing code, compared createInvite at all21 open heads (the original20 drafts and focused #319). Every method was byte-identical, including #31. This is an independent correction, not a duplicate implementation.

The existing insert now selects only a published, verified creator projection—the same eligibility predicate used by public invitation reads. Zero eligible rows produce existing creator_unavailable404 and “This creator is unavailable.” Existing canonical session, creator ownership, erasure fence, invitation limit and RLS remain in force. No schema/grants, copy, design, provider or publication setup changes.

Personally signed in through the genuine development issuer and clicked Create and copy twice against the same isolated database. Both actual requests returned404 (51.77ms and50.13ms), showed the intended refusal and recovered the button. Zero invitation/projection rows remained; the empty clipboard stayed empty. The temporary local verification fixture was restored pending/version9 and the actual creator signed out. Positive invitation delivery still needs a genuine published projection; none was fabricated for acceptance.

Backend typecheck/build, scoped lint/format passed. No automated test code was added or manually run. [Exact-head overlap and actual receipts](../../artifacts/pr-review/2026-10-06/growth-invitation-availability/manifest.json) retain the evidence. The preceding generic503/FK observation is recorded in the [Studio session operation](growth-studio-session-2026-10-06.md).
