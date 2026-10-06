"""Rebuild IANA offsets with an existing Python 3.9+ system zoneinfo database."""
from datetime import datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo, available_timezones
import json

start = int(datetime(2020, 1, 1, tzinfo=timezone.utc).timestamp())
end = int(datetime(2041, 1, 1, tzinfo=timezone.utc).timestamp())
result = {}
for name in sorted(available_timezones()):
    if name.startswith(('posix/', 'right/')):
        continue
    zone = ZoneInfo(name)
    def offset(stamp):
        return int(datetime.fromtimestamp(stamp, timezone.utc).astimezone(zone).utcoffset().total_seconds())
    previous = offset(start)
    transitions = [start, previous]
    for stamp in range(start + 86400, end, 86400):
        current = offset(stamp)
        if current == previous:
            continue
        low, high = stamp - 86400, stamp
        while high - low > 1:
            middle = (low + high) // 2
            if offset(middle) == previous:
                low = middle
            else:
                high = middle
        transitions.extend([high, current])
        previous = current
    result[name] = transitions
output = Path(__file__).resolve().parents[1] / 'src/timezones.js'
output.write_text('// Generated IANA timezone offsets, 2020–2040. See scripts/generate-timezones.py.\nglobalThis.SatsHoleTimezones=' + json.dumps(result, separators=(',', ':')) + '\n')
