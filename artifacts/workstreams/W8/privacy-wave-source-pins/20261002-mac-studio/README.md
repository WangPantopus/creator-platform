# Executable privacy-wave source pins

W4's actual post-upgrade backend launch refused in `registeredMigration`: newly active 0082 had no `sourceSha256`. The four active continuation entries now pin the exact unchanged original 0074/0082/0087/0103 SQL bytes. W8 personally invoked the real `registeredMigration` implementation for all four owner/path/name/hash contracts; all returned their actual canonical version/checksum.

This is registry metadata correction, not new SQL, a migration activation, an application acceptance receipt or a traffic reopening. No ledger, wave packet, source SQL, historical allocation, role, ACL or guard changed. W4 is operating the corrected real backend independently. W8 services and devices remain stopped, and private checkpoints remain outside Git.

Support PR179 merged `7f57b825eaa41d28a9afd7a485c0cac05ce0a5b3`, exact head `d4becb5c8a172da47701e3f53ee14db818cae844`. Current web/backend, compilation and Android checks passed; six queued foundation jobs were not passes. W1 finalization PR180 was fully source reviewed and merged `79e3b0c7d57fcfc6828618fe5b712ff48909e731`; its positive owner last-gate acceptance remains separate.
