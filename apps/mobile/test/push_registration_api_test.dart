import 'dart:async';
import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/testing.dart';
import 'package:kashyap_mobile/services/genealogy_api_service.dart';
import 'native_session_test.dart' show MemorySessionStore, jsonResponse;
import 'chat_outbox_test.dart' show MemoryChatOutboxStore;

void main() {
  const token = 'fictional-provider-token-123';
  GenealogyApiService service(MockClient client) => GenealogyApiService(
    client: client, sessionStore: MemorySessionStore(), chatOutboxStore: MemoryChatOutboxStore());

  test('iOS register, inspect and remove use authenticated session-scoped endpoints', () async {
    debugDefaultTargetPlatformOverride = TargetPlatform.iOS;
    var calls = 0;
    final api = service(MockClient((request) async {
      expect(request.url.path, '/notifications/push-registration');
      expect(request.headers['Authorization'], 'Bearer access');
      if (calls++ == 0) {
        expect(request.method, 'PUT');
        expect(jsonDecode(request.body), {'token': token, 'platform': 'IOS'});
        return jsonResponse({'registration': {'id': 'opaque', 'generation': 'one'}});
      }
      expect(request.body, isEmpty);
      if (calls == 2) {
        expect(request.method, 'GET');
        return jsonResponse({'registration': null});
      }
      expect(request.method, 'DELETE');
      return jsonResponse({'success': true});
    }));
    try {
      api.setAuthToken('access');
      expect((await api.registerPushToken(token))['registration']['id'], 'opaque');
      expect((await api.currentPushRegistration())['registration'], isNull);
      expect((await api.removePushRegistration())['success'], isTrue);
      expect(calls, 3);
    } finally {
      api.dispose();
      debugDefaultTargetPlatformOverride = null;
    }
  });

  test('invalid inputs and missing session never transmit a provider token', () async {
    var calls = 0;
    final api = service(MockClient((_) async { calls++; return jsonResponse({}); }));
    addTearDown(api.dispose);
    await expectLater(api.registerPushToken(token), throwsStateError);
    api.setAuthToken('access');
    expect(() => api.registerPushToken('short'), throwsFormatException);
    expect(() => api.registerPushToken(token, platform: 'WEB'), throwsFormatException);
    expect(calls, 0);
  });

  test('401 refresh retries within the same session without changing the token contract', () async {
    var puts = 0;
    final api = service(MockClient((request) async {
      if (request.url.path == '/auth/native/verify') {
        return jsonResponse({'accessToken': 'old', 'refreshToken': 'refresh'});
      }
      if (request.url.path == '/auth/native/refresh') {
        return jsonResponse({'accessToken': 'new', 'refreshToken': 'rotated'});
      }
      expect(request.method, 'PUT');
      expect(jsonDecode(request.body), {'token': token, 'platform': 'ANDROID'});
      puts++;
      if (puts == 1) { return jsonResponse({}, 401); }
      expect(request.headers['Authorization'], 'Bearer new');
      return jsonResponse({'registration': {'id': 'opaque'}});
    }));
    addTearDown(api.dispose);
    await api.verifyOtp('challenge', '123456');
    await api.registerPushToken(token, platform: 'ANDROID');
    expect(puts, 2);
  });

  test('late response cannot retry a token into a replacement session', () async {
    final arrived = Completer<void>();
    final release = Completer<void>();
    var calls = 0;
    final api = service(MockClient((_) async {
      calls++;
      arrived.complete();
      await release.future;
      return jsonResponse({}, 401);
    }));
    addTearDown(api.dispose);
    api.setAuthToken('old-session');
    final pending = api.registerPushToken(token);
    final assertion = expectLater(pending, throwsStateError);
    await arrived.future;
    api.setAuthToken('replacement-session');
    release.complete();
    await assertion;
    expect(api.authToken, 'replacement-session');
    expect(calls, 1);
  });

  test('late refresh cannot overwrite a replacement session or resend its push token', () async {
    final refreshing = Completer<void>();
    final release = Completer<void>();
    var puts = 0;
    final api = service(MockClient((request) async {
      if (request.url.path == '/auth/native/verify') {
        return jsonResponse({'accessToken': 'old', 'refreshToken': 'old-refresh'});
      }
      if (request.url.path == '/auth/native/refresh') {
        refreshing.complete();
        await release.future;
        return jsonResponse({'accessToken': 'stale', 'refreshToken': 'stale-refresh'});
      }
      puts++;
      return jsonResponse({}, 401);
    }));
    addTearDown(api.dispose);
    await api.verifyOtp('challenge', '123456');
    final assertion = expectLater(api.registerPushToken(token), throwsStateError);
    await refreshing.future;
    api.setAuthToken('replacement-session');
    release.complete();
    await assertion;
    expect(api.authToken, 'replacement-session');
    expect(puts, 1);
  });

  test('provider tokens in server error bodies are never propagated to callers', () async {
    final api = service(MockClient((_) async => jsonResponse({'message': token}, 503)));
    addTearDown(api.dispose);
    api.setAuthToken('access');
    await expectLater(api.registerPushToken(token), throwsA(predicate((error) =>
      error.toString().contains('503') && !error.toString().contains(token))));
  });
}
