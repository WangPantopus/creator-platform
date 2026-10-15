// Run the opt-in iOS navigation journeys, serially, on lane 7's simulator.
// First build-for-testing; start the harness and ios-link-driver.mjs.
// node tests/scenarios/lane-7/ios-navigation.mjs <built.xctestrun> [N2 N5 ... | --stack]
// LANE7_OUT is an off-repository directory for the xcresult evidence.
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, unlinkSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";

const [source, ...ids] = process.argv.slice(2);
const stack = ids.length === 1 && ids[0] === "--stack";
if (stack) ids.length = 0;
const suite = stack ? "Lane7StackNavigationFlow" : "Lane7NavigationFlows";
const flows = stack
  ? { STACK: "testNavigationOnRealStack" }
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
    value.EnvironmentVariables[
      stack ? "LANE7_REAL_STACK" : "LANE7_NAVIGATION"
    ] = "1";
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
  if (
    !readFileSync(scratch, "utf8").includes(
      stack ? "LANE7_REAL_STACK" : "LANE7_NAVIGATION",
    )
  )
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
      "platform=iOS Simulator,id=62DDB9C8-4B10-48CB-94ED-1746980B54EA",
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
      `PASS iOS: ${expected} operated navigation flows, none skipped.`,
    );
  }
} finally {
  unlinkSync(scratch);
}
