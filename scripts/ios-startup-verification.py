"""Bound each native phase, retain diagnostics, and never retry a failing app test."""
import json
import os
from pathlib import Path
import re
import signal
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parents[1]
RESULTS = ROOT / 'test-results'
MARKERS = ['TEST_DISCOVERED', 'KEYCHAIN_CLEAR', 'KEYCHAIN_WRITE', 'KEYCHAIN_READ',
           'KEYCHAIN_DELETE', 'KEYCHAIN_VERIFIED', 'APP_PUMP', 'APP_VERIFIED', 'CLEANUP_VERIFIED']


class PhaseFailure(RuntimeError):
    def __init__(self, phase, timed_out=False):
        super().__init__(phase)
        self.phase = phase
        self.timed_out = timed_out


def live_group_members(group):
    # Darwin may return EPERM rather than ESRCH for a group containing only
    # exited/zombie processes. Never treat a live denied group as cleaned up.
    listing = subprocess.check_output(['ps', '-axo', 'pid,pgid,stat'], text=True, timeout=5)
    return [int(fields[0]) for line in listing.splitlines()[1:]
            if len(fields := line.split()) == 3 and fields[1] == str(group)
            and not fields[2].startswith('Z')]


def stop_group(process):
    # Kill descendants even when the launcher has already exited.
    for sig in (signal.SIGTERM, signal.SIGKILL):
        try:
            os.killpg(process.pid, sig)
        except ProcessLookupError:
            break
        except PermissionError:
            if live_group_members(process.pid):
                raise RuntimeError('Phase cleanup denied for a live process group')
            break
        if sig == signal.SIGTERM:
            try:
                process.wait(timeout=3)
            except subprocess.TimeoutExpired:
                pass
    process.wait(timeout=5)


def run_phase(name, command, timeout, cwd=ROOT, report=None, echo_output=True):
    RESULTS.mkdir(exist_ok=True)
    path = RESULTS / f'ios-{name}.log'
    started = time.monotonic()
    print(f'IOS_PHASE {name} START deadline={timeout}s', flush=True)
    with path.open('wb') as output, path.open('rb') as reader:
        process = subprocess.Popen(command, cwd=cwd, stdout=output,
                                   stderr=subprocess.STDOUT, start_new_session=True)
        timed_out = False
        heartbeat = started
        try:
            while process.poll() is None:
                data = reader.read()
                if echo_output:
                    sys.stdout.buffer.write(data)
                    sys.stdout.flush()
                now = time.monotonic()
                if now - started >= timeout:
                    timed_out = True
                    break
                if now - heartbeat >= 30:
                    print(f'IOS_PHASE {name} RUNNING elapsed={int(now-started)}s', flush=True)
                    heartbeat = now
                time.sleep(0.25)
        finally:
            stop_group(process)
            data = reader.read()
            if echo_output:
                sys.stdout.buffer.write(data)
                sys.stdout.flush()
    outcome = {'phase': name, 'status': 'TIMEOUT' if timed_out else
               ('PASSED' if process.returncode == 0 else 'FAILED'),
               'exitCode': process.returncode, 'deadlineSeconds': timeout,
               'elapsedSeconds': round(time.monotonic() - started, 2)}
    if report is not None:
        report['phases'].append(outcome)
        save_report(report)
    print(f'IOS_PHASE {name} {outcome["status"]}', flush=True)
    if timed_out or process.returncode != 0:
        raise PhaseFailure(name, timed_out)
    return path.read_text(errors='replace')


def select_device(inventory):
    # Keep the verified smoke-test matrix stable across hosted image updates.
    runtime = 'com.apple.CoreSimulator.SimRuntime.iOS-18-5'
    device_type = 'com.apple.CoreSimulator.SimDeviceType.iPhone-16-Pro'
    if not any(r['identifier'] == runtime and r.get('isAvailable') for r in inventory['runtimes']):
        raise RuntimeError('Pinned iOS 18.5 runtime is unavailable; review the test matrix')
    if not any(d.get('isAvailable') and d.get('deviceTypeIdentifier') == device_type
               for d in inventory['devices'].get(runtime, [])):
        raise RuntimeError('Pinned iPhone 16 Pro device type is unavailable')
    return runtime, device_type


def classify_failure(failure, log):
    if failure.phase != 'startup-test':
        return 'SIMULATOR_INFRASTRUCTURE_' + ('TIMEOUT' if failure.timed_out else 'FAILURE')
    if not failure.timed_out:
        return 'TEST_COMMAND_FAILED_REVIEW_LOG'
    if 'IOS_TEST TEST_DISCOVERED' not in log:
        return 'TEST_DISCOVERY_OR_BUILD_INSTALL_LAUNCH_TIMEOUT'
    if 'IOS_TEST CLEANUP_VERIFIED' in log:
        return 'TEST_RUNNER_TEARDOWN_TIMEOUT'
    return 'APPLICATION_OR_PLUGIN_TIMEOUT'


def save_report(report):
    (RESULTS / 'ios-startup-phases.json').write_text(json.dumps(report, indent=2) + '\n')


def diagnostics(simulator):
    commands = [('diagnostic-devices', ['xcrun', 'simctl', 'list', '--json'], 15),
                ('diagnostic-processes', ['ps', '-axo', 'pid,ppid,state,etime,comm'], 10)]
    if simulator:
        commands += [('diagnostic-app-log', ['xcrun', 'simctl', 'spawn', simulator,
                     'log', 'show', '--last', '10m', '--style', 'compact', '--predicate',
                     'process == "Runner" OR process == "debugserver" OR process == "SpringBoard"'], 20),
                     ('diagnostic-screenshot', ['xcrun', 'simctl', 'io', simulator, 'screenshot',
                      str(RESULTS / 'ios-failure.png')], 15)]
    for name, command, timeout in commands:
        try:
            run_phase(name, command, timeout, echo_output=False)
        except (PhaseFailure, OSError, RuntimeError):
            pass  # Diagnostics must never replace the original failure.


def main():
    RESULTS.mkdir(exist_ok=True)
    source = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip()
    report = {'sourceSha': source, 'status': 'RUNNING', 'phases': [], 'productionAcceptance': False}
    save_report(report)
    simulator = None
    try:
        if source != os.environ.get('KASHYAP_SOURCE_HEAD_SHA'):
            raise RuntimeError('Simulator checkout differs from requested source')
        inventory = json.loads(run_phase('simulators', ['xcrun', 'simctl', 'list', '--json'], 30, report=report, echo_output=False))
        runtime, device_type = select_device(inventory)
        report.update(runtime=runtime, deviceType=device_type)
        # The hosted runner itself is disposable. Its pre-created simulator is
        # the fixture used by prior green runs; a fresh device adds a second
        # cold OS provisioning workload after compilation on the small VM.
        device = sorted((d for d in inventory['devices'][runtime]
                         if d.get('isAvailable') and d.get('deviceTypeIdentifier') == device_type),
                        key=lambda d: d['udid'])[0]
        simulator = device['udid']
        if not re.fullmatch(r'[0-9A-Fa-f-]{36}', simulator):
            raise RuntimeError('Unexpected simulator identifier')
        report['simulatorId'] = simulator
        (RESULTS / 'ios-simulator-id.txt').write_text(simulator + '\n')
        if device['state'] != 'Booted':
            run_phase('simulator-boot', ['xcrun', 'simctl', 'boot', simulator], 60, report=report)
        run_phase('simulator-bootstatus', ['xcrun', 'simctl', 'bootstatus', simulator, '-b'], 180, report=report)
        log = run_phase('startup-test', ['flutter', 'test', 'integration_test/ios_startup_test.dart',
                        '-d', simulator, '--no-pub', '--timeout', '5m', '--verbose',
                        '--dart-define=KASHYAP_DISPOSABLE_IOS_SIMULATOR=true',
                        '--dart-define=API_BASE_URL=https://api.invalid', '--reporter', 'expanded'],
                        600, cwd=ROOT / 'apps/mobile', report=report)
        if 'All tests passed!' not in log or any(f'IOS_TEST {m}' not in log for m in MARKERS):
            raise RuntimeError('Test exit was successful without complete discovery/Keychain/app/cleanup evidence')
        report['status'] = 'PASSED'
    except (PhaseFailure, RuntimeError, OSError, ValueError) as failure:
        report['status'] = 'FAILED'
        log_path = RESULTS / 'ios-startup-test.log'
        log = log_path.read_text(errors='replace') if log_path.exists() else ''
        report['classification'] = (classify_failure(failure, log) if isinstance(failure, PhaseFailure)
                                    else 'VERIFICATION_SETUP_OR_EVIDENCE_FAILURE')
        report['lastTestMarker'] = next((m for m in reversed(MARKERS) if f'IOS_TEST {m}' in log), None)
        save_report(report)
        print(f'IOS_FAILURE {report["classification"]}: {failure}', flush=True)
        diagnostics(simulator)
    finally:
        if simulator:
            for phase, command in [('simulator-shutdown', ['xcrun', 'simctl', 'shutdown', simulator])]:
                try:
                    run_phase(phase, command, 20)
                except (PhaseFailure, OSError, RuntimeError):
                    pass
        save_report(report)
    return 0 if report['status'] == 'PASSED' else 1


if __name__ == '__main__':
    sys.exit(main())
