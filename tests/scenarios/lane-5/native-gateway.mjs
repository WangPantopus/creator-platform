// Local outer-edge FCM stand-in. Never forwards requests to a real provider.
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";

export function nativeGateway() {
  const accepted = [];
  const delivered = [];
  let online = false;
  let mode = "up";
  let clockOffset = 0;
  const flush = () => {
    for (const item of accepted) {
      if (
        !item.delivered &&
        online &&
        item.expires > Date.now() + clockOffset
      ) {
        item.delivered = true;
        delivered.push(item.message);
      }
    }
  };
  return createServer(async (req, res) => {
    res.setHeader("Content-Type", "application/json");
    if (req.method === "GET" && req.url === "/sent") {
      res.end(JSON.stringify(accepted));
    } else if (req.method === "GET" && req.url === "/delivered") {
      res.end(JSON.stringify(delivered));
    } else if (req.method === "PUT" && req.url === "/online") {
      online = true;
      flush();
      res.end("{}");
    } else if (req.method === "PUT" && req.url === "/offline") {
      online = false;
      res.end("{}");
    } else if (req.method === "PUT" && req.url === "/advance-day") {
      clockOffset += 86400001;
      res.end("{}");
    } else if (
      req.method === "PUT" &&
      ["/up", "/down", "/unknown"].includes(req.url)
    ) {
      mode = req.url.slice(1);
      res.end("{}");
    } else if (req.method === "POST" && req.url === "/fcm") {
      try {
        let body = "";
        for await (const chunk of req) {
          body += chunk;
          if (body.length > 8192) throw new Error("oversize");
        }
        const { message } = JSON.parse(body);
        if (mode === "down") {
          res.statusCode = 503;
          res.setHeader("Retry-After", "60");
          res.end("{}");
          return;
        }
        if (message.token.startsWith("invalid-")) {
          res.statusCode = 404;
          res.end(
            JSON.stringify({
              error: { details: [{ errorCode: "UNREGISTERED" }] },
            }),
          );
          return;
        }
        const ttl = Number(message.android.ttl.replace(/s$/u, ""));
        accepted.push({
          message,
          expires: Date.now() + clockOffset + ttl * 1000,
          delivered: false,
        });
        flush();
        res.end(
          mode === "unknown"
            ? "{}"
            : JSON.stringify({
                name: `projects/lane5/messages/${randomUUID()}`,
              }),
        );
      } catch {
        res.statusCode = 400;
        res.end("{}");
      }
    } else {
      res.statusCode = 404;
      res.end("{}");
    }
  });
}
