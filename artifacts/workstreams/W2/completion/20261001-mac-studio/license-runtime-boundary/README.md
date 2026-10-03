# Current-license runtime boundary

Current-license rechecks now enforce the same development-versus-real scope boundary as license recording/publication. The inner synthetic verifier also requires explicit development scope. Runtime and held-client delivery derive that qualification from the configured verifier, whose constructor enforces the loopback development host boundary; clients and stored license text cannot select it. Runtime qualification now uses the actual held transaction when rechecking the stored row.

[Sanitized operator receipt](receipt.json) records the existing synthetic license on the real non-owner pool (max one connection). Positive development and negative real-scope/foreign-proof/voice/host checks passed without provider calls or durable writes. This closes a recheck gap; it is not reviewed production licensing, fan generation acceptance or release completion.
