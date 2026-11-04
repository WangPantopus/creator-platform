// E7.1: a release build contains none of the debug harness hook. Counts the
// hook's markers in each app given: an iOS .app (every Mach-O file in it) or an
// Android .apk (its DEX files). Pass a debug build too, so the scan is seen to
// find them where they are.
//   node tests/scenarios/lane-7/e7-1-release-hook.mjs debug=<app> release=<app> [...]
// Build the iOS release app for the simulator first, for example:
//   xcodebuild build -project apps/ios/QelvoraApp.xcodeproj -scheme QelvoraApp \
//     -configuration Release -destination 'generic/platform=iOS Simulator' \
//     -derivedDataPath <dir> CODE_SIGN_IDENTITY=- CODE_SIGNING_ALLOWED=YES CODE_SIGNING_REQUIRED=NO
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

// The launch arguments and extras of the hook, its diagnostics, and lane 7's fake API origin.
const MARKERS = [
  "harness-actor",
  "harness-reset",
  "harness_actor",
  "harness_reset",
  "No development actor matches",
  "DebugHarness",
  "127.0.0.1:56473",
];
const machO = (data) =>
  data.length > 4 &&
  [0xfeedfacf, 0xcffaedfe, 0xcafebabe, 0xbebafeca].includes(
    data.readUInt32BE(0),
  );
function* files(path) {
  if (statSync(path).isDirectory())
    for (const entry of readdirSync(path)) yield* files(join(path, entry));
  else yield path;
}
/** The bytes the scan reads: every Mach-O file of a bundle, or an APK's DEX files. */
function binaries(app) {
  if (app.endsWith(".apk"))
    return execFileSync("unzip", ["-Z1", app], { encoding: "utf8" })
      .split("\n")
      .filter((name) => /^classes\d*\.dex$/u.test(name))
      .map((name) =>
        execFileSync("unzip", ["-p", app, name], { maxBuffer: 256 << 20 }),
      );
  return [...files(app)].map((f) => readFileSync(f)).filter(machO);
}
const count = (data, marker) => {
  let n = 0;
  for (
    let at = data.indexOf(marker);
    at !== -1;
    at = data.indexOf(marker, at + 1)
  )
    n += 1;
  return n;
};

let failures = 0;
for (const arg of process.argv.slice(2)) {
  const [kind, app] = arg.split(/=(.*)/su);
  if (!["debug", "release"].includes(kind) || !app)
    throw new Error("Pass debug=<app> or release=<app>.");
  const scanned = binaries(app);
  const found = Object.fromEntries(
    MARKERS.map((m) => [
      m,
      scanned.reduce((sum, data) => sum + count(data, m), 0),
    ]),
  );
  const total = Object.values(found).reduce((a, b) => a + b, 0);
  // A debug build must show the hook (else the scan proves nothing); a release build none of it.
  const ok =
    scanned.length > 0 && (kind === "release" ? total === 0 : total > 0);
  if (!ok) failures += 1;
  console.log(
    `${ok ? "PASS" : "FAIL"} ${kind} ${app}: ${scanned.length} binaries; ${MARKERS.map((m) => `${m} ${found[m]}`).join(", ")}`,
  );
  // E7.6: the development link scheme (qelvora://) is absent from an iOS release build.
  if (!app.endsWith(".apk")) {
    const plist = JSON.parse(
      execFileSync(
        "plutil",
        ["-convert", "json", "-o", "-", join(app, "Info.plist")],
        { encoding: "utf8" },
      ),
    );
    const schemes = (plist.CFBundleURLTypes ?? []).flatMap(
      (t) => t.CFBundleURLSchemes ?? [],
    );
    const custom = schemes.includes("qelvora");
    const fine = kind === "release" ? !custom : true;
    if (!fine) failures += 1;
    console.log(
      `${fine ? "PASS" : "FAIL"} ${kind} URL schemes: ${schemes.join(", ") || "none"}${kind === "release" ? " (qelvora:// must be absent)" : ""}`,
    );
  }
}
console.log(failures ? `\n${failures} app(s) failed` : "\nall apps passed");
process.exit(failures ? 1 : 0);
