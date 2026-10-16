import { createHash } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import { contentHash } from "../../core/canonical.js";
import { DomainError, invariant } from "../../core/errors.js";
import {
  assertGenerationConsumerCustody,
  generationConsumerCatalogue,
  type GenerationConsumerCustody,
} from "../agent/generation-consumer-catalogue.js";
import {
  GenerationIdentityAuthority,
  type GenerationPurposeConsumer,
  type GenerationTaskScope,
} from "../identity/generation-scope.js";

/** The integrator assigns the number when it registers the proposal. */
export const GENERATION_MEMORY_MIGRATION =
  /^\d{4}_w3_generation_memory_proposals$/u;
/** SHA-256 of pending_w3_generation_memory_proposals.sql as proposed. */
export const GENERATION_MEMORY_SOURCE_SHA256 =
  "d84d6e027f46c1ce01d764e9a7f53a6d0014b6a3cbc8b8b4a5fcad40a84c66cd";
export const GENERATION_MEMORY_SIGNATURE =
  "creator.generation_memory_proposals(uuid,uuid,jsonb)";
const owner = "creator_w3_generation_memory";
const Hash = z.string().regex(/^[a-f0-9]{64}$/u);
export const MemoryProposalItem = z.strictObject({
  kind: z.enum(["fact", "open_loop"]),
  text: z.string().min(1).max(500),
  semanticKey: z.string().min(1).max(120),
  sensitiveCategory: z
    .enum([
      "health",
      "sexuality",
      "religion",
      "politics",
      "ethnicity",
      "union",
      "financial_hardship",
      "sensitive_unspecified",
    ])
    .nullable(),
});
export type MemoryProposalItem = z.infer<typeof MemoryProposalItem>;

/** W3's writer of memory proposals for the generation worker (B5). It writes
 * only `proposed` items for the original accepted turn, inside W1's held
 * generation transaction; the fan accepts each one before it is memory, and a
 * sensitive one only with its own consent (INV-23). Off the record, a changed
 * turn or an excluded key writes nothing. */
export class PreparedGenerationConversationMemory {
  private constructor(
    private readonly identity: GenerationIdentityAuthority,
    private readonly custody: GenerationConsumerCustody,
  ) {}

  static async prepare(input: {
    identity: GenerationIdentityAuthority;
    workerPool: Pool;
    /** Reviewed source/install receipt and catalogue, never read back. */
    consumer: GenerationPurposeConsumer;
    catalogueChecksum: string;
  }): Promise<PreparedGenerationConversationMemory> {
    invariant(
      input.identity instanceof GenerationIdentityAuthority,
      "generation_memory_unconfigured",
      "The genuine generation purpose issuer is required.",
    );
    input.identity.assertPool(input.workerPool);
    const receipt = Object.freeze({
      ...input.consumer,
      migration: Object.freeze({ ...input.consumer.migration }),
    });
    invariant(
      receipt.owner === owner &&
        receipt.signature === GENERATION_MEMORY_SIGNATURE &&
        GENERATION_MEMORY_MIGRATION.test(receipt.migration.version) &&
        receipt.migration.checksum === GENERATION_MEMORY_SOURCE_SHA256 &&
        Hash.safeParse(receipt.definitionChecksum).success &&
        Hash.safeParse(input.catalogueChecksum).success,
      "generation_memory_unconfigured",
      "The exact reviewed W3 memory executable and catalogue are required.",
    );
    input.identity.assertConsumerRegistered(receipt);
    const custody: GenerationConsumerCustody = Object.freeze({
      owner,
      consumers: Object.freeze([receipt]),
      catalogueChecksum: input.catalogueChecksum,
      callers: Object.freeze([]),
      dependencies: Object.freeze([
        "creator.generation_scope_matches(uuid,uuid)",
        "creator.canonical_json(jsonb)",
      ]),
    });
    try {
      await assertGenerationConsumerCustody(input.workerPool, custody);
      const row = (
        await input.workerPool.query<{ ready: boolean; definition: string }>(
          `SELECT session_user='creator_generation_worker'
           AND EXISTS(SELECT FROM creator.schema_migration WHERE version=$1 AND checksum=$2)
           AND p.prosecdef AND p.provolatile='v' AND p.proconfig=ARRAY['search_path=pg_catalog']
           AND pg_get_userbyid(p.proowner)=$3 AND has_function_privilege(session_user,p.oid,'EXECUTE')
           AND NOT EXISTS(SELECT FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
            WHERE a.grantee=0 AND a.privilege_type='EXECUTE') AS ready,
           pg_get_functiondef(p.oid) AS definition
           FROM pg_proc p WHERE p.oid=to_regprocedure($4)`,
          [
            receipt.migration.version,
            receipt.migration.checksum,
            owner,
            receipt.signature,
          ],
        )
      ).rows[0];
      if (
        row?.ready !== true ||
        createHash("sha256").update(row.definition).digest("hex") !==
          receipt.definitionChecksum ||
        contentHash(
          await generationConsumerCatalogue(input.workerPool, owner),
        ) !== input.catalogueChecksum
      )
        throw new Error("Unreviewed memory proposal custody");
    } catch (cause) {
      const failure = new DomainError(
        "generation_memory_unconfigured",
        "Reviewed generation memory proposals are unavailable.",
        503,
      );
      Object.defineProperty(failure, "cause", {
        value: cause,
        configurable: true,
        writable: true,
      });
      throw failure;
    }
    return new PreparedGenerationConversationMemory(input.identity, custody);
  }

  /** On W1's held transaction for this exact task; returns the items written. */
  async proposeInTransaction(
    client: PoolClient,
    scope: GenerationTaskScope,
    items: readonly MemoryProposalItem[],
  ): Promise<number> {
    const batch = z.array(MemoryProposalItem).max(5).parse(items);
    await this.identity.authorizeInTransaction(scope, client);
    await assertGenerationConsumerCustody(client, this.custody);
    const written = (
      await client.query<{ written: number }>(
        "SELECT creator.generation_memory_proposals($1,$2,$3::jsonb) AS written",
        [scope.generationId, scope.workerToken, JSON.stringify(batch)],
      )
    ).rows[0]?.written;
    invariant(
      Number.isInteger(written) && written! >= 0 && written! <= batch.length,
      "generation_memory_unavailable",
      "The memory proposal write is unavailable.",
    );
    await assertGenerationConsumerCustody(client, this.custody);
    await this.identity.authorizeInTransaction(scope, client);
    return written!;
  }
}
