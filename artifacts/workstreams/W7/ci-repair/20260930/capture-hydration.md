# Existing visual capture repair

Foundation run36753457775 passes backend and both Android jobs. Web passes12 of13
checks. Its only failing comparison is the Night Sources catalog page. The
downloaded reference, implementation and difference images show that the page
matches except for Next's red development issue badge.

CI's hydration log identifies the textarea's inline styles, including
`caret-color: transparent` on the browser DOM. Playwright screenshots default to
hiding carets by modifying inline styles. If React hydrates during that capture,
the modified DOM disagrees with the server style and creates a development issue.
This is a capture-induced hydration race, not a reason to hide the badge or alter
reference pixels. The existing catalog screenshots now use `caret: "initial"`
on both reference and implementation, leaving the unfocused controls' styles
intact. Existing runtime-error checks, reference renderer, pixel limits and
catalog counts are preserved.

The targeted Sources checks pass in Light and Night. The complete existing
catalog suite then passes all4 cases:64 exported screens and53 component
compositions in each theme. Exact logs are alongside this record. No new test
case, reference replacement, tolerance change or paid AI call.

The actual W7 web server3007 and canonical API4107 were restarted after their
previous processes had exited. Browser control recovered. The expired-session
notice, canonical development sign-in chooser and return to settings were
operated; the earlier saved quiet hours, timezone, preview and channel preferences
remain present. `settings-recovery-current.jpg` records that live state, rather
than a design fixture. This does not establish push/email delivery or a populated
primary-artboard acceptance.

GitHub metadata writes were retried after the founder's access update but still
returned403, “Resource not accessible by integration.” The browser is signed
out, and no CLI credential is configured. Branch push and CI reads work. The
current PR description is saved in the resume evidence; the pending connection
question requests the specific missing access. No unauthorized alternate
credential was used.
