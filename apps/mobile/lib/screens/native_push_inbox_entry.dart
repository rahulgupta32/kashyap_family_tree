import 'package:flutter/material.dart';
import '../services/genealogy_api_service.dart';
import '../services/native_push_inbox_router.dart';
import 'notification_inbox_screen.dart';

/// Lives below authentication/MFA and uses the authenticated route's navigator.
class NativePushInboxEntry extends StatefulWidget {
  final GenealogyApiService apiService;
  final NativePushInboxRouter router;
  final Widget child;
  final Future<bool> Function()? onEnablePush;
  final Future<void> Function()? onDisablePush;
  const NativePushInboxEntry({super.key, required this.apiService,
    required this.router, required this.child, this.onEnablePush, this.onDisablePush});

  @override
  State<NativePushInboxEntry> createState() => _NativePushInboxEntryState();
}

class _NativePushInboxEntryState extends State<NativePushInboxEntry> {
  late final int _generation;
  late final void Function() _detach;
  bool _inboxOpen = false;

  bool get _current => mounted && widget.apiService.authToken != null &&
      _generation == widget.apiService.pushSessionGeneration;

  @override
  void initState() {
    super.initState();
    _generation = widget.apiService.pushSessionGeneration;
    _detach = widget.router.attach(openInbox: _open, prompt: _prompt);
  }

  void _open() {
    if (!_current || _inboxOpen) { return; }
    _inboxOpen = true; // Coalesce both queued frames and an already open route.
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      if (!_current) { _inboxOpen = false; return; }
      ScaffoldMessenger.of(context).hideCurrentSnackBar();
      await Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) =>
        NotificationInboxScreen(apiService: widget.apiService,
          onEnablePush: widget.onEnablePush, onDisablePush: widget.onDisablePush)));
      _inboxOpen = false;
    });
    WidgetsBinding.instance.ensureVisualUpdate();
  }

  void _prompt() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!_current || _inboxOpen) { return; }
      final messenger = ScaffoldMessenger.of(context);
      messenger.hideCurrentSnackBar();
      messenger.showSnackBar(SnackBar(
        content: const Text('नयाँ सूचना उपलब्ध छ (New notification available)'),
        action: SnackBarAction(label: 'खोल्नुहोस् (Open)', onPressed: _open),
      ));
    });
    WidgetsBinding.instance.ensureVisualUpdate();
  }

  @override
  void dispose() { _detach(); super.dispose(); }

  @override
  Widget build(BuildContext context) => widget.child;
}
