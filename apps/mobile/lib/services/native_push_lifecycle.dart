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
  int? _pendingActivationGeneration;
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
    if (_enabling > 0) { return false; }
    if (api.pushRemovalPending && _pendingActivationGeneration != api.pushSessionGeneration) {
      final epoch = ++_epoch, generation = api.pushSessionGeneration;
      _stoppedGeneration = generation;
      _enabled = false;
      await _cancelChanges();
      await _serialize<void>(() => _removeRegistration(epoch, generation));
      return false;
    }
    if (_stoppedGeneration == api.pushSessionGeneration) { return false; }
    final epoch = ++_epoch, generation = api.pushSessionGeneration;
    await _writes;
    if (!_current(epoch, generation)) { return false; }
    // An explicit opt-in may still be waiting for APNs or a confirmed PUT.
    // This intent belongs only to the session that requested it.
    if (_pendingActivationGeneration == generation) {
      return _activate(epoch, generation, requestPermission: false);
    }
    final response = await api.currentPushRegistration();
    if (!_current(epoch, generation)) { return false; }
    if (response is! Map || response['registration'] == null) {
      _pendingActivationGeneration = null;
      _enabled = false;
      await _cancelChanges();
      await _withSource<void>(() async {
        if (_current(epoch, generation)) { await source.stop(); }
      });
      return false;
    }
    _pendingActivationGeneration = generation;
    return _activate(epoch, generation, requestPermission: false);
  }

  Future<bool> enable() async {
    if (_closed) { throw StateError('Push lifecycle is closed'); }
    if (api.authToken == null) { throw StateError('Sign in to enable push'); }
    _stoppedGeneration = null; // Only a new explicit opt-in can undo this stop.
    final epoch = ++_epoch, generation = api.pushSessionGeneration;
    _pendingActivationGeneration = generation;
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
    _enabled = false;
    await _cancelChanges();
    if (!_current(epoch, generation)) { return false; }
    // Subscribe before acquisition/registration: rotation can arrive during
    // either await. Buffer the newest value until the first PUT is confirmed.
    String? rotated;
    _changes = source.tokenChanges.listen((next) {
      if (!_current(epoch, generation)) { return; }
      rotated = next;
      if (_enabled) { unawaited(_handleRefresh(next, epoch, generation)); }
    }, onError: (Object _) { /* Retry on foreground reconciliation. */ });
    final token = await _withSource<String?>(() async =>
      _current(epoch, generation) ? await source.currentToken() : null);
    if (!_current(epoch, generation)) { return false; }
    if (token == null) { return false; } // APNs may not be ready yet.
    final stillAllowed = await _withSource<bool>(() async =>
      _current(epoch, generation) && await source.permissionGranted());
    if (!stillAllowed) {
      if (_current(epoch, generation)) { await disable(); }
      return false;
    }
    final currentToken = rotated ?? token;
    await _serialize<void>(() async {
      if (_current(epoch, generation)) {
        final result = await api.registerPushToken(currentToken);
        if (_current(epoch, generation) && api.pushRemovalPending) {
          final registration = result is Map ? result['registration'] : null;
          if (registration is! Map || registration['id'] is! String || (registration['id'] as String).isEmpty) {
            throw StateError('Push activation could not be confirmed');
          }
          await api.confirmPushRemoval(generation); // Only after explicit opt-in PUT confirmation.
        }
      }
    });
    if (!_current(epoch, generation)) { return false; }
    _pendingActivationGeneration = null;
    _enabled = true;
    final latest = rotated;
    if (latest != null && latest != currentToken) {
      await _handleRefresh(latest, epoch, generation);
    }
    return _enabled && _current(epoch, generation);
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
    _pendingActivationGeneration = null;
    _enabled = false;
    await _cancelChanges();
    // A pending PUT must finish before DELETE, or it could restore a disabled
    // registration. A newer activation supersedes this deletion.
    await _serialize<void>(() => _removeRegistration(epoch, generation));
  }

  Future<void> _removeRegistration(int epoch, int generation) async {
    if (!_current(epoch, generation)) { return; }
    try {
      // Persist before HTTP so a killed process can retry the idempotent DELETE.
      // If secure storage is unavailable, still attempt server removal instead
      // of prolonging delivery. Keep the in-memory intent until both the server
      // acknowledgement and a subsequent storage write have been confirmed.
      try { await api.rememberPushRemoval(generation); }
      catch (_) { /* The fixed storage failure must not block a safe DELETE. */ }
      if (!_current(epoch, generation)) { return; }
      final result = await api.removePushRegistration();
      if (!_current(epoch, generation)) { return; }
      if (result is! Map || result['success'] != true) {
        throw StateError('Push removal could not be confirmed');
      }
      await api.confirmPushRemoval(generation);
    } finally {
      await _withSource<void>(() async {
        if (_current(epoch, generation)) { await source.stop(); }
      });
    }
  }

  Future<void> signOut() async {
    final epoch = ++_epoch;
    _stoppedGeneration = api.pushSessionGeneration;
    _pendingActivationGeneration = null;
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
    _pendingActivationGeneration = null;
    final epoch = ++_epoch;
    _enabled = false;
    await _cancelChanges();
    await _withSource<void>(() async { if (epoch == _epoch) { await source.stop(); } });
  }
}
