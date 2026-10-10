// OS links for the opt-in Lane7NavigationFlows XCUITest journey. XCTest's
// open(URL) launches afresh, which cannot prove a link into an already open app.
// This loopback-only helper sends simctl openurl to the lane's own simulator.
// Run beside the harness: node tests/scenarios/lane-7/ios-link-driver.mjs
import http from "node:http";
import { execFileSync } from "node:child_process";

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
  "/threads/c1000000-0000-4000-8000-000000000002/f1000000-0000-4000-8000-000000000001",
  "/creators/maya",
  "/support",
  "/identity/account",
  "/admin",
]);
const server = http.createServer(async (request, response) => {
  try {
    if (request.method !== "POST" || request.url !== "/link")
      throw new Error("Only POST /link is supported.");
    let body = "";
    for await (const chunk of request) {
      body += chunk;
      if (body.length > 512) throw new Error("Body too large.");
    }
    const { path } = JSON.parse(body);
    if (!paths.has(path)) throw new Error("Path is not a lane 7 scenario.");
    execFileSync("xcrun", [
      "simctl",
      "openurl",
      device.udid,
      `qelvora://app${path}`,
    ]);
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ opened: path }));
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
