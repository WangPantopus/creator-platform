import type { PoolClient } from "pg";
import { contentHash } from "../../core/canonical.js";
import { generationConsumerCatalogue } from "../../core/purpose-catalogue.js";
import { generationOutputShapeCatalogueQuery } from "../../modules/conversation/generation-output.js";
import { comparisonReaderCatalogue } from "../../modules/conversation/comparison-feed.js";
import { comparisonPrivacyCatalogue } from "../../modules/conversation/comparison-privacy.js";
import { generationProvenancePurgeCatalogue } from "../../modules/conversation/generation-provenance-privacy.js";
import { conversationPrivacyCursorCatalogue } from "../../modules/conversation/privacy-export-cursor.js";
import { generationSafetyTerminalPurposeCatalogue } from "../../modules/commerce/generation-safety-terminal-catalogue.js";
import { generationOutputCursorCatalogueQuery } from "../../modules/identity/generation-output-cursor.js";
import { generationTerminalDiscoveryCatalogueQuery } from "../../modules/identity/generation-terminal-discovery.js";
import { publicAIPurposeCatalogue } from "../../modules/identity/public-ai-catalogue.js";
import { accountDetachedUsageCatalogue } from "../../modules/trust/account-detached-usage-catalogue.js";
import { accountingBoundaryCatalogue } from "../../modules/trust/accounting-boundary-catalogue.js";
import { comparisonArtifactCatalogue } from "../../modules/trust/comparison-artifacts.js";
import { originalPrivacyFamilyPurposeCatalogue } from "../../modules/trust/privacy-family-catalog.js";
import { usageExpiryCatalogue } from "../../modules/trust/usage-expiry-catalogue.js";
import { generationWavePurposeCatalogue } from "../../../scripts/migration-generation-roles.js";
import type { JsonPath } from "./json-text.js";

// The reviewed catalogue pins: digests of what the database's purpose roles can
// reach, taken on a database at a known state and checked by the product before
// export, delete, generation and the migration operator will run. Every one of
// them hashes the list of every relation in the database (see
// core/purpose-catalogue.ts), so a new relation anywhere changes them.
//
// Each group below reads exactly what the product's own check reads, by calling
// the same exported "operator metadata" function. Nothing here is a second
// opinion about what a catalogue should contain: it recomputes the digest the
// product will compute. `check` first proves that on a known-good database
// (every pin must reproduce), so a tool that drifted from the product reports
// the drift instead of writing a wrong pin.

export type DatabaseFacts = { growthApi: boolean };

export type PinGroup = {
  /** Stable name: the JSON path of the pin, or of the list of alternatives. */
  id: string;
  /** What the digest covers, in a phrase for the reviewer. */
  covers: string;
  /** The live digest must equal one of these pinned alternatives. */
  members: { label: string; path: JsonPath; pinned: string }[];
  /** The structure whose canonical hash is the pin. */
  read: (client: PoolClient) => Promise<unknown>;
  /** Set when the reviewed code reads under this search_path. */
  searchPath?: "pg_catalog";
  /** The member that applies to this database, when the database says so. */
  select?: (facts: DatabaseFacts) => string | undefined;
};

type Review = Record<string, unknown>;

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const hex = (value: unknown): value is string =>
  typeof value === "string" && /^[0-9a-f]{64}$/u.test(value);

/** Digests of immutable things (SQL source files, function definitions): they
 * change only when that text changes, never when a relation is added. */
const IMMUTABLE: readonly RegExp[] = [
  /^sources\.\d+\.checksum$/u,
  /^conversationCursorDefinitions\..+$/u,
  /^comparison\.privacy\.definitionSha256$/u,
  /^baselineWave\.sha256$/u,
];

export const outputTables = (generationOutputSource: string) => {
  const start = generationOutputSource.indexOf("const Columns = {");
  const end = generationOutputSource.indexOf("} as const;", start);
  const tables = [
    ...generationOutputSource
      .slice(start, end)
      .matchAll(/^ {2}"creator\.([a-z_]+)": \{/gmu),
  ].map((match) => match[1]!);
  if (start < 0 || end < 0 || tables.length === 0)
    throw new Error(
      "The generation output module no longer lists its tables in a form this tool can read.",
    );
  return tables;
};

const walkHex = (
  value: unknown,
  path: (string | number)[],
  out: Map<string, string>,
) => {
  if (Array.isArray(value))
    value.forEach((item, index) => walkHex(item, [...path, index], out));
  else if (value && typeof value === "object")
    for (const [key, item] of Object.entries(value))
      walkHex(item, [...path, key], out);
  else if (hex(value)) out.set(path.join("."), value);
};

const single = (
  review: Review,
  path: string[],
  group: Omit<PinGroup, "id" | "members">,
): PinGroup | undefined => {
  let value: unknown = review;
  for (const key of path) value = record(value)[key];
  return hex(value)
    ? {
        id: path.join("."),
        members: [{ label: "pinned", path, pinned: value }],
        ...group,
      }
    : undefined;
};

/** Every group the review file pins, and every pinned digest the tool does not
 * know how to recompute (which `check` reports as a failure). */
export function pinGroups(review: Review, outputShapeTables: string[]) {
  const groups: PinGroup[] = [];
  const add = (group: PinGroup | undefined) => group && groups.push(group);
  const role = (name: string) => (client: PoolClient) =>
    generationConsumerCatalogue(client, name);

  for (const [name, pinned] of Object.entries(record(review.workerCatalogues)))
    if (hex(pinned))
      groups.push({
        id: `workerCatalogues.${name}`,
        covers: `what role ${name} can reach`,
        members: [
          { label: "pinned", path: ["workerCatalogues", name], pinned },
        ],
        read: role(name),
      });
  add(
    single(review, ["agentExportCatalogueChecksum"], {
      covers: "what role creator_w2_privacy_export can reach",
      read: role("creator_w2_privacy_export"),
    }),
  );

  const runtime = ["runtimeCatalogues"];
  add(
    single(review, [...runtime, "detached"], {
      covers: "detached usage accounting: its role plus the relations it reads",
      read: (client) => accountDetachedUsageCatalogue(client),
    }),
  );
  add(
    single(review, [...runtime, "boundary"], {
      covers: "the Conversation accounting boundary: role plus relations",
      read: (client) => accountingBoundaryCatalogue(client),
    }),
  );
  add(
    single(review, [...runtime, "expiry"], {
      covers: "usage expiry: its role plus the relations it reads",
      read: (client) => usageExpiryCatalogue(client),
    }),
  );
  add(
    single(review, [...runtime, "family"], {
      covers: "the original privacy family: roles, executables and relations",
      read: (client) => originalPrivacyFamilyPurposeCatalogue(client),
    }),
  );
  add(
    single(review, [...runtime, "financial"], {
      covers: "the generation safety terminal: every role and relation",
      read: (client) => generationSafetyTerminalPurposeCatalogue(client),
    }),
  );
  add(
    single(review, [...runtime, "output"], {
      covers: "the generation output cursor and writer",
      searchPath: "pg_catalog",
      read: async (client) => ({
        cursor: await generationConsumerCatalogue(
          client,
          "creator_generation_cursor_authority",
        ),
        writer: await generationConsumerCatalogue(
          client,
          "creator_w3_generation_output",
        ),
        catalogue: (await client.query(generationOutputCursorCatalogueQuery))
          .rows[0]?.catalogue,
      }),
    }),
  );
  add(
    single(review, [...runtime, "terminal"], {
      covers: "generation terminal discovery and authority",
      searchPath: "pg_catalog",
      read: async (client) => ({
        discovery: await generationConsumerCatalogue(
          client,
          "creator_generation_terminal_discovery",
        ),
        original: await generationConsumerCatalogue(
          client,
          "creator_generation_terminal_authority",
        ),
        catalogue: (
          await client.query(generationTerminalDiscoveryCatalogueQuery)
        ).rows[0]?.catalogue,
      }),
    }),
  );
  add(
    single(review, ["publicCatalogueChecksum"], {
      covers: "the public AI reader: role, executables and relations",
      read: (client) => publicAIPurposeCatalogue(client),
    }),
  );
  add(
    single(review, ["outputCatalogueChecksum"], {
      covers: "the generation output writer's role and table shapes",
      read: async (client) => ({
        privileges: await generationConsumerCatalogue(
          client,
          "creator_w3_generation_output",
        ),
        catalogue: (
          await client.query(generationOutputShapeCatalogueQuery, [
            outputShapeTables,
            "creator_w3_generation_output",
          ])
        ).rows[0]?.catalogue,
      }),
    }),
  );
  add(
    single(review, ["conversationCursorCatalogueChecksum"], {
      covers: "the conversation privacy cursor: role, relations, executables",
      read: (client) => conversationPrivacyCursorCatalogue(client),
    }),
  );

  // The same purge catalogue has two reviewed forms: without and with the
  // Growth API login as an incoming member of the core runtime role.
  const base = review.provenancePurgeCatalogueChecksum;
  const incoming = review.provenancePurgeIncomingCatalogueChecksum;
  if (hex(base) || hex(incoming))
    groups.push({
      id: "provenancePurgeCatalogueChecksum",
      covers: "the conversation provenance purge: role, executables, relation",
      members: [
        ...(hex(base)
          ? [
              {
                label: "without growth_api",
                path: ["provenancePurgeCatalogueChecksum"],
                pinned: base,
              },
            ]
          : []),
        ...(hex(incoming)
          ? [
              {
                label: "with growth_api",
                path: ["provenancePurgeIncomingCatalogueChecksum"],
                pinned: incoming,
              },
            ]
          : []),
      ],
      searchPath: "pg_catalog",
      read: (client) => generationProvenancePurgeCatalogue(client),
      select: (facts) =>
        facts.growthApi ? "with growth_api" : "without growth_api",
    });

  const comparison = record(review.comparison);
  if (hex(comparison.readerCatalogueChecksum))
    add(
      single(review, ["comparison", "readerCatalogueChecksum"], {
        covers: "the comparison reader: role, executables and relations",
        read: (client) => comparisonReaderCatalogue(client),
      }),
    );
  if (hex(record(comparison.privacy).catalogueChecksum))
    add(
      single(review, ["comparison", "privacy", "catalogueChecksum"], {
        covers: "comparison privacy: role, executables, storage, triggers",
        read: (client) => comparisonPrivacyCatalogue(client),
      }),
    );
  if (hex(comparison.artifactsCatalogueChecksum))
    add(
      single(review, ["comparison", "artifactsCatalogueChecksum"], {
        covers: "comparison export artifacts: role and relations",
        read: (client) => comparisonArtifactCatalogue(client),
      }),
    );

  // Lists of alternatives: any one member is accepted by the product, because
  // the same graph reviews differently on a fresh build, a restored populated
  // database, and with or without the Growth API login.
  for (const [list, covers, read] of [
    [
      "purposeProfiles",
      "the generation purposes' roles, memberships, settings and executables",
      (client: PoolClient) => generationWavePurposeCatalogue(client),
    ],
    [
      "originalFamilyProfiles",
      "the original privacy family",
      (client: PoolClient) => originalPrivacyFamilyPurposeCatalogue(client),
    ],
  ] as const) {
    const members = Array.isArray(review[list])
      ? (review[list] as unknown[])
      : [];
    const entries = members.flatMap((member, index) =>
      hex(record(member).sha256)
        ? [
            {
              label: String(record(member).review ?? index),
              path: [list, index, "sha256"] as JsonPath,
              pinned: record(member).sha256 as string,
            },
          ]
        : [],
    );
    if (entries.length)
      groups.push({ id: list, covers, members: entries, read });
  }

  const covered = new Set(
    groups.flatMap((group) => group.members.map((m) => m.path.join("."))),
  );
  const found = new Map<string, string>();
  walkHex(review, [], found);
  const unknown = [...found.keys()].filter(
    (path) => !covered.has(path) && !IMMUTABLE.some((rule) => rule.test(path)),
  );
  return { groups, unknown };
}

/** Read one group on its own read-only transaction and hash it exactly as the
 * product does. */
export async function liveDigest(
  client: PoolClient,
  group: PinGroup,
): Promise<string> {
  await client.query("BEGIN READ ONLY");
  try {
    if (group.searchPath)
      await client.query(`SET LOCAL search_path=${group.searchPath}`);
    return contentHash(await group.read(client));
  } finally {
    await client.query("ROLLBACK").catch(() => undefined);
  }
}
