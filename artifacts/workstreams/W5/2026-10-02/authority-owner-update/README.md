# W5 authority owner update

Implemented at `15d59eca744db52d6553f44ecc7e32df4f0ef528` after merging current main `97a79a34aa98c327d1cc501756bd8484bf3bc9f8` at `5cb21260da9b2bc077be3b981b9199f1139469bd`.

The five identity files match W1's `dce780db` exactly. Current main already supplied the actual AudienceScope negative-before-positive ordering and the contention-safe final signature gate. W5 personally consumed the remaining publication issuer and SQL proposal. The publication scope has to be deleted inside its issuing transaction; a deferred constraint rejects committing a retained scope. The issuer also rejects replication privileges and per-role configuration.

- `schema-publication-scope.sql` (reserved 0071): SHA-256 `100e319216568ee1ed27081be0520dbfdb3b7019659946c2c5de1f6859d32cc1`.
- `schema-signature-read-fence.sql` (reserved 0081): SHA-256 `157640de84f22d6d638d788dfe04314fd193efaed80a829f288bec7cbcb815b5`.
- `signature-read-fence.ts`: SHA-256 `863e9b076f857e8c148695084145d2cd88e91fd50057b4debd8a9f513536aaf1`.

Runnable: backend `tsc --noEmit`, targeted ESLint and Prettier checks passed at this source commit. Integrated: the existing W5 purpose worker retains the same actual issuer, held client and sealed scope. Verified: exact owner bytes and static checks only; no scheduled or media-ready positive publication was operated for this update. Release-ready: no. Reserved migrations were neither applied nor relabeled. The W5 database remains the explicitly reopened local-development wave57 database.

The creator is DEVELOPMENT-ONLY SEEDED VERIFIED (2026-10-01T20:44:26Z), with no genuine proof or passkey. This evidence does not establish signing, media provenance or delivery.
