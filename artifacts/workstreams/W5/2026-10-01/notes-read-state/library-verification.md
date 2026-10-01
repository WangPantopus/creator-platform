# Original library read and filter states

Application 701cbf5ce7721b5fb6f0e0950e8994f1112a7f58, formatted without semantic changes at 78e1d33b25e2ca00bf9351d79d6f98baa0a0e967. This change remains on original PR9; it is not included in merged PR14.

Personally opened the original launched web app on3005 using the existing pending-creator development account. Publish returned the actual verification/recovery error together with “Your library is empty.” The corrected view retains the error and suppresses the false empty state. After canonical sign-in to the existing creator, the library returned all four stored items, including archived post revision5 and unsigned Note revision17.

An unmatched actual search also said the whole library was empty. Changed successful filtered-zero results to “No matching items” with search/state recovery guidance. Actual unmatched query and published-state filter both show that result. Clearing both returns all four original items. Every measured390 Light state has390px document width. No object, publication, signature, media or ledger was changed. One getByLabel State lookup failed; the observed combobox role then operated successfully. Captures and library-browser-states.json record the actual states.

Scoped ESLint and formatting pass on the final source. The first formatting check requested line wrapping, which was corrected and rechecked. No tests or test files were added; the production build will be rerun on the forthcoming combined reconciliation rather than being represented as already verified for that unknown source.
