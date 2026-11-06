import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:http/http.dart' as http;
import 'package:kashyap_mobile/main.dart';
import 'package:kashyap_mobile/localization/calendar_labels.dart';
import 'package:kashyap_mobile/screens/calendar_event_detail_screen.dart';
import 'package:kashyap_mobile/screens/calendar_period_screen.dart';
import 'package:kashyap_mobile/services/calendar_time.dart';
import 'package:kashyap_mobile/services/genealogy_api_service.dart';
import 'package:kashyap_mobile/services/session_store.dart';
import 'package:kashyap_mobile/widgets/heritage.dart';
import 'm4_live_api_device_test.dart' show api, reviewerLogin, until, press;

const base = String.fromEnvironment('API_BASE_URL');
void main() {
  final binding = IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  testWidgets(
      'Calendar UI creates, retrieves, edits, RSVPs and cancels with real authorization and history',
      (tester) async {
    expect(base, 'http://10.0.2.2:3010',
        reason: 'Only the disposable CI API is allowed in this fixture');
    const phone = '+9779847100071';
    final service = GenealogyApiService();
    final store = SecureSessionStore();
    await tester.runAsync(store.clear);
    Future<void> snapshot(String name) async {
      await tester.pumpAndSettle();
      final bytes = await binding.takeScreenshot(name);
      await File('${Directory.systemTemp.path}/$name.png')
          .writeAsBytes(bytes, flush: true);
    }

    try {
      await tester.pumpWidget(KashyapApp(apiService: service));
      await until(tester, find.byKey(const Key('sign-in-phone')));
      await binding.convertFlutterSurfaceToImage();
      await tester.pumpAndSettle();
      await snapshot('nepali-login');
      await api('/auth/test-clear-cooldown', data: {'phoneNumber': phone});
      await tester.enterText(find.byKey(const Key('sign-in-phone')), phone);
      await press(tester, find.byKey(const Key('sign-in-submit')));
      await until(tester, find.byKey(const Key('sign-in-code')));
      final code =
          await api('/auth/test-otp?phoneNumber=${Uri.encodeComponent(phone)}');
      await tester.enterText(
          find.byKey(const Key('sign-in-code')), code['otp'] as String);
      await press(tester, find.byKey(const Key('sign-in-submit')));
      await until(tester, find.byType(HeritageNavigation));
      await press(
          tester,
          find.descendant(
              of: find.byType(HeritageNavigation),
              matching: find.text('Calendar')));
      await until(tester, find.byTooltip(calendarLabels['create']!));
      await press(tester, find.byTooltip(calendarLabels['create']!));
      const original = 'Synthetic native calendar integration';
      await tester.enterText(
          find.byKey(const ValueKey('calendar-title')), original);
      await tester.enterText(find.byKey(const ValueKey('calendar-description')),
          'Synthetic event; no cultural calculations.');
      await tester.enterText(find.byKey(const ValueKey('calendar-location')),
          'Synthetic test venue');
      await press(
          tester, find.widgetWithText(TextButton, calendarLabels['time']!));
      await press(tester, find.text('OK').last);
      await press(tester, find.text('OK').last);
      await press(
          tester, find.widgetWithText(TextButton, calendarLabels['save']!));
      await until(tester, find.text(original));
      final events =
          await api('/calendar/events', token: service.authToken) as List;
      final event = events.singleWhere((e) => e['title'] == original) as Map;
      final id = event['id'] as String;
      expect(event['version'], 1);
      final wall = nepalWallClock(DateTime.parse(event['startsAt'] as String));
      final date = wall.toIso8601String().substring(0, 10);
      await press(tester, find.byTooltip('Calendar day month agenda'));
      await until(tester, find.byType(CalendarPeriodScreen));
      await tester.enterText(find.byType(TextField), date);
      await press(tester, find.text('Show calendar period'));
      await until(tester, find.byKey(ValueKey('calendar-day-$date')));
      await tester.scrollUntilVisible(find.text(original), 180,
          scrollable: find
              .descendant(
                  of: find.byType(CalendarPeriodScreen),
                  matching: find.byType(Scrollable))
              .first,
          maxScrolls: 30);
      await snapshot('nepali-calendar-month');
      await tester.pageBack();
      await tester.pumpAndSettle();
      final bs = await api('/calendar/events', token: service.authToken, data: {
        'title': 'Synthetic BS month integration',
        'eventType': 'GENERAL_EVENT',
        'audienceScope': 'PRIVATE',
        'solarDate': '2083-11-01'
      });
      expect(bs['solarDate'], '2083-11-01');
      await press(tester, find.byTooltip('Calendar day month agenda'));
      await until(tester, find.byType(CalendarPeriodScreen));
      await press(tester, find.byType(DropdownButtonFormField<String>).first);
      await press(tester, find.text('BS').last);
      await tester.enterText(find.byType(TextField), '2083-11-01');
      await press(tester, find.text('Show calendar period'));
      await until(
          tester, find.byKey(const ValueKey('calendar-day-2083-11-01')));
      await tester.scrollUntilVisible(
          find.text('Synthetic BS month integration'), 180,
          scrollable: find
              .descendant(
                  of: find.byType(CalendarPeriodScreen),
                  matching: find.byType(Scrollable))
              .first,
          maxScrolls: 30);
      expect(find.text('Synthetic BS month integration'), findsOneWidget);
      await tester.pageBack();
      await tester.pumpAndSettle();

      await press(tester, find.descendant(
          of: find.byKey(ValueKey('calendar-event-$id')),
          matching: find.text(original)));
      // The tile also contains RSVP controls; tap its title to open detail.
      await until(tester, find.byType(CalendarEventDetailScreen));
      await until(tester, find.text('v1 · CALENDAR_EVENT_CREATED'));
      await press(tester, find.byKey(const ValueKey('detail-rsvp-GOING')));
      final rsvp = find.byKey(const ValueKey('detail-rsvp-GOING'));
      await until(tester, rsvp,
          ready: () => tester.widget<ChoiceChip>(rsvp).selected);
      expect(
          (await api('/calendar/events/$id',
              token: service.authToken))['myRsvp'],
          'GOING');
      await press(tester, find.text('सम्पादन (Edit event)'));
      await tester.enterText(find.byKey(const ValueKey('calendar-title')),
          'Updated synthetic calendar integration');
      await press(
          tester, find.widgetWithText(TextButton, calendarLabels['save']!));
      await until(tester, find.text('Updated synthetic calendar integration'));
      await until(tester, find.text('v2 · CALENDAR_EVENT_UPDATED'));
      final other = await reviewerLogin('+9779847100072');
      final denied = await http.patch(Uri.parse('$base/calendar/events/$id'),
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer $other'
          },
          body: jsonEncode({'version': 2, 'title': 'Forbidden change'}));
      expect(denied.statusCode, anyOf(403, 404));
      final deniedHistory = await http.get(
          Uri.parse('$base/calendar/events/$id/history'),
          headers: {'Authorization': 'Bearer $other'});
      expect(deniedHistory.statusCode, anyOf(403, 404));
      expect(
          (await api('/calendar/events/$id',
              token: service.authToken))['version'],
          2);
      await snapshot('nepali-calendar');
      await press(tester, find.text('रद्द गर्नुहोस् (Cancel event)'));
      await tester.enterText(find.byKey(const ValueKey('calendar-title')),
          'Synthetic test cancellation');
      await press(
          tester, find.widgetWithText(TextButton, calendarLabels['save']!));
      await until(tester, find.text('v3 · CALENDAR_EVENT_CANCELLED'));
      expect(find.byKey(const ValueKey('detail-rsvp-GOING')), findsNothing);
      final saved = await api('/calendar/events/$id', token: service.authToken);
      expect(saved['lifecycleState'], 'CANCELLED');
      expect(saved['version'], 3);
      final late = await http.post(Uri.parse('$base/calendar/events/$id/rsvp'),
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ${service.authToken}'
          },
          body: '{"response":"GOING"}');
      expect(late.statusCode, 409);
      debugPrint(
          '[CALENDAR DEVICE] Real UI AD/BS month/create/detail/update/RSVP/cancel/history and unauthorized mutation/history verified');
    } finally {
      await tester.pumpWidget(const SizedBox.shrink());
      service.dispose();
      await tester.runAsync(store.clear);
    }
  });
}
