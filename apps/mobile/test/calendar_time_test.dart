import 'package:flutter_test/flutter_test.dart';
import 'package:kashyap_mobile/services/calendar_time.dart';
void main(){
 test('explicit wall fields become the same UTC event regardless of device zone',(){
  expect(nepalWallTimeToUtc(DateTime.utc(2027,1,2,10)).toIso8601String(),'2027-01-02T04:15:00.000Z');
  expect(formatNepalWallTime(DateTime.utc(2027,1,2,10)),'2027-01-02 10:00 · नेपाल समय (Nepal UTC+05:45)');
  expect(()=>nepalWallTimeToUtc(DateTime(2027,1,2,10)),throwsFormatException);
 });
 test('UTC conversion crosses year and leap-day boundaries without shifting entered wall fields',(){
  expect(nepalWallClock(DateTime.utc(2026,12,31,19)),DateTime.utc(2027,1,1,0,45));
  expect(nepalWallTimeToUtc(DateTime.utc(2027,1,1)).toIso8601String(),'2026-12-31T18:15:00.000Z');
  expect(nepalWallTimeToUtc(DateTime.utc(2028,3,1,0,10)).toIso8601String(),'2028-02-29T18:25:00.000Z');
 });
 test('display converts the instant once with explicit offset and rejects unspecified local times',(){
  expect(formatNepalInstant('2027-01-02T04:15:00Z'),'2027-01-02 10:00 · नेपाल समय (Nepal UTC+05:45)');
  expect(formatNepalInstant('2027-01-02T10:00:00+05:45'),'2027-01-02 10:00 · नेपाल समय (Nepal UTC+05:45)');
  expect(formatNepalInstant('2027-01-02T10:00:00'),'समय उपलब्ध छैन (Time unavailable)');
 });
 test('out-of-range years and imprecise picker tuples are rejected',(){
  for(final wall in [DateTime.utc(1899),DateTime.utc(2101),DateTime.utc(2027,1,1,0,0,1),DateTime.utc(1900)]) {
   expect(()=>nepalWallTimeToUtc(wall),throwsFormatException);
  }
 });
}
