import 'dart:async';
import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/testing.dart';
import 'package:kashyap_mobile/services/genealogy_api_service.dart';
import 'native_session_test.dart' show MemorySessionStore, jsonResponse;
import 'chat_outbox_test.dart' show MemoryChatOutboxStore;

class BlockingReadSessionStore extends MemorySessionStore {
  final reading = Completer<void>();
  final release = Completer<void>();
  @override
  Future<String?> read() async {
    reading.complete();
    await release.future;
    return value;
  }
}

void main() {
  for (final status in [200, 401, 403]) {
    test('late $status response is discarded after session replacement without retry or MFA side effects', () async {
      final arrived = Completer<void>();
      final release = Completer<void>();
      var calls = 0;
      var mfa = 0;
      var expired = 0;
      final api = GenealogyApiService(sessionStore: MemorySessionStore(),
        chatOutboxStore: MemoryChatOutboxStore(), client: MockClient((request) async {
          calls++;
          expect(request.headers['Authorization'], 'Bearer old');
          arrived.complete();
          await release.future;
          return jsonResponse(status == 200 ? {'private': 'old-account-data'} : {'errorCode': 'MFA_REQUIRED'}, status);
        }));
      addTearDown(api.dispose);
      api.onMfaRequired = () => mfa++;
      api.onSessionExpired = () => expired++;
      api.setAuthToken('old');
      final assertion = expectLater(api.requestJson('/profile/me'), throwsStateError);
      await arrived.future;
      api.setAuthToken('replacement');
      release.complete();
      await assertion;
      expect(api.authToken, 'replacement');
      expect(calls, 1);
      expect(mfa, 0);
      expect(expired, 0);
    });
  }

  test('a delayed mutation cannot replay against a replacement native session with refresh credentials', () async {
    final arrived = Completer<void>();
    final release = Completer<void>();
    var patches = 0;
    var refreshes = 0;
    var signIns = 0;
    final store = MemorySessionStore();
    final api = GenealogyApiService(sessionStore: store, chatOutboxStore: MemoryChatOutboxStore(),
      client: MockClient((request) async {
        if (request.url.path == '/auth/native/verify') {
          signIns++;
          return jsonResponse({'accessToken': 'access-$signIns', 'refreshToken': 'refresh-$signIns'});
        }
        if (request.url.path == '/auth/native/refresh') {
          refreshes++;
          return jsonResponse({'accessToken': 'unexpected', 'refreshToken': 'unexpected'});
        }
        expect(request.method, 'PATCH');
        expect(request.headers['Authorization'], 'Bearer access-1');
        expect(jsonDecode(request.body), {'currentAddress': 'fictional old-owner address'});
        patches++;
        arrived.complete();
        await release.future;
        return jsonResponse({}, 401);
      }));
    addTearDown(api.dispose);
    await api.verifyOtp('first', '123456');
    final assertion = expectLater(api.requestJson('/profile/me', method: 'PATCH',
      data: {'currentAddress': 'fictional old-owner address'}), throwsStateError);
    await arrived.future;
    await api.verifyOtp('second', '123456');
    release.complete();
    await assertion;
    expect(patches, 1);
    expect(refreshes, 0);
    expect(api.authToken, 'access-2');
    expect(jsonDecode(store.value!)['refreshToken'], 'refresh-2');
  });

  test('same-account replacement session also fences account-bound mutation retries', () async {
    String jwt(String suffix) => 'header.${base64Url.encode(utf8.encode(jsonEncode({'sub': 'same-owner'})))}.$suffix';
    final arrived = Completer<void>();
    final release = Completer<void>();
    var calls = 0;
    final api = GenealogyApiService(sessionStore: MemorySessionStore(),
      chatOutboxStore: MemoryChatOutboxStore(), client: MockClient((_) async {
        calls++;
        arrived.complete();
        await release.future;
        return jsonResponse({}, 401);
      }));
    addTearDown(api.dispose);
    api.setAuthToken(jwt('first-family'));
    final assertion = expectLater(api.requestJson('/community', method: 'POST',
      data: {'content': 'fictional intent'}, boundAccountId: 'same-owner'), throwsStateError);
    await arrived.future;
    api.setAuthToken(jwt('replacement-family'));
    release.complete();
    await assertion;
    expect(api.chatAccountId, 'same-owner');
    expect(api.authToken, jwt('replacement-family'));
    expect(calls, 1);
  });

  test('401 followed by revocation still clears the original session', () async {
    final store = MemorySessionStore();
    var expired = 0;
    final api = GenealogyApiService(sessionStore: store, chatOutboxStore: MemoryChatOutboxStore(),
      client: MockClient((request) async => request.url.path == '/auth/native/verify'
        ? jsonResponse({'accessToken': 'expired', 'refreshToken': 'revoked'})
        : jsonResponse({}, 401)));
    addTearDown(api.dispose);
    api.onSessionExpired = () => expired++;
    await api.verifyOtp('first', '123456');
    await expectLater(api.requestJson('/profile/me'), throwsStateError);
    expect(api.authToken, isNull);
    expect(store.value, isNull);
    expect(expired, 1);
  });
  for (final status in [200, 401]) {
    test('request started during pending sign-in cannot survive replacement activation ($status)', () async {
      final signInArrived = Completer<void>();
      final signInRelease = Completer<void>();
      final requestArrived = Completer<void>();
      final requestRelease = Completer<void>();
      var signIns = 0;
      var requests = 0;
      final api = GenealogyApiService(sessionStore: MemorySessionStore(),
        chatOutboxStore: MemoryChatOutboxStore(), client: MockClient((request) async {
          if (request.url.path == '/auth/native/verify') {
            final number = ++signIns;
            if (number == 2) {
              signInArrived.complete();
              await signInRelease.future;
            }
            return jsonResponse({'accessToken': 'access-$number', 'refreshToken': 'refresh-$number'});
          }
          expect(request.url.path, '/profile/me');
          expect(request.headers['Authorization'], 'Bearer access-1');
          requests++;
          requestArrived.complete();
          await requestRelease.future;
          return jsonResponse({'private': 'old-account-data'}, status);
        }));
      addTearDown(api.dispose);
      await api.verifyOtp('first', '123456');
      final replacement = api.verifyOtp('second', '123456');
      await signInArrived.future;
      final assertion = expectLater(api.requestJson('/profile/me'), throwsStateError);
      await requestArrived.future;
      signInRelease.complete();
      expect(await replacement, 'access-2');
      requestRelease.complete();
      await assertion;
      expect(api.authToken, 'access-2');
      expect(requests, 1);
    });
  }

  test('request started during persisted-session read cannot return prior-account data', () async {
    final store = BlockingReadSessionStore()
      ..value = jsonEncode({'accessToken': 'saved-access', 'refreshToken': 'saved-refresh'});
    final requestArrived = Completer<void>();
    final requestRelease = Completer<void>();
    final api = GenealogyApiService(sessionStore: store, chatOutboxStore: MemoryChatOutboxStore(),
      client: MockClient((request) async {
        if (request.url.path == '/auth/native/refresh') {
          expect(jsonDecode(request.body)['refreshToken'], 'saved-refresh');
          return jsonResponse({'accessToken': 'restored-access', 'refreshToken': 'restored-refresh'});
        }
        expect(request.headers['Authorization'], 'Bearer prior-access');
        requestArrived.complete();
        await requestRelease.future;
        return jsonResponse({'private': 'prior-account-data'});
      }));
    addTearDown(api.dispose);
    api.setAuthToken('prior-access');
    final restore = api.restoreSession();
    await store.reading.future;
    final assertion = expectLater(api.requestJson('/profile/me'), throwsStateError);
    await requestArrived.future;
    store.release.complete();
    expect(await restore, isTrue);
    requestRelease.complete();
    await assertion;
    expect(api.authToken, 'restored-access');
    expect(jsonDecode(store.value!)['refreshToken'], 'restored-refresh');
  });

}
