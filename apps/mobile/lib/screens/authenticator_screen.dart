import 'package:flutter/material.dart';
import '../services/genealogy_api_service.dart';

/// Keeps authenticator material in this route's memory only.
class AuthenticatorScreen extends StatefulWidget {
  final GenealogyApiService apiService;
  final Widget Function() child;
  const AuthenticatorScreen({super.key, required this.apiService, required this.child});
  @override
  State<AuthenticatorScreen> createState() => _AuthenticatorScreenState();
}

class _AuthenticatorScreenState extends State<AuthenticatorScreen> {
  final _code = TextEditingController();
  Map<String, dynamic>? _status;
  String? _secret;
  List<String>? _recoveryCodes;
  String? _error;
  bool _busy = false;
  bool _recovery = false;
  bool _complete = false;
  @override
  void initState() { super.initState(); _load(); }
  @override
  void dispose() { _code.clear(); _code.dispose(); _secret = null; _recoveryCodes = null; super.dispose(); }

  Future<void> _load() async {
    setState(() { _busy = true; _error = null; });
    try {
      final value = await widget.apiService.requestJson('/auth/mfa/status');
      if (value is! Map<String, dynamic> || value['required'] is! bool || value['verified'] is! bool || value['enrolled'] is! bool) {
        throw const FormatException('Invalid security status');
      }
      if (mounted) { setState(() { _status = value; _complete = value['required'] == false || value['verified'] == true; }); }
    } catch (_) {
      if (mounted) { setState(() => _error = 'Security status could not be checked. Please retry.'); }
    } finally { if (mounted) { setState(() => _busy = false); } }
  }

  Future<void> _submit() async {
    final owner = widget.apiService.chatAccountId;
    setState(() { _busy = true; _error = null; });
    try {
      final enrolling = _status?['enrolled'] == false;
      final operation = enrolling ? (_secret == null ? 'enroll' : 'confirm') : (_recovery ? 'recover' : 'verify');
      final value = await widget.apiService.requestJson('/auth/mfa/$operation', method: 'POST',
        data: operation == 'enroll' ? {} : {'code': _code.text.trim()});
      if (!mounted || owner != widget.apiService.chatAccountId) { return; }
      if (operation == 'enroll') {
        if (value is! Map || value['secret'] is! String) { throw const FormatException('Invalid setup response'); }
        setState(() => _secret = value['secret'] as String);
      } else if (operation == 'confirm') {
        if (value is! Map || value['recoveryCodes'] is! List) { throw const FormatException('Invalid recovery response'); }
        final codes = List<String>.from(value['recoveryCodes'] as List);
        _code.clear();
        setState(() { _secret = null; _recoveryCodes = codes; });
      } else {
        _code.clear();
        await _load();
      }
    } catch (_) {
      if (mounted) { setState(() => _error = 'Verification failed. Check the code or retry later.'); }
    } finally { if (mounted) { setState(() => _busy = false); } }
  }

  @override
  Widget build(BuildContext context) {
    if (_complete) { return widget.child(); }
    final setup = _status?['enrolled'] == false;
    final valid = RegExp(_recovery ? r'^[a-f0-9]{32}$' : r'^\d{6}$').hasMatch(_code.text.trim());
    return Scaffold(
      appBar: AppBar(title: const Text('Security verification / सुरक्षा प्रमाणीकरण'), actions: [
        IconButton(tooltip: 'Sign out', onPressed: _busy ? null : () async {
          try { await widget.apiService.logout(); } catch (_) { /* Local session is cleared by the service. */ }
        }, icon: const Icon(Icons.logout)),
      ]),
      body: ListView(padding: const EdgeInsets.all(20), children: [
        if (_busy) const LinearProgressIndicator(),
        if (_error != null) Text(_error!, style: const TextStyle(color: Colors.red)),
        if (_status == null) ElevatedButton(onPressed: _busy ? null : _load, child: const Text('Retry security check')),
        if (_recoveryCodes != null) ...[
          const Text('Save these recovery codes offline in a safe place. Each works once after phone sign-in. If all credentials are lost, phone sign-in alone cannot restore access.'),
          ..._recoveryCodes!.map((code) => Text(code)),
          ElevatedButton(onPressed: () { setState(() { _recoveryCodes = null; }); _load(); }, child: const Text('I saved the codes — continue')),
        ] else if (_status != null) ...[
          Text(setup ? 'Set up a time-based authenticator for Kashyap.' : 'Enter your authenticator code to continue.'),
          if (_secret != null) ...[
            const Text('Enter this setup key in your authenticator. Setup expires after 10 minutes.'),
            Text(_secret!),
            TextButton(onPressed: _busy ? null : () {
              _code.clear();
              setState(() => _secret = null);
              _submit();
            }, child: const Text('Restart expired setup')),
          ],
          if (!setup || _secret != null) TextField(controller: _code, autocorrect: false, enableSuggestions: false,
            keyboardType: _recovery ? TextInputType.text : TextInputType.number,
            decoration: InputDecoration(labelText: _recovery ? 'Recovery code' : '6-digit authenticator code'),
            onChanged: (_) => setState(() {})),
          if (!setup) TextButton(onPressed: _busy ? null : () { _code.clear(); setState(() => _recovery = !_recovery); },
            child: Text(_recovery ? 'Use authenticator' : 'Use recovery code')),
          ElevatedButton(onPressed: _busy || ((!setup || _secret != null) && !valid) ? null : _submit,
            child: Text(setup && _secret == null ? 'Set up authenticator' : 'Verify')),
        ],
      ]),
    );
  }
}
