"""Regression tests for fast CI's complete inventory and fail-conservative selection."""

from contextlib import contextmanager
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

import plan_fast_ci as planner

ROOT = Path(__file__).resolve().parents[1]


@contextmanager
def cwd(path):
    previous = Path.cwd()
    os.chdir(path)
    try:
        yield
    finally:
        os.chdir(previous)


class PlanningTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.run_git('init', '-q')
        self.run_git('config', 'user.email', 'fictional-ci@example.invalid')
        self.run_git('config', 'user.name', 'Fictional CI')
        self.write('README.md', 'initial')
        self.before = self.commit()

    def run_git(self, *args):
        return subprocess.check_output(['git', *args], cwd=self.root, stderr=subprocess.DEVNULL).decode().strip()

    def write(self, path, text='changed'):
        target = self.root / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(text, encoding='utf-8')

    def commit(self):
        self.run_git('add', '--all')
        self.run_git('commit', '-qm', 'fixture')
        return self.run_git('rev-parse', 'HEAD')

    def check(self, paths, expected):
        for path in paths:
            self.write(path)
        head = self.commit()
        with cwd(self.root):
            selected, _ = planner.plan({'before': self.before, 'after': head}, head)
        self.assertEqual(selected, dict(zip(planner.CHECKS, expected)))

    def assert_all(self, event, expected):
        with cwd(self.root):
            selected, _ = planner.plan(event, expected)
        self.assertTrue(all(selected.values()))

    def test_mobile_push_only_requires_mobile(self):
        self.check(['apps/mobile/lib/inbox.dart'], [False, False, True])

    def test_backend_push_only_requires_backend(self):
        self.check(['services/api/src/auth.ts'], [True, False, False])

    def test_admin_push_only_requires_admin(self):
        self.check(['apps/admin/src/app/page.tsx'], [False, True, False])

    def test_multiple_consumers_are_unioned(self):
        self.check(['apps/admin/src/app/page.tsx', 'services/api/src/auth.ts'], [True, True, False])

    def test_docs_only_still_runs_unconditional_validators(self):
        self.check(['docs/development-control/CURRENT_STATE.md'], [False, False, False])

    def test_shared_contract_requires_all_consumers(self):
        self.check(['packages/contracts/src/index.ts'], [True, True, True])

    def test_root_dependency_and_workflow_changes_require_all(self):
        for path in ('pnpm-lock.yaml', '.github/workflows/ci.yml', 'scripts/plan_fast_ci.py', 'new-module/main.ts'):
            with self.subTest(path=path):
                selected, _ = planner.classify([path])
                self.assertTrue(all(selected.values()))

    def test_rename_from_backend_to_docs_still_selects_backend(self):
        self.write('services/api/src/old.ts')
        self.before = self.commit()
        (self.root / 'docs').mkdir(exist_ok=True)
        self.run_git('mv', 'services/api/src/old.ts', 'docs/moved.md')
        head = self.commit()
        with cwd(self.root):
            selected, _ = planner.plan({'before': self.before, 'after': head}, head)
        self.assertEqual(selected, {'backend': True, 'admin': False, 'mobile': False})

    def test_deleted_mobile_file_is_included(self):
        self.write('apps/mobile/lib/old.dart')
        self.before = self.commit()
        (self.root / 'apps/mobile/lib/old.dart').unlink()
        head = self.commit()
        with cwd(self.root):
            selected, _ = planner.plan({'before': self.before, 'after': head}, head)
        self.assertTrue(selected['mobile'])

    def test_untrusted_newline_shell_characters_do_not_execute(self):
        self.check(['apps/mobile/lib/$(touch INJECTED)\nfile.dart'], [False, False, True])
        self.assertFalse((self.root / 'INJECTED').exists())

    def test_first_push_selects_all(self):
        self.assert_all({'before': '0' * 40, 'after': self.before}, self.before)

    def test_missing_or_malformed_base_selects_all(self):
        for before in (None, 'truncated', '1' * 40):
            with self.subTest(before=before):
                self.assert_all({'before': before, 'after': self.before}, self.before)

    def test_force_push_nonancestor_selects_all(self):
        self.write('services/api/src/future.ts')
        future = self.commit()
        self.run_git('checkout', '-q', self.before)
        self.assert_all({'before': future, 'after': self.before}, self.before)

    def test_empty_diff_selects_all(self):
        self.assert_all({'before': self.before, 'after': self.before}, self.before)

    def test_event_head_mismatch_fails(self):
        with cwd(self.root), self.assertRaises(ValueError):
            planner.plan({'before': self.before, 'after': '1' * 40}, self.before)

    def test_expected_source_mismatch_fails(self):
        with cwd(self.root), self.assertRaises(ValueError):
            planner.plan({'before': self.before, 'after': self.before}, '1' * 40)

    def test_invalid_source_fails(self):
        for expected in ('', 'main', 'a' * 39):
            with self.subTest(expected=expected), cwd(self.root), self.assertRaises(ValueError):
                planner.plan({'after': self.before}, expected)

    def test_incomplete_or_nonutf8_inventory_selects_all(self):
        for diff in (b'apps/mobile/lib/x.dart', b'\xff\0'):
            with self.subTest(diff=diff), patch.object(planner, 'git', side_effect=[self.before.encode(), b'', b'', diff]):
                selected, _ = planner.plan({'before': self.before, 'after': self.before}, self.before)
                self.assertTrue(all(selected.values()))

    def test_inventory_limits_select_all_without_silent_truncation(self):
        self.write('apps/mobile/lib/new.dart')
        head = self.commit()
        for limit in ('MAX_DIFF_BYTES', 'MAX_PATHS'):
            with self.subTest(limit=limit), cwd(self.root), patch.object(planner, limit, 0):
                selected, _ = planner.plan({'before': self.before, 'after': head}, head)
                self.assertTrue(all(selected.values()))

    def test_cli_records_bound_source_and_boolean_outputs(self):
        self.write('apps/mobile/lib/new.dart')
        head = self.commit()
        event_path = self.root / 'event.json'
        event_path.write_text(json.dumps({'before': self.before, 'after': head}))
        output_path = self.root / 'output.txt'
        env = dict(os.environ, GITHUB_EVENT_PATH=str(event_path), GITHUB_OUTPUT=str(output_path), KASHYAP_SOURCE_HEAD_SHA=head)
        subprocess.run(['python3', str(ROOT / 'scripts/plan_fast_ci.py')], cwd=self.root, env=env, check=True, capture_output=True)
        self.assertEqual(output_path.read_text(), 'backend=false\nadmin=false\nmobile=true\n')
        evidence = json.loads((self.root / 'test-results/fast-ci-plan.json').read_text())
        self.assertEqual(evidence['source_sha'], head)
        self.assertIn('full CI and native acceptance remain mandatory', evidence['scope'])


if __name__ == '__main__':
    unittest.main()
