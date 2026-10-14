import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:kashyap_mobile/localization/calendar_labels.dart';
import 'package:kashyap_mobile/screens/calendar_audience_picker.dart';
import 'package:kashyap_mobile/screens/calendar_events_screen.dart';
import 'package:kashyap_mobile/screens/calendar_period_screen.dart';
import 'package:kashyap_mobile/screens/calendar_recurrence_screen.dart';
import 'package:kashyap_mobile/screens/calendar_session_guard.dart';
import 'package:kashyap_mobile/services/genealogy_api_service.dart';
import 'chat_outbox_test.dart' show MemoryChatOutboxStore;
import 'native_session_test.dart' show MemorySessionStore, jsonResponse;

Map<String, dynamic> event([String title = 'Private fictional invitation']) => {
  'id': 'event-1', 'title': title, 'audienceScope': 'INVITED_ONLY',
  'version': 2, 'canManage': true, 'lifecycleState': 'ACTIVE',
};
Map<String, dynamic> browsePage() => {'items': [{...event(), 'eventType': 'GENERAL_EVENT', 'solarDate': '2083-05-15'}], 'nextBefore': '9007199254740993'};
Map<String, dynamic> periodPage() => {
  'period': {'source': 'AD', 'view': 'MONTH', 'date': '2026-10-06', 'previousDate': '2026-09-01', 'nextDate': '2026-11-01'},
  'days': [{'date': '2026-10-06', 'count': 1}], 'undatedCount': 0,
  'items': [{...event(), 'eventType': 'GENERAL_EVENT', 'displayDate': '2026-10-06', 'startsAt': '2026-10-06T04:00:00Z'}],
  'nextBefore': null,
};
String accountToken(String owner, [String signature = 'signature']) =>
    'x.${base64Url.encode(utf8.encode(jsonEncode({'sub': owner})))}.$signature';

Future<void> tapText(WidgetTester tester, String text) async {
  await tester.ensureVisible(find.text(text));
  await tester.tap(find.text(text));
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('ordinary toolbar opens period and browse without a create dialog', (tester) async {
    final paths = <String>[];
    final api = GenealogyApiService(client: MockClient((request) async {
      paths.add(request.url.path);
      return jsonResponse(request.url.path == '/calendar/browse' ? browsePage() : [event()]);
    }))..setAuthToken('mock-access');
    addTearDown(api.dispose);
    await tester.pumpWidget(MaterialApp(home: CalendarEventsScreen(apiService: api)));
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Calendar day month agenda'));
    await tester.pumpAndSettle();
    expect(find.byType(CalendarPeriodScreen), findsOneWidget);
    expect(find.byType(AlertDialog), findsNothing);
    await tester.pageBack(); await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Browse all calendar events')); await tester.pumpAndSettle();
    expect(find.byType(CalendarBrowseScreen), findsOneWidget);
    expect(paths, ['/calendar/events', '/calendar/browse']);
    expect(find.byType(AlertDialog), findsNothing);
  });

  testWidgets('loaded list expires on replacement even with identical bearer and stale refresh callback cannot read', (tester) async {
    var reads = 0;
    final api = GenealogyApiService(client: MockClient((_) async { reads++; return jsonResponse([event()]); }))..setAuthToken('same-bearer');
    addTearDown(api.dispose);
    await tester.pumpWidget(MaterialApp(home: CalendarEventsScreen(apiService: api))); await tester.pumpAndSettle();
    final refresh = tester.widget<IconButton>(find.widgetWithIcon(IconButton, Icons.refresh)).onPressed!;
    expect(find.text('Private fictional invitation'), findsOneWidget);
    api.setAuthToken('same-bearer'); refresh(); await tester.pumpAndSettle();
    expect(find.text('Private fictional invitation'), findsNothing);
    expect(find.text(calendarSessionChanged), findsOneWidget);
    expect(reads, 1);
    expect(tester.widget<IconButton>(find.widgetWithIcon(IconButton, Icons.add)).onPressed, isNull);
  });

  testWidgets('replacing service identity expires existing calendar route before new reads', (tester) async {
    var newReads = 0;
    final oldApi = GenealogyApiService(client: MockClient((_) async => jsonResponse([event()])))..setAuthToken('same');
    final newApi = GenealogyApiService(client: MockClient((_) async { newReads++; return jsonResponse([event('Other account')]); }))..setAuthToken('same');
    addTearDown(oldApi.dispose); addTearDown(newApi.dispose);
    await tester.pumpWidget(MaterialApp(home: CalendarEventsScreen(apiService: oldApi))); await tester.pumpAndSettle();
    await tester.pumpWidget(MaterialApp(home: CalendarEventsScreen(apiService: newApi))); await tester.pumpAndSettle();
    expect(find.text('Private fictional invitation'), findsNothing);
    expect(find.text(calendarSessionChanged), findsOneWidget); expect(newReads, 0);
    oldApi.setAuthToken('replacement'); await tester.pump();
    expect(tester.takeException(), isNull);
  });

  testWidgets('calendar opened without a session makes no request', (tester) async {
    var reads = 0;
    final api = GenealogyApiService(client: MockClient((_) async { reads++; return jsonResponse([]); }));
    addTearDown(api.dispose);
    await tester.pumpWidget(MaterialApp(home: CalendarEventsScreen(apiService: api))); await tester.pumpAndSettle();
    expect(reads, 0); expect(find.text(calendarSessionChanged), findsOneWidget);
  });

  testWidgets('late list response cannot disclose an earlier session', (tester) async {
    final pending = Completer<http.Response>();
    final api = GenealogyApiService(client: MockClient((_) => pending.future))..setAuthToken('old');
    addTearDown(api.dispose);
    await tester.pumpWidget(MaterialApp(home: CalendarEventsScreen(apiService: api))); await tester.pump();
    api.setAuthToken('new'); pending.complete(jsonResponse([event()])); await tester.pumpAndSettle();
    expect(find.text('Private fictional invitation'), findsNothing); expect(find.text(calendarSessionChanged), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('out of order list reads retain newest response', (tester) async {
    final first = Completer<http.Response>(), second = Completer<http.Response>(); var reads = 0;
    final api = GenealogyApiService(client: MockClient((_) => ++reads == 1 ? first.future : second.future))..setAuthToken('same');
    addTearDown(api.dispose);
    await tester.pumpWidget(MaterialApp(home: CalendarEventsScreen(apiService: api))); await tester.pump();
    await tester.tap(find.widgetWithIcon(IconButton, Icons.refresh)); await tester.pump();
    second.complete(jsonResponse([event('Latest invitation')])); await tester.pumpAndSettle();
    first.complete(jsonResponse([event('Stale invitation')])); await tester.pumpAndSettle();
    expect(find.text('Latest invitation'), findsOneWidget); expect(find.text('Stale invitation'), findsNothing);
  });

  testWidgets('pending RSVP cannot reload private list under replacement session', (tester) async {
    final pending = Completer<http.Response>(); var reads = 0, writes = 0;
    final api = GenealogyApiService(client: MockClient((request) async {
      if (request.method != 'GET') { writes++; return pending.future; }
      reads++; return jsonResponse([event()]);
    }))..setAuthToken('old'); addTearDown(api.dispose);
    await tester.pumpWidget(MaterialApp(home: CalendarEventsScreen(apiService: api))); await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('rsvp-event-1-GOING'))); await tester.pump();
    api.setAuthToken('new'); pending.complete(jsonResponse({})); await tester.pumpAndSettle();
    expect(writes, 1); expect(reads, 1); expect(find.text('Private fictional invitation'), findsNothing);
    expect(find.byType(SnackBar), findsNothing); expect(tester.takeException(), isNull);
  });

  testWidgets('loaded edit draft is removed on session change and stale save cannot mutate', (tester) async {
    var writes = 0;
    final api = GenealogyApiService(client: MockClient((request) async {
      if(request.method != 'GET') writes++;
      return jsonResponse([event()]);
    }))..setAuthToken('old'); addTearDown(api.dispose);
    await tester.pumpWidget(MaterialApp(home: CalendarEventsScreen(apiService: api))); await tester.pumpAndSettle();
    await tapText(tester, calendarLabels['edit']!);
    await tester.enterText(find.byType(TextField), 'Private edit draft');
    final save = tester.widget<TextButton>(find.widgetWithText(TextButton, calendarLabels['save']!)).onPressed!;
    api.setAuthToken('new'); save(); await tester.pumpAndSettle();
    expect(find.byType(AlertDialog), findsNothing); expect(find.text('Private edit draft'), findsNothing);
    expect(writes, 0); expect(find.text(calendarSessionChanged), findsOneWidget); expect(tester.takeException(), isNull);
  });

  testWidgets('loaded create draft disappears on session change without a mutation', (tester) async {
    var writes = 0;
    final api = GenealogyApiService(client: MockClient((request) async {
      if(request.method != 'GET') writes++;
      return jsonResponse([event()]);
    }))..setAuthToken('old'); addTearDown(api.dispose);
    await tester.pumpWidget(MaterialApp(home: CalendarEventsScreen(apiService: api))); await tester.pumpAndSettle();
    await tester.tap(find.byTooltip(calendarLabels['create']!)); await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField), 'Private creation draft');
    api.setAuthToken(null); await tester.pumpAndSettle();
    expect(find.byType(AlertDialog), findsNothing); expect(find.text('Private creation draft'), findsNothing);
    expect(writes, 0); expect(find.text(calendarSessionChanged), findsOneWidget); expect(tester.takeException(), isNull);
  });

  testWidgets('loaded browse page and pagination disappear synchronously on session change', (tester) async {
    var reads = 0;
    final api = GenealogyApiService(client: MockClient((_) async { reads++; return jsonResponse(browsePage()); }))..setAuthToken('old');
    addTearDown(api.dispose);
    await tester.pumpWidget(MaterialApp(home: CalendarBrowseScreen(api: api))); await tester.pumpAndSettle();
    final older = tester.widget<TextButton>(find.widgetWithText(TextButton, 'Older calendar events')).onPressed!;
    api.setAuthToken('new'); older(); await tester.pumpAndSettle();
    expect(find.text('Private fictional invitation'), findsNothing); expect(find.text('Older calendar events'), findsNothing);
    expect(find.text(calendarSessionChanged), findsOneWidget); expect(reads, 1);
  });

  testWidgets('loaded period clears event and source input and denies retained reload callback', (tester) async {
    var reads = 0;
    final api = GenealogyApiService(client: MockClient((_) async { reads++; return jsonResponse(periodPage()); }))..setAuthToken('old');
    addTearDown(api.dispose);
    await tester.pumpWidget(MaterialApp(home: CalendarPeriodScreen(api: api))); await tester.pumpAndSettle();
    await tapText(tester, 'Show calendar period');
    final reload = tester.widget<TextButton>(find.widgetWithText(TextButton, 'Show calendar period')).onPressed!;
    api.setAuthToken('new'); reload(); await tester.pumpAndSettle();
    expect(find.text('Private fictional invitation'), findsNothing); expect(find.byType(TextField), findsNothing);
    expect(find.text(calendarSessionChanged), findsOneWidget); expect(reads, 1);
  });

  testWidgets('pending period response is suppressed after logout', (tester) async {
    final pending = Completer<http.Response>();
    final api = GenealogyApiService(client: MockClient((_) => pending.future))..setAuthToken('old'); addTearDown(api.dispose);
    await tester.pumpWidget(MaterialApp(home: CalendarPeriodScreen(api: api))); await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Show calendar period')); await tester.tap(find.text('Show calendar period')); await tester.pump();
    api.setAuthToken(null); pending.complete(jsonResponse(periodPage())); await tester.pumpAndSettle();
    expect(find.text('Private fictional invitation'), findsNothing); expect(find.text(calendarSessionChanged), findsOneWidget);
  });

  testWidgets('loaded recipient preview cannot be returned by a replacement session', (tester) async {
    var posts = 0; Map<String, dynamic>? selected;
    final api = GenealogyApiService(client: MockClient((request) async {
      if(request.method == 'GET') return jsonResponse([{'id':'branch-1','nameNepali':'शाखा','nameEnglish':'Fictional branch'}]);
      posts++; return jsonResponse({'previewId':'preview-1','selection':{'type':'BRANCH','branchId':'branch-1'},
        'expiresAt':DateTime.now().add(const Duration(minutes:10)).toIso8601String(), 'recipientCount':1,'recipients':[{'name':'Private recipient'}]});
    }))..setAuthToken('old'); addTearDown(api.dispose);
    await tester.pumpWidget(MaterialApp(home: Builder(builder:(context) => TextButton(onPressed:() async {
      selected = await Navigator.push<Map<String,dynamic>>(context, MaterialPageRoute(builder:(_) => CalendarAudiencePicker(api:api)));
    }, child: const Text('Open audience')))));
    await tapText(tester, 'Open audience');
    await tester.tap(find.byType(DropdownButtonFormField<String>).at(1)); await tester.pumpAndSettle();
    await tester.tap(find.text('शाखा / Fictional branch').last); await tester.pumpAndSettle();
    await tapText(tester, 'समूह पूर्वावलोकन (Preview audience)');
    final use = tester.widget<ElevatedButton>(find.widgetWithText(ElevatedButton, 'यो समूह प्रयोग गर्नुहोस् (Use audience)')).onPressed!;
    expect(find.text('Private recipient'), findsOneWidget);
    api.setAuthToken('new'); use(); await tester.pumpAndSettle();
    expect(find.text('Private recipient'), findsNothing); expect(find.text(calendarSessionChanged), findsOneWidget);
    expect(selected, isNull); expect(posts, 1); expect(tester.takeException(), isNull);
  });

  testWidgets('recurrence clears evidence on replacement login for the same account', (tester) async {
    var reads = 0;
    final api = GenealogyApiService(client: MockClient((_) async { reads++; return jsonResponse({'items':[
      {'id':'rule-1','source_ref':'Private recurrence evidence','source_event_id':'event-1','source_version':2,
      'source_date':'2020-02-29','local_time':'09:00','leap_policy':'MARCH_01','state':'PENDING','version':1}
    ],'nextAfter':null}); }))..setAuthToken(accountToken('same-owner')); addTearDown(api.dispose);
    await tester.pumpWidget(MaterialApp(home: CalendarRecurrenceScreen(api:api))); await tester.pumpAndSettle();
    expect(find.text('Private recurrence evidence'), findsOneWidget);
    final reload = tester.widget<TextButton>(find.widgetWithText(TextButton,'पुनः लोड (Reload proposals)')).onPressed!;
    api.setAuthToken(accountToken('same-owner','new-login')); reload(); await tester.pumpAndSettle();
    expect(find.text('Private recurrence evidence'), findsNothing); expect(find.text(calendarSessionChanged), findsOneWidget); expect(reads,1);
  });

  testWidgets('same session access rotation keeps loaded events and controls available', (tester) async {
    var calendarReads = 0;
    var refreshes = 0;
    final api = GenealogyApiService(sessionStore: MemorySessionStore(), chatOutboxStore: MemoryChatOutboxStore(), client: MockClient((request) async {
      if(request.url.path == '/auth/native/verify') return jsonResponse({'accessToken':'old-access','refreshToken':'old-refresh'});
      if(request.url.path == '/auth/native/refresh') {
        refreshes++;
        return jsonResponse({'accessToken':'new-access','refreshToken':'new-refresh'});
      }
      expect(request.url.path, '/calendar/events');
      calendarReads++;
      if (calendarReads == 2) return jsonResponse({}, 401);
      return jsonResponse([event()]);
    })); addTearDown(api.dispose);
    // Flush initial serialized-storage setup before awaiting authentication.
    await tester.pump();
    await api.verifyOtp('challenge','123456');
    await tester.pumpWidget(MaterialApp(home: CalendarEventsScreen(apiService:api))); await tester.pumpAndSettle();
    final generation = api.pushSessionGeneration;
    expect(find.text('Private fictional invitation'), findsOneWidget);
    await tester.tap(find.widgetWithIcon(IconButton, Icons.refresh)); await tester.pumpAndSettle();
    expect(api.authToken,'new-access'); expect(api.pushSessionGeneration,generation);
    expect(refreshes, 1); expect(calendarReads, 3);
    expect(find.text('Private fictional invitation'), findsOneWidget); expect(find.text(calendarSessionChanged), findsNothing);
    expect(tester.widget<IconButton>(find.widgetWithIcon(IconButton,Icons.add)).onPressed,isNotNull);
  });
}
