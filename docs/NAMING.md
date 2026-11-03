# Naming: Hotpot transition

The founder selected **Hotpot** under **Pantopus** on 2026-11-02 (Pacific time).
This supersedes the placeholder-only naming rule. Apple has registered
`com.pantopus.hotpot` under Pantopus, Inc. (team `6UYZBA546R`), with Sign in with
Apple enabled. App Store Connect rejected the exact listing name **Hotpot** as
already in use; an alternative listing name awaits the founder. No app record or
TestFlight upload has been completed.

The existing source, package names and historical docs still use **Qelvora**.
The repository-wide rename below is pending; the first build preflight uses build
settings for the Hotpot display name and bundle ID without changing app behavior.

`Qelvora` is not an English word, not a product term used in the source
documents, and not a substring of any other word, so a case-sensitive
"Replace All" touches only the product name.

## The three spellings

| Spelling  | Used for                                                                         | Examples                                              |
| --------- | -------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `Qelvora` | Prose, UI copy, titles, designs                                                  | "Welcome to Qelvora", "Qelvora Studio"                |
| `qelvora` | Code identifiers, package names, URLs, file names, database schemas, CSS classes | `@pantopus/qelvora-web`, `qelvora.app`, `qelvora_api` |
| `QELVORA` | Environment variables and constants                                              | `QELVORA_API_URL`                                     |

To rename, run three case-sensitive replacements (`Qelvora` → `NewName`,
`qelvora` → `newname`, `QELVORA` → `NEWNAME`) across the repository, or one
case-preserving replacement if your editor supports it. Then rename any files or
folders whose names contain `qelvora`.

## Rules that keep the replacement clean

New implementation uses `config/brand.json` as its runtime brand source. Run
`pnpm brand:rename NewName --dry-run` to preview a repository-wide rename, and
`pnpm brand:rename NewName` to apply it in one command, including text filenames.
Run `pnpm install && pnpm generate && pnpm check` afterward. The chosen product
name is Hotpot; the coordinated source rename and its checks remain pending.

1. **One unbroken word.** It may be joined to other words (`QelvoraStudio`,
   `qelvora-api`, `qelvoraClient`), but the token itself is never split, spaced
   or hyphenated inside (`Qel-vora`, `Qel vora`).
2. **Only the three spellings.** No other casing (`QElvora`), no abbreviation
   (`QV`, `QLV`), no plural (`Qelvoras`), no possessive (`Qelvora's`). Write
   "the Qelvora app" or "on Qelvora" instead of a possessive, so the replacement
   never has to handle grammar.
3. **Nothing else carries the name.** Sample content stays independent: the
   sample creators "Maya" and "Devon", the team member "Priya", the sample tier
   ("Studio" in the source docs, "Kiln Club" in designs), the pottery examples
   (kilns, cone 6 glazes, `@kilnfire`) and the sponsor "Glazeco" are content,
   not product naming, and must not be replaced.
4. **The company name is Pantopus.** "Pantopus" is the parent company, and the
   account a Qelvora account can later link to (the pilot signs in with Apple and
   Google; see the BRIEF's decision log). It is not a placeholder and must never
   be replaced by the product rename.
5. **"Creator Network"** in `docs/source/Product_Design_Flows_Screens_and_Copy.md`
   (section 12) is the source documents' own earlier placeholder. The source docs
   are kept as written; new work uses `Qelvora`.

## What a text replacement cannot rename

Log each of these here when it is created, so the rename checklist is complete.

| Item                                                                    | Why it needs manual work                                                                                                                                                                | Status                    |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| Logo, wordmark, app icon                                                | A drawn asset; the name's length and letterforms change the design                                                                                                                      | Not created yet           |
| iOS bundle ID and Android application ID                                | Cannot be changed after the first store submission. Local hosts use `com.pantopus.qelvora`; the rename command updates source IDs before submission                                     | Hotpot iOS ID registered; not uploaded. Android unchanged |
| App Store / Play Store listing names                                    | Changed in the store consoles                                                                                                                                                           | Exact Hotpot listing name unavailable; record not created |
| Domain names and email sender domains                                   | Must be registered; old ones should redirect                                                                                                                                            | Not created yet           |
| Stripe products, prices and statement descriptors                       | Changed in the Stripe dashboard                                                                                                                                                         | Not created yet           |
| OAuth / passkey relying-party IDs                                       | A WebAuthn relying-party ID is tied to a domain; passkeys registered under the old domain stop working after a domain change. Decide the final domain before creators register passkeys | Not created yet           |
| Published design artifacts on claude.ai                                 | Artifact titles and canvases are edited in place, not in this repo                                                                                                                      | Not created yet           |
| Third-party accounts (analytics, push, model, voice and call providers) | Project names in each provider's console                                                                                                                                                | Not created yet           |
