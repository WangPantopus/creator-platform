# W1 generation without unnecessary writes — October 1, 2026

The canonical shared, native API and OpenAPI generators previously wrote every output on every generation run. Native compilers then reprocessed unchanged token/API files during a four-key copy update. Generation now compares existing bytes and writes only missing or different output. Strict check mode still rejects stale output; read errors other than a missing file remain errors.

Personally ran canonical generation followed by its strict check and compared SHA-256 plus nanosecond modification time for all 15 output files: 15/15 stayed unchanged. Generation still reports 12 shared resources and 96 OpenAPI operations. API typecheck, affected ESLint/Prettier and both original shared-resource/rename checks passed. No test code, generated output, schema, migration, reference or app runtime behavior changed.

The [source and output record](unchanged-generation.json) preserves exact generator hashes and before/after observations. This removes an observed unnecessary rebuild trigger; no build-time saving or performance percentile is claimed. The original W1 obligations and native/provider/CI acceptance gates remain active.
