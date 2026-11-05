import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import '../services/genealogy_api_service.dart';
import '../localization/account_deletion_labels.dart';

class SignInScreen extends StatefulWidget {
  final GenealogyApiService apiService;
  final VoidCallback onSignedIn;
  final VoidCallback onBrowsePublic;
  final bool accountDeletionConfirmed;
  final bool linkEmail;

  const SignInScreen({super.key, required this.apiService,
    required this.onSignedIn, required this.onBrowsePublic, this.accountDeletionConfirmed = false, this.linkEmail = false});

  @override
  State<SignInScreen> createState() => _SignInScreenState();
}

class _SignInScreenState extends State<SignInScreen> {
  final _form = GlobalKey<FormState>();
  final _phone = TextEditingController();
  final _code = TextEditingController();
  String? _otpSessionId;
  String? _error;
  bool _busy = false;
  bool _email = false;
  int _cooldown = 0;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _email = widget.linkEmail;
  }

  void _startCooldown() {
    _timer?.cancel();
    _cooldown = 60;
    _timer = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (!mounted) { timer.cancel(); return; }
      setState(() { _cooldown--; });
      if (_cooldown <= 0) { timer.cancel(); }
    });
  }


  Future<void> _submit() async {
    if (!_form.currentState!.validate()) { return; }
    setState(() { _busy = true; _error = null; });
    try {
      if (_otpSessionId == null) {
        final result = _email
          ? await widget.apiService.requestEmailOtp(_phone.text.trim(), link: widget.linkEmail)
          : await widget.apiService.requestOtp(_phone.text.trim());
        final sessionId = result['otpSessionId'];
        if (sessionId is! String || sessionId.isEmpty) {
          throw const FormatException('OTP session was not returned');
        }
        if (mounted) { setState(() { _otpSessionId = sessionId; _startCooldown(); }); }
      } else {
        if (widget.linkEmail) {
          await widget.apiService.verifyEmailLink(_otpSessionId!, _code.text.trim());
        } else {
          await widget.apiService.verifyOtp(_otpSessionId!, _code.text.trim(), email: _email,
            platform: defaultTargetPlatform == TargetPlatform.iOS ? 'ios' : 'android');
        }
        if (mounted) { widget.onSignedIn(); }
      }
    } catch (error) {
      if (mounted) { setState(() => _error = error.toString().replaceFirst('Exception: ', '')); }
    } finally {
      if (mounted) { setState(() => _busy = false); }
    }
  }

  @override
  void dispose() { _timer?.cancel(); _phone.dispose(); _code.dispose(); super.dispose(); }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('खाता प्रवेश (Sign in)')),
    body: Center(child: SingleChildScrollView(padding: const EdgeInsets.all(24),
      child: ConstrainedBox(constraints: const BoxConstraints(maxWidth: 440),
        child: Form(key: _form, child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          if (widget.accountDeletionConfirmed) Semantics(liveRegion: true, child: Text(accountDeletionLabels['done']!, key: const Key('account-deletion-confirmed'))),
          const Text('कश्यप अधिकारी वंशावली', style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold)),
          const SizedBox(height: 24),
          if (!widget.linkEmail) Wrap(spacing: 8, children: [
            ChoiceChip(label: const Text('मोबाइल (Mobile)'), selected: !_email,
              onSelected: _busy || _otpSessionId != null ? null : (_) => setState(() { _email = false; _phone.clear(); _error = null; })),
            ChoiceChip(key: const Key('sign-in-email-method'), label: const Text('इमेल (Email)'), selected: _email,
              onSelected: _busy || _otpSessionId != null ? null : (_) => setState(() { _email = true; _phone.clear(); _error = null; })),
          ]),
          if (widget.linkEmail) const Text('लगइन गरेपछि ५ मिनेटभित्र इमेल जोड्नुहोस्। (Link within five minutes of signing in.)'),
          TextFormField(key: Key(_email ? 'sign-in-email' : 'sign-in-phone'), controller: _phone,
            enabled: !_busy && _otpSessionId == null, keyboardType: _email ? TextInputType.emailAddress : TextInputType.phone,
            autofillHints: [_email ? AutofillHints.email : AutofillHints.telephoneNumber],
            decoration: InputDecoration(labelText: _email ? 'इमेल (Email address)' : 'फोन नम्बर (Phone number)', hintText: _email ? 'name@example.com' : '+97798XXXXXXXX'),
            validator: (value) => (_email ? RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$') : RegExp(r'^\+?[0-9]{10,15}$')).hasMatch(value?.trim() ?? '')
              ? null : 'सही इमेल वा नम्बर लेख्नुहोस् (Enter a valid email or phone number)'),
          if (_otpSessionId != null) ...[
            const SizedBox(height: 16),
            TextFormField(key: const Key('sign-in-code'), controller: _code, enabled: !_busy,
              keyboardType: TextInputType.number, autofillHints: const [AutofillHints.oneTimeCode],
              decoration: const InputDecoration(labelText: 'प्रमाणीकरण कोड (Verification OTP)'),
              validator: (value) => RegExp(r'^[0-9]{6}$').hasMatch(value?.trim() ?? '')
                ? null : '६ अंकको कोड लेख्नुहोस् (Enter the six-digit code)'),
            TextButton(onPressed: _busy || _cooldown > 0 ? null : () => setState(() { _otpSessionId = null; _code.clear(); }),
              child: Text(_cooldown > 0 ? 'फेरि पठाउन $_cooldown सेकेन्ड (Resend in $_cooldown s)' : 'फेरि कोड / ठेगाना बदल्नुहोस् (Resend / change destination)')),
          ],
          if (_error != null) Padding(padding: const EdgeInsets.symmetric(vertical: 12),
            child: Text(_error!, key: const Key('sign-in-error'), style: const TextStyle(color: Colors.red))),
          const SizedBox(height: 20),
          FilledButton(key: const Key('sign-in-submit'), onPressed: _busy ? null : _submit,
            child: Text(_busy ? 'पर्खनुहोस्…' : _otpSessionId == null ? 'कोड पठाउनुहोस् (Send code)' : 'प्रवेश गर्नुहोस् (Verify & sign in)')),
          if (!widget.linkEmail) TextButton(onPressed: _busy ? null : widget.onBrowsePublic,
            child: const Text('सार्वजनिक वंशावली हेर्नुहोस् (Browse public tree)')),
        ])),
      ),
    )),
  );
}
