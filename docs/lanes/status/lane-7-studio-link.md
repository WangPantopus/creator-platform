# Lane 7: the web Studio link (WP 7.12)

Written by lane 7. One spec for both apps; a difference between the platforms is a defect.

Under option A the pilot's native app is the fan app and creators use the web Studio on their
phones. A creator who opens the fan app needs one way to their Studio.

## Rules

1. **Who sees it.** "Open Qelvora Studio" (`nativeOpenStudio`, "Open {studio}" with the brand's
   Studio name) is on Your account when the signed-in account is a creator (`session.creator`), and
   only then. A fan's account has no link.
2. **Where it goes.** The system browser opens `{web origin}/studio/{creatorId}`, the creator's
   Studio (Notes first). The web shows it signed in, or its sign-in, which returns to that Studio
   (`apps/web/app/studio/[creatorId]/[[...screen]]/page.tsx`). The app's session is not handed to
   the browser: there is no contract for that (C1); the person signs in on the web once.
3. **The web origin** is a build setting, `CREATOR_WEB_URL` (iOS `CreatorWebURL` in Info.plist,
   Android `BuildConfig.CREATOR_WEB_URL`): an https origin with no path; a debug build may use a
   local http one. Without one, there is no link (never a dead end). The release origin waits on the
   domain (Q09, WP 7.6).

## Decisions taken as the proposed default (2026-10-16; the founder may veto any)

- New copy: "Open {studio}" ("Open Qelvora Studio"), on Your account, for creators only.
- The link opens the creator's own Studio (`/studio/{creatorId}`), not the team workspace.
- The system browser, not an in-app browser view (no new dependency on Android; the web keeps its
  own sign-in and cookies).

## The fake API

`GET /studio/:creatorId` answers for the web Studio, so a browser's visit shows in the request log.

## Scenarios and results (fake API on 56473 standing in for the API and the web origin; synthetic identities)

`node tests/scenarios/lane-7/e7-12-studio-link.mjs [Z1 Z2]` (Android) and
`node tests/scenarios/lane-7/ios-navigation.mjs <xctestrun> --studio [Z1 Z2]` (iOS), on this branch's
debug builds with `CREATOR_WEB_URL=http://127.0.0.1:56473`.

| ID | What | iOS | Android |
| --- | --- | --- | --- |
| Z1 | Maya (a creator account) on Your account: "Open Qelvora Studio"; a tap opens the system browser at her Studio | pass: Safari in front; the web origin logged `GET /studio/c1000000-0000-4000-8000-000000000001` | pass: Chrome received `VIEW http://127.0.0.1:56473/...` from the app (Android writes the path as "/..."); Chrome's first run shows its terms, which this session does not accept, so the page did not load |
| Z2 | Devon (a fan) on Your account | no link: pass | no link: pass |
| Z3 | The web lands signed in, or at sign-in returning to the Studio | not run: no web app was running; the web route does this (`apps/web/app/studio/[creatorId]/[[...screen]]/page.tsx`) | not run |
| Gates | compile (the iOS test build includes the flows) | test build | debug build |

Not run: a release build (no web origin, so no link), and the real web app (lane 2's stack with
`--web` would show Z3).
