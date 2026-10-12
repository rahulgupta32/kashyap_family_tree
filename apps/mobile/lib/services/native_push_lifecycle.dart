import 'dart:async';
import 'genealogy_api_service.dart';

abstract class PushTokenSource {
  Future<bool> permissionGranted({bool request = false});
  Future<String?> currentToken();
  Stream<String> get tokenChanges;
  Future<void> stop();
}

/// Binds provider events to the *current* native session. The server validates
/// account/session authority again for each registration.
class NativePushLifecycle {
  final GenealogyApiService api;
  final PushTokenSource source;
  StreamSubscription<String>? _changes;
  int _epoch = 0;
  bool _enabled = false;
  bool _enabling = false;
  Future<void> _writes = Future<void>.value();

  NativePushLifecycle(this.api, this.source);

  bool _current(int epoch, int generation) => epoch == _epoch &&
      generation == api.pushSessionGeneration && api.authToken != null;

  Future<T> _serialize<T>(Future<T> Function() action) {
    final pending = _writes.then((_) => action());
    _writes = pending.then<void>((_) {}, onError: (Object _, StackTrace __) {});
    return pending;
  }

  Future<bool> resumeExisting() async {
    if (api.authToken == null) { return false; }
    if (_enabling) { return false; }
    final epoch = ++_epoch, generation = api.pushSessionGeneration;
    await _writes;
    if (!_current(epoch, generation)) { return false; }
    final response = await api.currentPushRegistration();
    if (!_current(epoch, generation)) { return false; }
    if (response is! Map || response['registration'] == null) {
      _enabled = false;
      await _changes?.cancel();
      _changes = null;
      await source.stop();
      return false;
    }
    return _activate(epoch, generation, requestPermission: false);
  }

  Future<bool> enable() async {
    if (api.authToken == null) { throw StateError('Sign in to enable push'); }
    final epoch = ++_epoch, generation = api.pushSessionGeneration;
    _enabling = true;
    try { return await _activate(epoch, generation, requestPermission: true); }
    finally { _enabling = false; }
  }

  Future<bool> _activate(int epoch, int generation, {required bool requestPermission}) async {
    if (!await source.permissionGranted(request: requestPermission)) {
      if (_current(epoch, generation)) { await disable(); }
      return false;
    }
    if (!_current(epoch, generation)) { return false; }
    final token = await source.currentToken();
    if (!_current(epoch, generation)) { return false; }
    if (token == null) { return false; } // APNs may not be ready yet.
    await _serialize<void>(() async {
      if (_current(epoch, generation)) { await api.registerPushToken(token); }
    });
    if (!_current(epoch, generation)) { return false; }
    _enabled = true;
    await _changes?.cancel();
    _changes = source.tokenChanges.listen((next) {
      if (!_enabled || !_current(epoch, generation)) { return; }
      unawaited(_handleRefresh(next, epoch, generation));
    }, onError: (Object _) { /* Retry on foreground reconciliation. */ });
    return true;
  }

  Future<void> _handleRefresh(String next, int epoch, int generation) async {
    try {
      // Permission may be withdrawn while the app stays active. Do not bind a
      // newly rotated credential until the current OS state has been checked.
      if (!await source.permissionGranted()) {
        if (_current(epoch, generation)) { await disable(); }
        return;
      }
      if (_enabled && _current(epoch, generation)) {
        await _serialize<void>(() async {
          if (_enabled && _current(epoch, generation)) { await api.registerPushToken(next); }
        });
      }
    } catch (_) { /* A later foreground sync can retry without exposing next. */ }
  }

  Future<void> disable() async {
    final epoch = ++_epoch, generation = api.pushSessionGeneration;
    _enabled = false;
    await _changes?.cancel();
    _changes = null;
    // A pending PUT must finish before DELETE, or it could restore a disabled
    // registration. A newer activation supersedes this deletion.
    await _serialize<void>(() async {
      if (!_current(epoch, generation)) { return; }
      try { await api.removePushRegistration(); }
      finally { if (_current(epoch, generation)) { await source.stop(); } }
    });
  }

  Future<void> signOut() async {
    final epoch = ++_epoch;
    _enabled = false;
    await _changes?.cancel();
    _changes = null;
    try { await _writes; if (epoch == _epoch) { await source.stop(); } }
    catch (_) { /* Server logout still revokes this session family. */ }
  }

  Future<void> close() async {
    ++_epoch;
    _enabled = false;
    await _changes?.cancel();
    _changes = null;
  }
}
