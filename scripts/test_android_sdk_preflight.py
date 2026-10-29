import importlib.util
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('preflight', Path(__file__).with_name('android-sdk-preflight.py'))
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)


class PreflightTests(unittest.TestCase):
    def run_fake(self, mode):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp); sdk = root / 'sdk'; sdk.mkdir(); user = root / 'user'; user.mkdir()
            logs = root / 'logs'; logs.mkdir(); report = {}; calls = []
            (sdk / 'healthy-component').write_text('preserve')
            (sdk / '.temp').mkdir(); (sdk / '.temp/bad.zip').write_bytes(b'not a zip')
            def execute(args, target):
                package = args[2]; count = sum(p == package for p in calls); calls.append(package)
                if mode == 'nonarchive' or (package == 'emulator' and (mode == 'always' or count == 0)):
                    target.write_text('network denied' if mode == 'nonarchive' else 'Error on ZipFile unknown archive')
                    return 1, target.read_text()
                self.assertFalse((sdk / '.temp/bad.zip').exists())
                directory, required = m.PACKAGES[package]; location = sdk / directory; location.mkdir(parents=True, exist_ok=True)
                (location / 'package.xml').write_text(f'<repository><localPackage path="{package}"/></repository>')
                (location / required).write_bytes(b'fixture'); target.write_text('installed')
                return 0, 'installed'
            try:
                m.prepare(sdk, user, execute, logs, report)
            finally:
                self.assertEqual((sdk / 'healthy-component').read_text(), 'preserve')
            return calls, report

    def test_archive_error_has_one_cache_only_retry(self):
        calls, report = self.run_fake('recover')
        self.assertEqual(calls, ['emulator', 'emulator', 'system-images;android-35;google_apis;x86_64'])
        self.assertFalse(report['packages']['emulator'][0]['installed_package_verified'])
        self.assertTrue(report['packages']['emulator'][1]['installed_package_verified'])

    def test_repeated_archive_error_fails_closed(self):
        with self.assertRaisesRegex(RuntimeError, 'not verified'):
            self.run_fake('always')

    def test_other_failure_is_not_retried_as_archive_recovery(self):
        with self.assertRaisesRegex(RuntimeError, 'not verified'):
            self.run_fake('nonarchive')

    def test_partial_or_wrong_package_is_not_verified(self):
        with tempfile.TemporaryDirectory() as temp:
            sdk = Path(temp); location = sdk / 'emulator'; location.mkdir()
            (location / 'emulator').write_bytes(b'partial')
            (location / 'package.xml').write_text('<repository><localPackage path="wrong"/></repository>')
            self.assertFalse(m.installed(sdk, 'emulator'))


if __name__ == '__main__':
    unittest.main()
