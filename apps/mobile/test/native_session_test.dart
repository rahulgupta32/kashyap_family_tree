import 'dart:async';
import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:kashyap_mobile/services/genealogy_api_service.dart';
import 'package:kashyap_mobile/services/session_store.dart';

class MemorySessionStore implements SessionStore {
  String? value;
  @override
  Future<String?> read() async => value;
  @override
  Future<void> write(String value) async { this.value = value; }
  @override
  Future<void> clear() async { value = null; }
}

http.Response jsonResponse(Object body, [int status = 200]) =>
    http.Response(jsonEncode(body), status, headers: {'content-type': 'application/json; charset=utf-8'});

void main() {
  group('Native authentication HTTP contract (mock transport, not device acceptance)', () {
    test('OTP session ID and code use native endpoint; both tokens are stored', () async {
      final store = MemorySessionStore();
      final service = GenealogyApiService(sessionStore: store, client: MockClient((request) async {
        expect(request.headers['Authorization'], isNull);
        final body = jsonDecode(request.body);
        if (request.url.path == '/auth/otp/request') {
          expect(body, {'phoneNumber': '+9779840000001'});
          return jsonResponse({'otpSessionId': 'challenge-1', 'cooldownSeconds': 60, 'expiresInSeconds': 300});
        }
        expect(request.url.path, '/auth/native/verify');
        expect(body['otpSessionId'], 'challenge-1');
        expect(body['code'], '123456');
        expect(body['deviceInfo']['platform'], 'android');
        expect(body.containsKey('phoneNumber'), isFalse);
        return jsonResponse({'accessToken': 'access-1', 'refreshToken': 'refresh-1'});
      }));
      addTearDown(service.dispose);
      final challenge = await service.requestOtp('+9779840000001');
      await service.verifyOtp(challenge['otpSessionId'], '123456');
      expect(service.authToken, 'access-1');
      expect(jsonDecode(store.value!), {'accessToken': 'access-1', 'refreshToken': 'refresh-1'});
    });

    test('parallel unauthorized requests rotate once and retry with the new token', () async {
      final store = MemorySessionStore();
      final bothRejected = Completer<void>();
      var rejected = 0;
      var refreshes = 0;
      final service = GenealogyApiService(sessionStore: store, client: MockClient((request) async {
        if (request.url.path == '/auth/native/verify') {
          return jsonResponse({'accessToken': 'expired', 'refreshToken': 'refresh-old'});
        }
        if (request.url.path == '/auth/native/refresh') {
          refreshes++;
          expect(jsonDecode(request.body), {'refreshToken': 'refresh-old'});
          await bothRejected.future;
          return jsonResponse({'accessToken': 'fresh', 'refreshToken': 'refresh-new'});
        }
        if (request.headers['Authorization'] == 'Bearer expired') {
          rejected++;
          if (rejected == 2) { bothRejected.complete(); }
          return jsonResponse({}, 401);
        }
        expect(request.headers['Authorization'], 'Bearer fresh');
        return jsonResponse({'person': {'currentAddress': 'Pokhara'}});
      }));
      addTearDown(service.dispose);
      await service.verifyOtp('challenge', '123456');
      final profiles = await Future.wait([service.getMyProfile(), service.getMyProfile()]);
      expect(profiles.length, 2);
      expect(refreshes, 1);
      expect(jsonDecode(store.value!)['refreshToken'], 'refresh-new');
    });

    test('startup rotates persisted session and logout clears it', () async {
      final store = MemorySessionStore()..value = jsonEncode({'accessToken': 'old', 'refreshToken': 'saved'});
      final service = GenealogyApiService(sessionStore: store, client: MockClient((request) async {
        if (request.url.path == '/auth/native/refresh') {
          expect(jsonDecode(request.body)['refreshToken'], 'saved');
          return jsonResponse({'accessToken': 'restored', 'refreshToken': 'rotated'});
        }
        expect(request.url.path, '/auth/logout');
        expect(jsonDecode(request.body)['refreshToken'], 'rotated');
        return jsonResponse({'success': true});
      }));
      addTearDown(service.dispose);
      expect(await service.restoreSession(), isTrue);
      expect(service.authToken, 'restored');
      await service.logout();
      expect(store.value, isNull);
      expect(service.authToken, isNull);
    });

    test('revoked refresh clears credentials and notifies the app', () async {
      final store = MemorySessionStore()..value = jsonEncode({'accessToken': 'old', 'refreshToken': 'revoked'});
      var expired = false;
      final service = GenealogyApiService(sessionStore: store,
        client: MockClient((_) async => jsonResponse({}, 401)));
      service.onSessionExpired = () => expired = true;
      addTearDown(service.dispose);
      expect(await service.restoreSession(), isFalse);
      expect(expired, isTrue);
      expect(store.value, isNull);
      expect(service.authToken, isNull);
    });

    test('incorrect OTP never creates a session', () async {
      final store = MemorySessionStore();
      final service = GenealogyApiService(sessionStore: store,
        client: MockClient((_) async => jsonResponse({'message': 'Invalid OTP'}, 400)));
      addTearDown(service.dispose);
      await expectLater(service.verifyOtp('challenge', '000000'), throwsException);
      expect(store.value, isNull);
      expect(service.authToken, isNull);
    });
  });
}
