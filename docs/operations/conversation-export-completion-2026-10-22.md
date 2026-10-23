# Conversation metadata export with media frozen

Verified 2026-10-22 on the combined app's owned `integrated-1022` stack, with
synthetic development identities, the actual backend and PostgreSQL, and a fake
model. No SQL, retention policy or media configuration changed.

## Change

The stock host previously prepared conversation privacy only when interactive
media was configured. Even text-only accounts then failed with
`conversation_recordings_unavailable`, and Agent export could not finish its
accounting boundary.

`PreparedConversationRecordingAssociations` now owns the real association
metadata reads independently of media signing, delivery, storage and playback.
It preserves the exact existing registered migration checks, installed
checksums, schema/constraint/index checks, forced row security and non-owner
runtime role checks. Both export queries are unchanged. Interactive
`ConversationRecordings` delegates these reads to its prepared association
reader; it still requires the actual Media service for interactive operations.

The host supplies that concrete reader to privacy and cursor preparation. The
registered privacy graph can now prepare without enabling media features. No
empty adapter, forged receipt, changed grant or invented policy was used.

## Observed results

| Check | Actual result |
| --- | --- |
| Backend typecheck, scoped lint/format and whitespace checks | Passed |
| Existing migration constants, preparation checks and query bodies after extraction | Preserved exactly |
| New fan-one export through the real privacy API | All eight domains completed after the normal accounting-boundary retry |
| Protected conversation artifact | 15,512 bytes; SHA-256 `ef6f7d357e60c5f2145e01512c2f6a12cf69256d685764a54e21b5c7fb1a2a9c` |
| Artifact contents versus actual database | One family, two messages, one generation, zero recording associations; exact count match |
| Generation accounting in the artifact | One admission, attempt, receipt and receipt notification; five usage rows |
| Anonymous artifact download | 401 |
| Maya attempts fan-one job, manifest and artifact access | 404 for all three |
| Interactive recording delivery capability | Still false |
| Earlier partial export and deletion jobs | Retained unchanged; no manual retries or state updates |

Completed job: `cd0dc348-aaa7-4e17-8c82-b18d3bdc4d09`. The eight completed
domains were Agent, commerce, content, conversation, Growth, identity, media and
trust. Local detailed evidence is under
`/tmp/qelvora-privacy-associations-1022/`; it contains only synthetic fixtures and
is not committed.

## Limits

This proves populated text-conversation and accounting export. It does not
prove a nonempty recording-association export, binary media/call archives or
whole-account deletion. Binary archives still require their actual protected
archive adapter. Deletion still needs the approved retention rules and owner
adapters; none were bypassed or supplied by this change.
