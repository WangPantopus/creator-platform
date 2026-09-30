# W6 session, clock and media/consent lifecycle

Source: D-03/D-16/D-18/D-25, T-12, INV-09/12/15/16/18; Architecture §8;4E-01/02/03/04 and4F-03; C02/C06/C07/C10. These describe current implementation. **Every provider/outcome row remains runtime-unverified** because genuine calling is unconfigured.

## Transitions

| Trigger | Durable behavior |
| --- | --- |
| Signed offer | W4 caller transaction verifies captured obligation/version/exact slots; W6 schedule lock precedes W4 commitment lock, requires dated availability and inserts offer/overlap locks |
| Fan selects | Current fan-only offer/slot/version, same transaction assigns W4 obligation and writes unique session/reminder effect; stable retry key and selected-session recovery destination |
| Scheduled→waiting | Authorized window, exact fan and own verified creator; no AI/team; room/admission persisted, short token outside transaction followed by fresh authorization/time/nonce check |
| Waiting→connected | Genuine exact-account provider presence/history after appointment start; waiting adds no connected/reconnect time |
| Connected→reconnecting→connected | Mutual interval intersection stops; disconnected gaps after first mutual connection consume cumulative180s; rejoin retains state/room/current authority |
| Live→ending | Actor intent, delivered duration, reconnect exhaustion, grace no-show or hard deadline requests real provider closure; timeout is unknown external result |
| Ending→ended | Provider state/history both closed and complete; immutable evidence/outcome plus durable W4 settlement/handback/notice effects |
| Cancel | W4 cancel seam and room cleanup, release W6 locks; unresolved cancellation economics route to W4 resolution; no approved reschedule command |

Server clocks sort/merge duplicate/reordered intervals independently per participant, intersect them, clip to scheduled start and min(measurement,hard end,actor end intent), and cap mutual delivery at purchased duration. Reconnect starts only after first mutual connection; total allowance180s, later intervals after exhaustion add no delivery. Hard slot end = appointment start + purchased duration +180s. Clients display server projections; local transport status/countdown cannot establish delivery.

## Outcomes and evidence

All final branches require genuine complete closed history. W4 alone calculates money from persisted evidence and current authority.

| Condition | W6 result | Present W4 consumer |
| --- | --- | --- |
| Mutual connected time≥80% | completed | Delivered if creator authority current |
| Fan explicitly ends by choice after actual connection | completed + fanEndedByChoice | Permits completion below80% |
| Creator early end below80% after connection | partial | Proportional refund |
| Creator absent by grace, fan present | creator_no_show | Full refund |
| Fan absent by grace, creator present | fan_no_show | Charge as agreed; no invented human delivery |
| Both absent by grace | Unresolved | Approved cause rule missing; no final outcome/settlement |
| Fan technical end, exhausted reconnect, insufficient time otherwise | technical_failure | Full refund |
| No mutual connected time otherwise | technical_failure | Full refund |
| Missing/reordered/incomplete provider history | ending, reconciliation blocked | No final evidence until history converges |
| Creator authority revoked | Fresh operations denied; authorized lifecycle cleanup | W4 rechecks authority and resolves/refunds |

No genuine provider reconciliation trace exists for this run. Next real run must record sanitized session/effect/request IDs, room/history reference and interval/closure records, scheduled/hard/end-intent bounds, reconciliation passes, immutable evidence hash, W4 receipt/effect reference and both-client clocks. Callback arrival time cannot replace provider intervals. JWT expiry alone cannot prove one-use admission, reconnect expiry or strict revocation.

W4 current authorization presently rejects settled commitments. W6 optional `SchedulingAuthority.retained` allows W4 to authorize ended/cancelled receipts/consented summaries without granting booking/join rights. Missing policy fails closed; W4 implementation remains pending.

## Media and separate-purpose lifecycle

| Stage | Present behavior | Missing proof |
| --- | --- | --- |
| Upload | Owner/audience/purpose/retention/limits, short ticket,1MiB offset chunks/retry/checksum/container checks, quarantine | Real configured authority/scanner/store; corrupt/expiry/role cases |
| Processing | Separate leases and bounded real ffmpeg decode/AAC M4A/PNG/64peaks, per-attempt staging, stale-worker protection | Actual ingestion→scan→process→play |
| Duration | Mono1000Hz signed16-bit PCM bytes/2 = milliseconds; decode through max+1000ms to detect overflow; `-xerror`, wall/output bounds | Real WebM/native inputs;1ms precision limitation |
| Sign/provenance | Immutable processed digest/exact W1 act, separate decorated bytes, genuine C2PA contract/output bounds | Real passkey/C2PA and W3/W5 author display |
| Read/range/cache | Current audience and AI license on every read/range; account/family/asset/version/operation-bound ticket, no-store/tombstones | Replay/expiry/revocation/cache timing |
| Recording | Off default; both-party recording grant alone; provider-confirmed state, stop/delete durable effects | Actual refusal/stop/files match consent |
| Summary | Separately both-party; unrecorded summary uses packet+typed creator note only; working note filtered from fan API | Real summary/revocation/delete |
| Reuse/AI source | Distinct records/revocation/purpose-specific purge; join grants nothing | Actual consumer refusal without permission |
| Marked AI audio | Current W2 licensed revision and verified spoken/visual label, watermark/C2PA, bounded output, current read checks | Genuine generation and app/download/share/transform survival; disabled |
| Expiry/export/delete | Bounded expiry revoke/delete sweep, actual file/provider deletion/tombstones; W8 applyRetention verified before acknowledgment; full archive adapter | Approved retention/legal hold, full account export/deletion/backup proof |

PCM duration is inferred from decoded sample count, not guaranteed FFprobe metadata. Browser WebM duration metadata may be absent; the worker no longer requires it for otherwise valid audio. Actual pipeline proof remains blocked. [FFmpeg raw PCM](https://ffmpeg.org/ffmpeg-formats.html#Raw-PCM-muxers), [sample trimming](https://ffmpeg.org/ffmpeg-filters.html#atrim), [MediaRecorder](https://www.w3.org/TR/mediastream-recording/#dom-mediarecorder-start).
