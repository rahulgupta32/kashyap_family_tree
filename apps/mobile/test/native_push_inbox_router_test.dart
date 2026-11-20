import 'dart:async';
import 'package:flutter_test/flutter_test.dart';
import 'package:kashyap_mobile/services/genealogy_api_service.dart';
import 'package:kashyap_mobile/services/native_push_inbox_router.dart';

class FakeInboxEvents implements PushInboxEventSource {
  final taps = StreamController<void>.broadcast(sync: true);
  final arrivals = StreamController<void>.broadcast(sync: true);
  Future<bool> Function()? readInitial;
  bool initial = false;
  int initialReads = 0;
  @override
  Future<bool> initialOpen() async {
    initialReads++;
    return readInitial == null ? initial : await readInitial!();
  }
  @override
  Stream<void> get opened => taps.stream;
  @override
  Stream<void> get foreground => arrivals.stream;
  Future<void> close() async { await taps.close(); await arrivals.close(); }
}

void main() {
  late GenealogyApiService api;
  late FakeInboxEvents events;
  late NativePushInboxRouter router;
  setUp(() {
    api = GenealogyApiService()..setAuthToken('first');
    events = FakeInboxEvents();
    router = NativePushInboxRouter(api, events);
  });
  tearDown(() async { await router.close(); await events.close(); api.dispose(); });

  test('terminated tap waits for the authenticated MFA child and is consumed once', () async {
    events.initial = true;
    var opens = 0;
    await router.start();
    expect(opens, 0);
    final detach = router.attach(openInbox: () => opens++, prompt: () {});
    expect(opens, 1);
    detach();
    router.attach(openInbox: () => opens++, prompt: () {});
    await router.start();
    expect(opens, 1);
    expect(events.initialReads, 1);
  });

  test('background taps queue once while MFA loads; foreground does not queue', () async {
    var opens = 0, prompts = 0;
    await router.start();
    events.taps.add(null);
    events.taps.add(null);
    events.arrivals.add(null);
    router.attach(openInbox: () => opens++, prompt: () => prompts++);
    expect(opens, 1);
    expect(prompts, 0);
    events.arrivals.add(null);
    expect(prompts, 1);
  });

  test('signed-out initial and stream signals do not transfer to sign-in', () async {
    api.setAuthToken(null);
    events.initial = true;
    var opens = 0, prompts = 0;
    await router.start();
    events.taps.add(null);
    events.arrivals.add(null);
    api.setAuthToken('second');
    router.attach(openInbox: () => opens++, prompt: () => prompts++);
    expect(opens, 0);
    expect(prompts, 0);
    events.taps.add(null);
    expect(opens, 1);
  });

  test('delayed initial signal cannot transfer to replacement credentials', () async {
    final delayed = Completer<bool>();
    events.readInitial = () => delayed.future;
    var opens = 0;
    final starting = router.start();
    api.setAuthToken('second');
    router.attach(openInbox: () => opens++, prompt: () {});
    delayed.complete(true);
    await starting;
    expect(opens, 0);
  });

  test('queued old-session tap and old foreground binding are fenced', () async {
    var opens = 0, prompts = 0;
    await router.start();
    events.taps.add(null);
    api.setAuthToken('second');
    router.attach(openInbox: () => opens++, prompt: () => prompts++);
    expect(opens, 0);
    api.setAuthToken('third');
    events.arrivals.add(null);
    expect(prompts, 0);
  });

  test('disposing an old entry cannot detach a newer entry', () async {
    var old = 0, current = 0;
    await router.start();
    final detach = router.attach(openInbox: () => old++, prompt: () {});
    router.attach(openInbox: () => current++, prompt: () {});
    detach();
    events.taps.add(null);
    expect(old, 0);
    expect(current, 1);
  });

  test('provider initial/stream errors leave ordinary navigation available', () async {
    events.readInitial = () async => throw StateError('private-provider-detail');
    var opens = 0;
    router.attach(openInbox: () => opens++, prompt: () {});
    await router.start();
    events.taps.addError(StateError('private-provider-detail'));
    events.arrivals.addError(StateError('private-provider-detail'));
    events.taps.add(null);
    expect(opens, 1);
  });

  test('closed router rejects late initial results and cancels stream listeners', () async {
    final delayed = Completer<bool>();
    events.readInitial = () => delayed.future;
    var opens = 0;
    router.attach(openInbox: () => opens++, prompt: () {});
    final starting = router.start();
    await router.close();
    delayed.complete(true);
    await starting;
    events.taps.add(null);
    events.arrivals.add(null);
    expect(opens, 0);
    expect(events.taps.hasListener, false);
    expect(events.arrivals.hasListener, false);
  });
}
