import type { Pool, PoolClient } from "pg";
import { DomainError } from "../../core/errors.js";
import type { PrivacyHook } from "../trust/contracts.js";
import {
  ContentPrivacyExport,
  type ContentPrivacyTaskAuthority,
} from "./privacy-export.js";
type Retained = NonNullable<
  Awaited<ReturnType<PrivacyHook["run"]>>["retained"]
>;

/** Worker-only hook. W8 injects its fixed restored held-client task authority.
 * Deletion needs genuine retention/revocation and original group-FK custody;
 * neither an outer verification callback nor invisible rows grant a body read.
 */
export function contentPrivacyHook(
  worker: Pool,
  _retention?: (input: Parameters<PrivacyHook["run"]>[0]) => Promise<Retained>,
  _revokeSources?: (
    client: PoolClient,
    creatorContentIds: string[],
  ) => Promise<void>,
  authority?: ContentPrivacyTaskAuthority,
  exporter?: ContentPrivacyExport,
): PrivacyHook {
  return {
    domain: "content",
    async run(input) {
      if (input.kind !== "export")
        throw new DomainError(
          "content_retention_unconfigured",
          "Current Content retention and source revocation are unavailable.",
          503,
        );
      if (!authority || !exporter)
        throw new DomainError(
          "content_privacy_purpose_unconfigured",
          "Current Content export authority is unavailable.",
          503,
        );
      exporter.assertPool(worker);
      return exporter.export(input, authority);
    },
  };
}
