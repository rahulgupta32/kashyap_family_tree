#!/usr/bin/env python3
"""A labelled, debug-signed USB evaluation APK; no provisioning or staging claim."""
from android_signing import verified_certificate_digests
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess

ORIGIN = 'http://127.0.0.1:3010'
PACKAGE = 'com.example.kashyap_mobile.usbtest'


def inspect_badging(text):
    package = re.search(r"^package: name='([^']+)'", text, re.M)
    label = re.search(r"^application-label:'([^']+)'", text, re.M)
    minimum = re.search(r"^sdkVersion:'(\d+)'", text, re.M)
    if not package or package[1] != PACKAGE or not label or 'USB Test' not in label[1] or not minimum:
        raise ValueError('USB APK identity, label or minimum Android API mismatch')
    return int(minimum[1])


def verify_build_source(root):
    changed = subprocess.check_output(['git', 'diff', 'HEAD', '--name-only'], cwd=root, text=True).splitlines()
    allowed = 'apps/mobile/android/gradle.properties'
    if not changed:
        return None
    if changed != [allowed]:
        raise ValueError('USB distribution must use committed application source')
    original = subprocess.check_output(['git', 'show', 'HEAD:' + allowed], cwd=root, text=True)
    actual = (root / allowed).read_text()
    capped = re.sub(r'^org.gradle.jvmargs=.*$',
        'org.gradle.jvmargs=-Xmx3G -XX:MaxMetaspaceSize=1G -XX:ReservedCodeCacheSize=256m', original, flags=re.M)
    if actual != capped:
        raise ValueError('Unreviewed Gradle configuration change')
    return {'path': allowed, 'purpose': 'existing CI memory cap',
            'sha256': hashlib.sha256(actual.encode()).hexdigest()}


def main():
    root = Path(__file__).resolve().parents[1]
    mobile = root / 'apps/mobile'
    output = root / 'test-results' / 'usb-test'
    output.mkdir(parents=True, exist_ok=True)
    build_override = verify_build_source(root)
    sha = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=root, text=True).strip()
    tree = subprocess.check_output(['git', 'rev-parse', 'HEAD^{tree}'], cwd=root, text=True).strip()
    env = {**os.environ, 'KASHYAP_USB_TEST': 'true', 'CI': 'true', 'BOT': 'true'}
    subprocess.run(['flutter', 'build', 'apk', '--debug', '--dart-define=API_BASE_URL=' + ORIGIN],
                   cwd=mobile, env=env, check=True)
    apk = output / f'nepali-bansawali-usb-test-{sha[:12]}.apk'
    shutil.copyfile(mobile / 'build/app/outputs/flutter-apk/app-debug.apk', apk)
    sdk = Path(os.environ.get('ANDROID_HOME') or os.environ['ANDROID_SDK_ROOT'])
    versions = sorted((sdk / 'build-tools').glob('*/apksigner'),
                      key=lambda p: tuple(int(v) for v in p.parent.name.split('.') if v.isdigit()))
    if not versions:
        raise ValueError('Android build tools are required')
    signature = subprocess.check_output([str(versions[-1]), 'verify', '--print-certs', str(apk)], text=True)
    cert = verified_certificate_digests(signature)
    if len(cert) != 1:
        raise ValueError('Expected exactly one verified debug signing certificate')
    badging = subprocess.check_output([str(versions[-1].with_name('aapt')), 'dump', 'badging', str(apk)], text=True)
    minimum = inspect_badging(badging)
    version = re.search(r"^package:.*versionCode='([^']+)'.*versionName='([^']+)'", badging, re.M)
    if not version:
        raise ValueError('APK version metadata is missing')
    digest = hashlib.sha256(apk.read_bytes()).hexdigest()
    (output / 'SHA256SUMS').write_text(f'{digest}  {apk.name}\n')
    (output / 'evidence.json').write_text(json.dumps({
        'commit': sha, 'tree': tree, 'filename': apk.name, 'sha256': digest,
        'applicationId': PACKAGE, 'apiOrigin': ORIGIN, 'minimumAndroidApi': minimum,
        'version': version[2], 'versionCode': version[1],
        'signingType': 'Android debug; USB evaluation only', 'certificateSha256': cert[0].lower(),
        'buildCommand': ['flutter', 'build', 'apk', '--debug', '--dart-define=API_BASE_URL=' + ORIGIN],
        'buildEnvironment': {'KASHYAP_USB_TEST': 'true'}, 'buildOverride': build_override,
        'requires': 'Running synthetic laptop backend on port 3010 and adb reverse tcp:3010 tcp:3010',
        'installationVerified': False, 'physicalDeviceVerified': False,
        'stagingConnectivityVerified': False, 'productionAcceptance': False,
    }, indent=2) + '\n')
    shutil.copyfile(root / 'scripts/connect-usb-test.ps1', output / 'connect-usb-test.ps1')
    print(f'USB evaluation build: {apk.name}; SHA256={digest}')


if __name__ == '__main__':
    main()
