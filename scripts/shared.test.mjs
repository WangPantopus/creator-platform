import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
test("one rename updates native identifiers, package scopes and UI names while preserving Pantopus and binary assets", () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "creator-brand-test-"));
  try {
    fs.mkdirSync(path.join(temp, "scripts"));
    fs.mkdirSync(path.join(temp, "config"));
    fs.mkdirSync(path.join(temp, "apps/qelvora"), { recursive: true });
    fs.copyFileSync(
      path.join(root, "scripts/rename-brand.mjs"),
      path.join(temp, "scripts/rename-brand.mjs"),
    );
    fs.copyFileSync(
      path.join(root, "config/brand.json"),
      path.join(temp, "config/brand.json"),
    );
    const brand = JSON.parse(
      fs.readFileSync(path.join(root, "config/brand.json"), "utf8"),
    );
    fs.writeFileSync(
      path.join(temp, "README.md"),
      `${brand.name} Studio · Continue with Pantopus · @${brand.slug}/api · ${brand.environmentPrefix}_API_URL`,
    );
    fs.writeFileSync(
      path.join(temp, "apps/qelvora/Qelvora.swift"),
      `enum ${brand.name}API { let bundle = "com.pantopus.${brand.slug}" }`,
    );
    const binary = Buffer.from([0, 81, 101, 108, 118, 111, 114, 97]);
    fs.writeFileSync(path.join(temp, "font.ttf"), binary);
    execFileSync("git", ["init", "-q"], { cwd: temp });
    execFileSync(
      process.execPath,
      ["scripts/rename-brand.mjs", "Replacetest", "--dry-run"],
      { cwd: temp },
    );
    assert.match(
      fs.readFileSync(path.join(temp, "README.md"), "utf8"),
      new RegExp(brand.name),
    );
    execFileSync(
      process.execPath,
      ["scripts/rename-brand.mjs", "Replacetest"],
      { cwd: temp },
    );
    assert.equal(
      fs.readFileSync(path.join(temp, "README.md"), "utf8"),
      "Replacetest Studio · Continue with Pantopus · @replacetest/api · REPLACETEST_API_URL",
    );
    assert.match(
      fs.readFileSync(
        path.join(temp, "apps/replacetest/Replacetest.swift"),
        "utf8",
      ),
      /com\.pantopus\.replacetest/,
    );
    assert.deepEqual(fs.readFileSync(path.join(temp, "font.ttf")), binary);
    assert.equal(
      JSON.parse(fs.readFileSync(path.join(temp, "config/brand.json"), "utf8"))
        .name,
      "Replacetest",
    );
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test("all fixed copy and both themes exist in generated web, Swift and Kotlin resources", () => {
  const copy = JSON.parse(
    fs.readFileSync(path.join(root, "config/copy.json"), "utf8"),
  );
  const swift = fs.readFileSync(
    path.join(root, "apps/ios/Sources/Generated/QelvoraCopy.swift"),
    "utf8",
  );
  const kotlin = fs.readFileSync(
    path.join(
      root,
      "apps/android/app/src/main/java/com/pantopus/qelvora/generated/QelvoraCopy.kt",
    ),
    "utf8",
  );
  for (const key of Object.keys(copy)) {
    assert.ok(swift.includes(`"${key}"`), `Swift is missing ${key}`);
    assert.ok(kotlin.includes(`"${key}"`), `Kotlin is missing ${key}`);
  }
  const css = fs.readFileSync(
    path.join(root, "packages/tokens/tokens.css"),
    "utf8",
  );
  assert.match(css, /\[data-theme="night"\]/);
  assert.match(css, /--maya-surface: #EDE3D3/);
  assert.match(css, /--seal-fill: #E89A6E/);
  execFileSync(process.execPath, ["scripts/generate-shared.mjs", "--check"], {
    cwd: root,
  });
  execFileSync(
    process.execPath,
    ["scripts/generate-native-api.mjs", "--check"],
    { cwd: root },
  );
});
