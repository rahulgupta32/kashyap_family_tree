"""Drive the installed artifact through Android UI automation, without rebuilding."""
from pathlib import Path
import re
import subprocess
import time
import xml.etree.ElementTree as ET

output = Path('test-results/dev-preview-device')


def adb(*args):
    return subprocess.check_output(['adb', '-s', 'emulator-5554', *args], timeout=30)


def node(label, *, contains=False):
    deadline = time.monotonic() + 24
    while time.monotonic() < deadline:
        try:
            adb('shell', 'uiautomator', 'dump', '/sdcard/bansawali-review.xml')
            tree = ET.fromstring(adb('shell', 'cat', '/sdcard/bansawali-review.xml'))
        except (ET.ParseError, subprocess.SubprocessError):
            continue
        matches = []
        for item in tree.iter('node'):
            labels = [item.get('text', ''), item.get('content-desc', '')]
            if any(label in value if contains else label == value for value in labels):
                matches.append(item)
        if matches:
            def rank(item):
                left, top, right, bottom = map(int, re.findall(r"\d+", item.attrib["bounds"]))
                return item.get("clickable") != "true", (right-left)*(bottom-top)
            return min(matches, key=rank)
    capture('failure')
    (output / 'exact-apk-failure.xml').write_bytes(adb('shell', 'cat', '/sdcard/bansawali-review.xml'))
    raise RuntimeError(f'Unable to locate {label} in the installed review APK')


def tap(label, **kwargs):
    item = node(label, **kwargs)
    left, top, right, bottom = map(int, re.findall(r'\d+', item.attrib['bounds']))
    adb('shell', 'input', 'tap', str((left + right) // 2), str((top + bottom) // 2))


def capture(name):
    data = adb('exec-out', 'screencap', '-p')
    if not data.startswith(b'\x89PNG\r\n\x1a\n'):
        raise RuntimeError('Emulator screenshot capture failed')
    (output / f'exact-apk-{name}.png').write_bytes(data)


def back():
    adb('shell', 'input', 'keyevent', 'KEYCODE_BACK')


def chat_icons():
    for label in ('Start voice call', 'Start video call', 'Conversation options'):
        node(label)


tap('Enter Development Preview', contains=True)
tap('Calendar')
node('पारिवारिक पात्रो · Calendar')
capture('calendar')
back()
tap('Reels', contains=True)
adb('logcat', '-c')
tap('Play reel', contains=True)
deadline = time.monotonic() + 15
while b'Native reel playback started' not in adb('logcat', '-d', '-s', 'BansawaliReel:I'):
    if time.monotonic() >= deadline:
        raise RuntimeError('Native playback did not start')
    time.sleep(0.2)
time.sleep(1)
capture('reel-playing')
back()
tap('All preview screens', contains=True)
tap('Messaging', contains=True)
tap('Synthetic conversation', contains=True)
chat_icons()
capture('direct-chat')
tap('Start voice call')
tap('Simulate recipient answering')
node('Simulated call', contains=True)
tap('End call')
back()
tap('Synthetic family group with a long conversation title', contains=True)
original_scale = adb('shell', 'settings', 'get', 'system', 'font_scale').decode().strip()
try:
    adb('shell', 'settings', 'put', 'system', 'font_scale', '1.30')
    tap('Your message', contains=True)
    if b'mInputShown=true' not in adb('shell', 'dumpsys', 'input_method'):
        raise RuntimeError('Keyboard was not shown for group layout check')
    chat_icons()
    capture('group-chat-keyboard-large-text')
finally:
    if original_scale == 'null':
        adb('shell', 'settings', 'delete', 'system', 'font_scale')
    else:
        adb('shell', 'settings', 'put', 'system', 'font_scale', original_scale)
print('Installed APK verified: Calendar, native reel playback, direct call simulation, and group header with keyboard and large text')
