import 'dart:async';
import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/testing.dart';
import 'package:kashyap_mobile/services/genealogy_api_service.dart';
import 'package:kashyap_mobile/services/native_push_lifecycle.dart';
import 'native_push_lifecycle_test.dart' show FakePushSource;
import 'native_session_test.dart' show MemorySessionStore, jsonResponse;
import 'chat_outbox_test.dart' show MemoryChatOutboxStore;

class ControlledPreferenceStore extends MemorySessionStore {
  bool failWrites = false;
  Completer<void>? entered;
  Completer<void>? release;
  @override
  Future<void> write(String value) async {
    if (failWrites) { throw StateError('fictional-private-storage-diagnostic'); }
    if (release != null) { entered!.complete(); await release!.future; release = null; }
    await super.write(value);
  }
}

void main() {
  GenealogyApiService api(MemorySessionStore store, MockClient client) => GenealogyApiService(
    sessionStore: store, chatOutboxStore: MemoryChatOutboxStore(), client: client);

  void cleanup(GenealogyApiService service, NativePushLifecycle lifecycle, FakePushSource source) {
    addTearDown(() async { await lifecycle.close(); await source.changes.close(); service.dispose(); });
  }

  test('failed DELETE persists before HTTP; fresh process retries removal without SDK activation', () async {
    final store = MemorySessionStore();
    final source = FakePushSource();
    final calls = <String>[];
    final first = api(store, MockClient((request) async {
      calls.add(request.method);
      if (request.url.path == '/auth/native/verify') {
        return jsonResponse({'accessToken': 'first', 'refreshToken': 'first-refresh'});
      }
      expect(jsonDecode(store.value!)['pushRemovalPending'], true);
      return jsonResponse({'message': 'unavailable'}, 503);
    }));
    final lifecycle = NativePushLifecycle(first, source);
    cleanup(first, lifecycle, source);
    await first.verifyOtp('first', '123456');
    await expectLater(lifecycle.disable(), throwsStateError);
    expect(first.pushRemovalPending, true);
    expect(source.running, false);
    await lifecycle.close();

    final retrySource = FakePushSource();
    final second = api(store, MockClient((request) async {
      if (request.url.path == '/auth/native/refresh') {
        return jsonResponse({'accessToken': 'rotated', 'refreshToken': 'rotated-refresh'});
      }
      expect(request.method, 'DELETE');
      expect(request.headers['Authorization'], 'Bearer rotated');
      expect(jsonDecode(store.value!)['pushRemovalPending'], true);
      return jsonResponse({'success': true});
    }));
    final retry = NativePushLifecycle(second, retrySource);
    cleanup(second, retry, retrySource);
    expect(await second.restoreSession(), true);
    expect(second.pushRemovalPending, true);
    expect(await retry.resumeExisting(), false);
    expect(second.pushRemovalPending, false);
    expect(jsonDecode(store.value!).containsKey('pushRemovalPending'), false);
    expect(retrySource.permissionRequests, 0);
    expect(retrySource.running, false);
    expect(await retry.resumeExisting(), false);
    expect(calls, ['POST', 'DELETE']);
  });

  test('unconfirmed or malformed removal acknowledgement retains intent and retries', () async {
    for (final response in [<String, dynamic>{}, <String, dynamic>{'success': false}]) {
      final store = MemorySessionStore();
      final source = FakePushSource();
      var deletes = 0;
      final service = api(store, MockClient((request) async {
        if (request.url.path == '/auth/native/verify') {
          return jsonResponse({'accessToken': 'first', 'refreshToken': 'refresh'});
        }
        expect(request.method, 'DELETE');
        return jsonResponse(deletes++ == 0 ? response : {'success': true});
      }));
      final lifecycle = NativePushLifecycle(service, source);
      cleanup(service, lifecycle, source);
      await service.verifyOtp('first', '123456');
      await expectLater(lifecycle.disable(), throwsStateError);
      expect(service.pushRemovalPending, true);
      expect(jsonDecode(store.value!)['pushRemovalPending'], true);
      expect(await lifecycle.resumeExisting(), false);
      expect(deletes, 2);
      expect(service.pushRemovalPending, false);
      expect(source.permissionRequests, 0);
    }
  });

  test('same-session 401 rotation preserves pending intent before retrying DELETE', () async {
    final store = MemorySessionStore();
    final source = FakePushSource();
    var deletes = 0;
    final service = api(store, MockClient((request) async {
      if (request.url.path == '/auth/native/verify') {
        return jsonResponse({'accessToken': 'old', 'refreshToken': 'old-refresh'});
      }
      if (request.url.path == '/auth/native/refresh') {
        expect(jsonDecode(store.value!)['pushRemovalPending'], true);
        return jsonResponse({'accessToken': 'new', 'refreshToken': 'new-refresh'});
      }
      expect(request.method, 'DELETE');
      expect(jsonDecode(store.value!)['pushRemovalPending'], true);
      if (deletes++ == 0) { return jsonResponse({}, 401); }
      expect(request.headers['Authorization'], 'Bearer new');
      expect(jsonDecode(store.value!)['refreshToken'], 'new-refresh');
      return jsonResponse({'success': true});
    }));
    final lifecycle = NativePushLifecycle(service, source);
    cleanup(service, lifecycle, source);
    await service.verifyOtp('first', '123456');
    await lifecycle.disable();
    expect(deletes, 2);
    expect(service.pushRemovalPending, false);
  });

  test('failed durable acknowledgement keeps SDK stopped and intent pending until retry', () async {
    final store = ControlledPreferenceStore();
    final source = FakePushSource();
    var deletes = 0;
    final service = api(store, MockClient((request) async {
      if (request.url.path == '/auth/native/verify') {
        return jsonResponse({'accessToken': 'first', 'refreshToken': 'refresh'});
      }
      expect(request.method, 'DELETE');
      deletes++;
      store.failWrites = true;
      return jsonResponse({'success': true});
    }));
    final lifecycle = NativePushLifecycle(service, source);
    cleanup(service, lifecycle, source);
    await service.verifyOtp('first', '123456');
    await expectLater(lifecycle.disable(), throwsA(predicate((e) =>
      e.toString().contains('storage unavailable') && !e.toString().contains('private-storage'))));
    expect(service.pushRemovalPending, true);
    expect(jsonDecode(store.value!)['pushRemovalPending'], true);
    expect(source.running, false);
    store.failWrites = false;
    // The network handler above fails the acknowledgement write on every attempt.
    await expectLater(lifecycle.resumeExisting(), throwsStateError);
    expect(deletes, 2);
    expect(source.permissionRequests, 0);
  });

  test('storage unavailable still attempts safe server removal and does not claim confirmation', () async {
    final store = ControlledPreferenceStore();
    final source = FakePushSource();
    var deletes = 0;
    final service = api(store, MockClient((request) async {
      if (request.url.path == '/auth/native/verify') {
        return jsonResponse({'accessToken': 'first', 'refreshToken': 'refresh'});
      }
      expect(request.method, 'DELETE');
      deletes++;
      return jsonResponse({'success': true});
    }));
    final lifecycle = NativePushLifecycle(service, source);
    cleanup(service, lifecycle, source);
    await service.verifyOtp('first', '123456');
    store.failWrites = true;
    await expectLater(lifecycle.disable(), throwsStateError);
    expect(deletes, 1);
    expect(service.pushRemovalPending, true);
    expect(source.running, false);
    store.failWrites = false;
    expect(await lifecycle.resumeExisting(), false);
    expect(service.pushRemovalPending, false);
    expect(deletes, 2);
    expect(source.permissionRequests, 0);
  });

  test('failed explicit opt-in retains the marker; successful explicit PUT supersedes it', () async {
    final store = MemorySessionStore();
    final source = FakePushSource();
    final calls = <String>[];
    var failPut = true;
    final service = api(store, MockClient((request) async {
      if (request.url.path == '/auth/native/verify') {
        return jsonResponse({'accessToken': 'first', 'refreshToken': 'refresh'});
      }
      calls.add(request.method);
      expect(jsonDecode(store.value!)['pushRemovalPending'], true);
      if (request.method == 'DELETE' || failPut) { return jsonResponse({}, 503); }
      return jsonResponse({'registration': {'id': 'opaque'}});
    }));
    final lifecycle = NativePushLifecycle(service, source);
    cleanup(service, lifecycle, source);
    await service.verifyOtp('first', '123456');
    await expectLater(lifecycle.disable(), throwsStateError);
    await expectLater(lifecycle.enable(), throwsStateError);
    expect(service.pushRemovalPending, true);
    expect(jsonDecode(store.value!)['pushRemovalPending'], true);
    failPut = false;
    expect(await lifecycle.enable(), true);
    expect(service.pushRemovalPending, false);
    expect(jsonDecode(store.value!).containsKey('pushRemovalPending'), false);
    expect(calls, ['DELETE', 'PUT', 'PUT']);
  });

  test('delayed old DELETE cannot clear replacement-session state or affect its SDK activation', () async {
    final store = MemorySessionStore();
    final source = FakePushSource();
    final arrived = Completer<void>(), release = Completer<void>();
    var verifications = 0;
    final calls = <String>[];
    final service = api(store, MockClient((request) async {
      if (request.url.path == '/auth/native/verify') {
        final n = ++verifications;
        return jsonResponse({'accessToken': 'access-$n', 'refreshToken': 'refresh-$n'});
      }
      calls.add('${request.method}:${request.headers['Authorization']}');
      if (request.method == 'DELETE') { arrived.complete(); await release.future; return jsonResponse({'success': true}); }
      return jsonResponse({'registration': {'id': 'opaque'}});
    }));
    final lifecycle = NativePushLifecycle(service, source);
    cleanup(service, lifecycle, source);
    await service.verifyOtp('old', '123456');
    final old = expectLater(lifecycle.disable(), throwsStateError);
    await arrived.future;
    await service.verifyOtp('new', '123456');
    final enabling = lifecycle.enable();
    release.complete();
    await old;
    expect(await enabling, true);
    expect(jsonDecode(store.value!)['refreshToken'], 'refresh-2');
    expect(service.pushRemovalPending, false);
    expect(source.running, true);
    expect(calls, ['DELETE:Bearer access-1', 'PUT:Bearer access-2']);
  });

  test('serialized intent writes cannot overwrite replacement native credentials', () async {
    final store = ControlledPreferenceStore();
    var verifications = 0;
    final service = api(store, MockClient((_) async {
      final n = ++verifications;
      return jsonResponse({'accessToken': 'access-$n', 'refreshToken': 'refresh-$n'});
    }));
    addTearDown(service.dispose);
    await service.verifyOtp('old', '123456');
    store.entered = Completer<void>(); store.release = Completer<void>();
    final remembering = expectLater(service.rememberPushRemoval(service.pushSessionGeneration), throwsStateError);
    await store.entered!.future;
    final replacement = service.verifyOtp('new', '123456');
    store.release!.complete();
    await remembering;
    await replacement;
    expect(jsonDecode(store.value!), {'accessToken': 'access-2', 'refreshToken': 'refresh-2'});
    expect(service.pushRemovalPending, false);
  });

  test('malformed persisted intent fails closed; older two-field sessions remain compatible', () async {
    final store = MemorySessionStore()..value = jsonEncode({
      'accessToken': 'saved', 'refreshToken': 'saved-refresh', 'pushRemovalPending': 'invalid'});
    var requests = 0;
    final service = api(store, MockClient((_) async {
      requests++;
      return jsonResponse({'accessToken': 'new', 'refreshToken': 'new-refresh'});
    }));
    addTearDown(service.dispose);
    expect(await service.restoreSession(), false);
    expect(requests, 0);
    expect(store.value, isNull);
    store.value = jsonEncode({'accessToken': 'saved', 'refreshToken': 'saved-refresh'});
    expect(await service.restoreSession(), true);
    expect(service.pushRemovalPending, false);
    expect(requests, 1);
  });

  test('logout clears pending intent with the revoked native session', () async {
    final store = MemorySessionStore();
    final source = FakePushSource();
    final service = api(store, MockClient((request) async {
      if (request.url.path == '/auth/native/verify') {
        return jsonResponse({'accessToken': 'first', 'refreshToken': 'refresh'});
      }
      if (request.url.path == '/auth/logout') { return jsonResponse({'success': true}); }
      return jsonResponse({}, 503);
    }));
    final lifecycle = NativePushLifecycle(service, source);
    cleanup(service, lifecycle, source);
    await service.verifyOtp('old', '123456');
    await expectLater(lifecycle.disable(), throwsStateError);
    await lifecycle.signOut();
    await service.logout();
    expect(service.pushRemovalPending, false);
    expect(store.value, isNull);
    expect(await lifecycle.resumeExisting(), false);
  });

  test('APNs wait during explicit opt-in keeps durable intent until PUT, with no implicit permission request', () async {
    final store = MemorySessionStore();
    final source = FakePushSource()..token = null;
    final calls = <String>[];
    final service = api(store, MockClient((request) async {
      if (request.url.path == '/auth/native/verify') {
        return jsonResponse({'accessToken': 'first', 'refreshToken': 'refresh'});
      }
      calls.add(request.method);
      return request.method == 'DELETE' ? jsonResponse({}, 503)
        : jsonResponse({'registration': {'id': 'opaque'}});
    }));
    final lifecycle = NativePushLifecycle(service, source);
    cleanup(service, lifecycle, source);
    await service.verifyOtp('old', '123456');
    await expectLater(lifecycle.disable(), throwsStateError);
    expect(await lifecycle.enable(), false);
    expect(service.pushRemovalPending, true);
    expect(jsonDecode(store.value!)['pushRemovalPending'], true);
    source.token = 'fictional-provider-token-123';
    expect(await lifecycle.resumeExisting(), true);
    expect(service.pushRemovalPending, false);
    expect(source.permissionRequests, 1);
    expect(calls, ['DELETE', 'PUT']);
  });

  test('delayed durable acknowledgement cannot erase a newer account credential record', () async {
    final store = ControlledPreferenceStore();
    var verifications = 0;
    final service = api(store, MockClient((_) async {
      final n = ++verifications;
      return jsonResponse({'accessToken': 'access-$n', 'refreshToken': 'refresh-$n'});
    }));
    addTearDown(service.dispose);
    await service.verifyOtp('old', '123456');
    await service.rememberPushRemoval(service.pushSessionGeneration);
    store.entered = Completer<void>(); store.release = Completer<void>();
    final clearing = expectLater(service.confirmPushRemoval(service.pushSessionGeneration), throwsStateError);
    await store.entered!.future;
    final replacement = service.verifyOtp('new', '123456');
    store.release!.complete();
    await clearing;
    await replacement;
    expect(jsonDecode(store.value!), {'accessToken': 'access-2', 'refreshToken': 'refresh-2'});
    expect(service.pushRemovalPending, false);
  });


  test('unconfirmed successful HTTP PUT cannot erase unresolved removal intent', () async {
    final store = MemorySessionStore();
    final source = FakePushSource();
    final service = api(store, MockClient((request) async {
      if (request.url.path == '/auth/native/verify') {
        return jsonResponse({'accessToken': 'first', 'refreshToken': 'refresh'});
      }
      return request.method == 'DELETE' ? jsonResponse({}, 503) : jsonResponse(<String, dynamic>{});
    }));
    final lifecycle = NativePushLifecycle(service, source);
    cleanup(service, lifecycle, source);
    await service.verifyOtp('old', '123456');
    await expectLater(lifecycle.disable(), throwsStateError);
    await expectLater(lifecycle.enable(), throwsStateError);
    expect(service.pushRemovalPending, true);
    expect(jsonDecode(store.value!)['pushRemovalPending'], true);
  });

}
