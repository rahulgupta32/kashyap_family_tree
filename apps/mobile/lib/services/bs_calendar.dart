import 'bs_calendar_data.dart';
import 'calendar_time.dart';

class BsDay {
  const BsDay(this.year, this.month, this.day);

  final int year, month, day;

  String get iso => '$year-${month.toString().padLeft(2,'0')}-${day.toString().padLeft(2,'0')}';

  DateTime? get ad {
    final months = bsMonths[year];
    if (months == null || month < 1 || month > 12 ||
        day < 1 || day > months[month - 1]) return null;
    var offset = day - 1;
    for (final entry in bsMonths.entries) {
      if (entry.key == year) break;
      offset += entry.value.reduce((a,b) => a+b);
    }
    for (var i = 0; i < month - 1; i++) {
      offset += months[i];
    }
    return bsEpochAd.add(Duration(days: offset));
  }

  static BsDay? fromAd(DateTime day) {
    var offset = DateTime.utc(day.year, day.month, day.day).difference(bsEpochAd).inDays;
    if (offset < 0) return null;
    for (final entry in bsMonths.entries) {
      for (var i = 0; i < entry.value.length; i++) {
        final span = entry.value[i];
        if (offset < span) return BsDay(entry.key, i + 1, offset + 1);
        offset -= span;
      }
    }
    return null;
  }

  static BsDay? today([DateTime? now]) =>
      fromAd(nepalWallClock(now ?? DateTime.now()));
}
