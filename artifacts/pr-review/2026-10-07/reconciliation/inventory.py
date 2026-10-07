"""Read-only Git comparison of the pinned PR inventory; no checkout or merge.

The three-way text result describes textual integration only. It is not proof
of behavioral preservation, correct composition, or runtime acceptance.
"""

import collections
import functools
import json
import pathlib
import subprocess
import tempfile


HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parents[3]
MAIN = "3027874ce07ec40c03567109ec317a814fae6bd8"
PRS = json.loads((HERE / "pull-requests.json").read_text())
HEADS = {p["number"]: p["headRefOid"] for p in PRS}
INTEGRATION = HEADS[132]
PREFIXES = ("apps/", "packages/", "config/", "infra/", "scripts/", ".github/", "tests/")


def git(*args):
    return subprocess.check_output(["git", *args], cwd=ROOT)


@functools.cache
def tree(ref):
    result = {}
    for record in git("ls-tree", "-rz", ref).split(b"\0"):
        if not record:
            continue
        metadata, path = record.split(b"\t", 1)
        mode, kind, oid = metadata.decode().split()
        result[path.decode()] = {"mode": mode, "kind": kind, "oid": oid}
    return result


@functools.cache
def content(oid):
    return git("cat-file", "blob", oid)


def executable(path):
    return path.startswith(PREFIXES) or "/" not in path


def compare(path, base, source, target):
    before, change, current = (tree(r).get(path) for r in (base, source, target))
    if change == current:
        return "exact_source"
    if before == current:
        return "clean_remaining_delta"
    if not before or not change or not current:
        return "structural_review"
    if any(v["kind"] != "blob" or v["mode"] != "100644" for v in (before, change, current)):
        return "structural_review"
    data = [content(v["oid"]) for v in (current, before, change)]
    if any(b"\0" in value for value in data):
        return "binary_review"
    with tempfile.TemporaryDirectory(prefix="qelvora-pr-compare-") as tmp:
        files = [pathlib.Path(tmp) / name for name in ("target", "base", "source")]
        for name, value in zip(files, data):
            name.write_bytes(value)
        result = subprocess.run(
            ["git", "merge-file", "-p", *map(str, files)],
            cwd=ROOT, capture_output=True,
        )
    if result.returncode == 0:
        return "textually_absorbed" if result.stdout == data[0] else "clean_remaining_delta"
    return "conflict_review" if 0 < result.returncode < 128 else "comparison_error"


rows = []
for pr in sorted(PRS, key=lambda p: p["number"]):
    head = pr["headRefOid"]
    base = git("merge-base", MAIN, head).decode().strip()
    configured_base = git("merge-base", pr["baseRefOid"], head).decode().strip()
    changes = git("diff", "--name-only", "--no-renames", base, head).decode().splitlines()
    own = set(git("diff", "--name-only", "--no-renames", configured_base, head).decode().splitlines())
    files = []
    for path in changes:
        if not executable(path):
            continue
        source = tree(head).get(path)
        files.append({
            "path": path,
            "source": source,
            "in_configured_base_delta": path in own,
            "main": compare(path, base, head, MAIN),
            "integration_132": compare(path, base, head, INTEGRATION),
            "same_source_in_prs": [n for n, ref in HEADS.items() if n != pr["number"] and tree(ref).get(path) == source],
        })
    contained = []
    for n, ref in HEADS.items():
        if n == pr["number"]:
            continue
        check = subprocess.run(["git", "merge-base", "--is-ancestor", head, ref], cwd=ROOT)
        if check.returncode not in (0, 1):
            raise RuntimeError("Ancestry comparison failed")
        if check.returncode == 0:
            contained.append(n)
    rows.append({
        "number": pr["number"], "head": head, "main_merge_base": base,
        "configured_base": pr["baseRefName"], "configured_base_oid": pr["baseRefOid"],
        "configured_merge_base": configured_base,
        "contained_by": sorted(contained),
        "production_files": files,
        "other_changed_paths": [p for p in changes if not executable(p)],
        "summary": {target: dict(collections.Counter(f[target] for f in files)) for target in ("main", "integration_132")},
    })

output = {
    "main": MAIN, "integration_132": INTEGRATION,
    "method": "Changed paths from the main merge base, classified by exact blob/mode and independent three-way text comparison. Includes executable/config/test/root files; records other paths separately. No semantic equivalence or runtime acceptance is inferred.",
    "prs": rows,
}
(HERE / "file-ledger.json").write_text(json.dumps(output, indent=2) + "\n")
for row in rows:
    print(row["number"], len(row["production_files"]), json.dumps(row["summary"]))
