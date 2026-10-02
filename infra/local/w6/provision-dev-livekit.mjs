import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

// Only the operator's private disposable development directory receives keys.
const directory = process.argv[2];
if (
  process.env.NODE_ENV !== "development" ||
  !directory ||
  !path.isAbsolute(directory)
)
  throw new Error(
    "Explicit development and a new absolute private directory are required.",
  );
await mkdir(directory, { mode: 0o700 });
const apiKey = `W6${randomBytes(12).toString("hex")}`;
const apiSecret = randomBytes(32).toString("base64url");
const secrets = path.join(directory, "operator-credentials.json");
const config = path.join(directory, "server.yaml");
await writeFile(secrets, JSON.stringify({ apiKey, apiSecret }), {
  flag: "wx",
  mode: 0o600,
});
await writeFile(
  config,
  `port: 7886
bind_addresses: ["0.0.0.0"]
rtc:
  node_ip: 127.0.0.1
  use_external_ip: false
  tcp_port: 7887
  udp_port: 7888
keys:
  ${apiKey}: ${apiSecret}
webhook:
  api_key: ${apiKey}
  urls: ["http://host.docker.internal:3106/provider-webhook"]
logging:
  level: info
`,
  { flag: "wx", mode: 0o600 },
);
await writeFile(
  path.join(directory, "configuration.json"),
  JSON.stringify({
    qualification:
      "self-hosted transport development; no canonical paid-call acceptance",
    image:
      "livekit/livekit-server:v1.13.7@sha256:6fd3b7088874c4d119160dd688798dfec852bc014786d392caad15f6f63912a3",
    container: "creator-platform-w6-livekit-20261002",
    config,
    secrets,
    apiURL: "http://127.0.0.1:7886",
    websocketURL: "ws://127.0.0.1:7886",
  }),
  { flag: "wx", mode: 0o600 },
);
console.log(
  JSON.stringify({ directory, config, generated: true, developmentOnly: true }),
);
