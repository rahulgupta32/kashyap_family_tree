import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/testing.dart';
import 'package:kashyap_mobile/localization/calendar_labels.dart';
import 'package:kashyap_mobile/screens/calendar_events_screen.dart';
import 'package:kashyap_mobile/screens/calendar_period_screen.dart';
import 'package:kashyap_mobile/services/genealogy_api_service.dart';
import 'native_session_test.dart' show jsonResponse;

void main() {
  testWidgets('calendar bilingual selectors fit a narrow Android viewport',
      (tester) async {
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = const Size(320, 800);
    addTearDown(tester.view.resetDevicePixelRatio);
    addTearDown(tester.view.resetPhysicalSize);
    final service = GenealogyApiService(
        client: MockClient((_) async => jsonResponse([])))
      ..setAuthToken('mock-access');
    addTearDown(service.dispose);
    await tester.pumpWidget(
        MaterialApp(home: CalendarEventsScreen(apiService: service)));
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip(calendarLabels['create']!));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    final type = find.byKey(const ValueKey('calendar-event-type'));
    await tester.ensureVisible(type);
    await tester.tap(type);
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    await tester.tap(find.text(calendarLabels['communityMeeting']!).last);
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);

    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pumpAndSettle();
    await tester.pumpWidget(
        MaterialApp(home: CalendarPeriodScreen(api: service)));
    await tester.pumpAndSettle();
    await tester.tap(find.byType(DropdownButtonFormField<String>).last);
    await tester.pumpAndSettle();
    await tester.tap(find.text('कार्यसूची (Agenda for month)').last);
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
  });
}
