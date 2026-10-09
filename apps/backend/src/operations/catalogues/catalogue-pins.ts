import { readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { patchStrings, pathKey, type JsonPath } from "./json-text.js";
import {
  liveDigest,
  outputTables,
  pinGroups,
  type DatabaseFacts,
  type PinGroup,
} from "./pins.js";
import { captureRoles, diffSnapshots, type Snapshot } from "./snapshot.js";

// Reviewed catalogue pins: check them, snapshot a database before a migration,
// say what the migration changed, and rewrite the pins that must change.
// Read-only against the database, always. See
// docs/lanes/status/lane-2-catalogue-pins.md for the procedure.

const repoRoot = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../..",
);
const EXIT = { ok: 0, differs: 1, usage: 2, environment: 3 } as const;

class Stop extends Error {
  constructor(
    message: string,
    readonly code: number,
  ) {
    super(message);
  }
}

const usage = `Usage: catalogue-pins <command> --database-url URL [options]
  check      recompute every pinned digest and compare (exit 1 if any differs)
  snapshot   write what a database's purpose roles reach (before a migration)
  diff       say what changed since a snapshot (--base FILE)
  write      put the live digests into the review file (--base FILE helps)
  --database-url URL   the database to read (or CATALOGUE_DATABASE_URL)
  --review FILE        the review file (default: the newest under infra/migrations/reviews)
  --base FILE          a snapshot taken before the migration
  --out FILE           where snapshot writes
  --variant LABEL      choose the alternative a write replaces, when it cannot be told
  --dry-run            write: say what would change and change nothing`;

type Options = {
  command: string;
  databaseUrl: string | undefined;
  review: string | undefined;
  base: string | undefined;
  out: string | undefined;
  variant: string | undefined;
  dryRun: boolean;
};

function parse(argv: string[]): Options {
  const [command, ...rest] = argv;
  const options: Options = {
    command: command ?? "",
    databaseUrl: process.env.CATALOGUE_DATABASE_URL,
    review: undefined,
    base: undefined,
    out: undefined,
    variant: undefined,
    dryRun: false,
  };
  for (let i = 0; i < rest.length; i += 1) {
    const flag = rest[i]!;
    const value = () => {
      const next = rest[(i += 1)];
      if (next === undefined)
        throw new Stop(`${flag} needs a value.\n${usage}`, EXIT.usage);
      return next;
    };
    if (flag === "--database-url") options.databaseUrl = value();
    else if (flag === "--review") options.review = value();
    else if (flag === "--base") options.base = value();
    else if (flag === "--out") options.out = value();
    else if (flag === "--variant") options.variant = value();
    else if (flag === "--dry-run") options.dryRun = true;
    else throw new Stop(`Unknown option ${flag}.\n${usage}`, EXIT.usage);
  }
  if (!["check", "snapshot", "diff", "write"].includes(options.command))
    throw new Stop(usage, EXIT.usage);
  if (!options.databaseUrl)
    throw new Stop(`Give --database-url.\n${usage}`, EXIT.usage);
  if (options.command === "diff" && !options.base)
    throw new Stop(`diff needs --base.\n${usage}`, EXIT.usage);
  if (options.command === "snapshot" && !options.out)
    throw new Stop(`snapshot needs --out.\n${usage}`, EXIT.usage);
  return options;
}

const say = (line = "") => process.stdout.write(line + "\n");
const short = (digest: string) => digest.slice(0, 10) + "…";
const rel = (path: string) => relative(repoRoot, path);

async function newestReview() {
  const directory = join(repoRoot, "infra/migrations/reviews");
  for (const name of (await readdir(directory)).sort().reverse()) {
    if (!name.endsWith(".json")) continue;
    const json = JSON.parse(
      await readFile(join(directory, name), "utf8"),
    ) as Record<string, unknown>;
    if (json.runtimeCatalogues && json.sources) return join(directory, name);
  }
  throw new Stop(
    "No review file with pinned runtime catalogues was found.",
    EXIT.environment,
  );
}

type Evaluation = {
  group: PinGroup;
  digest: string | undefined;
  matched: string | null;
  error: string | undefined;
};

async function open(options: Options) {
  const reviewPath = options.review
    ? resolve(options.review)
    : await newestReview();
  const text = await readFile(reviewPath, "utf8");
  const review = JSON.parse(text) as Record<string, unknown>;
  const { groups, unknown } = pinGroups(
    review,
    outputTables(
      await readFile(
        join(
          repoRoot,
          "apps/backend/src/modules/conversation/generation-output.ts",
        ),
        "utf8",
      ),
    ),
  );
  const pool = new pg.Pool({
    connectionString: options.databaseUrl!,
    max: 2,
    connectionTimeoutMillis: 5000,
    query_timeout: 5000,
  });
  pool.on("error", () => undefined);
  try {
    const where = new URL(options.databaseUrl!);
    const name = where.pathname.slice(1);
    const facts: DatabaseFacts = {
      growthApi:
        (await pool.query("SELECT 1 FROM pg_roles WHERE rolname='growth_api'"))
          .rowCount === 1,
    };
    const ledger = Number(
      (
        await pool.query<{ n: string }>(
          "SELECT count(*) AS n FROM creator.schema_migration",
        )
      ).rows[0]!.n,
    );
    const registry = (
      JSON.parse(
        await readFile(join(repoRoot, "infra/migrations.json"), "utf8"),
      ) as { migrations: unknown[] }
    ).migrations.length;
    const missing: string[] = [];
    for (const source of Array.isArray(review.sources)
      ? (review.sources as { version: string; checksum: string }[])
      : [])
      if (
        (
          await pool.query(
            "SELECT 1 FROM creator.schema_migration WHERE version=$1 AND checksum=$2",
            [source.version, source.checksum],
          )
        ).rowCount !== 1
      )
        missing.push(source.version);
    if (missing.length)
      throw new Stop(
        `This database is not at the state ${rel(reviewPath)} describes: ${missing.join(", ")} not applied.`,
        EXIT.environment,
      );
    return {
      reviewPath,
      text,
      review,
      groups,
      unknown,
      pool,
      facts,
      database: {
        name,
        host: `${where.hostname}:${where.port || "5432"}`,
        ledger,
        registry,
      },
    };
  } catch (error) {
    await pool.end().catch(() => undefined);
    if (error instanceof Stop) throw error;
    throw new Stop(
      `Cannot read the database (${error instanceof Error ? error.message : "unknown error"}).`,
      EXIT.environment,
    );
  }
}

async function evaluate(
  pool: pg.Pool,
  groups: PinGroup[],
): Promise<Evaluation[]> {
  const out: Evaluation[] = [];
  for (const group of groups) {
    const client = await pool.connect();
    try {
      const digest = await liveDigest(client, group);
      out.push({
        group,
        digest,
        matched:
          group.members.find((member) => member.pinned === digest)?.label ??
          null,
        error: undefined,
      });
    } catch (error) {
      out.push({
        group,
        digest: undefined,
        matched: null,
        error: error instanceof Error ? error.message : "unreadable",
      });
    } finally {
      client.release();
    }
  }
  return out;
}

const heading = (context: Awaited<ReturnType<typeof open>>) => {
  say(`Catalogue pins  ${rel(context.reviewPath)}`);
  say(
    `database ${context.database.name} on ${context.database.host}: ${context.database.ledger} migrations applied ` +
      `(registry lists ${context.database.registry}); growth_api ${context.facts.growthApi ? "present" : "absent"}`,
  );
};

function report(
  context: Awaited<ReturnType<typeof open>>,
  results: Evaluation[],
) {
  const prefix = "workerCatalogues.";
  const workers = results.filter(
    (r) => r.group.id.startsWith(prefix) && !r.error,
  );
  const workersOk = workers.filter((r) => r.matched);
  if (workers.length) {
    const differing = workers.filter((r) => !r.matched);
    say(
      `${differing.length ? "FAIL" : "PASS"}  ${prefix}*  ${workersOk.length} of ${workers.length} match` +
        (differing.length
          ? `  (differ: ${differing
              .slice(0, 4)
              .map((r) => r.group.id.slice(prefix.length))
              .join(
                ", ",
              )}${differing.length > 4 ? `, and ${differing.length - 4} more` : ""})`
          : ""),
    );
  }
  for (const result of results) {
    if (workers.includes(result)) continue;
    if (result.error)
      say(`FAIL  ${result.group.id}  could not be read: ${result.error}`);
    else if (result.matched)
      say(
        `PASS  ${result.group.id}${result.group.members.length > 1 ? `  (matches: ${result.matched})` : ""}`,
      );
    else
      say(
        `FAIL  ${result.group.id}  live ${short(result.digest!)}  pinned ${result.group.members
          .map((m) => short(m.pinned))
          .join(" or ")}  covers ${result.group.covers}`,
      );
  }
  for (const path of context.unknown)
    say(
      `FAIL  ${path}  is pinned in the review but this tool does not know how to recompute it`,
    );
  const changed = results.filter((r) => !r.matched).length;
  const total = results.reduce((n, r) => n + r.group.members.length, 0);
  say(
    `${results.length - changed} of ${results.length} pin groups match (${total} pinned digests covered` +
      `, ${context.unknown.length} not known to this tool)`,
  );
  return changed + context.unknown.length;
}

async function check(options: Options) {
  const context = await open(options);
  try {
    heading(context);
    const results = await evaluate(context.pool, context.groups);
    report(context, results);
    const changed = results.filter((r) => !r.matched).length;
    if (changed || context.unknown.length) say();
    if (changed)
      say(
        "The product would refuse export, delete and generation, or the migration operator would refuse, on this database. " +
          "If the database is right and the repository is stale, run: write (see the procedure).",
      );
    if (context.unknown.length)
      say(
        "The review pins digests this tool cannot recompute. Add them to operations/catalogues/pins.ts, as a pin " +
          "or, if they hash an immutable source or definition, to its list of immutable paths.",
      );
    return changed || context.unknown.length ? EXIT.differs : EXIT.ok;
  } finally {
    await context.pool.end();
  }
}

async function snapshot(options: Options) {
  const context = await open(options);
  try {
    heading(context);
    const results = await evaluate(context.pool, context.groups);
    const { relations, roles } = await captureRoles(context.pool);
    const value: Snapshot = {
      format: "qelvora-catalogue-snapshot-1",
      takenAt: new Date().toISOString(),
      review: rel(context.reviewPath),
      database: {
        name: context.database.name,
        migrations: context.database.ledger,
        growthApi: context.facts.growthApi,
      },
      groups: Object.fromEntries(
        results
          .filter((r) => r.digest)
          .map((r) => [r.group.id, { digest: r.digest!, matched: r.matched }]),
      ),
      relations,
      roles,
    };
    await writeFile(
      resolve(options.out!),
      JSON.stringify(value, null, 1) + "\n",
    );
    say(
      `snapshot: ${relations.length} relations, ${Object.keys(roles).length} roles, ${results.length} pin groups` +
        ` (${results.filter((r) => r.matched).length} match the review)  ->  ${options.out}`,
    );
    return EXIT.ok;
  } finally {
    await context.pool.end();
  }
}

async function readSnapshot(path: string) {
  const value = JSON.parse(await readFile(resolve(path), "utf8")) as Snapshot;
  if (value.format !== "qelvora-catalogue-snapshot-1")
    throw new Stop(`${path} is not a catalogue snapshot.`, EXIT.usage);
  return value;
}

async function diff(options: Options) {
  const base = await readSnapshot(options.base!);
  const context = await open(options);
  try {
    heading(context);
    const results = await evaluate(context.pool, context.groups);
    const now = await captureRoles(context.pool);
    const changes = diffSnapshots(base, {
      ...base,
      relations: now.relations,
      roles: now.roles,
      groups: Object.fromEntries(
        results
          .filter((r) => r.digest)
          .map((r) => [r.group.id, { digest: r.digest!, matched: r.matched }]),
      ),
    });
    say(
      `since the snapshot of ${base.takenAt} (${base.database.migrations} migrations):`,
    );
    say(
      `relations: ${changes.relations.filter((c) => c.kind === "added").length} added, ` +
        `${changes.relations.filter((c) => c.kind === "removed").length} removed, ` +
        `${changes.relations.filter((c) => c.kind === "changed").length} changed`,
    );
    for (const change of changes.relations.slice(0, 40))
      say(`  ${change.kind.padEnd(8)} ${change.what}`);
    if (changes.relations.length > 40)
      say(`  ... and ${changes.relations.length - 40} more`);
    say(`purpose roles whose reach changed: ${changes.roles.length}`);
    for (const entry of changes.roles.slice(0, 40)) {
      say(`  ${entry.role}`);
      for (const change of entry.changes.slice(0, 10))
        say(`    ${change.kind.padEnd(8)} ${change.what}`);
    }
    say(
      `pin groups whose digest changed: ${changes.groups.length} of ${results.length}`,
    );
    const others = changes.groups.filter(
      (id) => !id.startsWith("workerCatalogues."),
    );
    const workerCount = changes.groups.length - others.length;
    if (workerCount) say(`  workerCatalogues.*  ${workerCount} roles`);
    for (const id of others) say(`  ${id}`);
    say();
    if (!changes.roles.length)
      say(
        "No purpose role gained or lost access to anything. The pins changed only because the list of relations did, " +
          "so regenerating them is mechanical.",
      );
    else
      say(
        "At least one purpose role's reach changed. Review each line above against the migration before regenerating: " +
          "the pins exist to make exactly this visible.",
      );
    return EXIT.ok;
  } finally {
    await context.pool.end();
  }
}

async function write(options: Options) {
  const base = options.base ? await readSnapshot(options.base) : undefined;
  const context = await open(options);
  try {
    heading(context);
    const results = await evaluate(context.pool, context.groups);
    const unreadable = results.filter((r) => r.error);
    if (unreadable.length || context.unknown.length) {
      report(context, results);
      throw new Stop(
        "Some pins cannot be recomputed by this tool, so writing now would leave the review half right. Nothing was written.",
        EXIT.differs,
      );
    }
    const replacements = new Map<string, string>();
    const edits: { path: JsonPath; value: string }[] = [];
    const lines: string[] = [];
    const ambiguous: string[] = [];
    for (const result of results) {
      if (result.matched) continue;
      const members = result.group.members;
      const wanted =
        (options.variant &&
          members.find((m) => m.label === options.variant)?.label) ||
        result.group.select?.(context.facts) ||
        (base?.groups[result.group.id]?.matched ?? undefined) ||
        (members.length === 1 ? members[0]!.label : undefined);
      const member = members.find((m) => m.label === wanted);
      if (!member) {
        ambiguous.push(
          `${result.group.id} (alternatives: ${members.map((m) => m.label).join(", ")})`,
        );
        continue;
      }
      replacements.set(pathKey(member.path), result.digest!);
      edits.push({ path: member.path, value: result.digest! });
      lines.push(
        `  ${result.group.id}${members.length > 1 ? ` [${member.label}]` : ""}  ${short(member.pinned)} -> ${short(result.digest!)}`,
      );
    }
    if (ambiguous.length)
      throw new Stop(
        `Cannot tell which alternative each of these replaces; take a snapshot before the migration and pass --base, or pass --variant LABEL:\n  ${ambiguous.join("\n  ")}\nNothing was written.`,
        EXIT.usage,
      );
    if (!replacements.size) {
      say("Every pin already matches; nothing to write.");
      return EXIT.ok;
    }
    say(
      `${options.dryRun ? "would change" : "changing"} ${replacements.size} digests in ${rel(context.reviewPath)}:`,
    );
    for (const line of lines) say(line);
    if (options.dryRun) return EXIT.ok;
    const patched = patchStrings(context.text, replacements);
    // The patched text must parse to exactly the original with those values
    // replaced and nothing else different.
    const expected = JSON.parse(context.text) as unknown;
    for (const { path, value } of edits) {
      let node = expected as Record<string | number, unknown>;
      for (const part of path.slice(0, -1))
        node = node[part] as Record<string | number, unknown>;
      node[path[path.length - 1]!] = value;
    }
    if (JSON.stringify(expected) !== JSON.stringify(JSON.parse(patched)))
      throw new Stop(
        "The patched review differs from the original in more than the changed digests; nothing was written.",
        EXIT.differs,
      );
    await writeFile(context.reviewPath, patched);
    say();
    say(
      "Written. The backend reads this file when it starts: restart it. Review `git diff` for the file,",
    );
    say("commit it with the migration, then run `check` again.");
    return EXIT.ok;
  } finally {
    await context.pool.end();
  }
}

try {
  const options = parse(process.argv.slice(2));
  process.exitCode = await { check, snapshot, diff, write }[
    options.command as "check"
  ](options);
} catch (error) {
  if (error instanceof Stop) {
    process.stderr.write(error.message + "\n");
    process.exitCode = error.code;
  } else {
    process.stderr.write(
      `catalogue-pins failed: ${error instanceof Error ? error.message : "unknown error"}\n`,
    );
    process.exitCode = EXIT.environment;
  }
}
