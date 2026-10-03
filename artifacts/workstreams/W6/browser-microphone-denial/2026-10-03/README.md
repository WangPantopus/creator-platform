# Browser microphone permission refusal — 3 October 2026

W6 personally repaired an observed browser recording failure. The preceding
shipping signature-entry run reported actual Chromium microphone permission
`denied`, while `getUserMedia` remained pending with Cancel permission request.
The recorder now reads the browser's real permission status before capture and
uses the existing permission-denied recovery notice. Absent, unsupported,
synchronously throwing or rejected permission queries retain the original
capture/prompt path. The original cancellation generation is checked after the
query and after capture; a late stream is still stopped.

## Source and build

- Fresh owned branch `codex/w6-browser-microphone-denial-20261003` starts from
  fetched main `132bc0550a077b9ffe4dad6d2a8d7bc3e0e25e80`, including merged W2
  PR286 and W4 PR210. No held source branch was imported.
- Source `3a928dfa0876e802641318ea04cd8e89eb621f2f` adds known-denial handling;
  `5922c4c7f0a02e3fc20808314cadb792f743203d` retains the original prompt when the
  browser does not support that query. Only `apps/web/features/media/recorder.ts`
  changes executable code. Brand remains configured in `config/brand.json`.
- Scoped web types, ESLint, formatting, diff and canonical generation
  (12 resources/115 operations) pass. Normal guarded production web build at
  exact `5922c4c7` passes. Private build log SHA256:
  `65cd2322191764034e2ae10d797be84c01b49890ce0de104e20c17a465aeec28`.
- Actual API uses the unchanged backend bundle SHA256
  `e53d70b8a38dd53ca480887bd725d0201319944a920a3727bc4a3d3b5d3a6828`, original
  development configuration and canonical61 application clone. No SQL,
  authority, signing, generated-client or worker capability change.

## Personally operated application

Fresh owned Playwright Chromium operated the normal production Next app through
private development HTTPS3006→3106 against actual API4106. The genuine W1
development issuer completed creator account
`10000000-0000-4000-8000-000000000001`; the actual capabilities request carried
its expected-account header. Recording entry used saved Note
`c0ea866e-8e7d-4ea5-be51-8e22724764f9` and its actual creator. There was no
draft save or media mutation in this increment.

CDP changed the isolated browser's real microphone permission to `denied`;
`navigator.permissions.query` confirmed that state. Record displayed the
canonical “Microphone access is off” notice, retained 0:00/Record and produced
no audio preview, upload control or pending permission-cancel button. Repeated
Record and a Light reload repeated the refusal. W6 personally viewed both
Light and Night390×844 screenshots. One automation click/wait observation was
524ms; this is not a latency distribution or budget acceptance.

Changing real permission back to `prompt` restored Cancel permission request.
That first pending request later ended with actual “microphone unavailable”;
a delayed automation Cancel consequently timed out and is not counted as
cancellation success. A fresh immediate Record/Cancel operation then passed:
0:00/Record, no audio element or upload button. Reapplying actual `denied`
permission repeated the correct notice. No page errors were observed. Original
issuer logout returned200 before the owned browser/context/server closed.

No browser media device, recorder output, human voice, passkey, signed media,
publication or fan playback was substituted. Actual human capture remains
absent. The unsupported-query fallback is source-qualified but was not operated
in a browser without microphone Permission API support; installed WebKit's
executable is absent. No Safari, physical microphone/audio, full accessibility
or successful signing/processing/publication acceptance is claimed.

## Actual state and resource closure

Read-only selected state at `2026-10-03T11:32:24.168Z` shows canonical61,
messages/thread-media/publications/offers/calls/admissions0. The saved Note
remains draft/version5; three earlier `post_photo` rows remain deleted/version2.
The existing seed Thread's `human_active`/epoch0 is not genuine W3 handback
evidence. The preserved upgraded target retains connection-limit0 and
`creator-platform:restored-traffic-closed`. This selected inspection is not a
whole-database comparison or privacy acceptance.

Owned runtime lease nonce `8410894d-a51a-47f0-ac68-7eadb4aef910`, dev16777232,
inode244159220 bound the exact worktree, ports and preserved container
`e1d9f59f5ceaad36ee1b821a2860e23a92dd1928d70dfddd36027b5b2a33a5a7`.
Closure rechecked owner bytes/device/inode, launcher command/PID/nonce, sole
listeners and Next child process group. API95217, Next wrapper95930/group97229
and TLS97513 stopped normally; original container stopped with data preserved.
Ports3006/3106/4106/55446 were closed and the exact runtime lease released at
`2026-10-03T11:33:04.259135Z`. Browser custody also closed/released. No native
device was started; the one heavy build lease released. Peers were untouched.

Routine screenshots, operational helpers and JSON stay private. Final private
receipt SHA256s: browser
`906331764a80c45de4e445812f4a6e1cc02126768095d8be666fe967f017946f`;
selected state `8d518673afd936d13730e3ea87dc463893a60354b054b4f9e00cb83c50be30a7`;
closure `1e5a57be4136b6dac1a5a7b371ff42ea5f262d51dbe3b4e5fb5e3586992df304`.

## Review and remaining delivery

The human-requested original46 oldest-first PR inventory was coordinated with
all seven owners; retained-source custody and positive-path gates remain
explicit. W3 closed12 redundant drafts and W4 retained its original sources in
held successors. Qualified owner increments283/285/286/287/210 are merged;
W6 did not perform those merges. PR290 is newly published documentation,
personally read at `996e344e`, with all ten checks queued at11:34; queued is not
pass. Broader W6 PR282/284/289 remain held for their exact positive-path limits.
All four active W6 branches and shared main include fetched main132bc055;
shared workbook, peers, historical refs and private proposed61 remain preserved.

W6 remains unfinished. Genuine human recording/passkey, production C2PA
signer/trust, W1/W3/W4/W5/W6/W8 same-original publication qualification and W8
activation, provider credentials/admission/history/deletion, call policy,
physical OS/audio/push and the remaining privacy/design requirements stay open.
No held purpose is applied and no missing authority is guessed.
