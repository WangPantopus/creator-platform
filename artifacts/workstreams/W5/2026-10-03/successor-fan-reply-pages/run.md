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

## Exact6aea4c8f shipping and personal web operation

Source `6aea4c8f90c95f0f783fec147763722f570d11c2` includes captured main
`a7a6f3707b74ed636198bda08cc76c6a52123a3b`. Web/backend/API typecheck,
scoped ESLint, Prettier and diff checks passed. Current canonical generation
reported114 operations and12 resources; the earlier111 count above belongs to
the original implementation source.

Serial guarded normal shipping builds passed at this exact source: production
web output `.next-w5-fan-replies-current`, Android debug APK SHA256
`d62830e4abb586f8fc1f49e2f914a57f4e9888a5f350f16f4d761c590ffb8fb2`,
and iOS Simulator app with strict deep codesign verification. iOS executable
SHA256 `bc936f6ac7e326e8aa9c6fe9b54973c8f556529487f6440e877c250d866cf910`;
debug dylib SHA256
`de44068fe43bb7e4d7b9e286b3da219c74386380b77d3018aee2439eb4b9e8db`.
Private logs: `/private/tmp/w5-fan-replies-current-{web,android,ios}.log`.
These native artifacts were built, not personally operated.

Personally used supported CUA in the owned in-app browser against this exact
production web output and API41055, canonical61. A fresh browser first met the
ordinary sign-in boundary. Temporarily started owned Next development under the
heavy lease, chose the actual `W5 development fan one` button through the
configured continuation, stopped only its checked owned listener normally,
released the heavy lease, restarted immutable production output and reloaded.
This is synthetic development identity, not production verification.

Personally inspected settled390/1280 Light/Night views: the actual unsigned Note
`170f95f9-2da6-42af-afe0-b7c3d88aba23` remained unavailable; actual API content
read returned403 while current account/policy/reply reads returned200. During a
real40-second STOP of checked owned API PID23406, the five-second access lease
concealed the fan controls and the real connection status appeared. A shell trap
always resumed that same PID. Actual renewal automatically restored the unsigned
refusal after CONT. Attempted Enter on the recovery button found no match because
renewal had already removed it; this attempt proves no manual recovery. Enter on
the actual restored Refresh button operated successfully. Your account then
showed retained `@kilnfire`; a direct actual Studio Team visit refused the account
with “Your current account has no role in this Studio.” No reply, approval,
signature, audience, payment or delivery record was manufactured.

Private personally inspected captures:
`/private/tmp/w5-fan-6aea4c8f-web{390,1280}-{light,night}.jpg`,
`/private/tmp/w5-fan-6aea4c8f-web1280-night-{outage,recovered}.jpg`, and
`/private/tmp/w5-fan-6aea4c8f-wrong-role.jpg`. This operation found22px fan
navigation links, now being repaired with shared44px quiet actions. None of
these observations transfers to that later product source.

Implemented and runnable: bounded per-Note consumers and all three exact-source
shipping builds above. Integrated: current main and canonical contracts;
no held purpose activation. Verified: current personal unsigned refusal,
wrong-role denial, four web views, actual outage concealment/automatic recovery
and retained fan identity. Unverified: populated paging, two-fan private reply
isolation, actual0156 review, genuine signed creator reaction and current native
personal operation. Release-ready: false; the original nine packages continue.
