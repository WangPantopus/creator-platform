# Studio integration, 2026-10-22

Today is now the first Studio tab on phones and the first desktop sidebar entry,
using the existing home glyph. Notes and the Note composer keep Today selected;
Notes remains one tap from Today. This implements the founder's 2026-10-15
decision recorded in [lane 6's status](../lanes/status/lane-6.md).

The Note composer's author preview now says “to all members”, matching its help
text and the published Note. Published Notes preserve paragraph breaks and take
text direction separately for each paragraph. Creator setup no longer requires
a fan handle; the navigation rule and generated clients share that exemption.

## Verification

| Check                                                                            | Observed result                                                                                                                                                                    |
| -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Web and shared UI typechecks                                                     | Pass                                                                                                                                                                               |
| Scoped ESLint and Prettier                                                       | Pass                                                                                                                                                                               |
| Existing E6.1 Workspace, Notes owner/team, Compose new/edit/team, empty Requests | 26 capture steps completed in Light and Night with the stand-in API; selected screenshots inspected. One initial resource 404 was recorded on Workspace; no other console entries. |
| Existing E6.2 Note scenario, extended for these changes                          | 10/10 pass through the running web app, backend and PostgreSQL                                                                                                                     |
| Existing E6.2 Today scenario                                                     | 10/10 pass: owner, drafter and triage navigation; a failed section; 320/390 px in Light and Night; authorship reading order; refresh on return                                     |

The Note scenario verifies Today entry and return navigation, the exact author
preview, two-paragraph text in the published Note, signed-act ownership, member
access and non-member denial, empty input, the 20,000-character limit, RTL and
emoji, and one publication after a double tap. Its old expectation that rendered
Notes collapse newlines was changed to require the original newlines.

The real-stack checks use development identity, a browser virtual passkey, and
synthetic membership rows. They do not prove physical-device signing or real
provider behavior. Screenshots stay outside git. Original artboards and image
baselines are unchanged; a full visual comparison was not run because the
approved tab replacement deliberately changes those images.

Re-run using the local stack and `LANE6_WEB`, `LANE6_API`, `LANE6_DB`, and
`LANE6_OUT` for its addresses and evidence directory:

```sh
node tests/scenarios/lane-6/e6-2-note.mjs
node tests/scenarios/lane-6/e6-2-today.mjs
```

The Studio polling work in PR #488, the tier-specific audience preview, and the
remaining Studio work packages are separate from this increment.
