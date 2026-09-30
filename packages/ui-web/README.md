# Web components

The 53 exports in `src/components.ts` port the checked-in reference bundle at
`design/design-system/project/components/bundle.js`. Public prop contracts come
from that bundle's `index.d.ts`, preserved in `src/contracts.ts`.

The port removes the browser global and adds strict React types to each prop,
helper, glyph and nav tuple. It preserves reference `qv-*` classes, element order,
SVG paths and composition. CSS is the original bundle with its remote font
import removed and the explicit BUILD_PROMPT section 9 corrections applied.
Fonts are bundled locally. Creator/AI authorship copy reads `@qelvora/copy`;
product names read `@qelvora/brand`.

The components are visual primitives. A component's `kind` is a rendering
contract; the backend owns the trusted author classification. Reference preview
buttons do not create purchases, sign messages or change creator presence.
Application flows supply real actions as their backend slices are implemented.

`pnpm test:visual` compares every supplied preview against the original,
unported bundle in Light and Night. The independent reference runtime restores
the exports' missing canvas `support.js` without importing the port.
