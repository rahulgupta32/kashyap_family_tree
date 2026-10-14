import 'dart:async';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/testing.dart';
import 'package:kashyap_mobile/services/genealogy_api_service.dart';
import 'native_session_test.dart' show MemorySessionStore, jsonResponse;
import 'chat_outbox_test.dart' show MemoryChatOutboxStore;

void main() {
  GenealogyApiService api(MockClient client, [MemorySessionStore? store]) => GenealogyApiService(
    client: client, sessionStore: store ?? MemorySessionStore(), chatOutboxStore: MemoryChatOutboxStore());

  test('session observers are notified synchronously for every replacement boundary', () {
    final service = api(MockClient((_) async => jsonResponse({})));
    addTearDown(service.dispose);
    final generations = <int>[];
    service.sessionChanges.addListener(() => generations.add(service.pushSessionGeneration));
    service.setAuthToken('first');
    expect(generations, [1]);
    service.setAuthToken('same-account-replacement');
    expect(generations, [1, 2]);
    service.setAuthToken(null);
    expect(generations, [1, 2, 3]);
  });

  test('OTP admission and activation notify; rotation within the same native family does not', () async {
    var requests = 0;
    final service = api(MockClient((request) async {
      if (request.url.path == '/auth/native/verify') {
        return jsonResponse({'accessToken': 'old', 'refreshToken': 'old-refresh'});
      }
      if (request.url.path == '/auth/native/refresh') {
        return jsonResponse({'accessToken': 'new', 'refreshToken': 'new-refresh'});
      }
      return requests++ == 0 ? jsonResponse({}, 401) : jsonResponse({'ok': true});
    }));
    addTearDown(service.dispose);
    final generations = <int>[];
    service.sessionChanges.addListener(() => generations.add(service.pushSessionGeneration));
    await service.verifyOtp('first', '123456');
    expect(generations, [1, 2]);
    expect(await service.requestJson('/fictional'), {'ok': true});
    expect(service.authToken, 'new');
    expect(generations, [1, 2]);
  });

  test('restoration boundaries and session clear notify independently of credential persistence', () async {
    final store = MemorySessionStore()..value = '{"accessToken":"old","refreshToken":"refresh"}';
    final service = api(MockClient((request) async => request.url.path == '/auth/native/refresh'
      ? jsonResponse({'accessToken': 'restored', 'refreshToken': 'rotated'})
      : jsonResponse({'success': true})), store);
    addTearDown(service.dispose);
    final generations = <int>[];
    service.sessionChanges.addListener(() => generations.add(service.pushSessionGeneration));
    expect(await service.restoreSession(), true);
    expect(generations, [1, 2]);
    await service.logout();
    expect(generations, [1, 2, 3]);
    expect(service.authToken, isNull);
  });

  test('removing the observer prevents late UI callbacks', () {
    final service = api(MockClient((_) async => jsonResponse({})));
    addTearDown(service.dispose);
    var notifications = 0;
    void listener() { notifications++; }
    service.sessionChanges.addListener(listener);
    service.setAuthToken('first');
    service.sessionChanges.removeListener(listener);
    service.setAuthToken('second');
    expect(notifications, 1);
  });

  test('disposal fences delayed private responses without notifying unmounting routes', () async {
    final entered = Completer<void>(), release = Completer<void>();
    final service = api(MockClient((_) async {
      entered.complete(); await release.future;
      return jsonResponse({'private': 'fictional-private-event'});
    }))..setAuthToken('first');
    var notifications = 0;
    service.sessionChanges.addListener(() => notifications++);
    final request = expectLater(service.requestJson('/fictional'), throwsStateError);
    await entered.future;
    service.dispose();
    service.dispose();
    release.complete();
    await request;
    expect(notifications, 0);
  });
}
