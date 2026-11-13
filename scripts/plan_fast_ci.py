"""Select fast push checks from a complete local diff; never replace full acceptance.

No GitHub file-list API is used: its truncation limits cannot silently skip a check.
Unknown history or paths select every fast check. Source mismatches fail outright.
"""

import json
import os
from pathlib import Path
import re
import subprocess

CHECKS = ('backend', 'admin', 'mobile')
SHA = re.compile(r'[0-9a-fA-F]{40}')
MAX_DIFF_BYTES = 4 * 1024 * 1024
MAX_PATHS = 10_000


def git(*args):
    return subprocess.check_output(['git', *args], timeout=30, stderr=subprocess.PIPE)


def all_checks(reason):
    return {key: True for key in CHECKS}, reason


def classify(paths):
    selected = {key: False for key in CHECKS}
    for path in paths:
        if path.startswith('services/api/'):
            selected['backend'] = True
        elif path.startswith('apps/admin/'):
            selected['admin'] = True
        elif path.startswith('apps/mobile/'):
            selected['mobile'] = True
        elif path.startswith('docs/') or path in {'README.md', 'LICENSE_DECISION_REQUIRED.md'}:
            # Frozen/release validators run for every push, including documentation.
            continue
        else:
            # Shared packages, infrastructure, workflows, helper scripts, root build
            # configuration and unknown future modules can affect any consumer.
            return all_checks('shared configuration or unclassified path')
    return selected, 'complete local push diff'


def plan(event, expected):
    if not isinstance(event, dict):
        raise ValueError('Expected a push event object')
    head = git('rev-parse', '--verify', 'HEAD').decode('ascii').strip()
    after = event.get('after')
    if not isinstance(expected, str) or not SHA.fullmatch(expected):
        raise ValueError('Missing or invalid source commit SHA')
    if not isinstance(after, str) or not SHA.fullmatch(after):
        raise ValueError('Missing or invalid push event head SHA')
    if after.lower() != head.lower() or expected.lower() != head.lower():
        raise ValueError('Push event, requested source and checkout must match')
    before = event.get('before')
    if not isinstance(before, str) or not SHA.fullmatch(before) or set(before) == {'0'}:
        return all_checks('first push or unavailable base SHA')
    try:
        git('cat-file', '-e', before + '^{commit}')
        # Force pushes/reconstructed history are checked conservatively in full.
        git('merge-base', '--is-ancestor', before, head)
        diff = git('diff', '--name-only', '--no-renames', '-z', before, head, '--')
    except (subprocess.SubprocessError, OSError):
        return all_checks('base history or complete diff unavailable')
    if len(diff) > MAX_DIFF_BYTES or (diff and not diff.endswith(b'\0')):
        return all_checks('oversized or incomplete change inventory')
    raw_paths = diff.split(b'\0')[:-1] if diff else []
    if not raw_paths or len(raw_paths) > MAX_PATHS:
        return all_checks('empty or oversized change inventory')
    try:
        paths = [path.decode('utf-8', errors='strict') for path in raw_paths]
    except UnicodeDecodeError:
        return all_checks('non-UTF-8 change inventory')
    if any(not path or path.startswith('/') or '..' in path.split('/') for path in paths):
        return all_checks('unexpected change inventory path')
    return classify(paths)


def main():
    event = json.loads(Path(os.environ['GITHUB_EVENT_PATH']).read_text(encoding='utf-8'))
    checks, reason = plan(event, os.environ.get('KASHYAP_SOURCE_HEAD_SHA', ''))
    evidence = {'source_sha': event['after'], 'checks': checks, 'reason': reason,
                'scope': 'fast developer feedback; full CI and native acceptance remain mandatory'}
    evidence_path = Path('test-results/fast-ci-plan.json')
    evidence_path.parent.mkdir(parents=True, exist_ok=True)
    evidence_path.write_text(json.dumps(evidence, indent=2) + '\n', encoding='utf-8')
    # Only constant names/boolean values enter workflow expressions.
    with Path(os.environ['GITHUB_OUTPUT']).open('a', encoding='utf-8') as output:
        for key, enabled in checks.items():
            output.write(f'{key}={str(enabled).lower()}\n')
    print(json.dumps(evidence))


if __name__ == '__main__':
    main()
