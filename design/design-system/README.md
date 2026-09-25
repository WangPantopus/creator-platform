# Phase 3 · design system

Source of the Design System artifact [Qelvora](https://claude.ai/artifact/AyfModKVToY2VeqMACNxFU)
on claude.ai. The artifact is the living version, with a live preview of every
component in both themes. These files are a snapshot so the work survives
outside claude.ai. Direction: **D · Atelier** (see the brief's decision log).

| Path | Contents |
| --- | --- |
| `project/README.md` | The brand book: the identity system, content rules, visual foundations, iconography and the wordmark |
| `project/tokens.json` | Tokens in two themes, Light and Night: 23 colors, 13 type styles (Geist, Newsreader, Geist Mono), 8 spacing steps, 6 radii, 3 shadows, 3 z-index layers. Every text pair is at least 4.5:1 in both themes |
| `project/components/bundle.js` | 53 React components as one script that assigns `window.Qelvora` (React 18) |
| `project/components/bundle.css` | Their styles, built only on the tokens (`qv-` classes) |
| `project/components/index.d.ts` | Props for every component, as documentation |
| `project/components/<Name>/` | Each component's guidelines (`README.md`) and live preview (`preview.html`) |
| `project/components/Cover/preview.html` | The cover shown above the brand book |
| `project/design-system.json` | The artifact's index |
| `tools/` | The scripts that write the component guidelines and previews, and render every preview headlessly |

## Components

| Group | Components |
| --- | --- |
| Identity | Mark, Seal, Avatar, AuthorLabel, IdentityStrip, ThreadHeader, SignedMarker, SystemLine, CallChip, ReservedLabel |
| Conversation | Message, Note, ReactionChip, CitationChip, MemoryChip, Correction, ContextCard, VoiceNote, Composer, StepIn, ShareCard |
| Requests | AccessLines, ModeList, IncludeList, TermsBlock, EtaLine, Countdown, RequestStatus, Receipt, SpendLimit |
| Studio | QueueCard, CapacityHeader, LabelPreview, SigningSheet, AuditBanner, SourceRow, InsteadMenu, TestConsole, VersionList, DigestItem |
| Navigation | TabBar, StudioTabBar, Sidebar, Segmented |
| Controls | Button, Sheet, Dialog, Toast |
| Feedback | Notice, NotificationRow, EmptyState, Skeleton, EmailFrame |

## Working on it

Edit the files under `project/` (component guidelines and previews are written
by `tools/gen_components.py`: edit the script, then run it), then republish
the changed files to the artifact. To render every preview in both themes:

```sh
python3 tools/gen_components.py
REACT_JS=/path/react.production.min.js REACT_DOM_JS=/path/react-dom.production.min.js python3 tools/build.py
PW=$(npm root -g)/playwright node tools/check.js    # one line per page; ERR marks a failure
PW=$(npm root -g)/playwright node tools/shots.js    # screenshots into rendercheck/shots/
```

`rendercheck/` is generated and ignored by Git.
