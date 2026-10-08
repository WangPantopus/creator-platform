# Ordinary installer continuation

PR349 head3297d8c4c failed both CI web/backend jobs: the ordinary fresh installer
included0239–0246 while correctly leaving their generation/privacy predecessor
waves unapplied.0240 rejected the absent original privacy sources. The refusal
and CI log remain preserved; no applied SQL was changed.

The installer now validates all eight registrations, excludes the comparison
wave until installed, rejects partial/unregistered installation and selects the
comparison catalogue when all eight are present. It continues to direct actual
upgrades through the closed wave runner.

The existing PostgreSQL integration suite passes all11 cases on a new isolated
cluster/database, including10000 real scoped pairs. An ordinary rerun on the
previously reviewed complete isolated graph22 passes all114 already-applied
sources without a new application. A first read-only attempt against restored
populated04 was refused by the complete purpose catalogue while its original
cluster had been reopened for application traffic; it is retained as a refusal,
not accepted existing-database evidence. No profile was broadened to accept it.

Backend type checking and scoped lint pass. No new unit tests were added.
