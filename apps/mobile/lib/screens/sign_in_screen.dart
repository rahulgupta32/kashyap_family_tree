import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import '../services/genealogy_api_service.dart';

class SignInScreen extends StatefulWidget {
  final GenealogyApiService apiService;
  final VoidCallback onSignedIn;
  final VoidCallback onBrowsePublic;

  const SignInScreen({super.key, required this.apiService,
    required this.onSignedIn, required this.onBrowsePublic});

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

  Future<void> _submit() async {
    if (!_form.currentState!.validate()) { return; }
    setState(() { _busy = true; _error = null; });
    try {
      if (_otpSessionId == null) {
        final result = await widget.apiService.requestOtp(_phone.text.trim());
        final sessionId = result['otpSessionId'];
        if (sessionId is! String || sessionId.isEmpty) {
          throw const FormatException('OTP session was not returned');
        }
        if (mounted) { setState(() => _otpSessionId = sessionId); }
      } else {
        await widget.apiService.verifyOtp(_otpSessionId!, _code.text.trim(),
          platform: defaultTargetPlatform == TargetPlatform.iOS ? 'ios' : 'android');
        if (mounted) { widget.onSignedIn(); }
      }
    } catch (error) {
      if (mounted) { setState(() => _error = error.toString().replaceFirst('Exception: ', '')); }
    } finally {
      if (mounted) { setState(() => _busy = false); }
    }
  }

  @override
  void dispose() { _phone.dispose(); _code.dispose(); super.dispose(); }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('खाता प्रवेश (Sign in)')),
    body: Center(child: SingleChildScrollView(padding: const EdgeInsets.all(24),
      child: ConstrainedBox(constraints: const BoxConstraints(maxWidth: 440),
        child: Form(key: _form, child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          const Text('कश्यप अधिकारी वंशावली', style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold)),
          const SizedBox(height: 24),
          TextFormField(key: const Key('sign-in-phone'), controller: _phone,
            enabled: !_busy && _otpSessionId == null, keyboardType: TextInputType.phone,
            autofillHints: const [AutofillHints.telephoneNumber],
            decoration: const InputDecoration(labelText: 'फोन नम्बर (Phone number)', hintText: '+97798XXXXXXXX'),
            validator: (value) => RegExp(r'^\+?[0-9]{10,15}$').hasMatch(value?.trim() ?? '')
              ? null : 'सही फोन नम्बर लेख्नुहोस् (Enter a valid phone number)'),
          if (_otpSessionId != null) ...[
            const SizedBox(height: 16),
            TextFormField(key: const Key('sign-in-code'), controller: _code, enabled: !_busy,
              keyboardType: TextInputType.number, autofillHints: const [AutofillHints.oneTimeCode],
              decoration: const InputDecoration(labelText: 'प्रमाणीकरण कोड (Verification OTP)'),
              validator: (value) => RegExp(r'^[0-9]{6}$').hasMatch(value?.trim() ?? '')
                ? null : '६ अंकको कोड लेख्नुहोस् (Enter the six-digit code)'),
            TextButton(onPressed: _busy ? null : () => setState(() { _otpSessionId = null; _code.clear(); }),
              child: const Text('फेरि कोड पठाउनुहोस् / नम्बर बदल्नुहोस् (Resend / change number)')),
          ],
          if (_error != null) Padding(padding: const EdgeInsets.symmetric(vertical: 12),
            child: Text(_error!, key: const Key('sign-in-error'), style: const TextStyle(color: Colors.red))),
          const SizedBox(height: 20),
          FilledButton(key: const Key('sign-in-submit'), onPressed: _busy ? null : _submit,
            child: Text(_busy ? 'पर्खनुहोस्…' : _otpSessionId == null ? 'कोड पठाउनुहोस् (Send code)' : 'प्रवेश गर्नुहोस् (Verify & sign in)')),
          TextButton(onPressed: _busy ? null : widget.onBrowsePublic,
            child: const Text('सार्वजनिक वंशावली हेर्नुहोस् (Browse public tree)')),
        ])),
      ),
    )),
  );
}
