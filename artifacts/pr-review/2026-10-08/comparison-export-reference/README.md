# Original comparison export recovery and withdrawal — October 8, 2026

The original fan export c09931ea now completes all eight domains. Agent's held
source uses the stream's original snapshot reference, so comparison capture and
protected file sealing refer to the same source. This reference is metadata;
original task authority, privately branded source, EOF and COMMIT checks remain.
No applied SQL or reviewed catalogue checksum changed.

The next retry exposed a second failure: comparison attempt recovery ran beside
newly claimed export work, taking FOR UPDATE on the same task whose source needs
FOR SHARE NOWAIT. Worker maintenance now runs after every claimed operation has
settled. Claimed leases start immediately; safety effects remain parallel; original
cross-host locks, signals and authority checks still apply. Attempt8's dead-letter
state is preserved in evidence; actual UI retry succeeds on attempt9 without
resetting counters, leases, clocks, jobs or data.

## Actual launched web operation

- [Original seven-domain state](original-job-before.json), [reference/lock refusals](source-refusals.json), [first repair attempt8](fan-comparison-export-after-01.json).
- [Final original job](fan-comparison-export-after-02.json) completes18:54:56.921UTC with compileded709286e. [Actual UI](comparison-export-complete-web.png).
- All four browser-downloaded files match original saved hashes and sizes. The
  main JSON contains eight domains. Conversation contains the actual separate
  consent and selected sample, and the private capture matches its original fan
  family. Agent has an empty creator set, a39-byte complete export, and its correct
  original capture. [Download verification](comparison-export-download-verification-01.json).
- Explicit [web withdrawal](comparison-withdrawn-web.png) removes the consent and
  saved sample at18:57:28.659UTC. The owned worker physically removes the affected
  Conversation binary/manifest by18:57:29.820UTC, approximately1.161s later.
  [Before](comparison-withdrawal-before-01.json), [after](comparison-withdrawal-after-01.json), [verification](comparison-withdrawal-verification-01.json).
- The other eleven retained streams are byte-for-byte unchanged, including all
  eight files from the original creator/fan exports. Downloads already obtained
  remain private fictional development evidence; the notice accurately says they
  cannot be recalled. Unmapped legacy exports retain their original expiry.
- A stale-verification download first returns401. Fresh same-account sign-in
  then returns403 export_artifact_unavailable, with the visible [unavailable
  notice](comparison-revoked-download-web.png). [HTTP evidence](actual-http-receipts.json).
- Original18 generations/69 usage records,36815microdollars,51settled units and
  publication are unchanged before/after. The two comparison calls remain known
  at921microdollars with settled holds, even after sample withdrawal.

## Validation and remaining work

Backend typecheck, scoped lint/format and the final bundle pass. The first build
was invoked from the wrong directory and failed resolving entrypoints; its log
is preserved. Both owned backend restarts stop normally with exit0. Original
errors and complete raw logs remain indexed in [source evidence](source-evidence-index.json).
No new unit tests were added. Native comparison Light journeys belong to the
preceding UI milestone; no native withdrawal or new native build is claimed here.

This qualifies one actual fan comparison export and withdrawal. Creator populated
comparison exports/results, in-flight withdrawal, physical expiry, sensitive and
injected sanitizer cases, restart after withdrawal, native Night/accessibility,
and the legitimate preserved revision13 upgrade remain. The generic unavailable
download copy still does not explain withdrawal specifically. Full privacy/mature
deletion and every other complete product milestone remain open. No production
policy, financial uncertainty, historical clock or original evidence was changed.
