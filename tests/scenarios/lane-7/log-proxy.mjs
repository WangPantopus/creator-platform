// A loopback proxy in front of lane 7's real API that logs what passes, for a
// scenario that keeps driving a device while it watches: every answer's
// method, path and status, each live-connection upgrade, each data frame the
// server sends (that it came, not what it holds) and each close frame (its
// code and reason). It never logs a header, a token or a body. It runs as its own process, so a scenario's blocking device calls
// (screenshots, adb, XCUITest) never hold the app's requests. Not a mock:
// every request reaches the real backend unchanged.
// GET /__proxy/log returns the entries; the app never asks for that path.
//   node tests/scenarios/lane-7/log-proxy.mjs --listen 57907 --target 57901
import http from "node:http";
import net from "node:net";

const args = process.argv.slice(2);
const flag = (name) => Number(args[args.indexOf(name) + 1]);
const listen = flag("--listen");
const target = flag("--target");
const entries = [];
const log = (entry) => entries.push({ at: Date.now(), ...entry });

const server = http.createServer((req, res) => {
  const path = new URL(req.url, "http://proxy").pathname;
  if (path === "/__proxy/log") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(entries));
    return;
  }
  const upstream = http.request(
    {
      host: "127.0.0.1",
      port: target,
      method: req.method,
      path: req.url,
      headers: { ...req.headers, host: `127.0.0.1:${target}` },
    },
    async (reply) => {
      const chunks = [];
      for await (const chunk of reply) chunks.push(chunk);
      log({ method: req.method, path, status: reply.statusCode });
      // Connection: close, as lane 7's other proxies (follow-up 12).
      res.writeHead(reply.statusCode, {
        ...reply.headers,
        connection: "close",
      });
      res.end(Buffer.concat(chunks));
    },
  );
  upstream.on("error", () => {
    log({ method: req.method, path, status: 502 });
    res.writeHead(502, { connection: "close" });
    res.end();
  });
  req.pipe(upstream);
});
// The live connection: the upgrade's answer, then the server's frames, read
// only for a close frame's code and reason (a server's frames are unmasked).
server.on("upgrade", (req, socket, head) => {
  const path = new URL(req.url, "http://proxy").pathname;
  let pending = Buffer.alloc(0);
  let upgraded = false;
  const read = (chunk) => {
    pending = Buffer.concat([pending, chunk]);
    if (!upgraded) {
      const end = pending.indexOf("\r\n\r\n");
      if (end < 0) return;
      const status = Number(
        /^HTTP\/1\.1 (\d+)/u.exec(pending.toString("latin1"))?.[1] ?? 0,
      );
      log({ method: "WS", path, status });
      upgraded = true;
      pending = pending.subarray(end + 4);
    }
    for (;;) {
      if (pending.length < 2) return;
      let length = pending[1] & 127;
      let offset = 2;
      if (length === 126) {
        if (pending.length < 4) return;
        length = pending.readUInt16BE(2);
        offset = 4;
      } else if (length === 127) {
        if (pending.length < 10) return;
        length = Number(pending.readBigUInt64BE(2));
        offset = 10;
      }
      if (pending.length < offset + length) return;
      const payload = pending.subarray(offset, offset + length);
      // A data frame is logged by its arrival only, never its content.
      if ((pending[0] & 15) === 1) log({ method: "FRAME", path, status: 0 });
      if ((pending[0] & 15) === 8 && payload.length >= 2)
        log({
          method: "CLOSE",
          path,
          status: payload.readUInt16BE(0),
          reason: payload.subarray(2).toString(),
        });
      pending = pending.subarray(offset + length);
    }
  };
  const upstream = net.connect(target, "127.0.0.1", () => {
    const lines = [`${req.method} ${req.url} HTTP/1.1`];
    for (let i = 0; i < req.rawHeaders.length; i += 2)
      lines.push(`${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}`);
    upstream.write(lines.join("\r\n") + "\r\n\r\n");
    if (head.length) upstream.write(head);
    socket.pipe(upstream);
    upstream.on("data", (chunk) => {
      read(chunk);
      socket.write(chunk);
    });
    upstream.on("end", () => socket.end());
  });
  const close = () => {
    socket.destroy();
    upstream.destroy();
  };
  upstream.on("error", close);
  socket.on("error", close);
});
server.listen(listen, "127.0.0.1", () =>
  console.log(`log proxy on 127.0.0.1:${listen} for 127.0.0.1:${target}`),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => process.exit(0));
