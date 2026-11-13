"""Fail CI if the checked out source differs from the triggering branch head."""

import os
import re
import subprocess


def main():
    expected = os.environ.get('KASHYAP_SOURCE_HEAD_SHA', '')
    if not re.fullmatch(r'[0-9a-fA-F]{40}', expected):
        raise SystemExit('Missing or invalid source commit SHA')
    actual = subprocess.check_output(['git', 'rev-parse', '--verify', 'HEAD'], text=True).strip()
    if actual.lower() != expected.lower():
        raise SystemExit(f'Checked out commit {actual} differs from requested source {expected}')
    print(f'Verified source commit: {actual}')


if __name__ == '__main__':
    main()
