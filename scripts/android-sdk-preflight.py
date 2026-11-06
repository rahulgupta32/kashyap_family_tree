#!/usr/bin/env python3
"""Recover only SDK archive failures; retain diagnostics and fail closed."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import zipfile
import xml.etree.ElementTree as ET

PACKAGES = {'emulator': ('emulator', 'emulator'),
            'system-images;android-35;google_apis;x86_64': ('system-images/android-35/google_apis/x86_64', 'system.img')}
ARCHIVE_ERRORS = ('zipfile unknown archive', 'not a zip archive', 'checksum mismatch', 'invalid zip')


def installed(sdk, package):
    directory, required = PACKAGES[package]
    root = sdk / directory
    try:
        node = ET.parse(root / 'package.xml').getroot()
        local = next(n for n in node.iter() if n.tag.rsplit('}', 1)[-1] == 'localPackage')
        return local.get('path') == package and (root / required).stat().st_size > 0
    except (OSError, ET.ParseError, StopIteration):
        return False


def cache_evidence(sdk):
    result = []
    for folder in (sdk / '.temp', sdk / '.downloadIntermediates'):
        if not folder.is_dir():
            continue
        for path in folder.rglob('*'):
            if len(result) >= 20:
                break
            if path.is_file() and not path.is_symlink():
                size = path.stat().st_size
                record = {'path': str(path.relative_to(sdk)), 'bytes': size}
                # Bound forensic reads; SDK caches can contain multi-GB images.
                with path.open('rb') as f:
                    prefix = f.read(4096)
                record.update(prefix_hex=prefix[:16].hex(), sample_sha256=hashlib.sha256(prefix).hexdigest(),
                              zip_directory_readable=zipfile.is_zipfile(path))
                result.append(record)
    return result


def prepare(sdk, user_home, execute, log_dir, report):
    for package, (directory, _) in PACKAGES.items():
        records = report.setdefault('packages', {}).setdefault(package, [])
        for attempt in (1, 2):
            target = log_dir / ('android-sdk-' + directory.replace('/', '-') + f'-{attempt}.log')
            command = ['--verbose', '--install', package, '--channel=0']
            code, output = execute(command, target)
            valid = code == 0 and installed(sdk, package) and not any(error in output.lower() for error in ARCHIVE_ERRORS)
            records.append({'attempt': attempt, 'exit_code': code, 'installed_package_verified': valid,
                            'log': target.name, 'cache': cache_evidence(sdk) if not valid else []})
            if valid:
                records[-1]['package_xml_sha256'] = hashlib.sha256((sdk / directory / 'package.xml').read_bytes()).hexdigest()
                break
            if attempt == 2 or not any(error in output.lower() for error in ARCHIVE_ERRORS):
                raise RuntimeError(f'SDK package not verified: {package}; see {target.name}')
            # Only transient download caches; never remove installed SDK components.
            for cache in (sdk / '.temp', sdk / '.downloadIntermediates', user_home / 'cache'):
                if cache.is_symlink():
                    raise RuntimeError('Refusing symlinked SDK cache cleanup')
                if cache.exists():
                    shutil.rmtree(cache)


if __name__ == '__main__':
    if os.environ.get('GITHUB_ACTIONS') != 'true':
        raise SystemExit('Only an isolated GitHub Actions runner is supported')
    sdk = Path(os.environ['ANDROID_HOME']).resolve()
    user_home = Path(os.environ['ANDROID_USER_HOME']).resolve()
    temporary = Path(os.environ['RUNNER_TEMP']).resolve()
    if sdk == Path('/') or not user_home.is_relative_to(temporary) or user_home == temporary:
        raise SystemExit('Unsafe SDK/cache paths')
    manager = sdk / 'cmdline-tools/latest/bin/sdkmanager'
    log_dir = Path('test-results'); log_dir.mkdir(exist_ok=True)
    user_home.mkdir(parents=True, exist_ok=True)
    head = subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip()
    if head != os.environ.get('KASHYAP_SOURCE_HEAD_SHA'):
        raise SystemExit('Workflow source mismatch')
    report = {'kind': 'ANDROID_SDK_PREFLIGHT', 'source_sha': head, 'workflow_run_id': os.environ.get('GITHUB_RUN_ID'),
              'api_level': 35, 'target': 'google_apis', 'arch': 'x86_64', 'channel': 0,
              'status': 'FAILED', 'archive_checksum_independently_verified': False,
              'note': 'sdkmanager remains the installer; package/file validation is not a claim of independent archive checksum verification.'}

    def execute(arguments, target, stdin=None):
        try:
            with target.open('w') as out:
                completed = subprocess.run([str(manager), *arguments], input=stdin, text=True,
                                           stdout=out, stderr=subprocess.STDOUT, timeout=300)
            return completed.returncode, target.read_text(errors='replace')
        except subprocess.TimeoutExpired:
            return 124, target.read_text(errors='replace') + '\nSDK command timed out'

    try:
        code, version = execute(['--version'], log_dir / 'android-sdk-version.log')
        report['sdkmanager_version_output'] = version.strip()[-2000:]
        if code:
            raise RuntimeError('SDK manager version check failed')
        code, _ = execute(['--licenses'], log_dir / 'android-sdk-licenses.log', 'y\n' * 100)
        if code:
            raise RuntimeError('SDK license acceptance failed')
        prepare(sdk, user_home, execute, log_dir, report)
        report['status'] = 'PASSED'
    finally:
        (log_dir / 'android-sdk-preflight.json').write_text(json.dumps(report, indent=2) + '\n')
    print('Verified Android emulator and API35 Google APIs x86_64 package installation; no app acceptance inferred.')
