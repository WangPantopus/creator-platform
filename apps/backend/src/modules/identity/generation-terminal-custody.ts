import {
  GENERATION_TERMINAL_DENIAL_MIGRATION,
  GENERATION_TERMINAL_MIGRATION,
} from "./generation-terminal.js";

/** Actual closed PostgreSQL17 installation receipts, not activation or positive
 * permission. Callers still supply the genuine worker registry, held W8 recovery
 * and actual W2/W4 settlement ports to GenerationTerminalAuthority.create. */
export const reviewedGenerationTerminalCustody = Object.freeze({
  migration: Object.freeze({
    version: GENERATION_TERMINAL_MIGRATION,
    checksum:
      "fadbf62a3ddf06142c3a6ad30313503f9bebe7b6d64f67f8ba01ff13ce2398c7",
  }),
  denialMigration: Object.freeze({
    version: GENERATION_TERMINAL_DENIAL_MIGRATION,
    checksum:
      "393920665d8860ee53ee6ef740ba0ad4a6921aceddcbf33f6419727e846532af",
  }),
  denialDefinitionChecksum:
    "fc465b04641c205007bc532f0e7f3e95450f1fb82bf0b66811d3a27c42923a22",
  definitions: Object.freeze({
    "creator.begin_generation_terminal(uuid,uuid,text,uuid,integer,boolean)":
      "b2631b4b917f2406fff50fb5beaaab8d0eb96e9512534d251d56ffb4e363b691",
    "creator.capture_generation_terminal()":
      "b61df43e7edd74a33f80be0965169c4295c739d0364c18d017f48a86aa6283c4",
    "creator.end_generation_terminal()":
      "ce3e9f466d859d7f46091b601bbd0b84357a9ee2a3157a3ca3e8e39f75a1aacc",
    "creator.generation_terminal_matches(uuid,uuid,boolean)":
      "c3f8423b34d38f4f5fdb74804ecffd7b4aa659d243d50a0524be88318ff6c8ad",
    "creator.pending_generation_terminals(integer)":
      "34fdf0905679881077e5e1479649781a15335e6ce4a4dc90ba7d2839b82f53be",
    "creator.require_generation_terminal_cleanup()":
      "c9df9677830afe0e1d6b2ac33ec3efd288319bdc909a5eb381946987b5bdcd62",
  }),
});
