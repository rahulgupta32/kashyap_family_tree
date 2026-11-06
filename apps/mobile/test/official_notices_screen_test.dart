import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:kashyap_mobile/screens/official_notices_screen.dart';
import 'package:kashyap_mobile/services/genealogy_api_service.dart';
import 'native_session_test.dart' show MemorySessionStore, jsonResponse;
import 'chat_outbox_test.dart' show MemoryChatOutboxStore;

const noticeId = 'b273ab63-11f7-45da-bd31-dcdeef9d8e34';
const otherId = 'c273ab63-11f7-45da-bd31-dcdeef9d8e35';
Map<String, dynamic> notice(String id, String title, {String? body}) => {
  'id': id, 'title': title, 'scope': 'BRANCH', 'branchId': null,
  'generation': null, 'createdAt': '2026-10-13T00:00:00.000Z',
  if (body != null) 'body': body,
};

GenealogyApiService service(Future<http.Response> Function(http.Request) handler) =>
  GenealogyApiService(client: MockClient(handler), sessionStore: MemorySessionStore(),
    chatOutboxStore: MemoryChatOutboxStore())..setAuthToken('notice-session');

Future<void> mountNotices(WidgetTester tester, GenealogyApiService api, {String? initialNoticeId}) async {
  addTearDown(() async {
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pump();
  });
  await tester.pumpWidget(MaterialApp(home: OfficialNoticesScreen(apiService: api, initialNoticeId: initialNoticeId)));
}

Future<void> tapVisible(WidgetTester tester, Finder finder) async {
  await tester.scrollUntilVisible(finder, 200, scrollable: find.byType(Scrollable).first);
  await tester.pumpAndSettle();
  expect(finder.hitTestable(), findsOneWidget);
  await tester.tap(finder.hitTestable());
}

Future<void> unmountNotices(WidgetTester tester) async {
  await tester.pumpWidget(const SizedBox.shrink());
  await tester.pump();
}

void main() {
  testWidgets('mocked exact origin older than latest 50 loads fresh authorized detail', (tester) async {
    final paths = <String>[];
    final summaries = List.generate(50, (index) => notice(
      'b273ab63-11f7-45da-bd31-${index.toRadixString(16).padLeft(12, '0')}', 'Recent notice $index'));
    final api = service((request) async {
      paths.add(request.url.path);
      return request.url.path == '/notifications/broadcasts'
        ? jsonResponse(summaries)
        : jsonResponse(notice(noticeId, 'Older exact notice', body: 'Fresh authorized originating notice body'));
    });
    addTearDown(api.dispose);
    await mountNotices(tester, api, initialNoticeId: noticeId);
    await tester.pumpAndSettle();
    expect(paths, ['/notifications/broadcasts', '/notifications/broadcasts/$noticeId']);
    expect(find.text('Fresh authorized originating notice body').hitTestable(), findsOneWidget);
    expect(find.textContaining('Latest 50 notices'), findsOneWidget);
    await unmountNotices(tester);
  });

  testWidgets('mocked denied initial origin uses fixed fallback and no notice body', (tester) async {
    final api = service((request) async => request.url.path == '/notifications/broadcasts'
      ? jsonResponse([notice(otherId, 'Currently accessible notice')])
      : jsonResponse({'message': 'private origin restriction detail'}, 404));
    addTearDown(api.dispose);
    await mountNotices(tester, api, initialNoticeId: noticeId);
    await tester.pumpAndSettle();
    expect(find.textContaining('This notice is unavailable'), findsOneWidget);
    expect(find.text('Currently accessible notice'), findsOneWidget);
    expect(find.byType(SelectableText), findsNothing);
    expect(find.textContaining('private origin restriction'), findsNothing);
    await unmountNotices(tester);
  });

  testWidgets('mocked invalid initial URL cannot initiate any request', (tester) async {
    var requests = 0;
    final api = service((_) async { requests++; return jsonResponse([]); });
    addTearDown(api.dispose);
    await mountNotices(tester, api, initialNoticeId: 'https://untrusted.example/private');
    await tester.pumpAndSettle();
    expect(requests, 0);
    expect(find.textContaining('This notice is unavailable'), findsOneWidget);
    expect(find.byType(SelectableText), findsNothing);
    await unmountNotices(tester);
  });

  testWidgets('mocked origin change fences a pending earlier detail result', (tester) async {
    final arrived = Completer<void>(), response = Completer<http.Response>();
    final api = service((request) async {
      if (request.url.path == '/notifications/broadcasts') { return jsonResponse([]); }
      if (request.url.path.endsWith(noticeId)) { arrived.complete(); return response.future; }
      return jsonResponse(notice(otherId, 'New origin title', body: 'New origin body'));
    });
    addTearDown(api.dispose);
    await mountNotices(tester, api, initialNoticeId: noticeId);
    await tester.pump();
    await arrived.future;
    await tester.pumpWidget(MaterialApp(home: OfficialNoticesScreen(apiService: api, initialNoticeId: otherId)));
    await tester.pumpAndSettle();
    expect(find.text('New origin body'), findsOneWidget);
    response.complete(jsonResponse(notice(noticeId, 'Stale origin title', body: 'Stale origin body')));
    await tester.pumpAndSettle();
    expect(find.text('New origin body'), findsOneWidget);
    expect(find.text('Stale origin body'), findsNothing);
    expect(find.text('Stale origin title'), findsNothing);
    await unmountNotices(tester);
  });

  testWidgets('mocked authorized notices fetch selected detail and display plain text only', (tester) async {
    final paths = <String>[];
    final api = service((request) async {
      paths.add(request.url.path);
      expect(request.method, 'GET');
      expect(request.headers['Authorization'], 'Bearer notice-session');
      if (request.url.path == '/notifications/broadcasts') {
        return jsonResponse([notice(noticeId, 'Fictional meeting', body: 'Do not render summary body')]);
      }
      expect(request.url.path, '/notifications/broadcasts/$noticeId');
      return jsonResponse(notice(noticeId, 'Fictional meeting', body: '<b>Authorized plain text</b>'));
    });
    addTearDown(api.dispose);
    await mountNotices(tester, api);
    await tester.pumpAndSettle();
    expect(find.text('Do not render summary body'), findsNothing);
    await tapVisible(tester, find.text('Fictional meeting'));
    await tester.pumpAndSettle();
    expect(find.text('<b>Authorized plain text</b>'), findsOneWidget);
    expect(find.byType(SelectableText), findsOneWidget);
    expect(paths, ['/notifications/broadcasts', '/notifications/broadcasts/$noticeId']);
    await unmountNotices(tester);
  });

  testWidgets('mocked unsigned viewer performs no request', (tester) async {
    var calls = 0;
    final api = service((_) async { calls++; return jsonResponse([]); })..setAuthToken(null);
    addTearDown(api.dispose);
    await mountNotices(tester, api);
    await tester.pumpAndSettle();
    expect(calls, 0);
    expect(find.textContaining('Sign in again to view notices'), findsOneWidget);
    await unmountNotices(tester);
  });

  testWidgets('mocked normal token rotation preserves authorized detail viewing', (tester) async {
    var refreshes = 0;
    final api = service((request) async {
      if (request.url.path == '/auth/native/verify') {
        return jsonResponse({'accessToken': 'expired', 'refreshToken': 'refresh-old'});
      }
      if (request.url.path == '/auth/native/refresh') {
        refreshes++;
        return jsonResponse({'accessToken': 'fresh', 'refreshToken': 'refresh-new'});
      }
      if (request.url.path == '/notifications/broadcasts') {
        return jsonResponse([notice(noticeId, 'Rotating session notice')]);
      }
      if (request.headers['Authorization'] == 'Bearer expired') { return jsonResponse({}, 401); }
      expect(request.headers['Authorization'], 'Bearer fresh');
      return jsonResponse(notice(noticeId, 'Rotating session notice', body: 'Authorized after refresh'));
    });
    addTearDown(api.dispose);
    await api.verifyOtp('challenge', '123456');
    final generation = api.pushSessionGeneration;
    await mountNotices(tester, api);
    await tester.pumpAndSettle();
    await tapVisible(tester, find.text('Rotating session notice'));
    await tester.pumpAndSettle();
    expect(refreshes, 1);
    expect(api.pushSessionGeneration, generation);
    expect(find.text('Authorized after refresh'), findsOneWidget);
    await unmountNotices(tester);
  });

  testWidgets('mocked empty list has safe empty state and refresh', (tester) async {
    var calls = 0;
    final api = service((_) async { calls++; return jsonResponse([]); });
    addTearDown(api.dispose);
    await mountNotices(tester, api);
    await tester.pumpAndSettle();
    expect(find.textContaining('No official notices available'), findsOneWidget);
    await tester.tap(find.byTooltip('सूचनाहरू पुनः लोड गर्नुहोस् (Refresh official notices)'));
    await tester.pumpAndSettle();
    expect(calls, 2);
    await unmountNotices(tester);
  });

  testWidgets('mocked capped list states latest 50 and can open a scrolled notice', (tester) async {
    final summaries = List.generate(50, (index) => notice(
      'b273ab63-11f7-45da-bd31-${index.toRadixString(16).padLeft(12, '0')}', 'Notice $index'));
    final api = service((request) async => request.url.path == '/notifications/broadcasts'
      ? jsonResponse(summaries) : jsonResponse({...summaries.last, 'body': 'Last visible notice body'}));
    addTearDown(api.dispose);
    await mountNotices(tester, api);
    await tester.pumpAndSettle();
    expect(find.textContaining('Latest 50 notices'), findsOneWidget);
    expect(find.textContaining('Load older'), findsNothing);
    await tapVisible(tester, find.text('Notice 49'));
    await tester.pumpAndSettle();
    // Successful selection brings the freshly authorized detail into view.
    expect(find.text('Last visible notice body').hitTestable(), findsOneWidget);
    await unmountNotices(tester);
  });

  for (final status in [403, 404]) {
    testWidgets('mocked $status detail denial clears earlier body and hides server diagnostics', (tester) async {
      final api = service((request) async {
        if (request.url.path == '/notifications/broadcasts') {
          return jsonResponse([notice(noticeId, 'First notice'), notice(otherId, 'Restricted notice')]);
        }
        if (request.url.path.endsWith(noticeId)) {
          return jsonResponse(notice(noticeId, 'First notice', body: 'Previous authorized body'));
        }
        return jsonResponse({'message': 'private provider or membership diagnostic'}, status);
      });
      addTearDown(api.dispose);
      await mountNotices(tester, api);
      await tester.pumpAndSettle();
      await tapVisible(tester, find.text('First notice'));
      await tester.pumpAndSettle();
      expect(find.text('Previous authorized body'), findsOneWidget);
      await tapVisible(tester, find.text('Restricted notice'));
      await tester.pumpAndSettle();
      expect(find.text('Previous authorized body'), findsNothing);
      expect(find.textContaining('This notice is unavailable'), findsOneWidget);
      expect(find.textContaining('private provider'), findsNothing);
      await unmountNotices(tester);
    });
  }

  for (final phase in ['list', 'detail']) {
    testWidgets('mocked delayed $phase result cannot render in replacement session', (tester) async {
      final arrived = Completer<void>(), response = Completer<http.Response>();
      final api = service((request) async {
        if (phase == 'detail' && request.url.path == '/notifications/broadcasts') {
          return jsonResponse([notice(noticeId, 'Prior session notice')]);
        }
        arrived.complete();
        return response.future;
      });
      addTearDown(api.dispose);
      await mountNotices(tester, api);
      if (phase == 'detail') {
        await tester.pumpAndSettle();
        await tapVisible(tester, find.text('Prior session notice'));
      } else { await tester.pump(); }
      await arrived.future;
      api.setAuthToken('replacement-session');
      response.complete(jsonResponse(phase == 'list'
        ? [notice(noticeId, 'Stale title')]
        : notice(noticeId, 'Stale title', body: 'Stale private body')));
      await tester.pumpAndSettle();
      expect(find.text('Stale title'), findsNothing);
      expect(find.text('Stale private body'), findsNothing);
      expect(find.text('Prior session notice'), findsNothing);
      expect(find.textContaining('Sign in again to view notices'), findsOneWidget);
      await unmountNotices(tester);
    });
  }

  testWidgets('mocked unavailable or malformed list uses fixed retry message', (tester) async {
    var calls = 0;
    final api = service((_) async {
      calls++;
      if (calls == 1) { return jsonResponse({'message': 'private diagnostic'}, 503); }
      if (calls == 2) { return jsonResponse([{'id': '../unsafe', 'title': 'Untrusted title'}]); }
      return jsonResponse([notice(noticeId, 'Recovered notice')]);
    });
    addTearDown(api.dispose);
    await mountNotices(tester, api);
    await tester.pumpAndSettle();
    expect(find.textContaining('Notices unavailable'), findsOneWidget);
    expect(find.textContaining('private diagnostic'), findsNothing);
    await tapVisible(tester, find.text('फेरि प्रयास गर्नुहोस् (Retry)'));
    await tester.pumpAndSettle();
    expect(find.textContaining('Notices unavailable'), findsOneWidget);
    expect(find.text('Untrusted title'), findsNothing);
    await tapVisible(tester, find.text('फेरि प्रयास गर्नुहोस् (Retry)'));
    await tester.pumpAndSettle();
    expect(find.text('Recovered notice'), findsOneWidget);
    await unmountNotices(tester);
  });

  testWidgets('mocked mismatched detail identity reveals no body', (tester) async {
    final api = service((request) async => request.url.path == '/notifications/broadcasts'
      ? jsonResponse([notice(noticeId, 'Expected notice')])
      : jsonResponse(notice(otherId, 'Other title', body: 'Wrong notice body')));
    addTearDown(api.dispose);
    await mountNotices(tester, api);
    await tester.pumpAndSettle();
    await tapVisible(tester, find.text('Expected notice'));
    await tester.pumpAndSettle();
    expect(find.text('Wrong notice body'), findsNothing);
    expect(find.textContaining('This notice is unavailable'), findsOneWidget);
    await unmountNotices(tester);
  });

  testWidgets('mocked delayed response after disposal produces no widget exception', (tester) async {
    final response = Completer<http.Response>();
    final api = service((_) => response.future);
    addTearDown(api.dispose);
    await mountNotices(tester, api);
    await tester.pump();
    await tester.pumpWidget(const MaterialApp(home: Text('Replacement route')));
    response.complete(jsonResponse([notice(noticeId, 'Disposed response')]));
    await tester.pumpAndSettle();
    expect(find.text('Disposed response'), findsNothing);
    expect(tester.takeException(), isNull);
    await unmountNotices(tester);
  });

  testWidgets('mocked replacement clears an already loaded body without another request', (tester) async {
    var calls = 0;
    final api = service((request) async {
      calls++;
      return request.url.path == '/notifications/broadcasts'
        ? jsonResponse([notice(noticeId, 'Previous account title')])
        : jsonResponse(notice(noticeId, 'Previous account title', body: 'Previous account body'));
    });
    addTearDown(api.dispose);
    await mountNotices(tester, api);
    await tester.pumpAndSettle();
    await tapVisible(tester, find.text('Previous account title'));
    await tester.pumpAndSettle();
    expect(find.text('Previous account body'), findsOneWidget);
    api.setAuthToken('replacement-session');
    await tester.pump(const Duration(milliseconds: 501));
    expect(find.text('Previous account body'), findsNothing);
    expect(find.text('Previous account title'), findsNothing);
    expect(find.textContaining('Sign in again to view notices'), findsOneWidget);
    expect(calls, 2);
    await unmountNotices(tester);
  });

  testWidgets('mocked API replacement with the same generation cannot inherit loaded content', (tester) async {
    final api = service((request) async => request.url.path == '/notifications/broadcasts'
      ? jsonResponse([notice(noticeId, 'Original API title')])
      : jsonResponse(notice(noticeId, 'Original API title', body: 'Original API body')));
    var replacementCalls = 0;
    final replacement = service((_) async { replacementCalls++; return jsonResponse([]); });
    addTearDown(api.dispose);
    addTearDown(replacement.dispose);
    expect(api.pushSessionGeneration, replacement.pushSessionGeneration);
    await mountNotices(tester, api);
    await tester.pumpAndSettle();
    await tapVisible(tester, find.text('Original API title'));
    await tester.pumpAndSettle();
    expect(find.text('Original API body'), findsOneWidget);
    await tester.pumpWidget(MaterialApp(home: OfficialNoticesScreen(apiService: replacement)));
    await tester.pumpAndSettle();
    expect(find.text('Original API body'), findsNothing);
    expect(find.text('Original API title'), findsNothing);
    expect(find.textContaining('Sign in again to view notices'), findsOneWidget);
    expect(replacementCalls, 0);
    await unmountNotices(tester);
  });
}
