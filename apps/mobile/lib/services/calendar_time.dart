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
