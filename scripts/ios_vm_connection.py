"""One-shot disposable iOS fixture launch and authenticated loopback driver connection."""
import json
from datetime import datetime
from pathlib import Path
import plistlib
import re
import subprocess
import sys
import threading
import time
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
RESULTS = ROOT / 'test-results'
MODE = 'EXPLICIT_AUTHENTICATED_LOOPBACK_VM'
MARKERS = ['TEST_DISCOVERED', 'KEYCHAIN_CLEAR', 'KEYCHAIN_WRITE', 'KEYCHAIN_READ',
           'KEYCHAIN_DELETE', 'KEYCHAIN_VERIFIED', 'APP_PUMP', 'APP_VERIFIED', 'CLEANUP_VERIFIED']
REQUIRED_PHASES = ['test-build', 'test-install', 'test-launch', 'vm-discovery', 'test-driver', 'test-evidence', 'app-terminate']
OUTPUT_LOCK = threading.Lock()


class ConnectionFailure(RuntimeError):
    def __init__(self, phase, timed_out=False, exit_code=None):
        super().__init__(phase)
        self.phase, self.timed_out, self.exit_code = phase, timed_out, exit_code


def emit(data):
    with OUTPUT_LOCK:
        sys.stdout.buffer.write(data)
        sys.stdout.buffer.flush()


def vm_service_url(log):
    match = re.search(r'The Dart VM service is listening on (\S+)', log)
    if not match:
        return None
    value = match.group(1)
    try:
        uri = urlsplit(value)
        valid = (len(value) <= 256 and uri.scheme == 'http' and
                 uri.hostname in ('127.0.0.1', '::1') and uri.port is not None and
                 1 <= uri.port <= 65535 and uri.username is None and uri.password is None and
                 '?' not in value and '#' not in value and
                 re.fullmatch(r'/[A-Za-z0-9_=-]{8,128}/', uri.path))
    except ValueError:
        valid = False
    if not valid:
        raise RuntimeError('Invalid authenticated loopback VM announcement')
    return value


def validate_evidence(log, report):
    if (report.get('status') != 'PASSED' or report.get('mode') != MODE or
            report.get('vmUrlValidated') is not True or report.get('ownedProcessesJoined') is not True or
            report.get('bodyMarkers') != MARKERS):
        raise RuntimeError('Explicit VM connection evidence is incomplete')
    phases = report.get('phases', [])
    if [p.get('phase') for p in phases] != REQUIRED_PHASES or any(
            p.get('status') != 'PASSED' or p.get('exitCode') != 0 for p in phases):
        raise RuntimeError('Explicit VM phases did not all pass')
    if ('All tests passed.' not in log or 'IOS_DRIVER RESULT_VERIFIED' not in log or
            any('IOS_TEST ' + marker not in log for marker in MARKERS)):
        raise RuntimeError('Complete driver/Keychain/app/cleanup evidence is required')


class Capture:
    """Keep inner commands in the outer supervisor's process group."""
    def __init__(self, command, path, cwd=ROOT, echo=False):
        self.path, self.echo, self.error = path, echo, None
        self.started_at = time.time()
        self.output = path.open('wb')  # Never consume a previous launch's log.
        try:
            self.process = subprocess.Popen(command, cwd=cwd, stdout=subprocess.PIPE,
                                            stderr=subprocess.STDOUT)
        except BaseException:
            self.output.close()
            raise
        self.reader = threading.Thread(target=self.pump, daemon=True)
        self.reader.start()

    def pump(self):
        try:
            for line in self.process.stdout:
                self.output.write(line)
                self.output.flush()
                if self.echo:
                    emit(line)
        except Exception as error:
            self.error = error

    def join_reader(self):
        self.reader.join(timeout=5)
        if self.reader.is_alive() or self.error:
            raise RuntimeError('Fixture console capture did not finish')
        self.process.stdout.close()
        self.output.close()

    def wait(self, timeout, phase):
        try:
            code = self.process.wait(timeout=timeout)
        except subprocess.TimeoutExpired:
            raise ConnectionFailure(phase, True)
        self.join_reader()
        if code != 0:
            raise ConnectionFailure(phase, exit_code=code)

    def stop(self):
        if self.process.poll() is None:
            self.process.terminate()
            try:
                self.process.wait(timeout=3)
            except subprocess.TimeoutExpired:
                self.process.kill()
                self.process.wait(timeout=5)
        if not self.output.closed:
            self.join_reader()


def record_phase(report, name, started, failure=None):
    report['phases'].append({'phase': name,
        'status': 'TIMEOUT' if failure and failure.timed_out else 'FAILED' if failure else 'PASSED',
        'exitCode': failure.exit_code if failure else 0,
        'elapsedSeconds': round(time.monotonic() - started, 2)})
    (RESULTS / 'ios-vm-connection.json').write_text(json.dumps(report, indent=2) + '\n')


def command_phase(report, name, command, timeout, echo=False):
    started = time.monotonic()
    emit(f'IOS_CONNECTION {name} START deadline={timeout}s\n'.encode())
    capture, failure = None, None
    try:
        capture = Capture(command, RESULTS / f'ios-{name}.log', cwd=ROOT / 'apps/mobile', echo=echo)
        capture.wait(timeout, name)
    except (ConnectionFailure, RuntimeError, OSError) as error:
        failure = error if isinstance(error, ConnectionFailure) else ConnectionFailure(name)
        if failure is error:
            raise
        raise failure from error
    finally:
        if capture:
            try:
                capture.stop()
            except (RuntimeError, OSError) as error:
                failure = failure or ConnectionFailure(name)
                record_phase(report, name, started, failure)
                raise failure from error
        record_phase(report, name, started, failure)
    return capture


def snapshot_phase(report, name, command, timeout):
    """Keep log's UID/diagnostic stderr separate from its machine-readable JSON."""
    started, failure = time.monotonic(), None
    emit(f'IOS_CONNECTION {name} START deadline={timeout}s\n'.encode())
    try:
        result = subprocess.run(command, cwd=ROOT / 'apps/mobile', capture_output=True,
                                text=True, timeout=timeout)
        (RESULTS / f'ios-{name}.log').write_text(result.stdout)
        (RESULTS / f'ios-{name}-stderr.log').write_text(result.stderr)
        if result.returncode != 0:
            raise ConnectionFailure(name, exit_code=result.returncode)
        return result.stdout
    except subprocess.TimeoutExpired as error:
        failure = ConnectionFailure(name, True)
        for suffix, data in [('', error.stdout), ('-stderr', error.stderr)]:
            (RESULTS / f'ios-{name}{suffix}.log').write_text(
                data.decode(errors='replace') if isinstance(data, bytes) else data or '')
        raise failure from error
    except (ConnectionFailure, RuntimeError, OSError) as error:
        failure = error if isinstance(error, ConnectionFailure) else ConnectionFailure(name)
        if failure is error:
            raise
        raise failure from error
    finally:
        record_phase(report, name, started, failure)


def owned_messages(stdout, pid, since):
    entries = json.loads(stdout)
    if not isinstance(entries, list):
        raise RuntimeError('Invalid simulator log snapshot')
    messages = []
    for entry in entries:
        if (isinstance(entry, dict) and entry.get('processID') == pid and
                isinstance(entry.get('eventMessage'), str)):
            try:
                stamp = datetime.fromisoformat(entry.get('timestamp', ''))
                if stamp.tzinfo is None or stamp.timestamp() < since:
                    continue
            except (ValueError, TypeError):
                continue
            messages.append(entry['eventMessage'])
    return messages


def snapshot_url(stdout, pid, since):
    for message in owned_messages(stdout, pid, since):
        value = vm_service_url(message)
        if value:
            return value
    return None


def discover(capture, timeout, simulator=None, bundle=None):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if capture.error:
            raise RuntimeError('Fixture console capture failed')
        log = capture.path.read_text(errors='replace')
        value = vm_service_url(log)
        if value:
            return value
        # The short launcher has returned its PID; read the retained announcement for
        # that PID after this launch began, never an earlier Runner's address.
        pid = re.search(r'^' + re.escape(bundle) + r': ([1-9]\d*)\s*$', log, re.MULTILINE) if bundle else None
        if pid and simulator:
            try:
                result = subprocess.run(['xcrun', 'simctl', 'spawn', simulator, 'log', 'show', '--last', '5m',
                    '--style', 'json', '--predicate',
                    'process == "Runner" AND eventMessage CONTAINS "The Dart VM service is listening on"'],
                    capture_output=True, text=True, timeout=max(0.01, min(5, deadline - time.monotonic())))
                with (RESULTS / 'ios-vm-discovery.log').open('a') as output:
                    output.write(result.stdout)
                    output.write(result.stderr)
                if result.returncode == 0:
                    value = snapshot_url(result.stdout, int(pid.group(1)), capture.started_at)
                    if value:
                        return value
            except (subprocess.TimeoutExpired, json.JSONDecodeError):
                pass  # Still bounded by this discovery deadline; no launch/test is retried.
        code = capture.process.poll()
        if code is not None and (code != 0 or not pid):
            capture.join_reader()
            raise ConnectionFailure('vm-discovery', exit_code=code)
        time.sleep(0.1)
    raise ConnectionFailure('vm-discovery', True)


def launch_command(simulator, bundle):
    return ['xcrun', 'simctl', 'launch', '--terminate-running-process', simulator, bundle,
            '--enable-dart-profiling', '--disable-vm-service-publication', '--enable-checked-mode',
            '--verify-entry-points', '--start-paused']


def run(simulator):
    if not re.fullmatch(r'[0-9A-Fa-f-]{36}', simulator):
        raise RuntimeError('Invalid disposable simulator identifier')
    RESULTS.mkdir(exist_ok=True)
    report = {'mode': MODE, 'status': 'RUNNING', 'phases': [],
              'vmUrlValidated': False, 'ownedProcessesJoined': False, 'bodyMarkers': []}
    console, bundle, failure = None, None, None
    try:
        command_phase(report, 'test-build', ['flutter', 'build', 'ios', '--simulator', '--debug', '--no-pub',
            '--target=integration_test/ios_startup_test.dart',
            '--dart-define=KASHYAP_DISPOSABLE_IOS_SIMULATOR=true',
            '--dart-define=INTEGRATION_TEST_SHOULD_REPORT_RESULTS_TO_NATIVE=false',
            '--dart-define=API_BASE_URL=https://api.invalid'], 360)
        app = ROOT / 'apps/mobile/build/ios/iphonesimulator/Runner.app'
        bundle = plistlib.loads((app / 'Info.plist').read_bytes())['CFBundleIdentifier']
        if not isinstance(bundle, str) or not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9.-]{1,200}', bundle):
            raise RuntimeError('Invalid compiled fixture bundle identifier')
        command_phase(report, 'test-install', ['xcrun', 'simctl', 'install', simulator, str(app)], 30)
        console = command_phase(report, 'test-launch', launch_command(simulator, bundle), 30)
        match = re.search(r'^' + re.escape(bundle) + r': ([1-9]\d*)\s*$',
                          console.path.read_text(errors='replace'), re.MULTILINE)
        if not match:
            raise ConnectionFailure('test-launch')
        pid = int(match.group(1))
        started = time.monotonic()
        try:
            uri = discover(console, 60, simulator, bundle)
        except (ConnectionFailure, RuntimeError, OSError) as error:
            scoped = error if isinstance(error, ConnectionFailure) else ConnectionFailure('vm-discovery')
            record_phase(report, 'vm-discovery', started, scoped)
            if scoped is error:
                raise
            raise scoped from error
        record_phase(report, 'vm-discovery', started)
        report['vmUrlValidated'] = True
        # Supported by the pinned Flutter tool. URI is fenced to this launch's PID/time.
        command_phase(report, 'test-driver', ['flutter', 'drive', '-d', simulator, '--no-pub',
            '--target=integration_test/ios_startup_test.dart', '--driver=test_driver/ios_startup_driver.dart',
            '--timeout=180', '--use-existing-app=' + uri], 180, echo=True)
        snapshot = snapshot_phase(report, 'test-evidence', ['xcrun', 'simctl', 'spawn', simulator,
            'log', 'show', '--last', '5m', '--style', 'json', '--predicate',
            'process == "Runner" AND eventMessage CONTAINS "IOS_TEST"'], 10)
        messages = owned_messages(snapshot, pid, console.started_at)
        report['bodyMarkers'] = [marker for marker in MARKERS if any('IOS_TEST ' + marker in m for m in messages)]
        for marker in report['bodyMarkers']:
            emit(('IOS_TEST ' + marker + '\n').encode())
        if report['bodyMarkers'] != MARKERS:
            raise ConnectionFailure('test-evidence')
    except (ConnectionFailure, RuntimeError, OSError, ValueError) as error:
        failure = error
    finally:
        if console:
            try:
                command_phase(report, 'app-terminate', ['xcrun', 'simctl', 'terminate', simulator, bundle], 15)
                console.stop()
                report['ownedProcessesJoined'] = True
            except (ConnectionFailure, RuntimeError, OSError) as error:
                failure = failure or error
                try:
                    console.stop()
                except (RuntimeError, OSError):
                    pass  # Retain the original failure; the outer supervisor kills the whole group.
        report['status'] = 'FAILED' if failure else 'PASSED'
        if failure:
            report['failurePhase'] = failure.phase if isinstance(failure, ConnectionFailure) else 'connection-evidence'
        (RESULTS / 'ios-vm-connection.json').write_text(json.dumps(report, indent=2) + '\n')
    if failure:
        raise failure
    return report


if __name__ == '__main__':
    try:
        run(sys.argv[1])
    except (ConnectionFailure, RuntimeError, OSError, ValueError, IndexError) as error:
        print(f'IOS_CONNECTION FAILED: {error}', flush=True)
        sys.exit(1)
