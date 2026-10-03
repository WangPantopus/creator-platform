import { createHash } from "node:crypto";
import { Client, type Pool, type PoolClient } from "pg";
import { z } from "zod";
import { canonical, contentHash } from "../../core/canonical.js";
import { DomainError, invariant } from "../../core/errors.js";
import type { AccessService } from "../access/scope.js";
import {
  GenerationIdentityAuthority,
  type GenerationTerminalPurposeConsumer,
} from "../identity/generation-scope.js";
import {
  GenerationTerminalAuthority,
  type GenerationTerminalScope,
} from "../identity/generation-terminal.js";
import {
  PreparedGenerationTerminalJournal,
  type GenerationTerminalJournalReceipt,
} from "../agent/generation-terminal-journal.js";
import {
  generationSafetyTerminalPurposeCatalogue,
  assertGenerationSafetyTerminalCatalogue,
  GENERATION_SAFETY_TERMINAL_CATALOGUE_SHA256,
} from "./generation-safety-terminal-catalogue.js";
import { CommerceGenerationAllowance } from "./generation-allowance.js";
import { assertOriginalCostCustody } from "./original-cost-custody.js";

export const GENERATION_SAFETY_TERMINAL_MIGRATION =
  "0215_w4_generation_safety_terminal_settlement";
export const GENERATION_SAFETY_TERMINAL_SCHEMA_SHA256 =
  "97593fdef08464d54afe9ba14c340f873c4231bf48d11f3fc574a584cab6416f";
export const GENERATION_SAFETY_TERMINAL_SIGNATURES = [
  "creator.generation_settle_typed_original_allowance(uuid,uuid)",
  "creator.generation_typed_original_allowance_receipt(uuid,uuid)",
] as const;
const Owner = "creator_w4_generation_safety_terminal";
const Hash = z.string().regex(/^[a-f0-9]{64}$/u);
const Receipt = z.strictObject({
  generationId: z.uuid(),
  reservationId: z.uuid(),
  grantId: z.uuid(),
  state: z.enum(["held", "settled"]),
  policyVersion: z.string().min(1).max(200),
  ceilingUnits: z.int().positive(),
  outputDelivered: z.boolean(),
  units: z.int().nonnegative().nullable(),
  reference: Hash.nullable(),
  safetyExempt: z.boolean(),
  expectedUnits: z.int().nonnegative(),
  providerCostMicros: z.int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  providerCostReference: Hash,
});
export type TypedOriginalGenerationAllowanceReceipt = Readonly<
  z.infer<typeof Receipt>
>;

/** Typed original financial disposition. Genuine W1/W2 objects and actual
 * W3 durable provenance are required; no caller amount, kind or output proof.
 * Unknown costs remain unavailable with the original hold retained. */
export class CommerceGenerationSafetyTerminalSettlement {
  private readonly issued = new WeakMap<
    GenerationTerminalScope,
    {
      client: PoolClient;
      journal: GenerationTerminalJournalReceipt;
      receipt: TypedOriginalGenerationAllowanceReceipt;
    }
  >();
  private constructor(
    private readonly configuration: {
      identity: GenerationIdentityAuthority;
      terminal: GenerationTerminalAuthority;
      workerPool: Pool;
      hostPool: Pool;
      access: AccessService;
      allowance: CommerceGenerationAllowance;
      journal: PreparedGenerationTerminalJournal;
      consumers: readonly GenerationTerminalPurposeConsumer[];
      catalogueChecksum: string;
    },
  ) {}
  static async prepare(input: {
    identity: GenerationIdentityAuthority;
    terminal: GenerationTerminalAuthority;
    workerPool: Pool;
    hostPool: Pool;
    access: AccessService;
    allowance: CommerceGenerationAllowance;
    journal: PreparedGenerationTerminalJournal;
    consumers: readonly GenerationTerminalPurposeConsumer[];
    catalogueChecksum: string;
  }) {
    invariant(
      input.identity instanceof GenerationIdentityAuthority &&
        input.terminal instanceof GenerationTerminalAuthority &&
        input.allowance instanceof CommerceGenerationAllowance &&
        input.journal instanceof PreparedGenerationTerminalJournal,
      "generation_terminal_allowance_unconfigured",
      "Use the actual original identity, terminal, journal and allowance owners.",
    );
    input.identity.assertPool(input.workerPool);
    input.terminal.assertPool(input.workerPool);
    input.allowance.assertComposition(input.hostPool, input.access);
    input.journal.assertHostPool(input.hostPool);
    const host = new Client(input.hostPool.options),
      worker = new Client(input.workerPool.options);
    const endpoint = (client: Client) =>
      canonical({
        host: client.host,
        port: client.port,
        database: client.database,
      });
    invariant(
      host.user === "creator_runtime" &&
        worker.user === "creator_generation_worker" &&
        endpoint(host) === endpoint(worker),
      "generation_terminal_allowance_pool_mismatch",
      "Use distinct canonical host and worker logins on the same database.",
    );
    const consumers = input.consumers.map((r) =>
      Object.freeze({ ...r, migration: Object.freeze({ ...r.migration }) }),
    );
    invariant(
      consumers.length === 2 &&
        new Set(consumers.map((r) => r.signature)).size === 2 &&
        input.catalogueChecksum ===
          GENERATION_SAFETY_TERMINAL_CATALOGUE_SHA256 &&
        consumers.every(
          (r) =>
            GENERATION_SAFETY_TERMINAL_SIGNATURES.some(
              (s) => s === r.signature,
            ) &&
            r.owner === Owner &&
            r.migration.version === GENERATION_SAFETY_TERMINAL_MIGRATION &&
            r.migration.checksum === GENERATION_SAFETY_TERMINAL_SCHEMA_SHA256 &&
            Hash.safeParse(r.definitionChecksum).success,
        ),
      "generation_terminal_allowance_unconfigured",
      "Both independently reviewed original financial executables and catalogue are required.",
    );
    for (const r of consumers)
      input.identity.assertTerminalConsumerRegistered(r);
    const settlement = new CommerceGenerationSafetyTerminalSettlement({
      ...input,
      consumers: Object.freeze(consumers),
    });
    const client = await input.workerPool.connect();
    let failed = false;
    let failure: unknown;
    try {
      await client.query("BEGIN ISOLATION LEVEL READ COMMITTED");
      await settlement.assertCatalogue(client);
    } catch (error) {
      failed = true;
      failure = error;
    }
    let discard = false;
    try {
      await client.query("ROLLBACK");
    } catch (error) {
      discard = true;
      if (!failed) {
        failed = true;
        failure = error;
      }
      // Wait for the actual connection to close before removing it from the
      // pool. An unsuccessful rollback must never return a reusable client.
      try {
        await client.end();
      } catch {
        // Retain the original review/rollback failure.
      }
    }
    try {
      client.release(discard ? true : undefined);
    } catch (error) {
      if (!failed) {
        failed = true;
        failure = error;
      }
    }
    if (failed) throw failure;
    return settlement;
  }
  private async assertCatalogue(client: PoolClient) {
    await assertGenerationSafetyTerminalCatalogue(client);
    await assertOriginalCostCustody(client);
    const ready = (
      await client.query<{ ready: boolean }>(
        `SELECT session_user='creator_generation_worker' AND current_user=session_user
   AND EXISTS(SELECT FROM creator.schema_migration WHERE version=$2 AND checksum=$3)
   AND NOT has_function_privilege(session_user,to_regprocedure('creator.generation_settle_original_allowance(uuid,uuid)'),'EXECUTE')
   AND NOT has_function_privilege(session_user,to_regprocedure('creator.generation_original_allowance_receipt(uuid,uuid)'),'EXECUTE')
   AND EXISTS(SELECT FROM pg_roles r WHERE r.rolname=$1 AND NOT r.rolcanlogin AND NOT r.rolinherit
    AND NOT r.rolsuper AND NOT r.rolbypassrls AND NOT r.rolcreatedb AND NOT r.rolcreaterole AND NOT r.rolreplication
    AND (r.rolconfig IS NULL OR cardinality(r.rolconfig)=0)
    AND NOT EXISTS(SELECT FROM pg_auth_members WHERE member=r.oid OR roleid=r.oid)
    AND NOT EXISTS(SELECT FROM pg_namespace WHERE nspowner=r.oid)
    AND NOT EXISTS(SELECT FROM pg_class WHERE relowner=r.oid)
    AND (SELECT count(*)=2 FROM pg_proc WHERE proowner=r.oid))
   AND NOT EXISTS(SELECT FROM pg_namespace n WHERE n.nspname !~ '^pg_' AND n.nspname<>'information_schema'
    AND has_schema_privilege($1,n.oid,'CREATE'))
   AND NOT EXISTS(SELECT FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname !~ '^pg_' AND n.nspname<>'information_schema' AND c.relkind='S'
     AND CASE WHEN c.relkind='S' THEN has_sequence_privilege($1,c.oid,'USAGE,SELECT,UPDATE') ELSE false END)
   AND NOT EXISTS(SELECT FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname !~ '^pg_' AND n.nspname<>'information_schema' AND pg_get_userbyid(p.proowner)<>$1
     AND p.oid NOT IN(to_regprocedure('creator.generation_terminal_matches(uuid,uuid,boolean)'),to_regprocedure('creator.canonical_json(jsonb)'))
     AND ((p.prosecdef AND has_function_privilege($1,p.oid,'EXECUTE'))
      OR EXISTS(SELECT FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
       WHERE a.grantee=(SELECT oid FROM pg_roles WHERE rolname=$1) AND a.privilege_type='EXECUTE')))
   AND NOT EXISTS(SELECT FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname !~ '^pg_' AND n.nspname<>'information_schema' AND c.relkind IN('r','p','v','m','f')
     AND CASE WHEN c.relkind IN('r','p','v','m','f') THEN has_table_privilege($1,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') ELSE false END) AS ready`,
        [
          Owner,
          GENERATION_SAFETY_TERMINAL_MIGRATION,
          GENERATION_SAFETY_TERMINAL_SCHEMA_SHA256,
        ],
      )
    ).rows[0]?.ready;
    if (ready !== true) this.unavailable();
    for (const r of this.configuration.consumers) {
      const fn = (
        await client.query<{ ready: boolean; definition: string }>(
          `SELECT p.prosecdef AND p.provolatile='v'
    AND p.prokind='f' AND p.prorettype='jsonb'::regtype AND p.proconfig=ARRAY['search_path=pg_catalog']
    AND pg_get_userbyid(p.proowner)=$2 AND has_function_privilege(session_user,p.oid,'EXECUTE')
    AND NOT EXISTS(SELECT FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
     LEFT JOIN pg_roles recipient ON recipient.oid=a.grantee WHERE a.privilege_type<>'EXECUTE'
      OR recipient.rolname IS NULL OR recipient.rolname NOT IN($2,'creator_generation_worker')
      OR (a.grantee<>p.proowner AND a.is_grantable)) AS ready,pg_get_functiondef(p.oid) AS definition
    FROM pg_proc p WHERE p.oid=to_regprocedure($1)`,
          [r.signature, Owner],
        )
      ).rows[0];
      if (
        fn?.ready !== true ||
        createHash("sha256").update(fn.definition).digest("hex") !==
          r.definitionChecksum
      )
        this.unavailable();
    }
    // Use this held client's exact catalogue, not an outside transaction's read.
    const catalogue = await generationSafetyTerminalPurposeCatalogue(client);
    if (contentHash(catalogue) !== this.configuration.catalogueChecksum)
      this.unavailable();
  }
  private unavailable(): never {
    throw new DomainError(
      "generation_terminal_allowance_unconfigured",
      "Actual typed original financial terminal custody is unavailable.",
      503,
    );
  }
  private verify(
    scope: GenerationTerminalScope,
    journal: GenerationTerminalJournalReceipt,
    raw: unknown,
  ) {
    const value = Receipt.parse(raw);
    invariant(
      value.generationId === scope.generationId &&
        value.reservationId === scope.reservationId &&
        value.grantId === scope.grantId &&
        value.outputDelivered === scope.lastSequence > 0 &&
        journal.custody === "sealed" &&
        journal.state !== "unknown" &&
        journal.costMicros !== null &&
        value.providerCostMicros === journal.costMicros &&
        value.providerCostReference === journal.reference &&
        value.state === "settled" &&
        value.reference === journal.reference &&
        value.units === value.expectedUnits &&
        value.units !== null &&
        value.units <= value.ceilingUnits &&
        (!value.safetyExempt || (value.outputDelivered && value.units === 0)),
      "generation_terminal_allowance_changed",
      "The real all-attempt cost, typed safety disposition and original cursor must agree.",
    );
    return Object.freeze(value);
  }
  async settleInTransaction(
    client: PoolClient,
    scope: GenerationTerminalScope,
  ) {
    this.configuration.allowance.assertComposition(
      this.configuration.hostPool,
      this.configuration.access,
    );
    await this.configuration.terminal.authorizeInTransaction(
      scope,
      client,
      true,
    );
    await this.assertCatalogue(client);
    const journal = await this.configuration.journal.sealInTransaction(
      client,
      scope,
    );
    const raw = (
      await client.query<{ receipt: unknown }>(
        "SELECT creator.generation_settle_typed_original_allowance($1,$2) AS receipt",
        [scope.generationId, scope.custodyToken],
      )
    ).rows[0]?.receipt;
    const receipt = this.verify(scope, journal, raw);
    await this.configuration.journal.assertCurrentInTransaction(
      client,
      scope,
      journal,
    );
    await this.configuration.terminal.authorizeInTransaction(
      scope,
      client,
      true,
    );
    this.issued.set(scope, { client, journal, receipt });
    return receipt;
  }
  /** Actual W1 terminal owner calls this after all W3/W2/W4 writes, before its
   * own restoration/currentness/end/COMMIT. No missing callback means settled. */
  async assertSettledInTransaction(
    client: PoolClient,
    scope: GenerationTerminalScope,
  ) {
    const binding = this.issued.get(scope);
    invariant(
      binding?.client === client,
      "generation_terminal_allowance_required",
      "This actual held terminal has no original financial disposition.",
    );
    await this.configuration.terminal.authorizeInTransaction(
      scope,
      client,
      true,
    );
    await this.configuration.journal.assertCurrentInTransaction(
      client,
      scope,
      binding.journal,
    );
    await this.assertCatalogue(client);
    const raw = (
      await client.query<{ receipt: unknown }>(
        "SELECT creator.generation_typed_original_allowance_receipt($1,$2) AS receipt",
        [scope.generationId, scope.custodyToken],
      )
    ).rows[0]?.receipt;
    const current = this.verify(scope, binding.journal, raw);
    invariant(
      contentHash(current) === contentHash(binding.receipt),
      "generation_terminal_allowance_changed",
      "Original financial disposition changed before terminal COMMIT.",
    );
    await this.configuration.terminal.authorizeInTransaction(
      scope,
      client,
      true,
    );
  }
}
