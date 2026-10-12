"""Archive reviewable native source and record narrowly scoped CI evidence."""
import argparse
import hashlib
import json
import os
import re
from pathlib import Path
import subprocess
import tarfile

ROOT = Path(__file__).resolve().parents[1]
RESULTS = ROOT / 'test-results'
PROJECT = 'apps/mobile/ios/Runner.xcodeproj/project.pbxproj'


def git(*args):
    return subprocess.check_output(['git', *args], cwd=ROOT, text=True).strip()


def native_sources():
    tracked = git('ls-files', '--', 'apps/mobile/ios').splitlines()
    extra = git('ls-files', '--others', '--exclude-standard', '--', 'apps/mobile/ios').splitlines()
    files = []
    for relative in sorted(set(tracked + extra)):
        path = ROOT / relative
        if path.is_symlink():
            raise RuntimeError('Native source archive must not contain symlinks')
        if path.is_file():
            if not path.resolve().is_relative_to(ROOT / 'apps/mobile/ios'):
                raise RuntimeError('Native source escaped the iOS directory')
            files.append(relative)
    if PROJECT not in files:
        raise RuntimeError('Missing iOS Xcode source project')
    return files


def archive():
    RESULTS.mkdir(exist_ok=True)
    files = native_sources()
    hashes = {p: hashlib.sha256((ROOT / p).read_bytes()).hexdigest() for p in files}
    with tarfile.open(RESULTS / 'ios-source.tar.gz', 'w:gz') as archive_file:
        for relative in files:
            archive_file.add(ROOT / relative, arcname=relative, recursive=False)
    (RESULTS / 'ios-source-hashes.json').write_text(json.dumps(hashes, indent=2) + '\n')


def record():
    source = os.environ['KASHYAP_SOURCE_HEAD_SHA']
    if git('rev-parse', 'HEAD') != source:
        raise RuntimeError('iOS checkout is not the requested source commit')
    committed = subprocess.run(['git', 'ls-files', '--error-unmatch', PROJECT], cwd=ROOT,
                               capture_output=True).returncode == 0
    startup = (RESULTS / 'ios-startup-test.log').read_text()
    if not re.search(r'All tests passed!|\b[1-9]\d* tests? passed\b', startup):
        raise RuntimeError('Simulator test success was not recorded')
    for target in ['iphonesimulator', 'iphoneos']:
        if not (ROOT / f'apps/mobile/build/ios/{target}/Runner.app/Runner').is_file():
            raise RuntimeError(f'Missing compiled {target} application')
    if committed:
        subprocess.check_call(['git', 'diff', '--exit-code', '--', 'apps/mobile/ios'], cwd=ROOT)
    report = {
        'kind': 'IOS_SIMULATOR_AND_UNSIGNED_DEVICE_BUILD',
        'status': 'PASSED',
        'sourceSha': source,
        'sourceTreeSha': git('rev-parse', 'HEAD^{tree}'),
        'nativeSourceCommitted': committed,
        'simulatorStartup': 'VERIFIED',
        'simulatorKeychainRoundTrip': 'VERIFIED_WITH_FICTIONAL_FIXTURE',
        'unsignedDeviceCompilation': 'VERIFIED',
        'productionAcceptance': False,
        'signedDistributionVerified': False,
        'physicalDeviceVerified': False,
        'liveBackendIosVerified': False,
        'apnsDeliveryVerified': False,
        'supportedDeviceMatrixVerified': False,
        'nativeSourceHashes': json.loads((RESULTS / 'ios-source-hashes.json').read_text()),
    }
    (RESULTS / 'ios-verification.json').write_text(json.dumps(report, indent=2) + '\n')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('action', choices=['archive', 'record'])
    args = parser.parse_args()
    archive() if args.action == 'archive' else record()
