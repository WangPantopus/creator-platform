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

## Scenarios and results

See the pull request.
