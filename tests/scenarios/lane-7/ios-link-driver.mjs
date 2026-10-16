// OS links for the opt-in Lane7NavigationFlows XCUITest journey. XCTest's
// open(URL) launches afresh, which cannot prove a link into an already open app.
// This loopback-only helper sends simctl openurl to the lane's own simulator.
// Run beside the harness: node tests/scenarios/lane-7/ios-link-driver.mjs
import http from "node:http";
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const devices = JSON.parse(
  execFileSync("xcrun", ["simctl", "list", "devices", "--json"], {
    encoding: "utf8",
  }),
).devices;
const device = Object.values(devices)
  .flat()
  .find((value) => value.name === "qelvora-lane7-ios");
if (!device || device.state !== "Booted")
  throw new Error("Boot qelvora-lane7-ios before starting the link driver.");
const paths = new Set([
  "/threads/c1000000-0000-4000-8000-000000000001/f1000000-0000-4000-8000-000000000001",
  "/threads/c1000000-0000-4000-8000-000000000002/f1000000-0000-4000-8000-000000000001",
  "/creators/maya",
  "/support",
  "/support/privacy",
  "/identity/account",
  "/admin",
]);
const server = http.createServer(async (request, response) => {
  try {
    if (
      request.method !== "POST" ||
      !["/link", "/storage", "/content-size"].includes(request.url)
    )
      throw new Error("Only lane 7 scenario controls are supported.");
    let body = "";
    for await (const chunk of request) {
      body += chunk;
      if (body.length > 8192) throw new Error("Body too large.");
    }
    const input = JSON.parse(body);
    let result;
    if (request.url === "/storage") {
      // Inspect only this feature's ciphertext, never Keychain or credentials.
      const container = execFileSync(
        "xcrun",
        [
          "simctl",
          "get_app_container",
          device.udid,
          "com.pantopus.qelvora",
          "data",
        ],
        { encoding: "utf8" },
      ).trim();
      const directory = join(
        container,
        "Library/Application Support/com.pantopus.qelvora.conversation-drafts",
      );
      const files = existsSync(directory) ? readdirSync(directory) : [];
      if (files.some((file) => !/^[0-9a-f]{64}\.enc$/u.test(file)))
        throw new Error("Unexpected draft file.");
      const records = files.map((file) => readFileSync(join(directory, file)));
      let excludedFromBackup = false;
      if (existsSync(directory)) {
        try {
          excludedFromBackup =
            execFileSync(
              "xattr",
              [
                "-p",
                "com.apple.metadata:com_apple_backup_excludeItem",
                directory,
              ],
              { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
            ).trim().length > 0;
        } catch {
          /* Report the platform attribute accurately. */
        }
      }
      result = {
        count: records.length,
        sizes: records.map((data) => data.length),
        plaintextFound: records.some((data) =>
          (input.markers ?? []).some((marker) =>
            data.includes(Buffer.from(marker)),
          ),
        ),
        excludedFromBackup,
      };
    } else if (request.url === "/content-size") {
      if (
        !["large", "accessibility-extra-extra-extra-large"].includes(input.size)
      )
        throw new Error("Not a lane 7 text size.");
      execFileSync("xcrun", [
        "simctl",
        "ui",
        device.udid,
        "content_size",
        input.size,
      ]);
      result = {
        size: execFileSync(
          "xcrun",
          ["simctl", "ui", device.udid, "content_size"],
          { encoding: "utf8" },
        ).trim(),
      };
    } else {
      const { path } = input;
      if (!paths.has(path)) throw new Error("Path is not a lane 7 scenario.");
      execFileSync("xcrun", [
        "simctl",
        "openurl",
        device.udid,
        `qelvora://app${path}`,
      ]);
      result = { opened: path };
    }
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify(result));
  } catch (error) {
    response.writeHead(400, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: error.message }));
  }
});
server.listen(56475, "127.0.0.1", () =>
  console.log("lane 7 iOS link driver: 56475"),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => server.close(() => process.exit(0)));
