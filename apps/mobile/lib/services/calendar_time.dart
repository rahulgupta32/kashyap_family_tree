/// Picker fields are a UTC-backed wall-clock tuple, not a UTC event instant.
/// The organizer explicitly chooses fixed UTC+05:45; no BS/Tithi conversion.
DateTime nepalWallTimeToUtc(DateTime wall) {
  if (!wall.isUtc || wall.year < 1900 || wall.year > 2100 || wall.second != 0 || wall.millisecond != 0 || wall.microsecond != 0) {
    throw const FormatException('Invalid Gregorian wall time');
  }
  final instant = wall.subtract(const Duration(minutes:345));
  if (instant.year < 1900) { throw const FormatException('Gregorian event time outside supported range'); }
  return instant;
}
DateTime nepalWallClock(DateTime instant) => instant.toUtc().add(const Duration(minutes:345));
String formatNepalInstant(String value) {
  final instant = DateTime.tryParse(value);
  if (instant == null || !instant.isUtc) { return 'समय उपलब्ध छैन (Time unavailable)'; }
  final wall = nepalWallClock(instant);
  return '${wall.toIso8601String().substring(0,16).replaceFirst('T',' ')} · नेपाल समय (Nepal UTC+05:45)';
}
String formatNepalWallTime(DateTime wall) => '${wall.toIso8601String().substring(0,16).replaceFirst('T',' ')} · नेपाल समय (Nepal UTC+05:45)';

/// Parse explicit minute-precision Gregorian fields without accepting date rollover.
String nepalWallInputToUtc(String value) {
  final match = RegExp(r'^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$').firstMatch(value);
  if (match == null) { throw const FormatException('Invalid Gregorian wall time'); }
  final fields = [for (var i = 1; i <= 5; i++) int.parse(match.group(i)!)];
  final wall = DateTime.utc(fields[0], fields[1], fields[2], fields[3], fields[4]);
  if (wall.year != fields[0] || wall.month != fields[1] || wall.day != fields[2] || wall.hour != fields[3] || wall.minute != fields[4]) {
    throw const FormatException('Invalid Gregorian wall time');
  }
  return nepalWallTimeToUtc(wall).toIso8601String();
}
