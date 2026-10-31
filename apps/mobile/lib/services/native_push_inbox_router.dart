import 'dart:async';
import 'genealogy_api_service.dart';

/// Provider messages are reduced to signals before reaching navigation.
abstract class PushInboxEventSource {
  Future<bool> initialOpen();
  Stream<void> get opened;
  Stream<void> get foreground;
}

/// Retains at most one tap for the current session while its MFA gate loads.
/// No provider payload, credential or private destination is retained here.
class NativePushInboxRouter {
  final GenealogyApiService api;
  final PushInboxEventSource source;
  StreamSubscription<void>? _opened;
  StreamSubscription<void>? _foreground;
  void Function()? _openInbox;
  void Function()? _prompt;
  int? _bindingGeneration;
  int? _pendingGeneration;
  bool _started = false;
  bool _closed = false;

  NativePushInboxRouter(this.api, this.source);

  bool _current(int? generation) => !_closed && generation != null &&
      api.authToken != null && generation == api.pushSessionGeneration;

  /// Call once after the launch session restoration settles, even signed out.
  /// This consumes a cold-launch tap without carrying it into a later sign-in.
  Future<void> start() async {
    if (_started || _closed) { return; }
    _started = true;
    final generation = api.authToken == null ? null : api.pushSessionGeneration;
    try {
      _opened = source.opened.listen((_) => _tap(
        api.authToken == null ? null : api.pushSessionGeneration), onError: (Object _) {});
      _foreground = source.foreground.listen((_) {
        if (_current(_bindingGeneration)) { _prompt?.call(); }
      }, onError: (Object _) {});
      final opened = await source.initialOpen().timeout(const Duration(seconds: 10));
      if (opened) { _tap(generation); }
    } catch (_) { /* Ordinary startup remains available without provider events. */ }
  }

  void _tap(int? generation) {
    if (!_current(generation)) { return; }
    if (_bindingGeneration == generation && _openInbox != null) {
      _openInbox!();
    } else {
      _pendingGeneration = generation;
    }
  }

  /// Attach only from the child of the completed authenticator gate.
  void Function() attach({required void Function() openInbox, required void Function() prompt}) {
    final generation = api.authToken == null ? null : api.pushSessionGeneration;
    _bindingGeneration = generation;
    _openInbox = openInbox;
    _prompt = prompt;
    if (_current(generation) && _pendingGeneration == generation) {
      _pendingGeneration = null;
      openInbox();
    } else {
      _pendingGeneration = null;
    }
    return () {
      if (identical(_openInbox, openInbox)) {
        _bindingGeneration = null;
        _openInbox = null;
        _prompt = null;
      }
    };
  }

  Future<void> close() async {
    _closed = true;
    _pendingGeneration = null;
    _bindingGeneration = null;
    _openInbox = null;
    _prompt = null;
    await _opened?.cancel();
    await _foreground?.cancel();
  }
}
