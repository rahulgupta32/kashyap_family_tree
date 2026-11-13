#!/usr/bin/env python3
"""Fail closed for preview inputs in non-debug native builds."""
import base64
import os

def validate(mode, target='', defines='', preview_identity=''):
    if mode.lower() == 'debug':
        return
    decoded = [base64.b64decode(item, validate=True).decode() for item in defines.split(',') if item]
    if ('dev_preview' in target.replace('\\', '/').lower() or preview_identity.lower() == 'true' or
            any(item.partition('=')[0] in {'ENABLE_DEV_PREVIEW', 'ENABLE_DEV_FULL_STACK'} for item in decoded)):
        raise ValueError('Development preview is debug-only and forbidden in release/profile builds')

if __name__ == '__main__':
    mode = os.environ.get('FLUTTER_BUILD_MODE') or os.environ.get('CONFIGURATION', 'release').split('-')[0]
    validate(mode, os.environ.get('FLUTTER_TARGET', ''), os.environ.get('DART_DEFINES', ''), os.environ.get('KASHYAP_DEV_PREVIEW', ''))
