"""Regression controls for timeout attribution and strict committed-source evidence."""
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time
import unittest

SCRIPTS = Path(__file__).resolve().parent


def module(name, filename):
    spec = importlib.util.spec_from_file_location(name, SCRIPTS / filename)
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


runner = module('ios_runner', 'ios-startup-verification.py')
evidence = module('ios_evidence', 'ios-verification-evidence.py')


class BoundedRunnerTests(unittest.TestCase):
    def test_runtime_selection_is_order_independent_and_skips_unavailable(self):
        runtimes = [{'identifier': 'com.apple.CoreSimulator.SimRuntime.iOS-18-5',
                     'version': '18.5', 'isAvailable': True},
                    {'identifier': 'com.apple.CoreSimulator.SimRuntime.iOS-26-2',
                     'version': '26.2', 'isAvailable': True}]
        devices = {r['identifier']: [{'name': 'iPhone 16 Pro', 'udid': 'fixture',
                    'isAvailable': True, 'deviceTypeIdentifier': 'com.apple.CoreSimulator.SimDeviceType.iPhone-16-Pro'}] for r in runtimes}
        expected = (runtimes[0]['identifier'], 'com.apple.CoreSimulator.SimDeviceType.iPhone-16-Pro')
        self.assertEqual(runner.select_device({'runtimes': runtimes, 'devices': devices}), expected)
        self.assertEqual(runner.select_device({'runtimes': list(reversed(runtimes)), 'devices': devices}), expected)
        with self.assertRaises(RuntimeError):
            runner.select_device({'runtimes': runtimes, 'devices': {}})
        runtimes[0]['isAvailable'] = False
        with self.assertRaisesRegex(RuntimeError, 'Pinned iOS'):
            runner.select_device({'runtimes': runtimes, 'devices': devices})

    def test_timeout_classification_does_not_blame_app_before_discovery(self):
        failure = runner.PhaseFailure('startup-test', True)
        self.assertEqual(runner.classify_failure(failure, 'Xcode build done'),
                         'TEST_DISCOVERY_OR_BUILD_INSTALL_LAUNCH_TIMEOUT')
        self.assertEqual(runner.classify_failure(failure, 'IOS_TEST TEST_DISCOVERED'),
                         'APPLICATION_OR_PLUGIN_TIMEOUT')
        self.assertEqual(runner.classify_failure(failure, 'IOS_TEST TEST_DISCOVERED\nIOS_TEST CLEANUP_VERIFIED'),
                         'TEST_RUNNER_TEARDOWN_TIMEOUT')
        self.assertEqual(runner.classify_failure(runner.PhaseFailure('simulator-bootstatus', True), ''),
                         'SIMULATOR_INFRASTRUCTURE_TIMEOUT')
        self.assertEqual(runner.classify_failure(runner.PhaseFailure('startup-test'), ''),
                         'TEST_COMMAND_FAILED_REVIEW_LOG')

    def test_hung_child_is_killed_and_phase_report_is_retained(self):
        previous = runner.RESULTS
        with tempfile.TemporaryDirectory() as tmp:
            runner.RESULTS = Path(tmp)
            report = {'phases': []}
            start = time.monotonic()
            try:
                with self.assertRaises(runner.PhaseFailure) as error:
                    runner.run_phase('hang', [sys.executable, '-c',
                        'import subprocess,sys,time; p=subprocess.Popen([sys.executable,"-c","import time; time.sleep(60)"]); print(p.pid,flush=True); time.sleep(60)'], 0.5, report=report)
                self.assertTrue(error.exception.timed_out)
                self.assertLess(time.monotonic() - start, 10)
                saved = json.loads((Path(tmp) / 'ios-startup-phases.json').read_text())
                self.assertEqual(saved['phases'][0]['status'], 'TIMEOUT')
                pid = (Path(tmp) / 'ios-hang.log').read_text().strip()
                # A dead zombie is acceptable until the OS reaps it; a sleeping child is not.
                status = subprocess.run(['ps', '-o', 'stat=', '-p', pid], capture_output=True, text=True).stdout.strip()
                self.assertTrue(not status or status.startswith('Z'), status)
            finally:
                runner.RESULTS = previous

    def test_nonzero_exit_cannot_be_masked_by_success_text(self):
        previous = runner.RESULTS
        with tempfile.TemporaryDirectory() as tmp:
            runner.RESULTS = Path(tmp)
            try:
                with self.assertRaises(runner.PhaseFailure) as error:
                    runner.run_phase('failure', [sys.executable, '-c', 'print("All tests passed!"); raise SystemExit(7)'], 5)
                self.assertFalse(error.exception.timed_out)
            finally:
                runner.RESULTS = previous


class SourceEvidenceTests(unittest.TestCase):
    def test_untracked_modified_and_missing_native_source_are_rejected(self):
        previous = evidence.ROOT
        with tempfile.TemporaryDirectory() as tmp:
            evidence.ROOT = Path(tmp).resolve()
            root = evidence.ROOT
            project = root / evidence.PROJECT
            project.parent.mkdir(parents=True)
            project.write_text('fixture')
            def git(*args):
                subprocess.run(['git', *args], cwd=root, check=True, capture_output=True)
            git('init')
            git('add', '.')
            git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-m', 'fixture')
            try:
                self.assertEqual(evidence.native_sources(), [evidence.PROJECT])
                extra = project.parent / 'Package.resolved'
                extra.write_text('{"pins":[]}')
                with self.assertRaisesRegex(RuntimeError, 'Package.resolved'):
                    evidence.native_sources()
                extra.unlink()
                project.write_text('changed source')
                with self.assertRaises(subprocess.CalledProcessError):
                    evidence.native_sources()
                project.unlink()
                with self.assertRaises(subprocess.CalledProcessError):
                    evidence.native_sources()
            finally:
                evidence.ROOT = previous


if __name__ == '__main__':
    unittest.main()
