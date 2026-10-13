"""Archive reviewable native source and record narrowly scoped CI evidence."""
import argparse
import hashlib
import json
import os
import shutil
from pathlib import Path
import subprocess
import tarfile
from ios_vm_connection import validate_evidence

ROOT = Path(__file__).resolve().parents[1]
RESULTS = ROOT / 'test-results'
PROJECT = 'apps/mobile/ios/Runner.xcodeproj/project.pbxproj'
INPUTS = ['.github/workflows/ios-verification.yml', 'scripts/ios-startup-verification.py',
          'scripts/ios_vm_connection.py', 'scripts/ios-verification-evidence.py',
          'scripts/run-ios-startup-verification.sh', 'apps/mobile/integration_test/ios_startup_test.dart',
          'apps/mobile/test_driver/ios_startup_driver.dart']


def git(*args):
    return subprocess.check_output(['git', *args], cwd=ROOT, text=True).strip()


def native_sources():
    tracked = git('ls-files', '--', 'apps/mobile/ios').splitlines()
    extra = git('ls-files', '--others', '--exclude-standard', '--', 'apps/mobile/ios').splitlines()
    if extra:
        raise RuntimeError('Uncommitted iOS source is present: ' + ', '.join(extra))
    subprocess.check_call(['git', 'diff', '--exit-code', 'HEAD', '--', 'apps/mobile/ios'], cwd=ROOT)
    files = []
    for relative in sorted(tracked):
        path = ROOT / relative
        if path.is_symlink():
            raise RuntimeError('Native source archive must not contain symlinks')
        if not path.is_file():
            raise RuntimeError('Committed iOS source is missing')
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
    inputs = input_hashes()
    with tarfile.open(RESULTS / 'ios-verification-inputs.tar.gz', 'w:gz') as archive_file:
        for relative in INPUTS:
            archive_file.add(ROOT / relative, arcname=relative, recursive=False)
    (RESULTS / 'ios-verification-input-hashes.json').write_text(json.dumps(inputs, indent=2) + '\n')


def input_hashes():
    subprocess.check_call(['git', 'ls-files', '--error-unmatch', '--', *INPUTS], cwd=ROOT,
                          stdout=subprocess.DEVNULL)
    subprocess.check_call(['git', 'diff', '--exit-code', 'HEAD', '--', *INPUTS], cwd=ROOT)
    if any((ROOT / p).is_symlink() or not (ROOT / p).is_file() for p in INPUTS):
        raise RuntimeError('Verification input is missing or is a symlink')
    return {p: hashlib.sha256((ROOT / p).read_bytes()).hexdigest() for p in INPUTS}


def record():
    source = os.environ['KASHYAP_SOURCE_HEAD_SHA']
    if git('rev-parse', 'HEAD') != source:
        raise RuntimeError('iOS checkout is not the requested source commit')
    files = native_sources()
    hashes = {p: hashlib.sha256((ROOT / p).read_bytes()).hexdigest() for p in files}
    if hashes != json.loads((RESULTS / 'ios-source-hashes.json').read_text()):
        raise RuntimeError('Archived iOS source differs from verified source')
    inputs = input_hashes()
    if inputs != json.loads((RESULTS / 'ios-verification-input-hashes.json').read_text()):
        raise RuntimeError('Archived verification inputs differ from verified source')
    startup = (RESULTS / 'ios-startup-test.log').read_text()
    phases = json.loads((RESULTS / 'ios-startup-phases.json').read_text())
    if phases['status'] != 'PASSED' or phases['sourceSha'] != source:
        raise RuntimeError('Bounded simulator verification did not pass for this source')
    connection = json.loads((RESULTS / 'ios-vm-connection.json').read_text())
    validate_evidence(startup, connection)
    for target in ['iphonesimulator', 'iphoneos']:
        if not (ROOT / f'apps/mobile/build/ios/{target}/Runner.app/Runner').is_file():
            raise RuntimeError(f'Missing compiled {target} application')
    subprocess.check_call(['git', 'diff', '--exit-code', '--', 'apps/mobile/lib',
                           'apps/mobile/integration_test', 'apps/mobile/pubspec.yaml',
                           'apps/mobile/pubspec.lock', 'apps/mobile/test_driver'], cwd=ROOT)
    report = {
        'kind': 'IOS_SIMULATOR_AND_UNSIGNED_DEVICE_BUILD',
        'status': 'PASSED',
        'sourceSha': source,
        'sourceTreeSha': git('rev-parse', 'HEAD^{tree}'),
        'nativeSourceCommitted': True,
        'simulatorStartup': 'VERIFIED',
        'simulatorKeychainRoundTrip': 'VERIFIED_WITH_FICTIONAL_FIXTURE',
        'unsignedDeviceCompilation': 'VERIFIED',
        'productionAcceptance': False,
        'signedDistributionVerified': False,
        'physicalDeviceVerified': False,
        'liveBackendIosVerified': False,
        'apnsDeliveryVerified': False,
        'supportedDeviceMatrixVerified': False,
        'nativeSourceHashes': hashes,
        'dependencyLockHashes': {p: hashlib.sha256((ROOT / p).read_bytes()).hexdigest()
                                for p in ['apps/mobile/pubspec.lock', 'apps/mobile/ios/Podfile.lock'] +
                                [p for p in files if p.endswith('/Package.resolved')]},
        'simulatorPhases': phases,
        'simulatorConnection': connection,
        'verificationInputHashes': inputs,
    }
    (RESULTS / 'ios-verification.json').write_text(json.dumps(report, indent=2) + '\n')


def inspect():
    """Retain drift for review without accepting or hiding generated source."""
    RESULTS.mkdir(exist_ok=True)
    status = git('status', '--porcelain', '--untracked-files=all', '--', 'apps/mobile/ios')
    (RESULTS / 'ios-native-source-status.txt').write_text(status + '\n')
    print('iOS source status after native tools:\n' + status)
    # SwiftPM may create a reviewed application dependency lock outside ephemeral/.
    # Preserve only this known non-secret candidate, never arbitrary untracked bytes.
    candidates = []
    for path in sorted((ROOT / 'apps/mobile/ios').rglob('Package.resolved')):
        if path.is_symlink() or not path.is_file() or path.stat().st_size > 262144:
            continue
        relative = path.relative_to(ROOT).as_posix()
        if '/Pods/' in relative or '/ephemeral/' in relative:
            continue
        destination = RESULTS / 'ios-dependency-candidates' / relative
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(path, destination)
        candidates.append(relative)
    (RESULTS / 'ios-swiftpm-candidates.json').write_text(json.dumps(candidates, indent=2) + '\n')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('action', choices=['archive', 'record', 'inspect'])
    args = parser.parse_args()
    {'archive': archive, 'record': record, 'inspect': inspect}[args.action]()
