import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/testing.dart';
import 'package:kashyap_mobile/localization/calendar_labels.dart';
import 'package:kashyap_mobile/screens/calendar_events_screen.dart';
import 'package:kashyap_mobile/services/genealogy_api_service.dart';
import 'native_session_test.dart' show jsonResponse;

void main() {
  testWidgets('organizer cancellation sends current version and disables RSVP after reload', (tester) async {
    var cancelled = false;
    final service = GenealogyApiService(client: MockClient((request) async {
      if (request.method == 'POST') {
        expect(request.url.path, '/calendar/events/event-1/cancel');
        expect(jsonDecode(request.body), {'version': 2, 'reason': 'Fictional cancellation'});
        cancelled = true;
        return jsonResponse({});
      }
      return jsonResponse([{'id': 'event-1', 'title': 'Fictional gathering', 'audienceScope': 'COMMUNITY',
        'version': cancelled ? 3 : 2, 'canManage': true, 'lifecycleState': cancelled ? 'CANCELLED' : 'ACTIVE'}]);
    }))..setAuthToken('mock-access');
    addTearDown(service.dispose);
    await tester.pumpWidget(MaterialApp(home: CalendarEventsScreen(apiService: service)));
    await tester.pumpAndSettle();
    await tester.tap(find.text(calendarLabels['cancel']!));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField), 'Fictional cancellation');
    await tester.tap(find.text(calendarLabels['save']!));
    await tester.pumpAndSettle();
    expect(cancelled, isTrue);
    expect(find.text(calendarLabels['cancelled']!), findsOneWidget);
    expect(tester.widget<ChoiceChip>(find.byKey(const ValueKey('rsvp-event-1-GOING'))).onSelected, isNull);
    expect(find.text(calendarLabels['edit']!), findsNothing);
  });

  testWidgets('ordinary invitee has RSVP controls but no organizer controls', (tester) async {
    final service = GenealogyApiService(client: MockClient((_) async => jsonResponse([
      {'id': 'event-2', 'title': 'Fictional invitation', 'audienceScope': 'INVITED_ONLY', 'version': 1, 'canManage': false,
        'lifecycleState': 'ACTIVE', 'myRsvp': 'INVITED'}
    ])))..setAuthToken('mock-access');
    addTearDown(service.dispose);
    await tester.pumpWidget(MaterialApp(home: CalendarEventsScreen(apiService: service)));
    await tester.pumpAndSettle();
    expect(find.text(calendarLabels['edit']!), findsNothing);
    expect(find.text(calendarLabels['cancel']!), findsNothing);
    expect(tester.widget<ChoiceChip>(find.byKey(const ValueKey('rsvp-event-2-GOING'))).onSelected, isNotNull);
  });
}
