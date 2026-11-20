import base64
import importlib.util
from pathlib import Path
import re
import unittest
spec = importlib.util.spec_from_file_location('preview_guard', Path(__file__).with_name('check_preview_build.py'))
guard = importlib.util.module_from_spec(spec)
spec.loader.exec_module(guard)
root = Path(__file__).resolve().parents[1]
class PreviewBuildTests(unittest.TestCase):
    def test_release_and_profile_reject_flags_and_alternate_entry(self):
        for mode in ['release', 'Release', 'profile']:
            for flag in ['ENABLE_DEV_PREVIEW=true', 'ENABLE_DEV_PREVIEW=false', 'ENABLE_DEV_FULL_STACK=true']:
                with self.assertRaises(ValueError): guard.validate(mode, defines=base64.b64encode(flag.encode()).decode())
            with self.assertRaises(ValueError): guard.validate(mode, target='lib/main_dev_preview.dart')
            with self.assertRaises(ValueError): guard.validate(mode, preview_identity='true')
            guard.validate(mode, target='lib/main.dart', defines=base64.b64encode(b'API_BASE_URL=https://api.synthetic.invalid').decode())
        guard.validate('debug', target='lib/main_dev_preview.dart', defines=base64.b64encode(b'ENABLE_DEV_PREVIEW=true').decode())
    def test_production_import_graph_excludes_synthetic_repository(self):
        start = root/'apps/mobile/lib/main.dart'
        seen = set()
        def visit(path):
            path = path.resolve()
            if path in seen: return
            seen.add(path)
            self.assertNotIn('dev_preview', path.parts)
            self.assertNotEqual(path.name, 'main_dev_preview.dart')
            for imp in re.findall(r"(?:import|export|part)\s+['\"]([^'\"]+)", path.read_text()):
                if ':' not in imp: visit(path.parent/imp)
        visit(start)
        self.assertGreater(len(seen), 30)
    def test_native_build_hooks_reject_preview_before_signing(self):
        android=(root/'apps/mobile/android/app/build.gradle.kts').read_text()
        self.assertIn('ENABLE_DEV_PREVIEW', android)
        self.assertIn('preProfileBuild', android)
        ios=(root/'apps/mobile/ios/Runner.xcodeproj/project.pbxproj').read_text()
        self.assertIn('check_preview_build.py', ios)
if __name__ == '__main__': unittest.main()
