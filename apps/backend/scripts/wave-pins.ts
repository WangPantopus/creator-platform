import { spawnSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import {
  patchStrings,
  pathKey,
} from "../src/operations/catalogues/json-text.js";
import {
  liveDigest,
  outputTables,
  pinGroups,
} from "../src/operations/catalogues/pins.js";
import type { Snapshot } from "../src/operations/catalogues/snapshot.js";
import {
  canonical,
  matchesLedger,
  readLedger,
  repositoryRoot,
  sha256,
  transactionBody,
} from "./migration-custody.js";

// The mechanical half of a new wave's catalogue pins, on a scratch database at
// the head before the wave (docs/engineering/migrations.md):
//   apply  snapshot it against the previous head's review, apply the wave's
//          sources in one transaction, and show what the catalogue tool sees
//          change. A person reviews every changed reach before going on.
//   write  write the new review from the previous one if it does not exist,
//          put the live digests in, and check them.
// Run both on a database without the Growth API login and on one with it, and
// on a restored populated copy with --variant for the populated profiles. The
// database must carry the local stack's scratch marker. A review pinned in
// infra/migrations/reviewed.json is reviewed: write changes it only with
// --replace. It never edits the registry, reviewed.json, a wave packet or SQL.
//   (cd apps/backend && node --import tsx scripts/wave-pins.ts apply|write \
//     --wave ID --database-url URL --out DIR [--scope TEXT] [--variant LABEL]
//     [--replace])

type Source = { version: string; path: string; checksum: string };
class Stop extends Error {}
function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Stop(message);
}
/** The comment the local stack puts on the database it creates
 * (infra/local/stack.mjs). Put it on a restored copy by hand. */
const SCRATCH = "creator-platform:local-scratch";
const file = (path: string) => new URL(path, repositoryRoot);
const json = async (path: string) =>
  JSON.parse(await readFile(file(path), "utf8"));
const abs = (path: string) => fileURLToPath(file(path));
const backend = abs("apps/backend/");

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const flags = new Map<string, string>();
  for (let at = 0; at < rest.length; at += 1) {
    const flag = rest[at] ?? "";
    if (flag === "--replace") flags.set("replace", "");
    else {
      check(
        /^--(wave|database-url|out|scope|variant)$/u.test(flag) &&
          rest[at + 1] !== undefined,
        "Usage: wave-pins.ts apply|write --wave ID --database-url URL --out DIR [--scope TEXT] [--variant LABEL] [--replace]",
      );
      flags.set(flag.slice(2), rest[(at += 1)]!);
    }
  }
  check(command === "apply" || command === "write", "Give apply or write.");
  const chain = (await json("infra/migrations/chain.json")) as {
    waves: { id: string; sha256: string }[];
    head: { wave: string };
  };
  const at = chain.waves.findIndex((wave) => wave.id === flags.get("wave"));
  check(
    at > 0 && chain.head.wave === flags.get("wave"),
    "Give the newest wave in infra/migrations/chain.json (run pnpm generate after the registry edit).",
  );
  const wave = chain.waves[at]!;
  const prior = chain.waves[at - 1]!;
  const packetPath = `infra/migrations/waves/${wave.id}.json`;
  const reviewPath = `infra/migrations/reviews/${wave.id}.json`;
  const priorReview = `infra/migrations/reviews/${prior.id}.json`;
  check(
    sha256(await readFile(file(packetPath))) === wave.sha256 &&
      sha256(
        await readFile(file(`infra/migrations/waves/${prior.id}.json`)),
      ) === prior.sha256,
    "The wave packets differ from infra/migrations/chain.json; run pnpm generate.",
  );
  check(existsSync(file(priorReview)), `${priorReview} is missing.`);
  const packet = (await json(packetPath)) as {
    baseline: Source[];
    wave: Source[];
  };
  // As the operator: a wave's versions rise, above every version before it.
  const last = packet.baseline.reduce(
    (high, source) => (source.version > high ? source.version : high),
    "",
  );
  check(
    packet.wave.every(
      (source, at) =>
        source.version > (at ? packet.wave[at - 1]!.version : last),
    ),
    `${wave.id}'s versions must rise, above every version before the wave (${last}).`,
  );
  // pg reads host, port and socket settings from the query string too, so a
  // URL is taken only without one. pg would look up a bracketed IPv6 host
  // such as [::1] as a name, so only the two names the stack uses are taken.
  const given = flags.get("database-url") ?? "";
  check(URL.canParse(given), "Give --database-url.");
  const url = new URL(given);
  check(
    ["postgres:", "postgresql:"].includes(url.protocol) &&
      ["localhost", "127.0.0.1"].includes(url.hostname) &&
      !url.search &&
      !url.hash,
    "Use a plain loopback URL to a scratch database: host localhost or 127.0.0.1, no query string or fragment.",
  );
  const out = resolve(flags.get("out") ?? "");
  const root = resolve(fileURLToPath(repositoryRoot));
  check(
    flags.has("out") &&
      out !== root &&
      !out.startsWith(root + sep) &&
      existsSync(out) &&
      statSync(out).isDirectory() &&
      (statSync(out).mode & 0o077) === 0,
    "Give a private --out directory outside Git.",
  );
  const before = join(
    out,
    `${wave.id}-${url.port || "5432"}-${url.pathname.slice(1)}-before.json`,
  );
  const tool = (...args: string[]) => {
    const run = spawnSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "src/operations/catalogues/catalogue-pins.ts",
        ...args,
      ],
      {
        cwd: backend,
        encoding: "utf8",
        env: { ...process.env, CATALOGUE_DATABASE_URL: url.href },
      },
    );
    process.stdout.write(run.stdout + run.stderr);
    check(run.status === 0, `catalogue-pins ${args[0]} failed.`);
  };
  // The product's catalogue readers require a finite query budget, as the
  // catalogue tool gives them; the wave SQL runs without one, as in the operator.
  const pool = new pg.Pool({
    connectionString: url.href,
    max: 1,
    ...(command === "write"
      ? { connectionTimeoutMillis: 5000, query_timeout: 5000 }
      : {}),
  });
  const client = await pool.connect();
  try {
    const target = (
      await client.query<{
        safe: boolean;
        major: number;
        scratch: boolean;
        name: string;
      }>(
        `SELECT current_user=session_user AND r.rolsuper AS safe,
           current_setting('server_version_num')::int/10000 AS major,
           coalesce(shobj_description(d.oid,'pg_database')=$1,false) AS scratch,
           current_database() AS name
         FROM pg_roles r, pg_database d WHERE r.rolname=session_user AND d.datname=current_database()`,
        [SCRATCH],
      )
    ).rows[0];
    check(
      target?.safe && target.major === 17,
      "Use a PostgreSQL 17 database as its administrator.",
    );
    // Never print the statement that marks this database: whoever pointed the
    // script here by mistake would be handed the way past the guard.
    check(
      target.scratch,
      `${target.name} is not marked as a scratch database. The local stack marks the database it creates (node infra/local/stack.mjs up --lane N --base-port P --no-web), and a restored copy is marked as step 1 of docs/engineering/migrations.md says.`,
    );
    const ledger = await readLedger(client);
    if (command === "apply") {
      check(
        matchesLedger(ledger, packet.baseline),
        `The database must hold exactly the ${packet.baseline.length} sources before ${wave.id}.`,
      );
      check(!existsSync(before), `${before} already exists.`);
      tool("snapshot", "--review", abs(priorReview), "--out", before);
      await client.query(
        "SELECT pg_advisory_lock(hashtextextended('creator-migrations',0))",
      );
      await client.query("BEGIN");
      try {
        // The same SQL, order and ledger rows as activate-wave and the local
        // installer, without the backup ceremony a scratch database needs none of.
        for (const source of [...packet.wave].sort((a, b) =>
          a.version.localeCompare(b.version),
        )) {
          check(
            /^\d{4}_[a-z0-9_]+$/u.test(source.version) &&
              /^(apps\/backend|infra\/migrations\/history)\/[a-zA-Z0-9_./-]+\.sql$/u.test(
                source.path,
              ) &&
              !source.path.includes(".."),
            `Invalid packet entry ${source.version}.`,
          );
          const sql = await readFile(file(source.path), "utf8");
          check(
            sha256(sql) === source.checksum,
            `Pinned source changed: ${source.version}.`,
          );
          const body = transactionBody(sql);
          check(
            !/^\s*(?:BEGIN|COMMIT|ROLLBACK)\s*;/imu.test(body),
            `Internal transaction boundary in ${source.version}.`,
          );
          await client.query(body);
          await client.query("RESET ROLE");
          await client.query(
            "INSERT INTO creator.schema_migration(version,checksum) VALUES($1,$2)",
            [source.version, source.checksum],
          );
        }
        check(
          matchesLedger(await readLedger(client), [
            ...packet.baseline,
            ...packet.wave,
          ]),
          "The ledger is not the baseline plus the wave; rolled back.",
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        await client.query(
          "SELECT pg_advisory_unlock(hashtextextended('creator-migrations',0))",
        );
      }
      console.log(`applied ${packet.wave.length} sources of ${wave.id}`);
      tool("diff", "--base", before, "--review", abs(priorReview));
      console.log(
        `\nReview each changed reach above against the SQL. Then run write with the same --out.`,
      );
      return;
    }
    check(
      matchesLedger(ledger, [...packet.baseline, ...packet.wave]),
      `The database must hold the ${packet.baseline.length + packet.wave.length} sources through ${wave.id}; run apply first.`,
    );
    const snapshot = JSON.parse(await readFile(before, "utf8")) as Snapshot;
    check(
      snapshot.format === "qelvora-catalogue-snapshot-1" &&
        snapshot.review === priorReview &&
        snapshot.database.name === url.pathname.slice(1),
      `${before} is not this database's snapshot before ${wave.id}.`,
    );
    const registry = (await json("infra/migrations.json")) as {
      migrations: { version: string; owner: string }[];
    };
    const sources = packet.wave.map((source) => ({
      ...source,
      owner: registry.migrations.find((m) => m.version === source.version)!
        .owner,
      name: source.version.slice(5),
    }));
    const baselineWave = {
      path: `infra/migrations/waves/${prior.id}.json`,
      sha256: prior.sha256,
    };
    // Re-measuring a reviewed wave is a review of its own.
    const reviewed = (await json("infra/migrations/reviewed.json")) as {
      sha256: Record<string, string>;
    };
    check(
      !(reviewPath in reviewed.sha256) || flags.has("replace"),
      `${reviewPath} is reviewed (pinned in infra/migrations/reviewed.json). Re-measure it only with --replace, and review the change.`,
    );
    if (!existsSync(file(reviewPath))) {
      // Everything the wave does not change carries over from the previous
      // head; the catalogue tool rewrites what it does change.
      const scope = flags.get("scope");
      check(scope, `Give --scope, the sentence that says what ${wave.id} is.`);
      await writeFile(
        file(reviewPath),
        JSON.stringify(
          { ...(await json(priorReview)), scope, sources, baselineWave },
          null,
          2,
        ) + "\n",
      );
      console.log(`wrote ${reviewPath} from ${priorReview}`);
    } else {
      const review = await json(reviewPath);
      check(
        canonical(review.sources) === canonical(sources) &&
          canonical(review.baselineWave) === canonical(baselineWave) &&
          (!flags.has("scope") || review.scope === flags.get("scope")),
        `${reviewPath} does not describe ${wave.id} as given.`,
      );
    }
    const text = await readFile(file(reviewPath), "utf8");
    tool(
      "write",
      "--base",
      before,
      "--review",
      abs(reviewPath),
      ...(flags.has("variant") ? ["--variant", flags.get("variant")!] : []),
    );
    // A pin that did not describe this database before the wave cannot be
    // measured from it after the wave: keep it as it was. With the Growth API
    // login that is the no-Growth runtimeCatalogues.family diagnostic.
    const differed = (id: string) => snapshot.groups[id]?.matched === null;
    const tables = outputTables(
      await readFile(
        file("apps/backend/src/modules/conversation/generation-output.ts"),
        "utf8",
      ),
    );
    const was = pinGroups(JSON.parse(text), tables).groups;
    const written = await readFile(file(reviewPath), "utf8");
    const kept = new Map<string, string>();
    for (const group of was)
      if (differed(group.id))
        for (const member of group.members)
          kept.set(pathKey(member.path), member.pinned);
    let restored = patchStrings(written, kept);
    if (restored !== written)
      console.log(
        `kept the pins that did not match before the wave: ${was
          .filter((group) => differed(group.id))
          .map((group) => group.id)
          .join(", ")}`,
      );
    // With --variant this database is that alternative, even where another
    // alternative already has its digest (the tool then writes nothing), so
    // long as that alternative described it before the wave.
    const variant = flags.get("variant");
    const priorGroups = pinGroups(await json(priorReview), tables).groups;
    const live = new Map<string, string>();
    const measured = new Map<string, string>();
    for (const group of pinGroups(JSON.parse(restored), tables).groups) {
      const digest = await liveDigest(client, group);
      live.set(group.id, digest);
      const member = group.members.find((m) => m.label === variant);
      if (!member || member.pinned === digest || differed(group.id)) continue;
      check(
        priorGroups
          .find((prior) => prior.id === group.id)
          ?.members.find((m) => m.label === variant)?.pinned ===
          snapshot.groups[group.id]?.digest,
        `${group.id} [${variant}] did not describe this database before the wave.`,
      );
      measured.set(pathKey(member.path), digest);
      console.log(`  ${group.id} [${variant}] -> ${digest.slice(0, 10)}…`);
    }
    restored = patchStrings(restored, measured);
    if (restored !== written) await writeFile(file(reviewPath), restored);
    const now = pinGroups(JSON.parse(restored), tables).groups;
    const differ = now
      .filter(
        (group) => !group.members.some((m) => m.pinned === live.get(group.id)),
      )
      .map((group) => group.id);
    const expected = differ.filter(differed);
    const unexpected = differ.filter((id) => !differed(id));
    console.log(
      `${now.length - differ.length} of ${now.length} pin groups match` +
        (expected.length
          ? `; ${expected.join(", ")} did not match before the wave either`
          : ""),
    );
    for (const group of now)
      if (group.members.length > 1)
        console.log(
          `  ${group.id}: this database measured ${group.members.find((m) => m.label === variant)?.label ?? group.select?.({ growthApi: snapshot.database.growthApi }) ?? snapshot.groups[group.id]?.matched ?? "nothing"}; the other alternatives keep their values`,
        );
    check(!unexpected.length, `Still different: ${unexpected.join(", ")}.`);
  } finally {
    client.release();
    await pool.end();
  }
}

/** A refused connection has no message of its own, only a code or the
 * errors of each address it tried. */
const reason = (error: unknown): string =>
  error instanceof AggregateError && !error.message
    ? error.errors.map(reason).join("; ")
    : error instanceof Error
      ? error.message ||
        String((error as { code?: unknown }).code ?? error.name)
      : "unknown error";

main().catch((error) => {
  process.stderr.write(
    error instanceof Stop
      ? error.message + "\n"
      : `wave-pins failed (${reason(error)}).\n`,
  );
  process.exitCode = 1;
});
