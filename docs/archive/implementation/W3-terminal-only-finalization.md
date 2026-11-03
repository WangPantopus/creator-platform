# W3 terminal-only finalization

W3's original held `0110` source, mapped by W8 to `0193`, grants the original
generation matcher to its fixed finalizer role. W1's current terminal registry
separates terminal settlement from generation input authority. That original
source remains immutable and held; it is not retagged or activated.

W8 allocated the distinct held `0203_w3_terminal_only_finalization` for
`apps/backend/src/modules/conversation/migrations/pending_w3_terminal_only_finalization.sql`.
Its SHA-256 is `8de1897f2e70f763382984459274eb7616ad7149b457811fffd90fb8b7df2e8c`.
It uses the distinct NOLOGIN, NOINHERIT role `creator_w3_terminal_output` and
one fixed function, `creator.generation_terminal_output(uuid,uuid)`. It grants
only the genuine terminal matcher, with exact metadata/write columns and
nonce-bound, current transaction/PID RLS. It grants no original generation
matcher, private text, credentials, memory or financial reads.

The prepared W3 consumer requires genuine W1 identity and terminal instances,
the exact registered terminal packet, the canonical host and separate worker
login on the same actual database, and independently reviewed definition and
effective catalogue checksums. These checksums are mandatory configuration;
reading them from an unreviewed installation is not approval. The packet and
its nested migration metadata are frozen at preparation.

Factory qualification leases the actual worker client and opens a bounded
read-only READ COMMITTED transaction before W1's SAVEPOINT-based catalogue
proof. It clears interactive/scope GUCs locally, applies statement/lock/idle
timeouts, and always rolls back before releasing the client. A failed BEGIN or
rollback destroys that connection; an uncertain transaction is never returned
to the pool. This qualification transaction issues no generation or terminal
scope and performs no settlement or COMMIT.

Immediately before and after the fixed SQL transition, the consumer checks
current identity catalogue, exact role attributes, memberships, settings,
function owner/definition/ACL, effective columns/policies/schemas, and genuine
terminal scope on the same held worker client. It explicitly rejects the
original generation matcher privilege. The original AI message and generation
move only to W1's captured terminal state. The empty terminal frame preserves
the original thread, epoch, AI message and observed sequence. No output body or
new authorship/signature is manufactured.

W1 retains transaction ownership. After W3 finalization, the caller must perform
the genuine W2 all-attempt journal sealing and W4 original allowance settlement.
W1's mandatory final settlement/restoration/current-custody checks precede
COMMIT. This source does not supply a replacement Actor, ThreadScope, provider
admission, cost result, ledger entry or activation.

The distinct W1 ninth terminal contract and W8 reviewed installation remain
external integration inputs. This change is held source, not positive runtime
qualification or completion of W3. No new test code is included.
