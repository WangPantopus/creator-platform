# W1 shared CI bootstrap — October1,2026

PR59 keeps its original undefined-baseURL fix and normally merges PR53 exact commit `d207f5043facf0b0f24ec55d90b640b229ff0b06`, whose two hosted ios-foundation jobs passed. Main through `084a61a2` is normally merged. W4's original scale fix retains all110 supplied native references and comparison limits.

PR59 previously reached the visual comparisons on macOS26/Intel, but its light64-screen run timed out at180s and two unchanged source baselines each had one comparator-detected text-edge pixel (Welcome88,71; Handle314,368). No implementation difference was claimed for those failures. These are retained failure results, not passes.

Decision D-W1-CI-01: run web-visual on `xcode-27`, the macOS27/arm64 image independently identified in successful PR53 job110572493732's setup log (image20260928.0222.1). On this Mac Studio/macOS27-arm64, the original six baseline checks pass6/6 in14s and the full existing visual suite passes13/13 in4.0m. Reference images, layouts, assets and every original comparator/timeout are unchanged. CI records OS/architecture/Playwright version to make future rendering drift diagnosable. Hosted verification of this follow-up remains pending; local success is not a hosted pass.

Local command: VISUAL_APP_ORIGIN=http://localhost:3029 VISUAL_REFERENCE_ORIGIN=http://127.0.0.1:3129 CREATOR_NEXT_OUTPUT=.next-w1-ci-visual pnpm test:visual. Existing Playwright1.63.0 Chromium1243, DPR1/reduced motion, independent source reference server. Full coverage retains64 artboards and53 compositions in both themes, six foundation captures and unconfigured-auth behavior. No new tests or regenerated images.

This PR is limited to restoring shared CI and consuming current main. It does not establish personally operated W1 journeys or full W1 release acceptance. The separate W1 completion branch retains those obligations.
