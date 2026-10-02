import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import {
  mkdir,
  readFile,
  rmdir,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import { constants, tmpdir } from "node:os";
import path from "node:path";

// Usage: node scripts/with-heavy-build-lock.mjs --owner W1 -- xcodebuild ...
const args = process.argv.slice(2);
if (
  args[0] !== "--owner" ||
  !/^[A-Za-z0-9][A-Za-z0-9 .:_/-]{0,159}$/u.test(args[1] ?? "") ||
  args[2] !== "--" ||
  !args[3]
) {
  console.error(
    "Usage: with-heavy-build-lock.mjs --owner <stream> -- <command> [args]",
  );
  process.exit(64);
}
const lock = path.join(
  process.platform === "darwin" ? "/private/tmp" : tmpdir(),
  "creator-platform-heavy-build.lock",
);
try {
  await mkdir(lock, { mode: 0o700 });
} catch (error) {
  if (error.code === "EEXIST") {
    console.error(
      "Heavy build slot is occupied; no owner file or build was changed.",
    );
    process.exit(75);
  }
  throw error;
}
const identity = await stat(lock);
const ownerPath = path.join(lock, "owner");
const owner = `${args[1]} ${randomUUID()} ${new Date().toISOString()}\n`;
let ownsFile = false;
try {
  await writeFile(ownerPath, owner, { flag: "wx", mode: 0o600 });
  ownsFile = true;
  console.error(`Heavy build slot acquired by ${args[1]}.`);
  const child = spawn(args[3], args.slice(4), {
    stdio: "inherit",
    shell: false,
  });
  const forward = (signal) => () => child.kill(signal);
  const interrupt = forward("SIGINT");
  const terminate = forward("SIGTERM");
  process.on("SIGINT", interrupt);
  process.on("SIGTERM", terminate);
  try {
    const result = await new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("close", (code, signal) => resolve({ code, signal }));
    });
    process.exitCode =
      result.code ?? 128 + (constants.signals[result.signal] ?? 1);
  } finally {
    process.off("SIGINT", interrupt);
    process.off("SIGTERM", terminate);
  }
} finally {
  try {
    const current = await stat(lock);
    if (
      current.dev !== identity.dev ||
      current.ino !== identity.ino ||
      !ownsFile ||
      (await readFile(ownerPath, "utf8")) !== owner
    ) {
      console.error(
        "Heavy build custody changed; lock retained for its owner.",
      );
    } else {
      await unlink(ownerPath);
      await rmdir(lock);
      console.error("Heavy build slot released.");
    }
  } catch (error) {
    console.error(
      `Heavy build custody requires review (${error.code ?? "unknown"}); lock retained.`,
    );
  }
}
