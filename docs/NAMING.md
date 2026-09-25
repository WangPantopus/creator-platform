# Naming: the placeholder product name

The product has no final name yet. Everywhere in this repository (docs, designs,
code, config) it is called **Qelvora**, a made-up word chosen so that it can be
replaced mechanically once the real name is decided.

`Qelvora` is not an English word, not a product term used in the source
documents, and not a substring of any other word, so a case-sensitive
"Replace All" touches only the product name.

## The three spellings

| Spelling | Used for | Examples |
| --- | --- | --- |
| `Qelvora` | Prose, UI copy, titles, designs | "Welcome to Qelvora", "Qelvora Studio" |
| `qelvora` | Code identifiers, package names, URLs, file names, database schemas, CSS classes | `@pantopus/qelvora-web`, `qelvora.app`, `qelvora_api` |
| `QELVORA` | Environment variables and constants | `QELVORA_API_URL` |

To rename, run three case-sensitive replacements (`Qelvora` → `NewName`,
`qelvora` → `newname`, `QELVORA` → `NEWNAME`) across the repository, or one
case-preserving replacement if your editor supports it. Then rename any files or
folders whose names contain `qelvora`.

## Rules that keep the replacement clean

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
4. **The company name is Pantopus.** "Pantopus" is the parent company and the
   shared account ("Continue with Pantopus"). It is not a placeholder and must
   never be replaced by the product rename.
5. **"Creator Network"** in `docs/source/Product_Design_Flows_Screens_and_Copy.md`
   (section 12) is the source documents' own earlier placeholder. The source docs
   are kept as written; new work uses `Qelvora`.

## What a text replacement cannot rename

Log each of these here when it is created, so the rename checklist is complete.

| Item | Why it needs manual work | Status |
| --- | --- | --- |
| Logo, wordmark, app icon | A drawn asset; the name's length and letterforms change the design | Not created yet |
| iOS bundle ID and Android application ID | Cannot be changed after the first store submission. Use `com.pantopus.qelvora` and rename before the first submission | Not created yet |
| App Store / Play Store listing names | Changed in the store consoles | Not created yet |
| Domain names and email sender domains | Must be registered; old ones should redirect | Not created yet |
| Stripe products, prices and statement descriptors | Changed in the Stripe dashboard | Not created yet |
| OAuth / passkey relying-party IDs | A WebAuthn relying-party ID is tied to a domain; passkeys registered under the old domain stop working after a domain change. Decide the final domain before creators register passkeys | Not created yet |
| Published design artifacts on claude.ai | Artifact titles and canvases are edited in place, not in this repo | Not created yet |
| Third-party accounts (analytics, push, model, voice and call providers) | Project names in each provider's console | Not created yet |
