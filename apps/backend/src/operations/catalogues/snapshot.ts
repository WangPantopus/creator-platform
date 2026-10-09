import type { Pool } from "pg";
import { contentHash } from "../../core/canonical.js";
import { generationConsumerCatalogue } from "../../core/purpose-catalogue.js";

// A snapshot is what a reviewer needs to answer the one question a migration
// raises about the pins: did any purpose role gain or lose access to anything,
// or did only unrelated relations come and go? It keeps every relation once
// and, for each role, only the relations the role can actually reach.

type Relation = {
  schema: string;
  relation: string;
  relkind: string;
  owner: string;
  table_privileges: string[];
  sequence_privileges: string[];
  columns: unknown[];
  policies: unknown[];
  [key: string]: unknown;
};
type Schema = { schema: string; usage: boolean; create: boolean };
/** A hash of the whole row, and a line a reviewer can read. */
type Reach = { hash: string; summary: string };

export type Snapshot = {
  format: "qelvora-catalogue-snapshot-1";
  takenAt: string;
  review: string;
  database: { name: string; migrations: number; growthApi: boolean };
  /** For every pin group: its live digest and the pinned member it matched. */
  groups: Record<string, { digest: string; matched: string | null }>;
  /** Every relation in the database (name and kind), once. */
  relations: { name: string; kind: string; owner: string }[];
  /** For each purpose role: what it reaches, relation by relation. */
  roles: Record<string, { reaches: Record<string, Reach>; schemas: Schema[] }>;
};

const reaches = (row: Relation, role: string) =>
  row.table_privileges.length > 0 ||
  row.sequence_privileges.length > 0 ||
  row.columns.length > 0 ||
  row.policies.length > 0 ||
  row.owner === role;

const summarize = (row: Relation) =>
  [
    `kind ${row.relkind}`,
    `owner ${row.owner}`,
    row.table_privileges.length
      ? `table ${row.table_privileges.join(",")}`
      : "",
    row.sequence_privileges.length
      ? `sequence ${row.sequence_privileges.join(",")}`
      : "",
    row.columns.length ? `${row.columns.length} column grants` : "",
    row.policies.length ? `${row.policies.length} policies` : "",
  ]
    .filter(Boolean)
    .join("; ");

export async function captureRoles(pool: Pool) {
  const names = (
    await pool.query<{ rolname: string }>(
      "SELECT rolname FROM pg_roles WHERE rolname ~ '^(creator|growth)' ORDER BY rolname COLLATE \"C\"",
    )
  ).rows.map((row) => row.rolname);
  const roles: Snapshot["roles"] = {};
  let relations: Snapshot["relations"] = [];
  for (const role of names) {
    const catalogue = (await generationConsumerCatalogue(pool, role)) as {
      relations: Relation[];
      schemas: Schema[];
    };
    if (!relations.length)
      relations = catalogue.relations.map((row) => ({
        name: `${row.schema}.${row.relation}`,
        kind: row.relkind,
        owner: row.owner,
      }));
    roles[role] = {
      reaches: Object.fromEntries(
        catalogue.relations
          .filter((row) => reaches(row, role))
          .map((row) => [
            `${row.schema}.${row.relation}`,
            { hash: contentHash(row).slice(0, 16), summary: summarize(row) },
          ]),
      ),
      schemas: catalogue.schemas.filter((s) => s.usage || s.create),
    };
  }
  return { relations, roles };
}

export type Change = { kind: "added" | "removed" | "changed"; what: string };

/** What differs between two snapshots, role by role. */
export function diffSnapshots(base: Snapshot, head: Snapshot) {
  const relations: Change[] = [];
  const before = new Map(base.relations.map((r) => [r.name, r]));
  const after = new Map(head.relations.map((r) => [r.name, r]));
  for (const [name, row] of after) {
    const old = before.get(name);
    if (!old)
      relations.push({
        kind: "added",
        what: `${name} (kind ${row.kind}, owner ${row.owner})`,
      });
    else if (old.kind !== row.kind || old.owner !== row.owner)
      relations.push({
        kind: "changed",
        what: `${name} (kind ${old.kind} to ${row.kind}, owner ${old.owner} to ${row.owner})`,
      });
  }
  for (const [name, row] of before)
    if (!after.has(name))
      relations.push({ kind: "removed", what: `${name} (kind ${row.kind})` });

  const roles: { role: string; changes: Change[] }[] = [];
  for (const role of new Set([
    ...Object.keys(base.roles),
    ...Object.keys(head.roles),
  ])) {
    const a = base.roles[role];
    const b = head.roles[role];
    const changes: Change[] = [];
    if (!a) changes.push({ kind: "added", what: "role did not exist" });
    else if (!b)
      changes.push({ kind: "removed", what: "role no longer exists" });
    else {
      for (const [name, row] of Object.entries(b.reaches)) {
        if (!(name in a.reaches))
          changes.push({
            kind: "added",
            what: `reaches ${name} (${row.summary})`,
          });
        else if (a.reaches[name]!.hash !== row.hash)
          changes.push({
            kind: "changed",
            what: `${name}: was (${a.reaches[name]!.summary}) now (${row.summary})`,
          });
      }
      for (const name of Object.keys(a.reaches))
        if (!(name in b.reaches))
          changes.push({
            kind: "removed",
            what: `no longer reaches ${name} (${a.reaches[name]!.summary})`,
          });
      if (contentHash(a.schemas) !== contentHash(b.schemas))
        changes.push({
          kind: "changed",
          what: "schema USAGE or CREATE differs",
        });
    }
    if (changes.length) roles.push({ role, changes });
  }

  const groups = Object.keys(head.groups)
    .filter(
      (id) =>
        base.groups[id] && base.groups[id]!.digest !== head.groups[id]!.digest,
    )
    .sort();
  return { relations, roles, groups };
}
