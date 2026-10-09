# E6.1 runbook: proving a Studio split changes nothing

Lane 6, written 2026-10-08. The integrator moves this to its permanent place.

E6.1 says splitting `Studio.tsx` must change nothing: the same screens at 390 px in Light and
Night, the same network calls, the same keyboard order. This is how that is checked, and what the
check cannot see. Two scripts do the work; a third proves the code only moved.

## What is real and what is fake

- **Real:** the web app (`next dev`, built from your working tree), the installed Google Chrome
  driven by Playwright (`channel: "chrome"`, so nothing is downloaded), the browser's own
  keyboard, network, hydration, focus and polling code.
- **Fake, and the only fakes:**
  - The backend HTTP API. `tests/scenarios/lane-6/fixture-api.mjs` is a stand-in on port 56463
    that answers the `/v1` routes Studio calls with fixed data (`fixtures.mjs`). It checks every
    canned answer against the real zod schemas in `packages/api/src` when it starts, so it cannot
    drift from the published contracts. Use it until lane 2's one-command stack is on `main`; the
    capture script takes `--web` and `--api`, so it can point at a real stack later.
  - The clock. Each page runs on Playwright's fake clock, started on a fixed date, and the clock is
    paused once the first view has loaded. Studio polls every 4 seconds, and a poll that lands
    mid-tap makes Studio drop the tap (see the findings in `lane-6.md`), so a run that let
    polls fire at random moments would differ from itself. Steps advance the clock by hand where a
    screen needs a timer (the search delay, the outage check).
- **Not exercised:** the backend, PostgreSQL, the passkey ceremony (a Studio dialog is opened and
  photographed, nobody signs), the voice and photo recorders, real time passing between sessions.
  A split touches none of the backend, so none of it can regress here, but a green run says
  nothing about it.

## Run it

Toolchain block of the working agreement (section 3.7), then, from the repository root:

```
# 1. the "before": the tip of lane-6/studio-split-harness (the harness plus today's Studio.tsx)
git switch --detach lane-6/studio-split-harness
node tests/scenarios/lane-6/e6-1-run.mjs --out ../e6-1-before

# 2. the "after": the branch under review
git switch lane-6/<topic>
node tests/scenarios/lane-6/e6-1-run.mjs --out ../e6-1-after

# 3. compare, then prove the code only moved
node tests/scenarios/lane-6/e6-1-compare.mjs ../e6-1-before ../e6-1-after
node tests/scenarios/lane-6/e6-1-move-check.mjs lane-6/studio-split-harness
```

`e6-1-run.mjs` starts the stand-in API (56463) and `next dev` (56462, build directory
`.next-lane6`), waits for both, runs `e6-1-capture.mjs`, and stops them. A full run takes about ten
minutes. `--only a,b` limits the steps, and `e6-1-compare.mjs --subset` compares just those.
`next dev` rewrites the tracked file `apps/web/next-env.d.ts`; run
`git restore apps/web/next-env.d.ts` before committing.

## What a run records

For each of 41 shots (every area, plus the dialogs it opens) in Light and Night, each in its own
browser context so nothing leaks between steps: the full-page screenshot at 390 px, every `/api/`
call (method, path, query, normalized body, the account and session headers, the status), console
errors and warnings, and the Tab order as the browser walks it (up to 60 stops). It also counts the
polling calls over 20 seconds of page time on Notes, one second at a time.

`e6-1-compare.mjs` fails on any of these:

- a screenshot that differs by more than 2/255 in more than 64 pixels (the bound the existing
  visual suite uses for Chromium rounding corners; shots inside it are listed, not hidden);
- a write (any call that is not a GET) that differs, or arrives in a different order;
- a read that is missing, extra or different. Reads that start together have no fixed order, and
  whether the page cancels a read before its answer lands is a race, so reads compare as a sorted
  set and "aborted" counts as answered;
- a console message, a Tab stop, or a polling count (exactly) that differs.

Random ids (idempotency keys, new draft ids) are replaced by `<uuid>`; fixture ids are kept.

`e6-1-move-check.mjs` parses the base `Studio.tsx` from git and requires every top-level
declaration, with its leading comments, to exist exactly once under `features/studio` with
identical text (a leading `export` is ignored), and reports where each one went.

## Known limits

- The browser must be the same build on both sides; the compare script fails if it is not.
  Chrome runs without a GPU (`--disable-gpu`) so pixels repeat from run to run; make both runs on
  one machine.
- Next's development "Issues" badge is hidden in the screenshots; it is not part of the product.
- The dev server runs React in strict mode, which runs effects twice; both sides do the same.
