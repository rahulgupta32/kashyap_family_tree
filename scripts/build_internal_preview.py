#!/usr/bin/env python3
"""Build an explicitly approved, signed internal preview; never provisions infrastructure."""
from android_signing import verified_certificate_digests
import hashlib
import ipaddress
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
from urllib.parse import urlsplit


def validate(env):
    if env.get('KASHYAP_PREVIEW_APPROVED') != 'true':
        raise ValueError('Internal preview approval is required')
    endpoint = env.get('KASHYAP_STAGING_API_URL', '')
    url = urlsplit(endpoint)
    host = (url.hostname or '').lower()
    if (endpoint.strip() != endpoint or any(c.isspace() for c in endpoint) or
            url.scheme != 'https' or not host or url.username is not None or
            url.password is not None or url.query or url.fragment or
            url.path not in ('', '/') or url.port not in (None, 443) or
            '.' not in host or host.endswith(('.invalid', '.example', '.test', '.localhost')) or
            host in ('example.com', 'example.org', 'example.net') or
            host.endswith(('.example.com', '.example.org', '.example.net'))):
        raise ValueError('An approved public HTTPS staging API origin is required')
    try:
        ipaddress.ip_address(host)
    except ValueError:
        pass
    else:
        raise ValueError('Use the approved staging DNS name')
    identity = env.get('KASHYAP_ANDROID_APPLICATION_ID', '')
    if (not re.fullmatch(r'[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+', identity)
            or identity.startswith('com.example.') or not identity.endswith('.preview')):
        raise ValueError('A separately approved .preview application ID is required')
    for name in ('KASHYAP_ANDROID_STORE_FILE', 'KASHYAP_ANDROID_STORE_PASSWORD',
                 'KASHYAP_ANDROID_KEY_ALIAS', 'KASHYAP_ANDROID_KEY_PASSWORD'):
        if not env.get(name):
            raise ValueError('Approved private signing configuration is required')
    store = Path(env['KASHYAP_ANDROID_STORE_FILE'])
    if not store.is_absolute() or not store.is_file() or store.name.lower() == 'debug.keystore':
        raise ValueError('Approved private keystore is required')
    if env['KASHYAP_ANDROID_KEY_ALIAS'].lower() == 'androiddebugkey':
        raise ValueError('Debug signing is not permitted for this preview')
    if not re.fullmatch(r'[a-fA-F0-9]{64}', env.get('KASHYAP_PREVIEW_CERT_SHA256', '')):
        raise ValueError('The approved signing certificate SHA256 is required')
    return endpoint.rstrip('/'), identity


def main():
    endpoint, identity = validate(os.environ)
    root = Path(__file__).resolve().parents[1]
    if subprocess.check_output(['git', 'status', '--porcelain', '--untracked-files=no'], cwd=root).strip():
        raise ValueError('Commit reviewed source before building a distributable preview')
    sha = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=root, text=True).strip()
    tree = subprocess.check_output(['git', 'rev-parse', 'HEAD^{tree}'], cwd=root, text=True).strip()
    build = os.environ.get('GITHUB_RUN_NUMBER', '1')
    if not re.fullmatch(r'[1-9][0-9]{0,8}', build):
        raise ValueError('Invalid preview build number')
    output = root / 'test-results' / 'internal-preview'
    output.mkdir(parents=True, exist_ok=True)
    env = {**os.environ, 'KASHYAP_INTERNAL_PREVIEW': 'true'}
    mobile = root / 'apps' / 'mobile'
    with tempfile.TemporaryDirectory(prefix='nepali-bansawali-preview-') as temp:
        defines = Path(temp) / 'defines.json'
        defines.write_text(json.dumps({'API_BASE_URL': endpoint}))
        subprocess.run(['flutter', 'pub', 'get', '--enforce-lockfile'], cwd=mobile, env=env, check=True)
        subprocess.run(['flutter', 'build', 'apk', '--release', '--build-name=1.0.0',
                        '--build-number=' + build, '--dart-define-from-file=' + str(defines)],
                       cwd=mobile, env=env, check=True)
    apk = output / ('nepali-bansawali-preview-' + sha[:12] + '.apk')
    shutil.copyfile(mobile / 'build/app/outputs/flutter-apk/app-release.apk', apk)
    sdk = Path(os.environ.get('ANDROID_HOME') or os.environ['ANDROID_SDK_ROOT'])
    tools = sorted((sdk / 'build-tools').glob('*/apksigner'), key=lambda p: tuple(int(x) for x in p.parent.name.split('.') if x.isdigit()))
    if not tools:
        raise ValueError('Android signature verification tools are required')
    signature = subprocess.check_output([str(tools[-1]), 'verify', '--print-certs', str(apk)], text=True)
    certs = verified_certificate_digests(signature)
    if certs != [os.environ['KASHYAP_PREVIEW_CERT_SHA256'].lower()]:
        raise ValueError('APK signer does not match the approved internal signing certificate')
    badging = subprocess.check_output([str(tools[-1].with_name('aapt')), 'dump', 'badging', str(apk)], text=True)
    actual_id = re.search(r"^package: name='([^']+)'", badging, re.MULTILINE)
    minimum = re.search(r"^sdkVersion:'(\d+)'", badging, re.MULTILINE)
    label = re.search(r"^application-label:'([^']+)'", badging, re.MULTILINE)
    if not actual_id or actual_id[1] != identity or not minimum or not label or 'Preview' not in label[1]:
        raise ValueError('Built preview identity or Android version could not be verified')
    digest = hashlib.sha256(apk.read_bytes()).hexdigest()
    (output / 'SHA256SUMS').write_text(digest + '  ' + apk.name + '\n')
    (output / 'evidence.json').write_text(json.dumps({
        'commit': sha, 'tree': tree, 'filename': apk.name, 'sha256': digest,
        'version': '1.0.0', 'build': int(build), 'applicationId': identity,
        'apiOrigin': endpoint, 'buildVerified': True, 'installationVerified': False,
        'signingCertificateSha256': certs[0], 'minimumAndroidApi': int(minimum[1]),
        'stagingConnectivityVerified': False, 'productionAcceptance': False,
    }, indent=2) + '\n')


if __name__ == '__main__':
    main()
