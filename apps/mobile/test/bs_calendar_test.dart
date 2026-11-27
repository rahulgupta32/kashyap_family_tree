import 'package:flutter_test/flutter_test.dart';
import 'package:kashyap_mobile/services/bs_calendar.dart';

void main() {
  test('Bhadra 2083 starts on the reference Monday', () {
    final ad = const BsDay(2083, 5, 1).ad!;
    expect(ad, DateTime.utc(2026, 8, 17));
    expect(ad.weekday, DateTime.monday);
    expect(BsDay.fromAd(ad)?.iso, '2083-05-01');
  });

  test('Nepal midnight advances the day, including at BS year boundary', () {
    final first = const BsDay(2083, 1, 1).ad!;
    final midnight = first.subtract(const Duration(hours: 5, minutes: 45));
    expect(BsDay.today(midnight)?.iso, '2083-01-01');
    expect(BsDay.today(midnight.subtract(const Duration(seconds: 1)))?.year, 2082);
  });

  test('round trips AD leap day and rejects unsupported BS dates', () {
    final leap = DateTime.utc(2024, 2, 29);
    expect(BsDay.fromAd(leap)?.ad, leap);
    expect(const BsDay(2083, 5, 33).ad, isNull);
    expect(const BsDay(2091, 1, 1).ad, isNull);
    expect(BsDay.fromAd(DateTime.utc(1943, 4, 13)), isNull);
  });
}
