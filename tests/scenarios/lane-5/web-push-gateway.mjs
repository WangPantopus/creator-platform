// Browser subscription and push service at the outer edge. Keys are ephemeral
// development fixtures, persisted only for restart checks and never printed.
import { createServer } from "node:http";
import { createECDH, createPublicKey, randomBytes, verify } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(
  new URL("../../../apps/backend/package.json", import.meta.url),
);
const webpush = require("web-push");
const ece = createRequire(require.resolve("web-push"))("http_ece");
const fixtureFile = "/tmp/qelvora-lane5-web-push-development.json";
export function webPushGateway() {
  const fixture = existsSync(fixtureFile)
    ? JSON.parse(readFileSync(fixtureFile, "utf8"))
    : { vapid: webpush.generateVAPIDKeys(), browsers: {} };
  const save = () =>
    writeFileSync(fixtureFile, JSON.stringify(fixture), { mode: 0o600 });
  save();
  const sent = [];
  let mode = "up";
  const server = createServer(async (req, res) => {
    res.setHeader("Content-Type", "application/json");
    const subscription = /^\/subscription\/([a-z]+)$/u.exec(req.url ?? "");
    const submit = /^\/wp\/lane5-([a-z]+)$/u.exec(req.url ?? "");
    if (req.method === "GET" && subscription) {
      const name = subscription[1];
      if (!fixture.browsers[name]) {
        const key = createECDH("prime256v1");
        key.generateKeys();
        fixture.browsers[name] = {
          privateKey: key.getPrivateKey().toString("base64url"),
          auth: randomBytes(16).toString("base64url"),
          publicKey: key.getPublicKey().toString("base64url"),
        };
        save();
      }
      const browser = fixture.browsers[name];
      res.end(
        JSON.stringify({
          endpoint: `https://fcm.googleapis.com/wp/lane5-${name}`,
          expirationTime: null,
          keys: { p256dh: browser.publicKey, auth: browser.auth },
        }),
      );
    } else if (req.method === "GET" && req.url === "/sent") {
      res.end(JSON.stringify(sent));
    } else if (
      req.method === "PUT" &&
      ["/up", "/down", "/unknown"].includes(req.url)
    ) {
      mode = req.url.slice(1);
      res.end("{}");
    } else if (req.method === "POST" && submit) {
      try {
        const chunks = [];
        let length = 0;
        for await (const chunk of req) {
          length += chunk.length;
          if (length > 4096) throw new Error("oversize");
          chunks.push(chunk);
        }
        const body = Buffer.concat(chunks);
        const name = submit[1];
        const browser = fixture.browsers[name];
        const auth = /^vapid t=([^, ]+), k=([A-Za-z0-9_-]+)$/u.exec(
          req.headers.authorization ?? "",
        );
        if (!browser || !auth || auth[2] !== fixture.vapid.publicKey)
          throw new Error("bad VAPID key");
        const [header, payload, signature] = auth[1].split(".");
        const claims = JSON.parse(Buffer.from(payload, "base64url").toString());
        const publicBytes = Buffer.from(auth[2], "base64url");
        const key = createPublicKey({
          format: "jwk",
          key: {
            kty: "EC",
            crv: "P-256",
            x: publicBytes.subarray(1, 33).toString("base64url"),
            y: publicBytes.subarray(33).toString("base64url"),
          },
        });
        if (
          !verify(
            "sha256",
            Buffer.from(`${header}.${payload}`),
            { key, dsaEncoding: "ieee-p1363" },
            Buffer.from(signature, "base64url"),
          ) ||
          claims.aud !== "https://fcm.googleapis.com" ||
          claims.exp <= Date.now() / 1000 ||
          claims.sub !== "mailto:lane5@qelvora.test"
        )
          throw new Error("bad VAPID signature or claims");
        const receiver = createECDH("prime256v1");
        receiver.setPrivateKey(Buffer.from(browser.privateKey, "base64url"));
        const plain = ece.decrypt(body, {
          version: "aes128gcm",
          privateKey: receiver,
          authSecret: Buffer.from(browser.auth, "base64url"),
        });
        const data = JSON.parse(plain.toString());
        if (
          Object.keys(data).join() !== "notificationId" ||
          req.headers["content-encoding"] !== "aes128gcm" ||
          req.headers.ttl !== "86400"
        )
          throw new Error("bad encrypted payload");
        if (mode === "down") {
          res.statusCode = 503;
          res.setHeader("Retry-After", "60");
          res.end("{}");
          return;
        }
        if (name === "invalid") {
          res.statusCode = 410;
          res.end("{}");
          return;
        }
        sent.push({
          browser: name,
          notificationId: data.notificationId,
          encrypted: !body.includes(Buffer.from(data.notificationId)),
          vapidVerified: true,
          ttl: req.headers.ttl,
        });
        res.statusCode = mode === "unknown" ? 202 : 201;
        res.end("{}");
      } catch {
        res.statusCode = 400;
        res.end(JSON.stringify({ error: "local_gateway_validation_failed" }));
      }
    } else {
      res.statusCode = 404;
      res.end("{}");
    }
  });
  return {
    server,
    configuration: {
      subject: "mailto:lane5@qelvora.test",
      ...fixture.vapid,
      fetch: async (url, init) => {
        if (
          !/^https:\/\/fcm\.googleapis\.com\/wp\/lane5-[a-z]+$/u.test(
            String(url),
          )
        )
          throw new Error("Unexpected gateway endpoint.");
        return fetch(`http://127.0.0.1:56453${new URL(url).pathname}`, init);
      },
    },
  };
}
