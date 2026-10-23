# Committed review evidence budget

The Foundation pull-request workflow now checks the existing evidence policy
before accepting a review bundle: each added or changed regular file under
`artifacts/` is at most 300,000 bytes, and those files together are at most
1,000,000 bytes. A new or changed file cannot duplicate another artifact's Git
blob. Keep one copy and reference it. These are decimal KB/MB limits.

`scripts/check-evidence-budget.mjs` reads committed Git objects at the explicit
PR head against its merge base with the explicit base SHA. It does not inspect
generated working files, modify artifacts, subtract deleted bytes from the
budget, or reject untouched historical oversized/duplicate evidence. Symlinks
and submodules are not accepted as newly changed evidence. Filenames are read
with NUL delimiters; paths and refs never become shell commands.

The lightweight CI job uses the repository's existing pinned checkout and Node
actions, fetches history, and passes event SHAs through environment variables.
It requires no package install, provider credential or additional dependency.
Missing or invalid commits fail the check instead of silently skipping it.

## Observed checks

Eleven actual Git workflows passed in a separate disposable repository, using
real commits and invoking the command as a separate process: untouched legacy
evidence; exactly 300 KB; one byte over; exactly 1 MB total; four bytes over;
copying existing evidence; editing a file into a duplicate; a unique rename;
space/newline filenames; deletion attempting to offset new bytes; and an absent
base commit. Expected refusals returned nonzero. No unit tests were added.
ESLint and Prettier passed for the script and workflow. The current app branch
also passed against `origin/main`. This records local operation; the new remote
CI job has not yet been observed running.

Reproduce against any committed branch with fetched history:

```sh
node scripts/check-evidence-budget.mjs --base origin/main --head HEAD
```

For a stacked PR, pass its actual base branch. The checker enforces size and
duplicate storage only; review still decides whether the evidence supports the
claim. Raw diagnostic bundles belong outside Git.
