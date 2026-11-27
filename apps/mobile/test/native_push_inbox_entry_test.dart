import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/testing.dart';
import 'package:kashyap_mobile/main.dart';
import 'package:kashyap_mobile/screens/native_push_inbox_entry.dart';
import 'package:kashyap_mobile/screens/notification_inbox_screen.dart';
import 'package:kashyap_mobile/services/genealogy_api_service.dart';
import 'package:kashyap_mobile/services/native_push_inbox_router.dart';
import 'native_push_inbox_router_test.dart' show FakeInboxEvents;
import 'native_session_test.dart' show MemorySessionStore, jsonResponse;
import 'chat_outbox_test.dart' show MemoryChatOutboxStore;

class DelayedSessionStore extends MemorySessionStore {
  final restored = Completer<String?>();
  @override
  Future<String?> read() => restored.future;
}

void main() {
  late GenealogyApiService api;
  late FakeInboxEvents events;
  late NativePushInboxRouter router;
  late List<String> requests;
  setUp(() {
    requests = [];
    api = GenealogyApiService(sessionStore: MemorySessionStore(),
      chatOutboxStore: MemoryChatOutboxStore(), client: MockClient((request) async {
        requests.add('${request.method}:${request.url.path}:${request.headers['Authorization']}');
        if (request.url.path == '/notifications') {
          return jsonResponse({'items': [], 'nextCursor': null});
        }
        return jsonResponse(<String, dynamic>{});
      }))..setAuthToken('first');
    events = FakeInboxEvents();
    router = NativePushInboxRouter(api, events);
  });
  tearDown(() async { await router.close(); await events.close(); api.dispose(); });

  Widget entry() => MaterialApp(home: NativePushInboxEntry(apiService: api,
    router: router, child: const Scaffold(body: Text('Authenticated home'))));

  testWidgets('background tap opens current-authorized inbox once and can reopen after back', (tester) async {
    await router.start();
    await tester.pumpWidget(entry());
    events.taps.add(null);
    events.taps.add(null);
    await tester.pumpAndSettle();
    expect(find.byType(NotificationInboxScreen), findsOneWidget);
    expect(requests.where((r) => r.contains(':/notifications:')), ['GET:/notifications:Bearer first']);
    events.taps.add(null);
    await tester.pumpAndSettle();
    expect(requests.where((r) => r.contains(':/notifications:')).length, 1);
    await tester.pageBack();
    await tester.pumpAndSettle();
    expect(find.text('Authenticated home'), findsOneWidget);
    events.taps.add(null);
    await tester.pumpAndSettle();
    expect(requests.where((r) => r.contains(':/notifications:')).length, 2);
    expect(requests.every((r) => r.startsWith('GET:')), true); // No automatic read acknowledgement.
  });

  testWidgets('foreground prompt waits for an explicit bilingual inbox action', (tester) async {
    await router.start();
    await tester.pumpWidget(entry());
    events.arrivals.add(null);
    events.arrivals.add(null);
    await tester.pumpAndSettle();
    expect(find.byType(NotificationInboxScreen), findsNothing);
    expect(requests, isEmpty);
    expect(find.text('नयाँ सूचना उपलब्ध छ (New notification available)'), findsOneWidget);
    await tester.tap(find.text('खोल्नुहोस् (Open)'));
    await tester.pumpAndSettle();
    expect(find.byType(NotificationInboxScreen), findsOneWidget);
    expect(requests.where((r) => r.contains(':/notifications:')).length, 1);
  });

  testWidgets('stale foreground action cannot navigate with replacement session credentials', (tester) async {
    await router.start();
    await tester.pumpWidget(entry());
    events.arrivals.add(null);
    await tester.pumpAndSettle();
    api.setAuthToken('second');
    await tester.tap(find.text('खोल्नुहोस् (Open)'));
    await tester.pumpAndSettle();
    expect(find.byType(NotificationInboxScreen), findsNothing);
    expect(requests, isEmpty);
  });

  testWidgets('logout between tap and navigation frame prevents inbox requests', (tester) async {
    await router.start();
    await tester.pumpWidget(entry());
    events.taps.add(null);
    api.setAuthToken(null);
    await tester.pumpAndSettle();
    expect(find.byType(NotificationInboxScreen), findsNothing);
    expect(requests, isEmpty);
  });

  testWidgets('disposed entry cannot navigate from queued provider callbacks', (tester) async {
    await router.start();
    await tester.pumpWidget(entry());
    events.taps.add(null);
    events.arrivals.add(null);
    await tester.pumpWidget(const MaterialApp(home: Scaffold(body: Text('Signed out'))));
    await tester.pumpAndSettle();
    expect(find.byType(NotificationInboxScreen), findsNothing);
    expect(requests, isEmpty);
  });

  testWidgets('cold-launch tap cannot bypass failed MFA status and opens only after successful retry', (tester) async {
    var failStatus = true;
    final paths = <String>[];
    final gatedApi = GenealogyApiService(sessionStore: MemorySessionStore(),
      chatOutboxStore: MemoryChatOutboxStore(), client: MockClient((request) async {
        paths.add(request.url.path);
        if (request.url.path == '/auth/mfa/status') {
          if (failStatus) { return jsonResponse({'message': 'unavailable'}, 503); }
          return jsonResponse({'required': true, 'enrolled': true, 'verified': true});
        }
        if (request.url.path == '/notifications') { return jsonResponse({'items': [], 'nextCursor': null}); }
        if (request.url.path == '/genealogy/search') { return jsonResponse({'items': [], 'total': 0}); }
        return jsonResponse(<String, dynamic>{});
      }));
    addTearDown(gatedApi.dispose);
    events.initial = true;
    await tester.pumpWidget(KashyapApp(initialToken: 'gated', apiService: gatedApi, pushInboxSource: events));
    await tester.pumpAndSettle();
    expect(find.text('Retry security check'), findsOneWidget);
    expect(paths, ['/auth/mfa/status']);
    expect(find.byType(NotificationInboxScreen), findsNothing);
    failStatus = false;
    await tester.tap(find.text('Retry security check'));
    await tester.pumpAndSettle();
    expect(find.byType(NotificationInboxScreen), findsOneWidget);
    expect(paths.where((p) => p == '/notifications').length, 1);
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets('cold-launch event waits for real session restoration before the inbox HTTP request', (tester) async {
    final store = DelayedSessionStore();
    final calls = <String>[];
    final restoredApi = GenealogyApiService(sessionStore: store,
      chatOutboxStore: MemoryChatOutboxStore(), client: MockClient((request) async {
        calls.add('${request.url.path}:${request.headers['Authorization']}');
        if (request.url.path == '/auth/native/refresh') {
          return jsonResponse({'accessToken': 'restored', 'refreshToken': 'rotated-refresh'});
        }
        if (request.url.path == '/auth/mfa/status') {
          return jsonResponse({'required': false, 'enrolled': false, 'verified': false});
        }
        if (request.url.path == '/notifications') { return jsonResponse({'items': [], 'nextCursor': null}); }
        if (request.url.path == '/genealogy/search') { return jsonResponse({'items': [], 'total': 0}); }
        return jsonResponse(<String, dynamic>{});
      }));
    addTearDown(restoredApi.dispose);
    events.initial = true;
    await tester.pumpWidget(KashyapApp(apiService: restoredApi, pushInboxSource: events));
    await tester.pump();
    expect(events.initialReads, 0);
    expect(calls, isEmpty);
    expect(find.byType(NotificationInboxScreen), findsNothing);
    store.restored.complete(jsonEncode({'accessToken': 'saved', 'refreshToken': 'saved-refresh'}));
    await tester.pumpAndSettle();
    expect(events.initialReads, 1);
    expect(find.byType(NotificationInboxScreen), findsOneWidget);
    expect(calls.where((r) => r.startsWith('/notifications:')), ['/notifications:Bearer restored']);
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets('signed-out cold launch and public browsing cannot open a private inbox', (tester) async {
    final signedOutApi = GenealogyApiService(sessionStore: MemorySessionStore(),
      chatOutboxStore: MemoryChatOutboxStore(), client: MockClient((request) async {
        expect(request.url.path, '/genealogy/search');
        return jsonResponse({'items': [], 'total': 0});
      }));
    addTearDown(signedOutApi.dispose);
    events.initial = true;
    await tester.pumpWidget(KashyapApp(apiService: signedOutApi, pushInboxSource: events));
    await tester.pumpAndSettle();
    events.taps.add(null);
    events.arrivals.add(null);
    await tester.pumpAndSettle();
    expect(find.byType(NotificationInboxScreen), findsNothing);
    expect(events.initialReads, 1);
    await tester.pumpWidget(const SizedBox.shrink());
  });

}
