// A loopback proxy in front of lane 7's real API that holds chosen responses,
// so an app's routine session check finishes while a command is in flight (the
// race D6R needs). The API still answers at once; only the reply waits. Not a
// mock: every request reaches the real backend unchanged.
//   node tests/scenarios/lane-7/delay-proxy.mjs [--listen 56476] [--target 56471]
//     [--hold "POST /v1/trust/privacy/jobs"] [--ms 9000]
import http from "node:http";
import net from "node:net";

const args = process.argv.slice(2);
const flag = (name, fallback) =>
  args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const listen = Number(flag("--listen", "56476"));
const target = Number(flag("--target", "56471"));
const [holdMethod, holdPath] = flag(
  "--hold",
  "POST /v1/trust/privacy/jobs",
).split(" ");
const ms = Number(flag("--ms", "9000"));
const sleep = (wait) => new Promise((resolve) => setTimeout(resolve, wait));

const server = http.createServer((req, res) => {
  const held =
    req.method === holdMethod &&
    new URL(req.url, "http://proxy").pathname === holdPath;
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
      if (held) {
        // Timestamps only: never a header, token or body.
        console.log(
          `${new Date().toISOString()} answered ${req.method} ${holdPath} ${reply.statusCode}; holding ${ms} ms`,
        );
        await sleep(ms);
        console.log(
          `${new Date().toISOString()} released ${req.method} ${holdPath}`,
        );
      }
      res.writeHead(reply.statusCode, {
        ...reply.headers,
        connection: "close",
      });
      res.end(Buffer.concat(chunks));
    },
  );
  upstream.on("error", () => {
    res.writeHead(502, { connection: "close" });
    res.end();
  });
  req.pipe(upstream);
});
// The live thread connection passes straight through.
server.on("upgrade", (req, socket, head) => {
  const upstream = net.connect(target, "127.0.0.1", () => {
    const lines = [`${req.method} ${req.url} HTTP/1.1`];
    for (let i = 0; i < req.rawHeaders.length; i += 2)
      lines.push(`${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}`);
    upstream.write(lines.join("\r\n") + "\r\n\r\n");
    if (head.length) upstream.write(head);
    socket.pipe(upstream).pipe(socket);
  });
  const close = () => {
    socket.destroy();
    upstream.destroy();
  };
  upstream.on("error", close);
  socket.on("error", close);
});
server.listen(listen, "127.0.0.1", () =>
  console.log(
    `lane 7 delay proxy ${listen} -> ${target}, holding ${holdMethod} ${holdPath} for ${ms} ms`,
  ),
);
