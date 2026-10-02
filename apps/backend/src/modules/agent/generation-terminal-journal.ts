import { createHash } from "node:crypto";
import { Client, type Pool, type PoolClient } from "pg";
import { z } from "zod";
import { canonical, contentHash } from "../../core/canonical.js";
import { DomainError, invariant } from "../../core/errors.js";
import {
  GenerationIdentityAuthority,
  type GenerationPurposeConsumer,
} from "../identity/generation-scope.js";
import {
  GenerationTerminalAuthority,
  type GenerationTerminalScope,
} from "../identity/generation-terminal.js";
import { PreparedGenerationJournal } from "./generation-journal.js";
import { generationConsumerCatalogue } from "../../core/purpose-catalogue.js";

export const GENERATION_TERMINAL_JOURNAL_MIGRATION =
  "0105_w2_generation_terminal_journal";
export const GENERATION_TERMINAL_JOURNAL_SIGNATURES = [
  "creator.generation_agent_journal_receipt(uuid,uuid)",
  "creator.generation_seal_agent_journal(uuid,uuid)",
] as const;
const PrivateHelper = "creator.generation_append_agent_receipt(uuid,uuid)";
const Owner = "creator_w2_generation_terminal_journal";
const Hash = z.string().regex(/^[a-f0-9]{64}$/u);
const Receipt = z.strictObject({
  generationId: z.uuid(),
  custody: z.enum(["missing", "open", "sealed"]),
  state: z.enum(["known", "unknown", "no_request"]),
  costMicros: z.int().nonnegative().max(Number.MAX_SAFE_INTEGER).nullable(),
  usageIds: z.array(z.uuid()).max(100000),
  attemptIds: z.array(z.uuid()).max(100000),
  reference: z.union([Hash, z.literal("")]),
  retentionPolicyVersion: z.string().min(1).max(200).nullable(),
});
export type GenerationTerminalJournalReceipt = Readonly<
  Omit<z.infer<typeof Receipt>, "usageIds" | "attemptIds"> & {
    usageIds: readonly string[];
    attemptIds: readonly string[];
  }
>;

/** Original accepted all-attempt accounting only. This consumer cannot issue a
 * ThreadScope, admission, provider call, message or monetary settlement. */
export class PreparedGenerationTerminalJournal {
  private readonly issued = new WeakMap<
    GenerationTerminalJournalReceipt,
    { client: PoolClient; scope: GenerationTerminalScope; hash: string }
  >();
  private constructor(
    private readonly terminal: GenerationTerminalAuthority,
    private readonly journal: PreparedGenerationJournal,
    private readonly hostPool: Pool,
  ) {}

  assertHostPool(pool: Pool): void {
    invariant(
      pool === this.hostPool,
      "generation_terminal_journal_pool_mismatch",
      "Use this journal's actual canonical host pool.",
    );
  }

  static async prepare(input: {
    identity: GenerationIdentityAuthority;
    terminal: GenerationTerminalAuthority;
    workerPool: Pool;
    hostPool: Pool;
    journal: PreparedGenerationJournal;
    consumers: readonly GenerationPurposeConsumer[];
    privateHelperDefinitionChecksum: string;
    /** Independently reviewed effective column/table/RLS/schema catalogue. */
    catalogueChecksum: string;
  }): Promise<PreparedGenerationTerminalJournal> {
    invariant(
      input.identity instanceof GenerationIdentityAuthority &&
        input.terminal instanceof GenerationTerminalAuthority &&
        input.journal instanceof PreparedGenerationJournal,
      "generation_terminal_journal_unconfigured",
      "Actual original identity, terminal and privacy-registered journal custody are required.",
    );
    input.identity.assertPool(input.workerPool);
    input.terminal.assertPool(input.workerPool);
    input.journal.assertPool(input.hostPool);
    const host = new Client(input.hostPool.options);
    const worker = new Client(input.workerPool.options);
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
      "generation_terminal_journal_pool_mismatch",
      "Use distinct canonical host and worker logins on the same database.",
    );
    const receipts = [...input.consumers];
    invariant(
      receipts.length === GENERATION_TERMINAL_JOURNAL_SIGNATURES.length &&
        Hash.safeParse(input.privateHelperDefinitionChecksum).success &&
        Hash.safeParse(input.catalogueChecksum).success &&
        new Set(receipts.map((r) => r.signature)).size === receipts.length &&
        receipts.every(
          (r) =>
            GENERATION_TERMINAL_JOURNAL_SIGNATURES.some(
              (s) => s === r.signature,
            ) &&
            r.owner === Owner &&
            r.migration.version === GENERATION_TERMINAL_JOURNAL_MIGRATION &&
            Hash.safeParse(r.migration.checksum).success &&
            Hash.safeParse(r.definitionChecksum).success &&
            r.migration.checksum === receipts[0]!.migration.checksum,
        ),
      "generation_terminal_journal_unconfigured",
      "Both exact reviewed terminal journal executables and catalogue are required.",
    );
    for (const receipt of receipts)
      input.identity.assertConsumerRegistered(receipt);
    try {
      const ready = (
        await input.workerPool.query<{ ready: boolean; databaseOid: number }>(
          `SELECT (SELECT oid FROM pg_database WHERE datname=current_database()) AS "databaseOid",
           session_user='creator_generation_worker' AND current_user=session_user
           AND EXISTS(SELECT FROM creator.schema_migration WHERE version=$1 AND checksum=$2)
           AND EXISTS(SELECT FROM pg_roles r WHERE r.rolname=$3 AND NOT r.rolcanlogin
            AND NOT r.rolinherit AND NOT r.rolsuper AND NOT r.rolbypassrls AND NOT r.rolcreatedb
            AND NOT r.rolcreaterole AND NOT r.rolreplication AND (r.rolconfig IS NULL OR cardinality(r.rolconfig)=0)
            AND NOT EXISTS(SELECT FROM pg_auth_members WHERE member=r.oid OR roleid=r.oid)
            AND NOT EXISTS(SELECT FROM pg_namespace WHERE nspowner=r.oid)
            AND NOT EXISTS(SELECT FROM pg_class WHERE relowner=r.oid)
            AND (SELECT count(*)=3 FROM pg_proc WHERE proowner=r.oid))
           AND NOT has_function_privilege(session_user,to_regprocedure($4),'EXECUTE')
           AND NOT EXISTS(SELECT FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
            WHERE n.nspname !~ '^pg_' AND n.nspname<>'information_schema'
             AND pg_get_userbyid(p.proowner)<>$3
             AND p.oid NOT IN(to_regprocedure('creator.generation_terminal_matches(uuid,uuid,boolean)'),
              to_regprocedure('creator.canonical_json(jsonb)'))
             AND ((p.prosecdef AND has_function_privilege($3,p.oid,'EXECUTE'))
              OR EXISTS(SELECT FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
               WHERE a.grantee=(SELECT oid FROM pg_roles WHERE rolname=$3) AND a.privilege_type='EXECUTE')))
           AS ready`,
          [
            GENERATION_TERMINAL_JOURNAL_MIGRATION,
            receipts[0]!.migration.checksum,
            Owner,
            PrivateHelper,
          ],
        )
      ).rows[0];
      const hostDatabase = (
        await input.hostPool.query<{ databaseOid: number }>(
          'SELECT oid AS "databaseOid" FROM pg_database WHERE datname=current_database()',
        )
      ).rows[0];
      if (
        ready?.ready !== true ||
        ready.databaseOid !== hostDatabase?.databaseOid
      )
        throw new Error("Unreviewed original journal custody");
      for (const signature of [
        ...GENERATION_TERMINAL_JOURNAL_SIGNATURES,
        PrivateHelper,
      ]) {
        const privateHelper = signature === PrivateHelper;
        const row = (
          await input.workerPool.query<{ ready: boolean; definition: string }>(
            `SELECT p.prosecdef=$3 AND p.provolatile='v' AND p.prokind='f'
             AND p.proconfig=ARRAY['search_path=pg_catalog'] AND pg_get_userbyid(p.proowner)=$2
             AND NOT EXISTS(SELECT FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
              LEFT JOIN pg_roles r ON r.oid=a.grantee WHERE a.privilege_type<>'EXECUTE'
               OR r.rolname IS NULL OR r.rolname<>$2 AND ($3=false OR r.rolname<>'creator_generation_worker')
               OR (a.grantee<>p.proowner AND a.is_grantable))
             AND ($3=false OR has_function_privilege(session_user,p.oid,'EXECUTE')) AS ready,
             pg_get_functiondef(p.oid) AS definition FROM pg_proc p WHERE p.oid=to_regprocedure($1)`,
            [signature, Owner, !privateHelper],
          )
        ).rows[0];
        const expected = privateHelper
          ? input.privateHelperDefinitionChecksum
          : receipts.find((r) => r.signature === signature)!.definitionChecksum;
        if (
          row?.ready !== true ||
          createHash("sha256").update(row.definition).digest("hex") !== expected
        )
          throw new Error("Unreviewed original journal executable");
      }
      if (
        contentHash(
          await generationConsumerCatalogue(input.workerPool, Owner),
        ) !== input.catalogueChecksum
      )
        throw new Error("Unreviewed original journal catalogue");
    } catch {
      throw new DomainError(
        "generation_terminal_journal_unconfigured",
        "Reviewed original terminal journal custody is unavailable.",
        503,
      );
    }
    return new PreparedGenerationTerminalJournal(
      input.terminal,
      input.journal,
      input.hostPool,
    );
  }

  private async read(
    client: PoolClient,
    scope: GenerationTerminalScope,
    seal: boolean,
  ): Promise<GenerationTerminalJournalReceipt> {
    await this.terminal.authorizeInTransaction(scope, client, true);
    await this.journal.assertClient(client);
    const raw = (
      await client.query<{ receipt: unknown }>(
        seal
          ? "SELECT creator.generation_seal_agent_journal($1,$2) AS receipt"
          : "SELECT creator.generation_agent_journal_receipt($1,$2) AS receipt",
        [scope.generationId, scope.custodyToken],
      )
    ).rows[0]?.receipt;
    const value = Receipt.parse(raw);
    invariant(
      value.generationId === scope.generationId &&
        (value.custody === "missing"
          ? value.retentionPolicyVersion === null
          : value.retentionPolicyVersion ===
            this.journal.retentionPolicyVersion) &&
        new Set(value.usageIds).size === value.usageIds.length &&
        new Set(value.attemptIds).size === value.attemptIds.length &&
        (value.custody === "sealed"
          ? value.reference.length === 64 &&
            (value.state === "unknown"
              ? value.costMicros === null
              : value.costMicros !== null &&
                (value.state === "no_request"
                  ? value.usageIds.length === 0 && value.costMicros === 0
                  : value.usageIds.length > 0))
          : value.state === "unknown" &&
            value.costMicros === null &&
            value.reference === "" &&
            value.usageIds.length === 0 &&
            value.attemptIds.length === 0) &&
        (!seal || value.custody !== "open"),
      "generation_terminal_journal_changed",
      "The genuine original all-attempt journal and retention custody must match.",
    );
    await this.terminal.authorizeInTransaction(scope, client, true);
    return Object.freeze({
      ...value,
      usageIds: Object.freeze(value.usageIds),
      attemptIds: Object.freeze(value.attemptIds),
    });
  }

  async currentInTransaction(
    client: PoolClient,
    scope: GenerationTerminalScope,
  ) {
    const value = await this.read(client, scope, false);
    this.issued.set(value, { client, scope, hash: contentHash(value) });
    return value;
  }
  async sealInTransaction(client: PoolClient, scope: GenerationTerminalScope) {
    const value = await this.read(client, scope, true);
    this.issued.set(value, { client, scope, hash: contentHash(value) });
    return value;
  }
  async assertCurrentInTransaction(
    client: PoolClient,
    scope: GenerationTerminalScope,
    value: GenerationTerminalJournalReceipt,
  ): Promise<void> {
    const binding = this.issued.get(value);
    invariant(
      binding?.client === client &&
        binding.scope === scope &&
        binding.hash === contentHash(value),
      "generation_terminal_journal_required",
      "Use this same held client's privately issued original receipt.",
    );
    invariant(
      contentHash(await this.read(client, scope, false)) === binding.hash,
      "generation_terminal_journal_changed",
      "The original journal receipt changed during settlement.",
    );
  }
}
