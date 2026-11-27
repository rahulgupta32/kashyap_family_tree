#!/usr/bin/env python3
"""Mirror the backend civil date table into Flutter's offline calendar."""
import re
import sys
from pathlib import Path

root = Path(__file__).resolve().parents[1]
source = (root / 'packages/localization/src/calendar.ts').read_text()
rows = re.findall(r'^\s*(\d{4}): \[([\d, ]+)\],?$', source, re.M)
anchor = re.search(r'BS_START_GREGORIAN_UTC = Date.UTC\((\d+), (\d+), (\d+)\)', source)
assert anchor and rows and all(len(row.split(',')) == 12 for _, row in rows)
year, month, day = map(int, anchor.groups())
data = '// Generated from packages/localization/src/calendar.ts.\n'
data += f'final bsEpochAd = DateTime.utc({year}, {month+1}, {day});\n'
data += 'const bsMonths = <int, List<int>>{\n'
data += ''.join(f'  {y}: [{row}],\n' for y, row in rows) + '};\n'
output = root / 'apps/mobile/lib/services/bs_calendar_data.dart'
if '--check' in sys.argv:
    assert output.read_text() == data, 'Regenerate the offline BS month table'
else:
    output.write_text(data)
