# Web foundation

Run from the workspace with `pnpm --filter @qelvora/web dev`.

- `/creators/maya` renders the supplied public creator home.
- `/auth/continue` renders the supplied Pantopus welcome. Continue calls the
  backend identity adapter and preserves the local arrival path. Until Pantopus
  is configured, it displays the unavailable state. It creates no local account.
- `/onboarding/handle` requires Pantopus integration; it returns to sign-in.
  The exact handle artboard is available in the design catalog.
- `/design/screens` exposes all 64 exported artboards and prototype states.
- `/design/components` exposes all 53 component compositions.

Catalog pages are explicitly design previews. Controls in a preview show the
source composition; they do not perform the unimplemented product action.

`lib/design.tsx` compiles whitelisted, repository-owned design exports into React
nodes. It preserves source layout and uses the typed component port. Only trusted
checked-in `renderVals` and component-preview scripts run in an isolated server
VM. Request data never supplies script or filesystem paths. Numeric dimensions
inside source artboards are preserved as reference evidence; new shell styling
uses generated token variables. Deployment tracing includes only required
artboards, canvases and preview compositions from `design/`.

The theme follows the OS and responds to changes. Preview/testing URLs may force
`?theme=light` or `?theme=night`. Four bundled variable font files avoid network
font dependencies.

Set `QELVORA_API_URL` to the standalone Node host when integrating Pantopus. Its
`POST /v1/identity/continue` response must contain an HTTPS provider redirect;
an absent provider, invalid response or failed request displays the unavailable
state. Profile save, subscriptions, payments, chat streaming, calls, creator
publishing and roster discovery remain in later backend slices.
