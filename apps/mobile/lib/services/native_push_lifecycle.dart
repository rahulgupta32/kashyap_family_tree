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
  bool _closed = false;
  int _enabling = 0;
  int? _stoppedGeneration;
  Future<void> _writes = Future<void>.value();
  Future<void> _sourceWork = Future<void>.value();

  NativePushLifecycle(this.api, this.source);

  bool _current(int epoch, int generation) => !_closed && epoch == _epoch &&
      generation == api.pushSessionGeneration && api.authToken != null;

  Future<T> _serialize<T>(Future<T> Function() action) {
    final pending = _writes.then((_) => action());
    _writes = pending.then<void>((_) {}, onError: (Object _, StackTrace __) {});
    return pending;
  }

  // SDK token acquisition may enable persistent auto-init after an await.
  // Order shutdown behind *all* prior provider work, independently of HTTP.
  Future<T> _withSource<T>(Future<T> Function() action) {
    final pending = _sourceWork.then((_) => action());
    _sourceWork = pending.then<void>((_) {}, onError: (Object _, StackTrace __) {});
    return pending;
  }

  Future<void> _cancelChanges() async {
    final changes = _changes;
    _changes = null;
    await changes?.cancel();
  }

  Future<bool> resumeExisting() async {
    if (_closed || api.authToken == null) { return false; }
    if (_stoppedGeneration == api.pushSessionGeneration) { return false; }
    if (_enabling > 0) { return false; }
    final epoch = ++_epoch, generation = api.pushSessionGeneration;
    await _writes;
    if (!_current(epoch, generation)) { return false; }
    final response = await api.currentPushRegistration();
    if (!_current(epoch, generation)) { return false; }
    if (response is! Map || response['registration'] == null) {
      _enabled = false;
      await _cancelChanges();
      await _withSource<void>(() async {
        if (_current(epoch, generation)) { await source.stop(); }
      });
      return false;
    }
    return _activate(epoch, generation, requestPermission: false);
  }

  Future<bool> enable() async {
    if (_closed) { throw StateError('Push lifecycle is closed'); }
    if (api.authToken == null) { throw StateError('Sign in to enable push'); }
    _stoppedGeneration = null; // Only a new explicit opt-in can undo this stop.
    final epoch = ++_epoch, generation = api.pushSessionGeneration;
    _enabling++;
    try { return await _activate(epoch, generation, requestPermission: true); }
    finally { _enabling--; }
  }

  Future<bool> _activate(int epoch, int generation, {required bool requestPermission}) async {
    final allowed = await _withSource<bool>(() async =>
      _current(epoch, generation) && await source.permissionGranted(request: requestPermission));
    if (!allowed) {
      if (_current(epoch, generation)) { await disable(); }
      return false;
    }
    if (!_current(epoch, generation)) { return false; }
    final token = await _withSource<String?>(() async =>
      _current(epoch, generation) ? await source.currentToken() : null);
    if (!_current(epoch, generation)) { return false; }
    if (token == null) { return false; } // APNs may not be ready yet.
    await _serialize<void>(() async {
      if (_current(epoch, generation)) { await api.registerPushToken(token); }
    });
    if (!_current(epoch, generation)) { return false; }
    await _cancelChanges();
    if (!_current(epoch, generation)) { return false; }
    _enabled = true;
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
      final allowed = await _withSource<bool>(() async =>
        _enabled && _current(epoch, generation) && await source.permissionGranted());
      if (!allowed) {
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
    _stoppedGeneration = generation;
    _enabled = false;
    await _cancelChanges();
    // A pending PUT must finish before DELETE, or it could restore a disabled
    // registration. A newer activation supersedes this deletion.
    await _serialize<void>(() async {
      if (!_current(epoch, generation)) { return; }
      try { await api.removePushRegistration(); }
      finally {
        await _withSource<void>(() async {
          if (_current(epoch, generation)) { await source.stop(); }
        });
      }
    });
  }

  Future<void> signOut() async {
    final epoch = ++_epoch;
    _stoppedGeneration = api.pushSessionGeneration;
    _enabled = false;
    await _cancelChanges();
    try {
      await _writes;
      await _withSource<void>(() async { if (epoch == _epoch) { await source.stop(); } });
    }
    catch (_) { /* Server logout still revokes this session family. */ }
  }

  Future<void> close() async {
    if (_closed) { return; }
    _closed = true;
    final epoch = ++_epoch;
    _enabled = false;
    await _cancelChanges();
    await _withSource<void>(() async { if (epoch == _epoch) { await source.stop(); } });
  }
}
