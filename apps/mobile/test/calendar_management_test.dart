import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/testing.dart';
import 'package:kashyap_mobile/localization/calendar_labels.dart';
import 'package:kashyap_mobile/screens/calendar_events_screen.dart';
import 'package:kashyap_mobile/screens/calendar_period_screen.dart';
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
  testWidgets('calendar browser carries exact older-page cursor and resets on source filters', (tester) async {
    final queries=<Map<String,String>>[];
    final service=GenealogyApiService(client:MockClient((request)async{
      queries.add(request.url.queryParameters);
      final older=request.url.queryParameters.containsKey('before');
      return jsonResponse({'items':[{'title':older?'Earlier fictional event':'Latest fictional event','eventType':'GENERAL_EVENT','audienceScope':'COMMUNITY','lifecycleState':'ACTIVE','solarDate':'2083-05-15'}],'nextBefore':older?null:'9007199254740993'});
    }))..setAuthToken('mock-access');addTearDown(service.dispose);
    await tester.pumpWidget(MaterialApp(home:CalendarBrowseScreen(api:service)));await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Older calendar events'));await tester.tap(find.text('Older calendar events'));await tester.pumpAndSettle();
    expect(queries.last['before'],'9007199254740993');expect(find.text('Earlier fictional event'),findsOneWidget);
    expect(tester.widget<TextButton>(find.widgetWithText(TextButton,'Older calendar events')).onPressed,isNull);
    await tester.ensureVisible(find.byType(TextField));await tester.enterText(find.byType(TextField),'2083');await tester.pump();
    await tester.ensureVisible(find.text('Apply calendar filters'));await tester.tap(find.text('Apply calendar filters'));await tester.pumpAndSettle();
    expect(queries.last,{'yearBs':'2083'});expect(find.text('Latest fictional event'),findsOneWidget);
  });

  testWidgets('month cells open the source day and agenda retains exact composite cursor', (tester) async {
    final queries=<Map<String,String>>[];
    final service=GenealogyApiService(client:MockClient((request)async{
      final q=request.url.queryParameters;queries.add(q);
      return jsonResponse({'period':{'source':q['source'],'view':q['view'],'date':q['date'],'daysInMonth':31,'previousDate':'2026-09-01','nextDate':'2026-11-01'},'days':[{'date':'2026-10-06','count':2}],'undatedCount':0,'items':[{'id':'period-event','title':'Fictional source period','displayDate':'2026-10-06','startsAt':'2026-10-06T04:00:00Z','eventType':'GENERAL_EVENT','lifecycleState':'ACTIVE'}],'nextBefore':q.containsKey('before')?null:'2026-10-06|9007199254740993'});
    }))..setAuthToken('mock-access');addTearDown(service.dispose);
    await tester.pumpWidget(MaterialApp(home:CalendarPeriodScreen(api:service)));await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField),'2026-10-06');
    await tester.ensureVisible(find.text('Show calendar period'));await tester.tap(find.text('Show calendar period'));await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('06\n2 events'));await tester.tap(find.text('06\n2 events'));await tester.pumpAndSettle();
    expect(queries.last,{'source':'AD','view':'DAY','date':'2026-10-06'});
    await tester.ensureVisible(find.byType(DropdownButtonFormField<String>).at(1));await tester.tap(find.byType(DropdownButtonFormField<String>).at(1));await tester.pumpAndSettle();
    await tester.tap(find.text('कार्यसूची (Agenda for month)').last);await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Show calendar period'));await tester.tap(find.text('Show calendar period'));await tester.pumpAndSettle();
    expect(queries.last['view'],'AGENDA');
    await tester.scrollUntilVisible(find.text('More period events'),250,scrollable:find.byType(Scrollable).last);await tester.tap(find.text('More period events'));await tester.pumpAndSettle();
    expect(queries.last['before'],'2026-10-06|9007199254740993');
  });

}
