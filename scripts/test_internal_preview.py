import importlib.util
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('preview', Path(__file__).with_name('build_internal_preview.py'))
preview = importlib.util.module_from_spec(spec)
spec.loader.exec_module(preview)


class PreviewAdmissionTests(unittest.TestCase):
    def test_rejects_unapproved_destination_identity_and_debug_signing(self):
        with tempfile.TemporaryDirectory() as directory:
            store = Path(directory) / 'internal.jks'
            store.write_bytes(b'not-a-real-keystore')
            env = {'KASHYAP_PREVIEW_APPROVED': 'true',
                   'KASHYAP_STAGING_API_URL': 'https://staging.jyphra.com',
                   'KASHYAP_ANDROID_APPLICATION_ID': 'com.jyphra.kashyap.preview',
                   'KASHYAP_ANDROID_STORE_FILE': str(store),
                   'KASHYAP_ANDROID_STORE_PASSWORD': 'synthetic-password',
                   'KASHYAP_ANDROID_KEY_ALIAS': 'internal',
                   'KASHYAP_ANDROID_KEY_PASSWORD': 'synthetic-password'}
            env['KASHYAP_PREVIEW_CERT_SHA256'] = 'a' * 64
            self.assertEqual(preview.validate(env), ('https://staging.jyphra.com', env['KASHYAP_ANDROID_APPLICATION_ID']))
            for key, values in {
                'KASHYAP_PREVIEW_APPROVED': ['', 'false'],
                'KASHYAP_STAGING_API_URL': ['', 'http://staging.jyphra.com', 'https://localhost',
                    'https://10.0.2.2', 'https://staging.invalid', 'https://example.com',
                    'https://user:password@staging.jyphra.com', 'https://staging.jyphra.com?token=secret',
                    'https://staging.jyphra.com#secret', 'https://staging.jyphra.com/api', 'https://staging.jyphra.com:8443',
                    ' https://staging.jyphra.com', 'https://staging.jyphra.com\n', 'https://staging.example.org'],
                'KASHYAP_ANDROID_APPLICATION_ID': ['com.jyphra.kashyap', 'com.example.app.preview'],
                'KASHYAP_ANDROID_STORE_FILE': ['', '/missing-key.jks', 'relative-key.jks'],
                'KASHYAP_ANDROID_KEY_ALIAS': ['', 'androiddebugkey'],
                'KASHYAP_ANDROID_STORE_PASSWORD': [''],
                'KASHYAP_ANDROID_KEY_PASSWORD': [''],
                'KASHYAP_PREVIEW_CERT_SHA256': ['', 'not-a-certificate'],
            }.items():
                for value in values:
                    with self.subTest(key=key, value=value), self.assertRaises(ValueError):
                        preview.validate({**env, key: value})
            debug = Path(directory) / 'debug.keystore'
            debug.write_bytes(b'synthetic')
            with self.assertRaises(ValueError):
                preview.validate({**env, 'KASHYAP_ANDROID_STORE_FILE': str(debug)})


class SignerOutputTests(unittest.TestCase):
    def test_supported_tool_outputs_and_repeated_schemes(self):
        digest = 'a' * 64
        for prefix in ['Signer #1', 'V1 Signer:', 'V2 Signer:', 'V3 Signer:', 'V3.1 Signer:']:
            line = prefix + ' certificate SHA-256 digest: ' + digest
            self.assertEqual(preview.verified_certificate_digests(line), [digest])
        output = ('V2 Signer: certificate SHA-256 digest: ' + digest.upper() +
                  '\nV3 Signer: certificate SHA-256 digest: ' + digest)
        self.assertEqual(preview.verified_certificate_digests(output), [digest])

    def test_distinct_signers_are_not_collapsed(self):
        output = ('Signer #1 certificate SHA-256 digest: ' + 'a' * 64 +
                  '\nSigner #2 certificate SHA-256 digest: ' + 'b' * 64)
        self.assertEqual(len(preview.verified_certificate_digests(output)), 2)

    def test_unrecognized_or_malformed_output_provides_no_identity(self):
        for output in ['', 'V2 Signer: certificate SHA-256 digest: xyz',
                       'Unverified certificate SHA-256 digest: ' + 'a' * 64]:
            self.assertEqual(preview.verified_certificate_digests(output), [])


if __name__ == '__main__':
    unittest.main()
