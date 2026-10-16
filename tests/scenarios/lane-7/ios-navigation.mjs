// Run the opt-in iOS navigation journeys, serially, on lane 7's simulator.
// First build-for-testing; start the harness and ios-link-driver.mjs.
// node tests/scenarios/lane-7/ios-navigation.mjs <built.xctestrun> [N2 N5 ... | --stack]
// LANE7_OUT is an off-repository directory for the xcresult evidence.
import { execFileSync, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync, unlinkSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";

const [source, ...ids] = process.argv.slice(2);
const presence = ids[0] === "--presence";
if (presence) ids.shift();
const seal = ids[0] === "--seal";
if (seal) ids.shift();
const consent = ids[0] === "--consent";
if (consent) ids.shift();
const adults = ids[0] === "--adults";
if (adults) ids.shift();
const citations = ids[0] === "--citations";
if (citations) ids.shift();
const comparison = ids[0] === "--comparison";
if (comparison) ids.shift();
const drafts = ids[0] === "--drafts";
if (drafts) ids.shift();
const draftStack = ids.length === 1 && ids[0] === "--draft-stack";
if (draftStack) ids.length = 0;
const stack = ids.length === 1 && ids[0] === "--stack";
if (stack) ids.length = 0;
const suite = presence
  ? "Lane7PresenceFlows"
  : draftStack
    ? "Lane7StackDraftFlow"
    : drafts
      ? "Lane7DraftFlows"
      : stack
        ? "Lane7StackNavigationFlow"
        : seal
          ? "Lane7SealFlows"
          : consent
            ? "Lane7ConsentFlows"
            : adults
              ? "Lane7AdultFlows"
              : citations
                ? "Lane7CitationFlows"
                : comparison
                  ? "Lane7ComparisonFlows"
                  : "Lane7NavigationFlows";
const optInVariable = presence
  ? "LANE7_PRESENCE"
  : draftStack
    ? "LANE7_STACK_DRAFTS"
    : drafts
      ? "LANE7_DRAFTS"
      : stack
        ? "LANE7_REAL_STACK"
        : seal
          ? "LANE7_SEAL"
          : consent
            ? "LANE7_CONSENT"
            : adults
              ? "LANE7_ADULTS"
              : citations
                ? "LANE7_CITATIONS"
                : comparison
                  ? "LANE7_COMPARISON"
                  : "LANE7_NAVIGATION";
const flows = presence
  ? {
      R1: "testR01NotesAndReactionsInPlace",
      R4: "testR04NewNoteAfterForegroundAndReconnect",
      R5: "testR05EligibilityAndFailures",
      R7: "testR07EarlierMessagesRevealOlderNotes",
      R8: "testR08LongUnicodeNoteLargestText",
      R9: "testR09NothingOnDisk",
      R10: "testR10LargestTextOpensAtBottom",
    }
  : draftStack
    ? { D6: "testD06RealSendAndDeletion" }
    : drafts
      ? {
          D1: "testD01Lifecycle",
          D2: "testD02IndependentThreads",
          D3: "testD03LargestText",
          D3T: "testD03TallRowScroll",
          D4: "testD04SendRecovery",
          D4R: "testD04RejectedRetry",
          D5: "testD05AuthorizationAndReplacement",
          D7: "testD07BoundaryAndCiphertext",
          D7U: "testD07Unicode",
          D8: "testD08NewTextDuringSend",
        }
      : stack
        ? { STACK: "testNavigationOnRealStack" }
        : seal
          ? {
              S1: "testS01SealPerCreator",
              S2: "testS02LargestText",
              S3: "testS03EmojiLowercaseName",
            }
          : consent
            ? {
                C1: "testC01PromiseWhenProvidersKeepNothing",
                C2: "testC02ProviderThatKeepsMessages",
                C3: "testC03UnverifiedPolicy",
                C4: "testC04TwoProviders",
                C5: "testC05LargestTextNight",
              }
            : adults
              ? {
                  A1: "testA01FlaggedAfterSignIn",
                  A2: "testA02RefusedAtSignIn",
                  A3: "testA03LargestTextNight",
                }
              : citations
                ? {
                    P1: "testP01PassageOpens",
                    P2: "testP02RefusedPassage",
                    P3: "testP03MissingPassage",
                  }
                : comparison
                  ? {
                      K1: "testK01OffSaysNothing",
                      K2: "testK02QuestionChoiceClosesWhenTurnedOff",
                      K3: "testK03PrivacySectionLeavesOnRefusal",
                      K4: "testK04PrivacyRefreshAfterBackground",
                    }
                  : {
                      N1: "testN01ThreadBackAndGesture",
                      N2: "testN02ConsentIsReplaced",
                      N5: "testN05AccountBack",
                      N6: "testN06NotificationTrailAndLabel",
                      N8: "testN08ColdLink",
                      N13: "testN13AccountChangeClearsTrail",
                      N14: "testN14UnknownLink",
                      N15: "testN15RepeatedLinkAndQuickBack",
                      N16: "testN16LinkWhilePrivacyIsOpen",
                      N17: "testN17TrailBoundary",
                      N19: "testN19NewFanBack",
                      N20: "testN20EditProfileBack",
                      N21: "testN21CreatorAccessBack",
                    };
if (!source || ids.some((id) => !flows[id]))
  throw new Error(
    "Pass a built .xctestrun and optional unfinished iOS flow IDs.",
  );
const config = JSON.parse(
  execFileSync("plutil", ["-convert", "json", "-o", "-", source], {
    encoding: "utf8",
  }),
);
let targets = 0;
const optIn = (value) => {
  if (!value || typeof value !== "object") return;
  if (value.BlueprintName === "QelvoraUITests") {
    value.EnvironmentVariables ??= {};
    value.EnvironmentVariables[optInVariable] = "1";
    if (draftStack) {
      const fixture = JSON.parse(
        readFileSync(process.env.LANE7_STACK_FIXTURE, "utf8"),
      );
      const fields = [
        "api",
        "appApi",
        "actor",
        "creator",
        "fan",
        "thread",
        "route",
        "marker",
      ];
      if (Object.keys(fixture).some((key) => !fields.includes(key)))
        throw new Error("Unexpected fixture field");
      // A partial run may already have accepted its synthetic Send. Reusing
      // object IDs is safe; each operated run needs a distinct message marker.
      fixture.marker += " " + randomUUID().slice(0, 8);
      value.EnvironmentVariables.LANE7_STACK_FIXTURE = JSON.stringify(fixture);
    }
    targets += 1;
  }
  for (const child of Object.values(value)) optIn(child);
};
optIn(config);
if (!targets)
  throw new Error("No QelvoraUITests target in the supplied build.");
// Keep __TESTROOT__ references relative to the original products directory.
const scratch = join(
  dirname(resolve(source)),
  `lane7-${process.pid}.xctestrun`,
);
const out = process.env.LANE7_OUT ?? join(tmpdir(), "lane7-scenarios");
mkdirSync(out, { recursive: true });
const evidence = join(out, `ios-navigation-${Date.now()}.xcresult`);
try {
  writeFileSync(scratch, JSON.stringify(config));
  execFileSync("plutil", ["-convert", "xml1", scratch]);
  // Refuse an empty or malformed conversion before starting the expensive job.
  if (!readFileSync(scratch, "utf8").includes(optInVariable))
    throw new Error("The runner opt-in was not written.");
  const result = spawnSync(
    process.execPath,
    [
      "scripts/with-heavy-build-lock.mjs",
      "--owner",
      "LANE-7",
      "--",
      "xcodebuild",
      "test-without-building",
      "-xctestrun",
      scratch,
      "-destination",
      `platform=iOS Simulator,name=${process.env.LANE7_IOS ?? "qelvora-lane7-ios"}`,
      "-parallel-testing-enabled",
      "NO",
      "-resultBundlePath",
      evidence,
      ...(ids.length ? ids : Object.keys(flows)).map(
        (id) => `-only-testing:QelvoraUITests/${suite}/${flows[id]}`,
      ),
    ],
    { stdio: "inherit" },
  );
  console.log(`iOS evidence: ${evidence}`);
  process.exitCode = result.status ?? 1;
  if (result.status === 0) {
    const summary = JSON.parse(
      execFileSync(
        "xcrun",
        ["xcresulttool", "get", "test-results", "summary", "--path", evidence],
        { encoding: "utf8" },
      ),
    );
    const expected = ids.length || Object.keys(flows).length;
    if (
      summary.passedTests !== expected ||
      summary.skippedTests !== 0 ||
      summary.failedTests !== 0
    )
      throw new Error(
        `Expected ${expected} operated flows; observed ${summary.passedTests} passed, ${summary.skippedTests} skipped, ${summary.failedTests} failed.`,
      );
    console.log(
      `PASS iOS: ${expected} operated ${presence ? "presence" : drafts ? "draft" : seal ? "seal" : consent ? "consent" : adults ? "adults-only" : citations ? "citation" : "navigation"} flows, none skipped.`,
    );
  }
} finally {
  unlinkSync(scratch);
}
