import 'dart:async';
import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/testing.dart';
import 'package:kashyap_mobile/services/genealogy_api_service.dart';
import 'package:kashyap_mobile/services/native_push_lifecycle.dart';
import 'native_session_test.dart' show MemorySessionStore, jsonResponse;
import 'chat_outbox_test.dart' show MemoryChatOutboxStore;

class FakePushSource implements PushTokenSource {
  final changes = StreamController<String>.broadcast(sync: true);
  String? token = 'fictional-provider-token-123';
  bool allowed = true;
  bool running = false;
  int permissionRequests = 0, stops = 0;
  Future<String?> Function()? readToken;

  @override
  Future<bool> permissionGranted({bool request = false}) async {
    if (request) { permissionRequests++; }
    return allowed;
  }
  @override
  Future<String?> currentToken() async {
    final value = readToken == null ? token : await readToken!();
    running = true; // Models auto-init being enabled after delayed SDK work.
    return value;
  }
  @override
  Stream<String> get tokenChanges => changes.stream;
  @override
  Future<void> stop() async { stops++; running = false; }
}

void main() {
  GenealogyApiService api(MockClient client) => GenealogyApiService(client: client,
    sessionStore: MemorySessionStore(), chatOutboxStore: MemoryChatOutboxStore());

  test('fresh family does not request permission or register without explicit opt-in', () async {
    final source = FakePushSource();
    final methods = <String>[];
    final service = api(MockClient((request) async {
      methods.add(request.method);
      expect(request.headers['Authorization'], 'Bearer first');
      return jsonResponse({'registration': null});
    }))..setAuthToken('first');
    final lifecycle = NativePushLifecycle(service, source);
    addTearDown(() async { await lifecycle.close(); await source.changes.close(); service.dispose(); });
    expect(await lifecycle.resumeExisting(), false);
    expect(methods, ['GET']);
    expect(source.permissionRequests, 0);
    expect(source.stops, 1);
  });

  test('explicit opt-in registers and token refresh updates the same session', () async {
    final source = FakePushSource();
    final tokens = <String>[];
    final service = api(MockClient((request) async {
      expect(request.method, 'PUT');
      expect(request.headers['Authorization'], 'Bearer first');
      tokens.add(jsonDecode(request.body)['token'] as String);
      return jsonResponse({'registration': {'id': 'opaque'}});
    }))..setAuthToken('first');
    final lifecycle = NativePushLifecycle(service, source);
    addTearDown(() async { await lifecycle.close(); await source.changes.close(); service.dispose(); });
    expect(await lifecycle.enable(), true);
    source.changes.add('fictional-provider-token-456');
    await Future<void>.delayed(Duration.zero);
    expect(tokens, ['fictional-provider-token-123', 'fictional-provider-token-456']);
    expect(source.permissionRequests, 1);
  });

  test('replacement session fences delayed token acquisition', () async {
    final source = FakePushSource();
    final pending = Completer<String?>();
    source.readToken = () => pending.future;
    var requests = 0;
    final service = api(MockClient((_) async { requests++; return jsonResponse({}); }))..setAuthToken('first');
    final lifecycle = NativePushLifecycle(service, source);
    addTearDown(() async { await lifecycle.close(); await source.changes.close(); service.dispose(); });
    final enabling = lifecycle.enable();
    await Future<void>.delayed(Duration.zero);
    service.setAuthToken('second');
    pending.complete('fictional-provider-token-123');
    expect(await enabling, false);
    expect(requests, 0);
  });

  for (final operation in ['signOut', 'disable', 'close']) {
    test('$operation drains delayed SDK activation before stopping it', () async {
      final source = FakePushSource();
      final entered = Completer<void>(), token = Completer<String?>();
      source.readToken = () { entered.complete(); return token.future; };
      final methods = <String>[];
      final service = api(MockClient((request) async {
        methods.add(request.method);
        return jsonResponse({'success': true});
      }))..setAuthToken('first');
      final lifecycle = NativePushLifecycle(service, source);
      addTearDown(() async { await lifecycle.close(); await source.changes.close(); service.dispose(); });
      final enabling = lifecycle.enable();
      await entered.future;
      var stopped = false;
      final stopping = (operation == 'signOut' ? lifecycle.signOut()
        : operation == 'disable' ? lifecycle.disable() : lifecycle.close())
        .then((_) => stopped = true);
      await Future<void>.delayed(Duration.zero);
      expect(await lifecycle.resumeExisting(), false);
      expect(stopped, false);
      expect(source.stops, 0);
      token.complete('fictional-provider-token-123');
      expect(await enabling, false);
      await stopping;
      expect(source.running, false);
      expect(source.stops, 1);
      expect(methods, operation == 'disable' ? ['DELETE'] : isEmpty);
      source.changes.add('fictional-provider-token-456');
      await Future<void>.delayed(Duration.zero);
      expect(methods, operation == 'disable' ? ['DELETE'] : isEmpty);
    });
  }

  test('failed registration deletion still shuts down the SDK', () async {
    final source = FakePushSource();
    final service = api(MockClient((request) async => request.method == 'DELETE'
      ? jsonResponse({'message': 'Unavailable'}, 503)
      : jsonResponse({'registration': {'id': 'opaque'}})))..setAuthToken('first');
    final lifecycle = NativePushLifecycle(service, source);
    addTearDown(() async { await lifecycle.close(); await source.changes.close(); service.dispose(); });
    expect(await lifecycle.enable(), true);
    expect(source.running, true);
    await expectLater(lifecycle.disable(), throwsA(isA<StateError>()));
    expect(source.running, false);
    expect(source.stops, 1);
    expect(await lifecycle.resumeExisting(), false);
  });

  test('new explicit session activation supersedes queued old-session shutdown', () async {
    final source = FakePushSource();
    final entered = Completer<void>(), token = Completer<String?>();
    source.readToken = () { entered.complete(); return token.future; };
    final calls = <String>[];
    final service = api(MockClient((request) async {
      calls.add('${request.method}:${request.headers['Authorization']}');
      return jsonResponse({'registration': {'id': 'opaque'}});
    }))..setAuthToken('first');
    final lifecycle = NativePushLifecycle(service, source);
    addTearDown(() async { await lifecycle.close(); await source.changes.close(); service.dispose(); });
    final oldEnable = lifecycle.enable();
    await entered.future;
    final oldStop = lifecycle.signOut();
    service.setAuthToken('second');
    final newEnable = lifecycle.enable();
    source.readToken = null;
    token.complete('fictional-provider-token-123');
    expect(await oldEnable, false);
    await oldStop;
    expect(await newEnable, true);
    expect(source.running, true);
    expect(source.stops, 0);
    expect(calls, ['PUT:Bearer second']);
  });

  test('closed lifecycle cannot restart permission or token acquisition', () async {
    final source = FakePushSource();
    var requests = 0;
    final service = api(MockClient((_) async { requests++; return jsonResponse({}); }))..setAuthToken('first');
    final lifecycle = NativePushLifecycle(service, source);
    addTearDown(() async { await source.changes.close(); service.dispose(); });
    await lifecycle.close();
    await lifecycle.close();
    expect(await lifecycle.resumeExisting(), false);
    await expectLater(lifecycle.enable(), throwsStateError);
    expect(source.permissionRequests, 0);
    expect(source.stops, 1);
    expect(requests, 0);
  });

  test('permission withdrawal removes existing registration and stops source', () async {
    final source = FakePushSource()..allowed = false;
    final methods = <String>[];
    final service = api(MockClient((request) async {
      methods.add(request.method);
      if (request.method == 'GET') { return jsonResponse({'registration': {'id': 'opaque'}}); }
      return jsonResponse({'success': true});
    }))..setAuthToken('first');
    final lifecycle = NativePushLifecycle(service, source);
    addTearDown(() async { await lifecycle.close(); await source.changes.close(); service.dispose(); });
    expect(await lifecycle.resumeExisting(), false);
    expect(methods, ['GET', 'DELETE']);
    expect(source.stops, 1);
  });

  test('account switch prevents refresh events from binding old subscription to new family', () async {
    final source = FakePushSource();
    final calls = <String>[];
    final service = api(MockClient((request) async {
      calls.add('${request.method}:${request.headers['Authorization']}');
      return jsonResponse({'registration': {'id': 'opaque'}});
    }))..setAuthToken('first');
    final lifecycle = NativePushLifecycle(service, source);
    addTearDown(() async { await lifecycle.close(); await source.changes.close(); service.dispose(); });
    expect(await lifecycle.enable(), true);
    service.setAuthToken('second');
    source.changes.add('fictional-provider-token-789');
    await Future<void>.delayed(Duration.zero);
    expect(calls, ['PUT:Bearer first']);
  });

  test('disable waits for an in-flight token rotation before deleting registration', () async {
    final source = FakePushSource();
    final arrived = Completer<void>(), release = Completer<void>();
    final methods = <String>[];
    final service = api(MockClient((request) async {
      methods.add(request.method);
      if (request.method == 'PUT' && methods.length == 2) {
        arrived.complete();
        await release.future;
      }
      return jsonResponse(request.method == 'DELETE'
        ? {'success': true} : {'registration': {'id': 'opaque'}});
    }))..setAuthToken('first');
    final lifecycle = NativePushLifecycle(service, source);
    addTearDown(() async { await lifecycle.close(); await source.changes.close(); service.dispose(); });
    expect(await lifecycle.enable(), true);
    source.changes.add('fictional-provider-token-456');
    await arrived.future;
    final disabling = lifecycle.disable();
    await Future<void>.delayed(Duration.zero);
    expect(methods, ['PUT', 'PUT']);
    release.complete();
    await disabling;
    expect(methods, ['PUT', 'PUT', 'DELETE']);
    expect(source.stops, 1);
  });
}
