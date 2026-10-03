# Bounded per-Note fan reply history

Personally implemented product source
`dd0762d901f55dcfa3438ed2c9ff6542506cf66f`, including captured remote main
`3d14ec3e3d72b43c7bc7e1852addf670779f5517` and the earlier W5 increments.

Web/iOS/Android previously fetched the creator-wide first reply page and rebuilt
every earlier page during renewal, while stopping Older at five pages. The
canonical optional contentId filter now selects the current Note under existing
RLS/review/role guards. The creator tenure candidate query and cursor lookup use
the same filter. This grants no authority and creates no migration, scope,
approval or record. Canonical generation changes only the two reply-read
operations and their page schema; the111 operation count remains unchanged.

All three fan consumers refresh one visible page and retain only opaque cursor
history. Actual nextCursor controls Older; Newer returns to the preceding page.
Page changes conceal the old page and retain unsent input. Account/route changes
reset history; current account headers, generation/lifecycle fences and the
five-second lease remain. Web visibility changes independently conceal access.

Web/backend/API typecheck, scoped ESLint, Prettier, diff and canonical generation
checks pass. Swift syntax parsing passes. Personally inspected the actual three
parameterized SELECT shapes with EXPLAIN (without ANALYZE) on owned canonical61
as creator_runtime in one read-only transaction, then rolled back. All three
plans are available; no actor scope was installed and no private rows returned.
The private inspection source is
`/private/tmp/w5-fan-reply-query-inspection.cjs`. This proves query shape only.

Implemented: bounded per-Note source across web/native/canonical API.
Runnable: source checks and SQL planning above; current shipping builds pending.
Integrated: canonical generated query contracts; no held purpose activated.
Verified: only source checks and actual metadata-only query plans. Current-source
personal app operation, populated paging, two-fan isolation, real0156 review and
signed creator reaction remain unverified until genuine records/producers exist.
Release-ready: false for W5; all nine packages remain assigned.
