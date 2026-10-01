// Run inside the built Trust image. Inventory installed bytes, without fetching
// dependencies, changing the image, reading secrets or treating a pnpm store as
// npm's installed dependency tree. This is an unsigned installed inventory.
import { existsSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { dirname, join, relative } from "node:path";

const root = "/opt/app";
const [revision, digest] = process.argv.slice(2);
if (!/^[a-f0-9]{40}$/.test(revision ?? ""))
  throw new Error("An exact source commit is required.");
if (!/^sha256:[a-f0-9]{64}$/.test(digest ?? ""))
  throw new Error("An exact image digest is required.");
const properties = (values) =>
  Object.entries(values).map(([name, value]) => ({ name, value }));
const npmPurl = (name, version) =>
  `pkg:npm/${name.split("/").map(encodeURIComponent).join("/")}@${encodeURIComponent(version)}`;
const installed = new Map();
const modules = join(root, "node_modules/.pnpm");
const addPackage = (path) => {
  const real = realpathSync(path);
  if (installed.has(real)) return;
  const manifest = join(real, "package.json");
  if (!existsSync(manifest)) return;
  const bytes = readFileSync(manifest);
  const pkg = JSON.parse(bytes.toString("utf8"));
  if (typeof pkg.name !== "string" || typeof pkg.version !== "string")
    throw new Error("Installed package identity is unavailable.");
  const ref = `npm:${relative(root, real)}`;
  const component = {
    type: "library",
    "bom-ref": ref,
    name: pkg.name,
    version: pkg.version,
    purl: npmPurl(pkg.name, pkg.version),
    properties: properties({
      "w8:installed-path": relative(root, real),
      "w8:package-manifest-sha256": createHash("sha256")
        .update(bytes)
        .digest("hex"),
    }),
  };
  const license =
    typeof pkg.license === "string" ? pkg.license : pkg.license?.type;
  if (typeof license === "string")
    component.licenses = [{ license: { name: license } }];
  installed.set(real, { pkg, ref, component });
};
const scanModules = (path) => {
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const candidate = join(path, entry.name);
    if (entry.name.startsWith("@")) {
      for (const child of readdirSync(candidate))
        addPackage(join(candidate, child));
    } else addPackage(candidate);
  }
};
for (const entry of readdirSync(modules, { withFileTypes: true })) {
  if (!entry.isDirectory() || entry.name === "node_modules") continue;
  const path = join(modules, entry.name, "node_modules");
  if (existsSync(path)) scanModules(path);
}
scanModules(join(root, "node_modules"));

const resolveInstalled = (from, name) => {
  let path = from;
  while (path === root || path.startsWith(root + "/")) {
    const candidate = join(path, "node_modules", name);
    if (existsSync(join(candidate, "package.json")))
      return installed.get(realpathSync(candidate));
    if (path === root) break;
    path = dirname(path);
  }
};
const edges = (from, pkg) => {
  const optional = new Set(Object.keys(pkg.optionalDependencies ?? {}));
  const dependencies = {
    ...pkg.dependencies,
    ...pkg.peerDependencies,
    ...pkg.optionalDependencies,
  };
  const result = new Set();
  for (const name of Object.keys(dependencies)) {
    const resolved = resolveInstalled(from, name);
    if (resolved) result.add(resolved.ref);
    else if (!optional.has(name) && !pkg.peerDependenciesMeta?.[name]?.optional)
      throw new Error(`Installed dependency unavailable: ${pkg.name}/${name}`);
  }
  return [...result].sort();
};
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const ref = "trust-runtime";
const components = [...installed.values()].map((row) => row.component);
const dependencies = [{ ref, dependsOn: edges(root, pkg) }];
for (const [path, row] of installed)
  dependencies.push({ ref: row.ref, dependsOn: edges(path, row.pkg) });

const os = Object.fromEntries(
  readFileSync("/etc/os-release", "utf8")
    .split("\n")
    .filter((line) => /^[A-Z_]+=/.test(line))
    .map((line) => {
      const index = line.indexOf("=");
      return [
        line.slice(0, index),
        line.slice(index + 1).replace(/^"|"$/g, ""),
      ];
    }),
);
const packages = execFileSync(
  "dpkg-query",
  ["-W", "-f=${Package}\t${Version}\t${Architecture}\t${db:Status-Status}\n"],
  { encoding: "utf8" },
);
for (const line of packages.trim().split("\n")) {
  const [name, version, arch, state] = line.split("\t");
  if (state !== "installed") continue;
  components.push({
    type: "library",
    "bom-ref": `deb:${name}:${arch}`,
    name,
    version,
    purl: `pkg:deb/${os.ID}/${encodeURIComponent(name)}@${encodeURIComponent(version)}?arch=${encodeURIComponent(arch)}&distro=${os.ID}-${os.VERSION_ID}`,
  });
}
components.sort((a, b) => a["bom-ref"].localeCompare(b["bom-ref"]));
dependencies.sort((a, b) => a.ref.localeCompare(b.ref));
process.stdout.write(
  JSON.stringify(
    {
      $schema: "http://cyclonedx.org/schema/bom-1.5.schema.json",
      bomFormat: "CycloneDX",
      specVersion: "1.5",
      serialNumber: `urn:uuid:${randomUUID()}`,
      version: 1,
      metadata: {
        timestamp: new Date().toISOString(),
        lifecycles: [{ phase: "operations" }],
        component: {
          type: "application",
          "bom-ref": ref,
          name: pkg.name,
          version: pkg.version,
          properties: properties({
            "w8:source-commit": revision,
            "w8:image-digest": digest,
            "w8:node-version": process.version,
            "w8:inventory-scope":
              "Installed application node_modules and dpkg packages",
            "w8:limitations":
              "Unsigned inventory; Node/npm upstream embedded dependencies, dynamically mounted integrations and remote services require their own SBOM. No vulnerability or license approval is inferred. Package hashes cover manifest bytes only.",
          }),
        },
      },
      components,
      dependencies,
    },
    null,
    2,
  ) + "\n",
);
