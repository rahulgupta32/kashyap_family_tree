import importlib.util
from pathlib import Path
import subprocess
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('usb', Path(__file__).with_name('build_usb_test.py'))
usb = importlib.util.module_from_spec(spec)
spec.loader.exec_module(usb)

class UsbBuildTests(unittest.TestCase):
    def test_identity_rejects_ordinary_or_preview_artifact(self):
        good = "package: name='com.example.kashyap_mobile.usbtest'\napplication-label:'Nepali Bansawali — USB Test'\nsdkVersion:'24'\n"
        self.assertEqual(usb.inspect_badging(good), 24)
        for bad in [good.replace('.usbtest', '.preview'), good.replace('USB Test', 'Preview'), good.replace("sdkVersion:'24'", '')]:
            with self.assertRaises(ValueError):
                usb.inspect_badging(bad)

    def test_source_admits_only_the_existing_exact_ci_memory_cap(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            subprocess.run(['git', 'init', '-q', str(root)], check=True)
            def git(*args):
                return subprocess.run(['git', '-C', str(root), *args], check=True, capture_output=True)
            git('config', 'user.name', 'Synthetic test')
            git('config', 'user.email', 'test@example.invalid')
            props = root / 'apps/mobile/android/gradle.properties'
            props.parent.mkdir(parents=True)
            props.write_text('org.gradle.jvmargs=-Xmx8G\nandroid.useAndroidX=true\n')
            git('add', '.')
            git('commit', '-qm', 'synthetic fixture')
            self.assertIsNone(usb.verify_build_source(root))
            props.write_text('org.gradle.jvmargs=-Xmx3G -XX:MaxMetaspaceSize=1G -XX:ReservedCodeCacheSize=256m\nandroid.useAndroidX=true\n')
            self.assertEqual(usb.verify_build_source(root)['purpose'], 'existing CI memory cap')
            props.write_text(props.read_text().replace('true', 'false'))
            with self.assertRaises(ValueError):
                usb.verify_build_source(root)
            git('restore', '.')
            other = root / 'auth.dart'
            other.write_text('fixture')
            git('add', 'auth.dart')
            with self.assertRaises(ValueError):
                usb.verify_build_source(root)

if __name__ == '__main__':
    unittest.main()
