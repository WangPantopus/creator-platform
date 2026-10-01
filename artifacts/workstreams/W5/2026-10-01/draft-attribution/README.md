# Actual unsigned-draft attribution verification

Application: `58998384567cf53aa6c4758dd54a736a6d7fcacf`. Parent main: `107c8eb756e8391fb32840647e52d22d3234583a`.

The running parent Notes list rendered the actual persisted unsigned Note through the signed Note primitive. `before-signed-draft-390-light.jpg` preserves the incorrect Signed by marker. The fix renders only drafts as a plain card labeled “Draft · not signed or sent”, using existing whitespace/wrapping styles. The non-draft path is unchanged.

Personally operated the actual W5 development creator at web port 30055, with the preserved W5 API on 41055 and database on 55435. Opened the saved revision 12 through Edit draft, saved actual multiline/long-word text as revision 13, and read Notes in 390×844 and 1280×720, both Light and Night. All four actual views preserve exact text/newlines, show the draft label without Signed by, and have viewport-equal document widths. Phone and desktop Night pixels were inspected. Actual measured DOM facts are in `actual-browser-states.json`; before/after screenshots are retained.

Keyboard Enter on Edit draft opened the real editor. This exposed a separate existing loading race: the textarea appears before the stored document finishes loading. An attempted early restoration was overwritten by that pending read, so revision 14 retained the multiline text. After waiting for the loaded revision, restored the original exact words as revision 15 and reloaded to verify persistence. This race remains a separately tracked follow-up; the draft-list fix does not claim to repair it.

Read-only administrative database observation after restoration confirms the same Note `a9181632-d598-49f5-9be8-49a66184081c`, revision 15, state draft, zero publications and zero media. No review, passkey, signing, publication, reply or media delivery was performed.

Formatting, scoped lint and production web build pass on the frozen application source. Build includes TypeScript. No new test code, suites, assertion/reference changes, backend/API/schema/migration/native changes. Native behavior is inherited unchanged from the accepted parent and is not new authenticated W5 native evidence.

Additional actual browser acceptance before this fix: the owner at 3005 invited the existing actor 3 with only Drafting, the recipient at 30055 accepted and opened a local Team composer, and the owner removed only actor 3 while that composer remained open. The recipient automatically reached the current-role denial view with the private Studio/textarea/local text removed. Actor 4 retained triage/drafter/publisher. No Team draft was saved or signed. The observation after removal was at 5.5 seconds, not a measured latency bound. The screenshots and read-only membership observation are included; this is browser role-revocation scope only.

Original broad W5 PR9 remains draft/conflicting. Genuine signing is held by the human; immutable migration custody, producer integration and broader native/provider/content paths are still incomplete.
