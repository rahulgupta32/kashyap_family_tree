import 'dart:async';
import 'package:flutter/material.dart';
import 'services/genealogy_api_service.dart';
import 'services/api_endpoint_config.dart';
import 'services/firebase_push_source.dart';
import 'services/native_push_lifecycle.dart';
import 'theme/app_theme.dart';
import 'screens/person_search_screen.dart';
import 'screens/sign_in_screen.dart';
import 'screens/authenticator_screen.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  if (!isUsableApiEndpoint(mobileApiBaseUrl)) {
    runApp(const MaterialApp(home: Scaffold(body: Center(child: Padding(
      padding: EdgeInsets.all(24),
      child: Text('सेवा हाल उपलब्ध छैन। (Service unavailable.)',
        textAlign: TextAlign.center),
    )))));
    return;
  }
  runApp(const KashyapApp());
}

class KashyapApp extends StatefulWidget {
  final String? initialToken;
  final GenealogyApiService? apiService;
  const KashyapApp({super.key, this.initialToken, this.apiService});

  @override
  State<KashyapApp> createState() => _KashyapAppState();
}

class _KashyapAppState extends State<KashyapApp> with WidgetsBindingObserver {
  late final GenealogyApiService _apiService;
  NativePushLifecycle? _push;
  bool _loading = true;
  bool _browsePublic = false;
  int _sessionEpoch = 0;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _apiService = widget.apiService ?? GenealogyApiService();
    if (firebasePushConfigured) { _push = NativePushLifecycle(_apiService, FirebasePushSource()); }
    _apiService.onSessionExpired = () {
      if (_push != null) { unawaited(_push!.signOut().then<void>((_) {}, onError: (Object _) {})); }
      if (mounted) { setState(() { _browsePublic = false; _sessionEpoch++; }); }
    };
    _apiService.onMfaRequired = () {
      if (mounted) { setState(() => _sessionEpoch++); }
    };
    if (widget.initialToken != null) {
      _apiService.setAuthToken(widget.initialToken);
      _loading = false;
      _resumePush();
    } else {
      _restoreSession();
    }
  }

  Future<void> _restoreSession() async {
    try { if (await _apiService.restoreSession()) { _resumePush(); } }
    catch (_) { _apiService.setAuthToken(null); }
    if (mounted) { setState(() => _loading = false); }
  }

  void _resumePush() {
    if (_push != null && _apiService.authToken != null) {
      unawaited(_push!.resumeExisting().then<void>((_) {}, onError: (Object _) {}));
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) { _resumePush(); }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    if (_push != null) { unawaited(_push!.close()); }
    _apiService.onSessionExpired = null;
    _apiService.onMfaRequired = null;
    if (widget.apiService == null) { _apiService.dispose(); }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      key: ValueKey(_sessionEpoch),
      title: 'कश्यप अधिकारी वंशावली',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.theme,
      home: _loading ? const Scaffold(body: Center(child: CircularProgressIndicator()))
        : _apiService.authToken != null || _browsePublic
          ? (_apiService.authToken != null
              ? AuthenticatorScreen(apiService: _apiService, child: () => _personSearch())
              : _personSearch())
          : SignInScreen(apiService: _apiService,
              onSignedIn: () { setState(() { _browsePublic = false; _sessionEpoch++; }); _resumePush(); },
              onBrowsePublic: () => setState(() => _browsePublic = true)),
    );
  }

  Widget _personSearch() => PersonSearchScreen(apiService: _apiService,
              onSignIn: () => setState(() => _browsePublic = false),
              onEnablePush: _push?.enable,
              onDisablePush: _push?.disable,
              onSignOut: () async { await _push?.signOut(); await _apiService.logout(); });
}
