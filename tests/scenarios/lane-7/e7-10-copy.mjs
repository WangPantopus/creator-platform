// E7.10 (WP 7.10): the phone apps show no literal user-facing text, every copy key they use
// exists, and that copy has none of the forbidden words (Brief section 11).
// Usage: node tests/scenarios/lane-7/e7-10-copy.mjs   (one line per check; exit 1 on a finding)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const copy = JSON.parse(
  fs.readFileSync(path.join(root, "config/copy.json"), "utf8"),
);
const walk = (dir, ext) =>
  fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((e) =>
      e.isDirectory()
        ? walk(path.join(dir, e.name), ext)
        : e.name.endsWith(ext)
          ? [path.join(dir, e.name)]
          : [],
    );
// Generated code, the debug-only harness and the design catalog (debug-only sample content) are not product text.
const files = [
  ...walk(path.join(root, "apps/ios/Sources/QelvoraUI"), ".swift"),
  ...walk(path.join(root, "apps/ios/App"), ".swift"),
  ...walk(path.join(root, "apps/android/app/src/main/java"), ".kt"),
].filter(
  (f) =>
    !/\/generated\/|\/Generated\/|DebugHarness\.swift$|ComponentPreview\.(swift|kt)$|Catalog\.(swift|kt)$/.test(
      f,
    ),
);

// String literals with their interpolations ({0}, {1}), outside comments.
function literals(src, swift) {
  const out = [];
  let i = 0;
  const comment = () => {
    if (src.startsWith("//", i)) {
      const e = src.indexOf("\n", i);
      i = e < 0 ? src.length : e;
      return true;
    }
    if (!src.startsWith("/*", i)) return false;
    for (let depth = 0; i < src.length; ) {
      if (src.startsWith("/*", i)) {
        depth++;
        i += 2;
      } else if (src.startsWith("*/", i)) {
        i += 2;
        if (--depth === 0) break;
      } else i++;
    }
    return true;
  };
  const char = () => {
    i++;
    while (i < src.length && src[i] !== "'") i += src[i] === "\\" ? 2 : 1;
    i++;
  };
  const expr = (close) => {
    for (let depth = 0; i < src.length; ) {
      if (comment()) continue;
      const c = src[i];
      if (c === '"' || (swift && c === "#" && src[i + 1] === '"')) {
        string();
        continue;
      }
      if (!swift && c === "'") {
        char();
        continue;
      }
      if ("({[".includes(c)) depth++;
      if (")}]".includes(c)) {
        if (depth === 0 && c === close) return;
        depth--;
      }
      i++;
    }
  };
  function string() {
    const start = i;
    let hashes = 0;
    while (swift && src[i] === "#") {
      hashes++;
      i++;
    }
    const quote = src.startsWith('"""', i) ? '"""' : '"';
    i += quote.length;
    const closer = quote + "#".repeat(hashes),
      escape = "\\" + "#".repeat(hashes);
    let text = "",
      n = 0;
    while (i < src.length && !src.startsWith(closer, i)) {
      if (swift && src.startsWith(escape + "(", i)) {
        i += escape.length + 1;
        expr(")");
        i++;
        text += `{${n++}}`;
        continue;
      }
      if (!swift && src.startsWith("${", i)) {
        i += 2;
        expr("}");
        i++;
        text += `{${n++}}`;
        continue;
      }
      if (!swift && src[i] === "$" && /[A-Za-z_]/.test(src[i + 1] ?? "")) {
        i++;
        while (/\w/.test(src[i])) i++;
        text += `{${n++}}`;
        continue;
      }
      if (src.startsWith(swift ? escape : "\\", i)) {
        const k = i + (swift ? escape.length : 1);
        text += { n: "\n", t: "\t" }[src[k]] ?? src[k];
        i = k + 1;
        continue;
      }
      text += src[i++];
    }
    i += closer.length;
    out.push({ start, text });
  }
  while (i < src.length) {
    if (comment()) continue;
    if (
      src[i] === '"' ||
      (swift && src[i] === "#" && /^#+"/.test(src.slice(i, i + 4)))
    )
      string();
    else if (!swift && src[i] === "'") char();
    else i++;
  }
  return out;
}

// Text a person reads: words with a space, a capitalized word, or the identity punctuation.
function reads(t) {
  const plain = t.replace(/\{\d+\}/g, " ").trim();
  if (
    !/[A-Za-z]/.test(plain) ||
    /^[a-z0-9_./:?=&#%@+*~-]+$/.test(plain) ||
    /^https?:/.test(plain)
  )
    return false;
  if (/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$/.test(plain)) return false;
  if (
    /^[A-Z][A-Za-z]*(-[A-Z][A-Za-z]*)+$/.test(plain) ||
    (/[a-z][A-Z]/.test(plain) && !/\s/.test(plain))
  )
    return false;
  return (
    (/\s/.test(plain) && /[A-Za-z]{2}/.test(plain)) ||
    /^[A-Z][a-z]+/.test(plain) ||
    /[…·’]/.test(plain) ||
    /^[A-Z]{2,}$/.test(plain)
  );
}
// Literals that are not user-facing text: protocol values, ids, sample defaults, developer diagnostics.
const allowed = new Set([
  "Maya",
  "Priya",
  "Kiln Club members",
  "1 to 2 days",
  "From Instagram",
  "Monday",
  "V4 DRAFT",
  "DECIDE BY OCT 5",
  "4A Welcome Light",
  "4A Welcome Night",
  "Bearer ",
  "Bearer {0}",
  "Authorization",
  "Accept",
  "DEPRECATION",
  "LOCAL DEVELOPMENT",
  "UPLOADING",
  "QUARANTINED",
  "PROCESSING",
  "READY",
  "REJECTED",
  "XXX",
  "Glyphs",
  "Glyphs.json",
  "Newsreader16pt-Italic",
  "Newsreader16pt-Regular",
  "Expected an actual number.",
  "Missing reply policy",
  "Invalid reply policy",
  "Missing reply limit",
  "Invalid slot",
  "Invalid expiry",
  "Invalid session",
  "Unsupported call action",
  "Call request changed",
  "Call offer view changed",
  "Call media disconnected",
  "Current admission unavailable",
  "Wrong thread channel",
  "Replay required",
  "Generation replay required",
  "Unknown glyph: {0}",
  "Unsupported SVG shape",
  "Unknown text style: {0}",
  "The reference glyph resource is missing or invalid",
  "Unsupported reference glyph element",
  "Reference glyph contains an unrecognized color",
  "Unsupported reference SVG command",
  "missing continuation",
  "Read-only reply export",
  "Unreadable verification response",
  "Conversation request cancelled",
  "Your original account view changed.",
  "Pantopus sign-in is not connected",
  ". If",
  "Answered publicly.",
  "Reconnect with current authority",
  "Conversation unavailable",
  "Subscription refused",
]);
const protocolOnly = new Set([
  "Answered publicly.",
  "Reconnect with current authority",
  "Conversation unavailable",
  "Subscription refused",
]);
function allow(file, line, t) {
  const plain = t.replace(/\{\d+\}/g, "").trim();
  if (allowed.has(t))
    return !protocolOnly.has(t) || /== "|!= "|" ->/.test(line);
  return (
    /\b(MMM|HH:mm|EEEE|uuuu|yyyy)\b/.test(t) ||
    /^\^|\[[0-9a-fA-F]/.test(t) ||
    /^bytes[ =]|'opsz'|^[a-z_]+ [a-z_]+=\{\d\}$/.test(t) ||
    (!/\s/.test(plain) &&
      /[/{}=:.]/.test(t) &&
      !/^[A-Z][a-z]+[.…]?$/.test(plain)) ||
    /StudioTeamWorkspace\.(swift|kt)$/.test(file) || // suffixes for teamCopy() keys
    (/Navigation\.swift$/.test(file) && /case |active: String/.test(line)) || // raw values that build "nav" keys
    (/Growth\.(swift|kt)$/.test(file) &&
      /^(For you|Crafts|Music|Food|Chat|Posts|Requests|Access|Home|Discover)$/.test(
        t,
      ))
  ); // ids mapped to keys
}

let failures = 0;
const check = (ok, label, detail = "") => {
  console.log(`${ok ? "pass" : "FAIL"} ${label}${detail ? ": " + detail : ""}`);
  if (!ok) failures++;
};
const found = [],
  keys = { swift: new Set(), kotlin: new Set() },
  prefixes = new Set(),
  used = new Set();
for (const file of files) {
  const src = fs.readFileSync(file, "utf8"),
    swift = file.endsWith(".swift"),
    lines = src.split("\n");
  for (const l of literals(src, swift)) {
    const n = src.slice(0, l.start).split("\n").length;
    if (reads(l.text) && !allow(file, lines[n - 1], l.text))
      found.push(`${path.relative(root, file)}:${n} ${JSON.stringify(l.text)}`);
    if (l.text in copy) used.add(l.text); // keys chosen in ternaries and tables count as used
  }
  for (const m of src.matchAll(
    /(?:QelvoraCopy\.text|studioCopy|copy)\("([A-Za-z0-9]+)"(\s*\+)?/g,
  ))
    (m[2] ? prefixes : keys[swift ? "swift" : "kotlin"]).add(m[1]);
}
check(
  found.length === 0,
  `C1 no literal user-facing text in ${files.length} source files`,
  found.slice(0, 40).join("\n  "),
);
const direct = new Set([...keys.swift, ...keys.kotlin]);
const missing = [...direct].filter((k) => !(k in copy));
check(
  missing.length === 0,
  `C2 every key the apps look up exists (${direct.size} keys)`,
  missing.join(", "),
);
direct.forEach((k) => used.add(k));
const dynamic = [...prefixes].filter(
  (p) => !Object.keys(copy).some((k) => k.startsWith(p) && k !== p),
);
check(
  dynamic.length === 0,
  `C3 every key prefix resolves (${[...prefixes].join(", ")})`,
  dynamic.join(", "),
);
const values = Object.entries(copy).filter(
  ([k]) => used.has(k) || [...prefixes].some((p) => k.startsWith(p)),
);
// "Unlock it" means the device; "It does not mean {name} read" is the fixed sentence.
const forbidden = [
  /(?<!not mean )\{name\} (read|saw|remembers)\b/i,
  /\bwill reply\b/i,
  /\bVIP\b/,
  /exclusive access/i,
  /get closer/i,
  /from \$/i,
  /per minute/i,
  /\bunlock(?! it\b| this device| your device)/i,
  /keep chatting to/i,
  /\b(bot|chatbot|virtual)\b/i,
  /messaged you/i,
  /top fan/i,
  /biggest supporter/i,
  /\bupgrade/i,
];
const hits = values.filter(([, v]) => forbidden.some((r) => r.test(v)));
check(
  hits.length === 0,
  `C4 none of the forbidden words in the ${values.length} values the apps use`,
  hits.map(([k, v]) => `${k}: ${v}`).join("\n  "),
);
const possessive = values.filter(([, v]) => /Qelvora['’]s/i.test(v));
check(
  possessive.length === 0,
  "C5 no possessive product name",
  possessive.map(([k]) => k).join(", "),
);
const both = [...keys.swift].filter((k) => keys.kotlin.has(k)).length;
console.log(
  `info keys used: iOS ${keys.swift.size}, Android ${keys.kotlin.size}, both ${both}`,
);
process.exit(failures ? 1 : 0);
