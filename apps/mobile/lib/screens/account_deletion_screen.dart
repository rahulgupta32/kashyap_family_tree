import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../localization/account_deletion_labels.dart';
import '../services/genealogy_api_service.dart';

class AccountDeletionScreen extends StatefulWidget {
  final GenealogyApiService api;
  const AccountDeletionScreen({super.key, required this.api});
  @override
  State<AccountDeletionScreen> createState() => _AccountDeletionScreenState();
}

class _AccountDeletionScreenState extends State<AccountDeletionScreen> {
  final _code = TextEditingController();
  late final GenealogyApiService _api;
  late final int _generation;
  String? _challenge, _error;
  bool _busy = false, _confirmed = false, _expired = false, _completed = false;
  bool get _current => mounted && !_expired && identical(widget.api, _api) &&
    _api.authToken != null && _api.pushSessionGeneration == _generation;
  @override
  void initState() {
    super.initState(); _api = widget.api; _generation = _api.pushSessionGeneration;
    _api.sessionChanges.addListener(_changed);
  }
  void _changed() {
    if (!_current && mounted) {
      _code.clear();
      setState(() { _expired = true; _completed = false; _challenge = null;
        _confirmed = false; _busy = false; _error = accountDeletionLabels['session']; });
    }
  }
  @override
  void didUpdateWidget(covariant AccountDeletionScreen oldWidget) { super.didUpdateWidget(oldWidget); _changed(); }
  @override
  void dispose() { _api.sessionChanges.removeListener(_changed); _code.dispose(); super.dispose(); }
  Future<void> _request() async {
    if (!_current || _busy) return;
    setState(() { _busy = true; _error = null; _challenge = null; _confirmed = false; _code.clear(); });
    try {
      final result = await _api.requestJson('/me/delete-challenge', method: 'POST', data: {});
      if (!_current) return;
      if (result is! Map || result['challengeId'] is! String || (result['challengeId'] as String).isEmpty ||
          result['expiresAt'] is! String || DateTime.tryParse(result['expiresAt'] as String) == null ||
          !DateTime.parse(result['expiresAt'] as String).isAfter(DateTime.now())) {
        throw const FormatException('Unconfirmed challenge');
      }
      setState(() => _challenge = result['challengeId'] as String);
    } catch (_) { if (_current) setState(() => _error = accountDeletionLabels['unconfirmed']); }
    finally { if (_current) setState(() => _busy = false); }
  }
  Future<void> _delete() async {
    if (!_current || _busy || !_confirmed || _challenge == null || !RegExp(r'^\d{6}$').hasMatch(_code.text)) return;
    setState(() { _busy = true; _error = null; });
    try {
      await _api.deleteOwnAccount(challengeId: _challenge!, otp: _code.text);
      if (!mounted || !identical(widget.api, _api) || _api.authToken != null ||
          _api.pushSessionGeneration != _generation + 1) { return; }
      _code.clear();
      setState(() { _completed = true; _challenge = null; _confirmed = false; _error = null; });
    } catch (_) { if (_current) setState(() => _error = accountDeletionLabels['unconfirmed']); }
    finally { if (mounted) setState(() => _busy = false); }
  }
  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: Text(accountDeletionLabels['title']!)),
    body: ListView(padding: const EdgeInsets.all(16), children: [
      Text(accountDeletionLabels['explanation']!),
      if (_error != null) Semantics(liveRegion: true, child: Text(_error!)),
      if (_busy) const Center(child: CircularProgressIndicator()),
      if (_completed) ...[
        Semantics(liveRegion: true, child: Text(accountDeletionLabels['done']!)),
        TextButton(onPressed: () => Navigator.of(context).popUntil((route) => route.isFirst), child: Text(accountDeletionLabels['return']!)),
      ] else if (_current) ...[
        ElevatedButton(key: const Key('deletion-request'), onPressed: _busy ? null : _request, child: Text(accountDeletionLabels['request']!)),
        if (_challenge != null) ...[
          TextField(key: const Key('deletion-code'), controller: _code, enabled: !_busy,
            keyboardType: TextInputType.number, obscureText: true, enableSuggestions: false, autocorrect: false,
            inputFormatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(6)],
            decoration: InputDecoration(labelText: accountDeletionLabels['code']), onChanged: (_) => setState(() {})),
          CheckboxListTile(key: const Key('deletion-confirm'), value: _confirmed, title: Text(accountDeletionLabels['confirm']!),
            onChanged: _busy ? null : (value) { if (_current && !_busy) setState(() => _confirmed = value == true); }),
          ElevatedButton(key: const Key('deletion-submit'), onPressed: _busy || !_confirmed || _code.text.length != 6 ? null : _delete,
            child: Text(accountDeletionLabels['delete']!)),
        ],
      ],
    ]),
  );
}
