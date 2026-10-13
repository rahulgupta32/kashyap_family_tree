"""Host controls for explicit connection, strict evidence and owned process cleanup."""
import copy
import importlib.util
import json
from pathlib import Path
import plistlib
import subprocess
import sys
import tempfile
import time
import unittest
from unittest.mock import patch, Mock

import ios_vm_connection as connection

SCRIPTS = Path(__file__).resolve().parent
URL = 'http://127.0.0.1:43001/abcdefghijk=/'
SIMULATOR = '11111111-1111-4111-8111-111111111111'


def evidence():
    log = '\n'.join('IOS_TEST ' + marker for marker in connection.MARKERS)
    log += '\nAll tests passed.\nIOS_DRIVER RESULT_VERIFIED\n'
    report = {'mode': connection.MODE, 'status': 'PASSED', 'vmUrlValidated': True,
              'consoleProcessJoined': True, 'phases': [
                  {'phase': name, 'status': 'PASSED', 'exitCode': 0}
                  for name in connection.REQUIRED_PHASES]}
    return log, report


class ExplicitConnectionTests(unittest.TestCase):
    def test_unified_snapshot_cannot_supply_another_process_service(self):
        entries = [{'processID': 123, 'timestamp': '2026-01-01T00:00:01+00:00',
                    'eventMessage': 'The Dart VM service is listening on ' + URL}]
        self.assertIsNone(connection.snapshot_url(json.dumps(entries), 456, 0))
        self.assertEqual(connection.snapshot_url(json.dumps(entries), 123, 0), URL)
        self.assertIsNone(connection.snapshot_url(json.dumps(entries), 123, 9999999999))
        entries[0]['timestamp'] = '2026-01-01T00:00:01'
        self.assertIsNone(connection.snapshot_url(json.dumps(entries), 123, 0))
        with self.assertRaises(RuntimeError):
            connection.snapshot_url('{}', 123, 0)

    def test_discovery_uses_only_the_launched_pid_when_console_misses_announcement(self):
        with tempfile.TemporaryDirectory() as tmp, patch.object(connection, 'RESULTS', Path(tmp)):
            path = Path(tmp) / 'console.log'; path.write_text('fixture.example: 123\n')
            capture = Mock(path=path, error=None, started_at=0); capture.process.poll.return_value = None
            result = subprocess.CompletedProcess([], 0,
                json.dumps([{'processID': 456, 'timestamp': '2026-01-01T00:00:01+00:00', 'eventMessage': 'The Dart VM service is listening on http://127.0.0.1:43003/othernonce=/'},
                            {'processID': 123, 'timestamp': '2026-01-01T00:00:01+00:00', 'eventMessage': 'The Dart VM service is listening on ' + URL}]), '')
            with patch.object(connection.subprocess, 'run', return_value=result):
                self.assertEqual(connection.discover(capture, 1, SIMULATOR, 'fixture.example'), URL)

    def test_only_authenticated_loopback_urls_are_accepted(self):
        for url in [URL, 'http://[::1]:43002/abcdefghijk=/']:
            self.assertEqual(connection.vm_service_url('The Dart VM service is listening on ' + url), url)
        for url in ['http://127.0.0.1:43001/', 'https://127.0.0.1:43001/abcdefghijk=/',
                    'http://provider.invalid:43001/abcdefghijk=/', 'http://localhost:43001/abcdefghijk=/',
                    'http://127.0.0.1:0/abcdefghijk=/', 'http://127.0.0.1:65536/abcdefghijk=/',
                    'http://user@127.0.0.1:43001/abcdefghijk=/', 'http://127.0.0.1:43001/abcdefghijk=/?query=1',
                    'http://@127.0.0.1:43001/abcdefghijk=/', 'http://127.0.0.1:43001/abcdefghijk=/?',
                    'http://127.0.0.1:43001/abcdefghijk=/#fragment']:
            with self.subTest(url=url), self.assertRaisesRegex(RuntimeError, 'loopback'):
                connection.vm_service_url('The Dart VM service is listening on ' + url)
        self.assertIsNone(connection.vm_service_url('No announcement'))

    def test_previous_launch_log_cannot_supply_a_connection(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / 'console.log'
            path.write_text('The Dart VM service is listening on ' + URL)
            capture = connection.Capture([sys.executable, '-c', 'print("No VM announcement",flush=True)'], path)
            try:
                with self.assertRaises(connection.ConnectionFailure):
                    connection.discover(capture, 2)
                self.assertNotIn(URL, path.read_text())
            finally:
                capture.stop()

    def test_hung_console_discovery_is_bounded_and_joined(self):
        with tempfile.TemporaryDirectory() as tmp:
            capture = connection.Capture([sys.executable, '-c', 'import time;print("Waiting",flush=True);time.sleep(30)'], Path(tmp) / 'console.log')
            started = time.monotonic()
            try:
                with self.assertRaises(connection.ConnectionFailure) as result:
                    connection.discover(capture, 0.15)
                self.assertTrue(result.exception.timed_out)
            finally:
                capture.stop()
            self.assertLess(time.monotonic() - started, 3)
            self.assertIsNotNone(capture.process.poll())
            self.assertFalse(capture.reader.is_alive())

    def test_real_nonzero_driver_exit_is_retained_even_with_success_text(self):
        with tempfile.TemporaryDirectory() as tmp, patch.object(connection, 'RESULTS', Path(tmp)), patch.object(connection, 'ROOT', Path(tmp)):
            (Path(tmp) / 'apps/mobile').mkdir(parents=True)
            report = {'phases': []}
            with self.assertRaises(connection.ConnectionFailure):
                connection.command_phase(report, 'test-driver', [sys.executable, '-c',
                    'print("All tests passed.\\nIOS_DRIVER RESULT_VERIFIED");raise SystemExit(7)'], 3)
            self.assertEqual(report['phases'][0]['status'], 'FAILED')
            self.assertEqual(report['phases'][0]['exitCode'], 7)

    def test_driver_protocol_success_requires_every_body_marker_and_phase(self):
        log, report = evidence()
        connection.validate_evidence(log, report)
        for marker in connection.MARKERS + ['IOS_DRIVER RESULT_VERIFIED', 'All tests passed.']:
            with self.subTest(marker=marker), self.assertRaises(RuntimeError):
                connection.validate_evidence(log.replace(marker, ''), report)
        for field in ['vmUrlValidated', 'consoleProcessJoined']:
            changed = copy.deepcopy(report); changed[field] = False
            with self.subTest(field=field), self.assertRaises(RuntimeError):
                connection.validate_evidence(log, changed)
        for i in range(len(report['phases'])):
            changed = copy.deepcopy(report); changed['phases'][i]['exitCode'] = 7
            with self.subTest(phase=i), self.assertRaises(RuntimeError):
                connection.validate_evidence(log, changed)

    def test_one_shot_orchestration_retains_driver_failure_despite_cleanup_failure(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); (root / 'test-results').mkdir()
            app = root / 'apps/mobile/build/ios/iphonesimulator/Runner.app'; app.mkdir(parents=True)
            (app / 'Info.plist').write_bytes(plistlib.dumps({'CFBundleIdentifier': 'fixture.example'}))
            commands, captures = [], []
            original = connection.Capture
            def captured(*args, **kwargs):
                c = original(*args, **kwargs); captures.append(c); return c
            def phase(report, name, command, timeout, echo=False):
                commands.append((name, command))
                failure = connection.ConnectionFailure(name, exit_code=7) if name in ['test-driver', 'app-terminate'] else None
                connection.record_phase(report, name, time.monotonic(), failure)
                if failure: raise failure
            launch = [sys.executable, '-c', f'import time;print("The Dart VM service is listening on {URL}",flush=True);time.sleep(30)']
            with patch.object(connection, 'ROOT', root), patch.object(connection, 'RESULTS', root / 'test-results'), \
                 patch.object(connection, 'command_phase', side_effect=phase), patch.object(connection, 'Capture', side_effect=captured), \
                 patch.object(connection, 'launch_command', return_value=launch) as launcher:
                with self.assertRaises(connection.ConnectionFailure) as error:
                    connection.run(SIMULATOR)
            self.assertEqual(error.exception.phase, 'test-driver')
            self.assertEqual(launcher.call_count, 1)
            self.assertEqual([name for name, _ in commands], ['test-build', 'test-install', 'test-driver', 'app-terminate'])
            self.assertIn('--use-existing-app=' + URL, commands[2][1])
            report = json.loads((root / 'test-results/ios-vm-connection.json').read_text())
            self.assertEqual(report['status'], 'FAILED')
            self.assertEqual(report['failurePhase'], 'test-driver')
            self.assertNotIn(URL, json.dumps(report))
            self.assertIsNotNone(captures[0].process.poll())
            self.assertFalse(captures[0].reader.is_alive())

    def test_console_child_cannot_escape_outer_deadline(self):
        spec = importlib.util.spec_from_file_location('outer', SCRIPTS / 'ios-startup-verification.py')
        outer = importlib.util.module_from_spec(spec); spec.loader.exec_module(outer)
        with tempfile.TemporaryDirectory() as tmp, patch.object(outer, 'RESULTS', Path(tmp)):
            path = str(Path(tmp) / 'console.log')
            code = f'import sys,time;sys.path.insert(0,{str(SCRIPTS)!r});from ios_vm_connection import Capture;from pathlib import Path;c=Capture([sys.executable,"-c","import time;time.sleep(30)"],Path({path!r}));print(c.process.pid,flush=True);time.sleep(30)'
            with self.assertRaises(outer.PhaseFailure):
                outer.run_phase('nested', [sys.executable, '-c', code], 0.5)
            pid = (Path(tmp) / 'ios-nested.log').read_text().strip()
            status = subprocess.run(['ps', '-o', 'stat=', '-p', pid], capture_output=True, text=True).stdout.strip()
            self.assertTrue(not status or status.startswith('Z'), status)

    def test_archived_verification_inputs_reject_untracked_or_changed_driver(self):
        spec = importlib.util.spec_from_file_location('input_evidence', SCRIPTS / 'ios-verification-evidence.py')
        archive = importlib.util.module_from_spec(spec); spec.loader.exec_module(archive)
        with tempfile.TemporaryDirectory() as tmp, patch.object(archive, 'ROOT', Path(tmp)):
            root = Path(tmp)
            for name in archive.INPUTS:
                path = root / name; path.parent.mkdir(parents=True, exist_ok=True); path.write_text('fictional input')
            driver = archive.INPUTS[-1]
            def git(*args):
                subprocess.run(['git', *args], cwd=root, check=True, capture_output=True)
            git('init'); git('add', '--', *archive.INPUTS[:-1])
            git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-m', 'fixture')
            with self.assertRaises(subprocess.CalledProcessError):
                archive.input_hashes()
            git('add', '--', driver)
            git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-m', 'driver fixture')
            self.assertEqual(len(archive.input_hashes()), 7)
            (root / driver).write_text('changed driver')
            with self.assertRaises(subprocess.CalledProcessError):
                archive.input_hashes()


if __name__ == '__main__':
    unittest.main()
