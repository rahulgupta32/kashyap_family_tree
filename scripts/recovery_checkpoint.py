#!/usr/bin/env python3
"""Create or verify a private, self-contained Git recovery checkpoint. Never uploads."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
from datetime import datetime, timezone


class CheckpointError(Exception):
    pass


def git(repo, *args):
    result = subprocess.run(['git', '-C', str(repo), *args], stdout=subprocess.PIPE,
                            stderr=subprocess.PIPE, env={**os.environ, 'GIT_NO_REPLACE_OBJECTS': '1'})
    if result.returncode:
        raise CheckpointError('Git command failed: ' + ' '.join(args[:2]) + '\n' +
                              result.stderr.decode('utf-8', 'replace').strip())
    return result.stdout


def digest(path):
    h = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()


def refs(repo):
    return dict(line.split('\t', 1) for line in git(repo, 'for-each-ref',
                '--format=%(refname)%09%(objectname)').decode().splitlines())


def files(repo, head):
    entries = []
    for row in git(repo, 'ls-tree', '-r', '-z', '--full-tree', head).split(b'\0'):
        if not row:
            continue
        metadata, name = row.split(b'\t', 1)
        mode, kind, blob = metadata.decode().split(' ')
        if kind != 'blob':
            raise CheckpointError('Gitlinks/submodules need a separate source checkpoint; refusing incomplete archive')
        entries.append({'path': name.decode('utf-8', 'surrogateescape'), 'mode': mode,
                        'blob': blob})
    process = subprocess.Popen(['git', '-C', str(repo), 'cat-file', '--batch'],
                               stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                               stderr=subprocess.PIPE,
                               env={**os.environ, 'GIT_NO_REPLACE_OBJECTS': '1'})
    try:
        for entry in entries:
            process.stdin.write((entry['blob'] + '\n').encode())
            process.stdin.flush()
            header = process.stdout.readline().decode().strip().split()
            if len(header) != 3 or header[1] != 'blob' or header[0] != entry['blob']:
                raise CheckpointError('Unexpected Git blob response')
            size = int(header[2])
            data = process.stdout.read(size)
            if len(data) != size or process.stdout.read(1) != b'\n':
                raise CheckpointError('Truncated Git blob response')
            entry.update(bytes=size, sha256=hashlib.sha256(data).hexdigest())
    finally:
        process.stdin.close()
        process.wait()
    if process.returncode:
        raise CheckpointError('Git blob inventory failed')
    return entries


def verify(directory):
    directory = Path(directory).resolve()
    manifest_path = directory / 'manifest.json'
    if not manifest_path.is_file() or not (directory / 'SHA256SUMS').is_file():
        raise CheckpointError('Checkpoint requires manifest.json and SHA256SUMS')
    lines = (directory / 'SHA256SUMS').read_text().splitlines()
    expected_names = {'manifest.json', 'source.bundle'}
    if len(lines) != 2:
        raise CheckpointError('Invalid checksum manifest')
    seen = set()
    for line in lines:
        checksum, name = line.split('  ', 1)
        if name not in expected_names or name in seen:
            raise CheckpointError('Unexpected checksum entry')
        seen.add(name)
        if digest(directory / name) != checksum:
            raise CheckpointError('SHA-256 mismatch: ' + name)
    manifest = json.loads(manifest_path.read_text())
    if manifest.get('format_version') != 1:
        raise CheckpointError('Unsupported checkpoint format')
    if digest(directory / 'source.bundle') != manifest['bundle_sha256']:
        raise CheckpointError('Bundle does not match source manifest')
    with tempfile.TemporaryDirectory(prefix='git-recovery-verify-') as temporary:
        empty = Path(temporary) / 'empty.git'
        git(temporary, 'init', '--bare', str(empty))
        # Verification in an empty object database rejects bundles requiring a prerequisite.
        git(empty, 'bundle', 'verify', str(directory / 'source.bundle'))
        restored = Path(temporary) / 'restored.git'
        git(temporary, 'clone', '--mirror', '--no-checkout', '--no-hardlinks',
            str(directory / 'source.bundle'), str(restored))
        head = git(restored, 'rev-parse', 'HEAD').decode().strip()
        tree = git(restored, 'rev-parse', 'HEAD^{tree}').decode().strip()
        if head != manifest['source_commit'] or tree != manifest['source_tree']:
            raise CheckpointError('Restored HEAD/tree mismatch')
        if refs(restored) != manifest['refs']:
            raise CheckpointError('Restored references mismatch')
        commits = git(restored, 'rev-list', '--all', 'HEAD').decode().splitlines()
        if sorted(commits) != sorted(manifest['commits']):
            raise CheckpointError('Restored commit inventory mismatch')
        if files(restored, head) != manifest['files']:
            raise CheckpointError('Restored file manifest mismatch')
    return manifest


def create(repo, destination, notes_path=None):
    repo = Path(git(repo, 'rev-parse', '--show-toplevel').decode().strip()).resolve()
    destination = Path(destination).expanduser().resolve()
    if destination == repo or repo in destination.parents:
        raise CheckpointError('Output directory must be outside the source repository')
    if destination.exists():
        raise CheckpointError('Output directory already exists; refusing overwrite')
    if git(repo, 'status', '--porcelain', '--untracked-files=no').strip():
        raise CheckpointError('Tracked worktree/index changes exist; commit or preserve them separately first')
    supplied_notes = json.loads(Path(notes_path).read_text()) if notes_path else {}
    if not isinstance(supplied_notes, dict):
        raise CheckpointError('Notes must be a JSON object')
    notes = {'completed': [], 'pending': [], 'tests': {'status': 'NOT RECORDED'},
             'blockers': [], 'next_task': 'NOT APPOINTED', **supplied_notes}
    head = git(repo, 'rev-parse', 'HEAD').decode().strip()
    tree = git(repo, 'rev-parse', 'HEAD^{tree}').decode().strip()
    original_refs = refs(repo)
    untracked_count = len([p for p in git(repo, 'ls-files', '--others', '--exclude-standard', '-z').split(b'\0') if p])
    destination.parent.mkdir(parents=True, exist_ok=True)
    staging = Path(tempfile.mkdtemp(prefix='.checkpoint-', dir=destination.parent))
    os.chmod(staging, 0o700)
    try:
        git(repo, 'bundle', 'create', str(staging / 'source.bundle'), '--all', 'HEAD')
        manifest = {'format_version': 1, 'created_utc': datetime.now(timezone.utc).isoformat(),
                    'source_commit': head, 'source_tree': tree, 'refs': original_refs,
                    'commits': git(repo, 'rev-list', '--all', 'HEAD').decode().splitlines(),
                    'files': files(repo, head), 'bundle_sha256': digest(staging / 'source.bundle'),
                    'excluded_untracked_count': untracked_count, 'notes': notes,
                    'notes_evidence': 'Caller supplied; this tool does not run or validate application tests',
                    'durability': 'UNCONFIRMED: copy to owner-approved persistent private storage and verify there',
                    'publication': 'Local archive only; no upload or public disclosure authorization'}
        if (refs(repo) != original_refs or git(repo, 'rev-parse', 'HEAD').decode().strip() != head or
                git(repo, 'status', '--porcelain', '--untracked-files=no').strip()):
            raise CheckpointError('Source changed while checkpointing; retry after writers finish')
        (staging / 'manifest.json').write_text(json.dumps(manifest, indent=2, ensure_ascii=True) + '\n')
        (staging / 'SHA256SUMS').write_text(''.join(digest(staging / name) + '  ' + name + '\n'
                                                 for name in ['manifest.json', 'source.bundle']))
        for path in staging.iterdir():
            os.chmod(path, 0o600)
        verify(staging)
        # mkdir reservation prevents a competing process from replacing an existing checkpoint.
        destination.mkdir(mode=0o700)
        for path in staging.iterdir():
            os.rename(path, destination / path.name)
        return manifest
    finally:
        shutil.rmtree(staging, ignore_errors=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='command', required=True)
    command = sub.add_parser('create')
    command.add_argument('--repo', default='.')
    command.add_argument('--output-directory', required=True)
    command.add_argument('--notes-json')
    command = sub.add_parser('verify')
    command.add_argument('directory')
    args = parser.parse_args()
    try:
        manifest = (create(args.repo, args.output_directory, args.notes_json)
                    if args.command == 'create' else verify(args.directory))
    except (CheckpointError, OSError, ValueError, KeyError) as error:
        print('ERROR: ' + str(error), file=sys.stderr)
        return 1
    print(json.dumps({'result': 'PASS', 'source_commit': manifest['source_commit'],
                      'source_tree': manifest['source_tree'], 'refs': len(manifest['refs']),
                      'commits': len(manifest['commits']), 'files': len(manifest['files']),
                      'bundle_sha256': manifest['bundle_sha256'],
                      'durability': manifest['durability']}))
    return 0


if __name__ == '__main__':
    sys.exit(main())
