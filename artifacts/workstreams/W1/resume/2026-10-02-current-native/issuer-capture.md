# W1 issuer-bound native request capture — October 2, 2026

Base `63ef5277ef9226f9b8941ebe6c17ecc625efdc8b`, with the committed FanShell and canonical proof projection changes. This is supporting source/build evidence; W1 has not personally operated the current shipping iOS app.

FanSession privately produces the capture from its actual issuer-bound SecureSessionStorage. Its ephemeral API client carries the captured credential and exposes an expected account pin. Credential bytes and storage are not exported. Callers must await `isCurrent()` before requests/provider handoff and before applying results. The exact original model, account, session, stored credential, credential generation and destination generation must still match. Rotation, purge, cancellation and navigation away then back refuse a retained capture. One-ID call lookup consumes this same port rather than duplicating default storage.

Personally run existing macOS Swift package checks under the owned atomic heavy-build lease: build 18.55 seconds, all 18 checks pass in 13.942 seconds, including all three NativeSnapshotTests in 13.937 seconds at unchanged references/tolerances. No new tests. The lease was released normally. Environment: Xcode 27 / macOS 27. System Contacts helper warnings remain local diagnostic output; they were not assertion failures.

Canonical proof output additionally carries the real saved nullable post URL. No existing case evidence is rewritten, no positive external ownership result is inferred, and no provider or server authority is conferred by the client capture.
