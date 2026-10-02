import { execFileSync } from "node:child_process";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// An opt-in operational UI project. The canonical application, package,
// settings and schemes come directly from the installed XcodeGen's dump.
// No canonical target or application source is edited.
const directory = process.argv[2];
const repository = fileURLToPath(new URL("../../../", import.meta.url));
const relative = directory ? path.relative(repository, directory) : "";
if (
  !directory ||
  !path.isAbsolute(directory) ||
  !(
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  )
)
  throw new Error(
    "Choose a new absolute private directory outside the repository.",
  );
const ios = path.join(repository, "apps/ios");
await mkdir(directory, { mode: 0o700 });
const canonicalPath = path.join(directory, "canonical-project.json");
execFileSync(
  "xcodegen",
  [
    "dump",
    "--quiet",
    "--no-env",
    "--type",
    "json",
    "--spec",
    path.join(ios, "project.yml"),
    "--file",
    canonicalPath,
  ],
  { stdio: "inherit" },
);
await chmod(canonicalPath, 0o600);
const spec = JSON.parse(await readFile(canonicalPath, "utf8"));
if (
  Object.keys(spec.targets).length !== 2 ||
  spec.targets.QelvoraApp?.type !== "application" ||
  spec.targets.QelvoraUITests?.type !== "bundle.ui-testing" ||
  spec.packages.QelvoraNative?.path !== "."
)
  throw new Error(
    "Review the changed canonical iOS project before adapting this driver.",
  );
spec.name = "W6RuntimeJourney";
spec.packages.QelvoraNative.path = ios;
spec.targets.QelvoraApp.sources = spec.targets.QelvoraApp.sources.map(
  (entry) => {
    const source = typeof entry === "string" ? { path: entry } : entry;
    return {
      ...source,
      path: path.resolve(ios, source.path),
      excludes: [...(source.excludes ?? []), "Info.plist"],
    };
  },
);
spec.targets.QelvoraApp.info.path = path.join(directory, "Info.plist");
spec.targets.QelvoraUITests.sources = [
  fileURLToPath(new URL("ios-runtime/", import.meta.url)),
];
const specPath = path.join(directory, "project.json");
await writeFile(specPath, JSON.stringify(spec, null, 2) + "\n", {
  mode: 0o600,
});
console.log(specPath);
