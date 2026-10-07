# PR reconciliation evidence

Human conclusions and continuation ownership: [remaining PR ledger](../../../../docs/operations/pr-reconciliation-2026-10-07.md). Broader context: [project checkpoint](../../../../docs/operations/project-continuation-2026-10-07.md).

- `pull-requests.json`: the 18 original open drafts at review, with full heads, configured bases and branch names. This is an input snapshot, not a live list after closures.
- `checks.json`: purpose-built CI tool results reduced to exact-head check/status metadata, observed October 7, 2026. This pass did not read every log or rerun application acceptance.
- `inventory.py` and `file-ledger.json`: changed-path inventory from each main merge base; exact blob/mode comparisons and independent three-way text comparisons against main and #132; configured-base delta membership; other PRs with the same source blob; ancestry; separate documentation/design/evidence path inventory.
- `preservation-131-to-145.json` and its registry patch: five identical files and one reviewed additive registry change.
- `preservation-242-to-63.json` and its worker patch: nine identical files and one reviewed worker evolution preserving the original family guards.
- `restoration-145-to-132.patch`: comparison in that direction, showing protections lost from #145 and newer shutdown work in #132. It is evidence, **not a patch to apply**.
- `actions.json` and `post-consolidation.json`: published comment/closure receipts and verified closed/open/head/branch state after the two consolidations.
- `validation.json`: local inventory, evidence and link checks, with their scope.
- Four `pr-*-body-at-review.txt` files retain the source/successor acceptance requirements for the two consolidation decisions. Historical source and other evidence remain in the preserved Git branches and commits named by the metadata.

The saved patches use zero context; the pinned commits retain surrounding source.

The script calls Git to read trees/blobs and runs `git merge-file -p` on temporary files. It writes the JSON ledger only, does not check out branches or merge product source, and requires Python 3 and Git. In a repository containing the pinned commit objects, run:

```sh
python3 artifacts/pr-review/2026-10-07/reconciliation/inventory.py
```

For a new clone, fetch the PR heads and the historical commit objects needed by the metadata first. Do not silently replace pinned heads with current branch tips. Git refs used in the original local review were `refs/review/20261007/<number>`.

Classification meanings:

| Value | Meaning |
| --- | --- |
| `exact_source` | Source and target have the same blob and file mode, including identical absence for deletions. |
| `textually_absorbed` | Applying the source's delta with a three-way text comparison leaves the target unchanged. |
| `clean_remaining_delta` | The target still matches the original base, or the three-way result is clean but changes the target. Requires review before integration. |
| `conflict_review` | Three-way text comparison conflicts. |
| `structural_review` | Addition/deletion, changed mode or non-regular text path needs separate review. |
| `binary_review` / `comparison_error` | Binary or tool failure; neither is counted as covered. No such result occurred in this snapshot. |

The `production_files` field is a broad implementation/configuration review bucket: `apps/`, `packages/`, `config/`, `infra/`, `scripts/`, `.github/`, `tests/`, and all root paths (including root documentation). It is not a count of product features. All remaining paths are recorded under `other_changed_paths`. Counts are repeated across overlapping PRs. Ancestry, textual absorption, static CI and metadata probes are never treated as proof of behavior or full application acceptance.
