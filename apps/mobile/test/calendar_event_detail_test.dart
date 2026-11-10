import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/testing.dart';
import 'package:kashyap_mobile/screens/calendar_event_detail_screen.dart';
import 'package:kashyap_mobile/services/genealogy_api_service.dart';
import 'native_session_test.dart' show jsonResponse;

void main() {
  testWidgets('manager cancellation reloads the authoritative cancelled history on a phone', (tester) async {
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = const Size(411, 731);
    addTearDown(tester.view.resetDevicePixelRatio);
    addTearDown(tester.view.resetPhysicalSize);
    var cancelled = false;
    final api = GenealogyApiService(client: MockClient((r) async {
      if (r.url.path.endsWith('/history')) {
        return jsonResponse([
          if (cancelled) {'version': 3, 'action': 'CALENDAR_EVENT_CANCELLED'},
          {'version': 2, 'action': 'CALENDAR_EVENT_UPDATED'},
          {'version': 1, 'action': 'CALENDAR_EVENT_CREATED'},
        ]);
      }
      return jsonResponse({
        'id': 'event', 'title': 'Updated synthetic calendar integration',
        'description': 'Synthetic event; no cultural calculations.',
        'location': 'Synthetic test venue', 'canManage': true,
        'startsAt': '2026-11-11T04:15:00Z',
        'rsvpCounts': {'going': 1, 'maybe': 0, 'declined': 0},
        'lifecycleState': cancelled ? 'CANCELLED' : 'ACTIVE',
      });
    }))..setAuthToken('mock');
    addTearDown(api.dispose);
    await tester.pumpWidget(MaterialApp(home: CalendarEventDetailScreen(
      api: api, eventId: 'event', onEdit: (_) async {},
      onCancel: (_) async { cancelled = true; },
    )));
    await tester.pumpAndSettle();
    final cancel = find.text('रद्द गर्नुहोस् (Cancel event)');
    await tester.ensureVisible(cancel);
    await tester.tap(cancel);
    await tester.pumpAndSettle();
    expect(cancelled, isTrue);
    expect(find.text('v3 · CALENDAR_EVENT_CANCELLED'), findsOneWidget);
    expect(find.byKey(const ValueKey('detail-rsvp-GOING')), findsNothing);
  });
  testWidgets(
      'detail fetches manager history, uses RSVP endpoint and reloads authoritative state',
      (tester) async {
    final paths = <String>[];
    String? rsvp;
    final api = GenealogyApiService(client: MockClient((r) async {
      paths.add('${r.method} ${r.url.path}');
      if (r.method == 'POST') {
        expect(r.url.path, '/calendar/events/event/rsvp');
        rsvp = jsonDecode(r.body)['response'];
        return jsonResponse({'success': true, 'myRsvp': rsvp});
      }
      if (r.url.path.endsWith('/history')) {
        return jsonResponse([
          {
            'version': 1,
            'action': 'CALENDAR_EVENT_CREATED',
            'snapshot': {'private': 'must not render'}
          }
        ]);
      }
      return jsonResponse({
        'id': 'event',
        'title': 'Synthetic event',
        'canManage': true,
        'myRsvp': rsvp,
        'lifecycleState': 'ACTIVE',
        'startsAt': '2026-11-10T04:15:00Z'
      });
    }))
      ..setAuthToken('mock');
    addTearDown(api.dispose);
    await tester.pumpWidget(MaterialApp(
        home: CalendarEventDetailScreen(api: api, eventId: 'event')));
    await tester.pumpAndSettle();
    expect(find.text('v1 · CALENDAR_EVENT_CREATED'), findsOneWidget);
    expect(find.textContaining('must not render'), findsNothing);
    await tester.tap(find.byKey(const ValueKey('detail-rsvp-GOING')));
    await tester.pumpAndSettle();
    expect(rsvp, 'GOING');
    expect(
        tester
            .widget<ChoiceChip>(find.byKey(const ValueKey('detail-rsvp-GOING')))
            .selected,
        isTrue);
    expect(paths, [
      'GET /calendar/events/event',
      'GET /calendar/events/event/history',
      'POST /calendar/events/event/rsvp',
      'GET /calendar/events/event',
      'GET /calendar/events/event/history'
    ]);
  });
  testWidgets(
      'invitee has no manager controls/history request and cancelled event has no RSVP',
      (tester) async {
    final api = GenealogyApiService(client: MockClient((r) async {
      expect(r.url.path, '/calendar/events/event');
      return jsonResponse({
        'id': 'event',
        'title': 'Synthetic event',
        'canManage': false,
        'lifecycleState': 'CANCELLED'
      });
    }))
      ..setAuthToken('mock');
    addTearDown(api.dispose);
    await tester.pumpWidget(MaterialApp(
        home: CalendarEventDetailScreen(
            api: api,
            eventId: 'event',
            onEdit: (_) async {},
            onCancel: (_) async {})));
    await tester.pumpAndSettle();
    expect(find.text('कार्यक्रम इतिहास · Event history'), findsNothing);
    expect(find.text('सम्पादन (Edit event)'), findsNothing);
    expect(find.byKey(const ValueKey('detail-rsvp-GOING')), findsNothing);
  });
  testWidgets(
      'session replacement clears a late detail and makes no private history request',
      (tester) async {
    final pending = Completer<Map<String, dynamic>>();
    final api = GenealogyApiService(client: MockClient((r) async {
      expect(r.url.path, '/calendar/events/event');
      return jsonResponse(await pending.future);
    }))
      ..setAuthToken('a');
    addTearDown(api.dispose);
    await tester.pumpWidget(MaterialApp(
        home: CalendarEventDetailScreen(api: api, eventId: 'event')));
    api.setAuthToken('b');
    pending.complete(
        {'id': 'event', 'title': 'Old private event', 'canManage': true});
    await tester.pumpAndSettle();
    expect(find.text('Old private event'), findsNothing);
    expect(find.textContaining('Session changed'), findsOneWidget);
  });
  testWidgets('malformed detail cannot display cached or invented event fields',
      (tester) async {
    final api = GenealogyApiService(
        client: MockClient((_) async =>
            jsonResponse({'id': 'wrong', 'title': 'Do not display'})))
      ..setAuthToken('mock');
    addTearDown(api.dispose);
    await tester.pumpWidget(MaterialApp(
        home: CalendarEventDetailScreen(api: api, eventId: 'event')));
    await tester.pumpAndSettle();
    expect(find.text('Do not display'), findsNothing);
    expect(find.textContaining('Event unavailable'), findsOneWidget);
  });
}
