# Private recovery checkpoint protocol

This protocol preserves available committed source. It does **not** recover absent Git objects, reconstruct the October 24 implementation, authorize disclosure, create an approved storage account or establish release acceptance.

A workspace or a download link is not a persistent backup. Continuity is accepted only after an authorized owner chooses a persistent **private** destination, copies the original bytes there, runs verification on that stored copy and confirms a later session can retrieve it. Until then every checkpoint records durability as **UNCONFIRMED**. Do not upload confidential source to a public repository or unapproved storage to bypass an active restriction.

## Create a checkpoint

Run from the repository using Python 3 and Git. Commit or separately preserve tracked edits first. The output directory must be new and outside the source repository; existing outputs are never overwritten.

```sh
python scripts/recovery_checkpoint.py create \
  --repo /absolute/path/to/kashyap_family_tree \
  --output-directory /approved/private/checkpoints/unique-checkpoint-name \
  --notes-json /private/path/checkpoint-notes.json
```

The example destination is a placeholder, **not an appointed or approved environment**. If no persistent location is approved, create the package locally for review and handoff, retain its UNCONFIRMED status, and ask the authorized owner to supply the destination. Do not describe that local copy as permanent.

`checkpoint-notes.json` is a JSON object containing the completed/pending work, actual test commands and outcomes with their source SHAs, current blockers/owners and exact next executable task. The tool preserves supplied notes without claiming their assertions are independently verified. Missing notes default to no recorded test acceptance and no appointed next task.

```json
{
  "completed": ["Describe verified completed work and evidence"],
  "pending": ["List unexecuted verification separately"],
  "tests": {"status": "NOT RUN", "source_sha": "exact recorded SHA", "commands": []},
  "blockers": [{"item": "Describe blocker", "owner": "Required role; appointment unverified"}],
  "next_task": "One executable task with its prerequisites"
}
```

The package contains:

- `source.bundle`: a self-contained Git bundle of all available references and HEAD, including committed history. It does not include ignored/untracked files, caches, credentials outside Git or another worktree's uncommitted edits.
- `manifest.json`: exact source commit/tree, captured refs, complete reachable commit inventory, tracked file paths/modes/blob IDs/SHA-256/byte sizes, bundle SHA-256, excluded untracked count and supplied work/evidence notes.
- `SHA256SUMS`: hashes for the bundle and manifest.

The source worktree/index must be clean for tracked files. Untracked paths are counted without reading their content and excluded. The tool refuses Gitlinks/submodules because the parent bundle cannot guarantee those separate sources. Snapshot creation also aborts if HEAD, refs or tracked cleanliness change during collection. Directory permissions are 0700 and artifact permissions 0600 on this platform. Do not commit these archives or raw evidence to the source repository.

## Verify before trusting or deleting another copy

```sh
python scripts/recovery_checkpoint.py verify /approved/private/checkpoints/unique-checkpoint-name
```

Verification checks both artifact hashes, verifies the bundle in an empty Git object database to reject prerequisite-dependent archives, then performs an isolated `git clone --mirror --no-checkout --no-hardlinks`. It compares restored HEAD/tree, every captured ref, commit inventory and every source file's mode/blob/SHA-256/byte size. The current source repository is never overwritten. Temporary verification clones are removed after checking.

Checksums demonstrate byte integrity, not owner approval or authenticity when received together from an untrusted source. Compare the package hashes/HEAD/tree against a separately trusted checkpoint record before accepting incoming source, and retain the applicable source/security review. No application tests, migration acceptance, user approvals or production gates close from bundle verification alone.

When restoring an incoming checkpoint, first verify into an isolated location. Review its complete history/diff against the current available implementation, preserve newer valid branches and uncommitted work, and integrate only through the appointed release owner. Never force-push or replace the current tree blindly. Recover the original October 24 bundle or exact patch/manifest before continuing its implementation; this utility cannot manufacture its missing bytes.

## Required persistent handback

Record the approved private destination and custodian, checkpoint commit/tree and SHA-256 values, retention/access policy, stored-copy verification outcome and retrieval instructions in the authorized continuity record. Do not put private credentials or signed download URLs in public development controls. Test retrieval from a subsequent session before claiming continuity is permanently resolved. If storage authorization or the original artifact is absent, record that dependency explicitly.

## Tool verification performed

An isolated fictional Git fixture with two branches and one tag passed create plus isolated clone verification and explicit verification. Untracked content was excluded. Existing destination, dirty tracked source and a deliberately corrupted bundle were each rejected. These are checkpoint-tool controls, **not application or production acceptance tests**. No external upload, GitHub write, source reconstruction, merge or deployment occurred.
