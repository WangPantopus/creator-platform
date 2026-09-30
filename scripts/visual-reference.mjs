/** Serves original exported boards/components with the missing canvas runtime restored. */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const esbuild = createRequire(require.resolve("tsx"))("esbuild");
const root = path.resolve(import.meta.dirname, "..");
const runtime = await esbuild.build({
  entryPoints: [path.join(root, "scripts/visual-support.ts")],
  bundle: true,
  write: false,
  platform: "browser",
  define: { "process.env.NODE_ENV": '"production"' },
  nodePaths: [path.join(root, "apps/web/node_modules")],
});
const css =
  fs
    .readFileSync(
      path.join(root, "design/design-system/project/components/bundle.css"),
      "utf8",
    )
    .replace(/@import.*?;\n/, "")
    .replace(
      ".qv-seg a[aria-current] { background: var(--maya-surface); color: var(--on-maya); }",
      ".qv-seg a[aria-current] { background: var(--surface); color: var(--ink); box-shadow: inset 0 0 0 1px var(--line); }",
    )
    .replace(
      ".qv-mode.is-selected { background: var(--maya-surface); color: var(--on-maya); }",
      ".qv-mode.is-selected { background: var(--surface); color: var(--ink); outline: 1px solid var(--ink); outline-offset: -1px; }",
    )
    .replace(
      ".qv-mode.is-selected .qv-mode__meta { color: var(--on-maya-muted); }",
      ".qv-mode.is-selected .qv-mode__meta { color: var(--ink-muted); }",
    )
    .replace(
      ".qv-mode.is-selected .qv-mode__price { color: var(--maya-accent); }",
      ".qv-mode.is-selected .qv-mode__price { color: var(--ink); }",
    )
    .replace(
      ".qv-mode.is-selected input { accent-color: var(--maya-accent); }",
      ".qv-mode.is-selected input { accent-color: var(--ink); }",
    )
    .replace(
      "background: var(--maya-accent); color: var(--on-maya-accent); font-family: var(--font-serif); font-style: italic; line-height: 1;",
      "background: var(--seal-fill, var(--maya-accent)); color: var(--seal-ink, var(--on-maya-accent)); font-family: var(--font-serif); font-style: italic; line-height: 1;",
    ) +
  '\nhtml { color-scheme: light; } html[data-theme="night"] { color-scheme: dark; }\n.qv-on-maya .qv-btn--quiet { color: var(--on-maya); }\n.qv-meta,.qv-author__time,.qv-signed__time,.qv-due,.qv-tag,.qv-countdown,.qv-mode__price,.qv-scope,.qv-call__timer,.qv-step__time { white-space: nowrap; }\n.qv-include__summary { font-family: var(--font-sans); }';
const badgeFix = "\n.qv-badge { white-space: nowrap; }";
const extra = fs
  .readFileSync(path.join(root, "apps/web/app/globals.css"), "utf8")
  .split("html {")[0];
const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  let data,
    type = "text/html";
  if (url.pathname.endsWith("/support.js") || url.pathname === "/support.js") {
    data = runtime.outputFiles[0].contents;
    type = "text/javascript";
  } else if (url.pathname.endsWith("/tokens.css")) {
    data = fs.readFileSync(path.join(root, "packages/tokens/tokens.css"));
    type = "text/css";
  } else if (url.pathname.endsWith("/bundle.css")) {
    data = css + badgeFix + extra;
    type = "text/css";
  } else if (url.pathname.endsWith("/bundle.js")) {
    data = fs
      .readFileSync(
        path.join(root, "design/design-system/project/components/bundle.js"),
        "utf8",
      )
      .replace(
        "h(Button, { variant: 'secondary', block: true }, 'Join Kiln Club · $5 a month')));",
        "h(Button, { variant: 'secondary', block: true }, 'Join Kiln Club · $5 a month')), h(StepIn, { name: name }));",
      );
    type = "text/javascript";
  } else if (url.pathname.startsWith("/fonts/")) {
    const name = path.basename(url.pathname);
    const file = path.join(root, "assets/fonts", name);
    if (fs.existsSync(file)) {
      data = fs.readFileSync(file);
      type = "font/ttf";
    }
  } else if (url.pathname.startsWith("/component/")) {
    const name = path.basename(url.pathname);
    const file = path.join(
      root,
      "design/design-system/project/components",
      name,
      "preview.html",
    );
    if (fs.existsSync(file))
      data = fs
        .readFileSync(file, "utf8")
        .replace(
          "</head>",
          '<script src="/support.js"></script><link rel="stylesheet" href="/tokens.css"><link rel="stylesheet" href="/bundle.css"><script src="/bundle.js"></script></head>',
        );
  } else {
    const file = path.resolve(root, "design", "." + url.pathname);
    if (
      file.startsWith(path.join(root, "design") + path.sep) &&
      fs.existsSync(file) &&
      file.endsWith(".dc.html")
    )
      data = fs
        .readFileSync(file, "utf8")
        .replaceAll(
          "What Maya will see",
          url.searchParams.get("original") === "1"
            ? "What Maya will see"
            : "Included in your request",
        );
  }
  if (data === undefined) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }
  res.writeHead(200, { "Content-Type": type, "Cache-Control": "no-store" });
  res.end(data);
});
server.listen(Number(process.env.REFERENCE_PORT ?? 3101), "127.0.0.1", () =>
  console.log(`Design reference server on ${server.address().port}`),
);
