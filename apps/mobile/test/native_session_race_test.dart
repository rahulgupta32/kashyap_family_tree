import 'dart:async';
import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/testing.dart';
import 'package:kashyap_mobile/services/genealogy_api_service.dart';
import 'native_session_test.dart' show MemorySessionStore, jsonResponse;
import 'chat_outbox_test.dart' show MemoryChatOutboxStore;

class BlockingSessionStore extends MemorySessionStore {
  final writing = Completer<void>();
  final release = Completer<void>();
  var writes = 0;
  @override
  Future<void> write(String value) async {
    if (writes++ == 0) {
      writing.complete();
      await release.future;
    }
    await super.write(value);
  }
}

class FailingSessionStore extends MemorySessionStore {
  var fail = true;
  @override
  Future<void> write(String value) async {
    if (fail) { fail = false; throw StateError('Storage unavailable'); }
    await super.write(value);
  }
}

void main() {
  GenealogyApiService api(MemorySessionStore store, MockClient client) => GenealogyApiService(
    sessionStore: store, chatOutboxStore: MemoryChatOutboxStore(), client: client);

  test('replacement sign-in serializes storage and wins over an older in-flight write', () async {
    final store = BlockingSessionStore();
    var verifications = 0;
    final service = api(store, MockClient((_) async {
      final number = ++verifications;
      return jsonResponse({'accessToken': 'access-$number', 'refreshToken': 'refresh-$number'});
    }));
    addTearDown(service.dispose);
    final old = expectLater(service.verifyOtp('old', '123456'), throwsStateError);
    await store.writing.future;
    final replacement = service.verifyOtp('new', '123456');
    store.release.complete();
    await old;
    expect(await replacement, 'access-2');
    expect(service.authToken, 'access-2');
    expect(jsonDecode(store.value!)['refreshToken'], 'refresh-2');
  });

  test('logout waits behind an in-flight write and clears both memory and storage', () async {
    final store = BlockingSessionStore();
    final service = api(store, MockClient((request) async => request.url.path == '/auth/logout'
      ? jsonResponse({'success': true})
      : jsonResponse({'accessToken': 'access', 'refreshToken': 'refresh'})));
    addTearDown(service.dispose);
    final old = expectLater(service.verifyOtp('old', '123456'), throwsStateError);
    await store.writing.future;
    final logout = service.logout();
    // Observe synchronous session clearing before allowing the old write to finish.
    await Future<void>.delayed(Duration.zero);
    store.release.complete();
    await old;
    await logout;
    expect(service.authToken, isNull);
    expect(store.value, isNull);
  });

  test('delayed logout cannot clear a newly accepted session', () async {
    final store = MemorySessionStore();
    final arrived = Completer<void>();
    final release = Completer<void>();
    var verifications = 0;
    final service = api(store, MockClient((request) async {
      if (request.url.path == '/auth/logout') {
        expect(jsonDecode(request.body)['refreshToken'], 'refresh-1');
        arrived.complete();
        await release.future;
        return jsonResponse({'success': true});
      }
      final number = ++verifications;
      return jsonResponse({'accessToken': 'access-$number', 'refreshToken': 'refresh-$number'});
    }));
    addTearDown(service.dispose);
    await service.verifyOtp('old', '123456');
    final logout = service.logout();
    await arrived.future;
    await service.verifyOtp('new', '123456');
    release.complete();
    await logout;
    expect(service.authToken, 'access-2');
    expect(jsonDecode(store.value!)['refreshToken'], 'refresh-2');
  });

  test('delayed OTP response cannot resurrect a session after logout', () async {
    final arrived = Completer<void>();
    final release = Completer<void>();
    final store = MemorySessionStore();
    final service = api(store, MockClient((request) async {
      if (request.url.path == '/auth/logout') { return jsonResponse({'success': true}); }
      arrived.complete();
      await release.future;
      return jsonResponse({'accessToken': 'stale', 'refreshToken': 'stale-refresh'});
    }));
    addTearDown(service.dispose);
    final old = expectLater(service.verifyOtp('old', '123456'), throwsStateError);
    await arrived.future;
    await service.logout();
    release.complete();
    await old;
    expect(service.authToken, isNull);
    expect(store.value, isNull);
  });

  test('a failed write does not poison the storage queue or authenticate the caller', () async {
    final store = FailingSessionStore();
    final service = api(store, MockClient((_) async =>
      jsonResponse({'accessToken': 'access', 'refreshToken': 'refresh'})));
    addTearDown(service.dispose);
    await expectLater(service.verifyOtp('first', '123456'), throwsStateError);
    expect(service.authToken, isNull);
    expect(await service.verifyOtp('second', '123456'), 'access');
    expect(jsonDecode(store.value!)['refreshToken'], 'refresh');
  });
}
