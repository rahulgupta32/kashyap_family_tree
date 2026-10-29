import 'dart:async';
import 'package:flutter/material.dart';
import 'services/genealogy_api_service.dart';
import 'services/api_endpoint_config.dart';
import 'services/firebase_push_source.dart';
import 'services/native_push_lifecycle.dart';
import 'services/native_push_inbox_router.dart';
import 'screens/native_push_inbox_entry.dart';
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
  final PushInboxEventSource? pushInboxSource;
  const KashyapApp({super.key, this.initialToken, this.apiService, this.pushInboxSource});

  @override
  State<KashyapApp> createState() => _KashyapAppState();
}

class _KashyapAppState extends State<KashyapApp> with WidgetsBindingObserver {
  late final GenealogyApiService _apiService;
  NativePushLifecycle? _push;
  NativePushInboxRouter? _pushInbox;
  bool _loading = true;
  bool _browsePublic = false;
  bool _accountDeleted = false;
  int _sessionEpoch = 0;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _apiService = widget.apiService ?? GenealogyApiService();
    final firebaseSource = firebasePushConfigured ? FirebasePushSource() : null;
    if (firebaseSource != null) { _push = NativePushLifecycle(_apiService, firebaseSource); }
    final inboxSource = widget.pushInboxSource ?? firebaseSource;
    if (inboxSource != null) { _pushInbox = NativePushInboxRouter(_apiService, inboxSource); }
    _apiService.onAccountDeleted = () { if (mounted) setState(() => _accountDeleted = true); };
    _apiService.onSessionExpired = () {
      if (_push != null) { unawaited(_push!.signOut().then<void>((_) {}, onError: (Object _) {})); }
      if (mounted) { setState(() { _browsePublic = false; _accountDeleted = false; _sessionEpoch++; }); }
    };
    _apiService.onMfaRequired = () {
      if (mounted) { setState(() => _sessionEpoch++); }
    };
    if (widget.initialToken != null) {
      _apiService.setAuthToken(widget.initialToken);
      _loading = false;
      _resumePush();
      _startInboxEvents();
    } else {
      _restoreSession();
    }
  }

  Future<void> _restoreSession() async {
    try { if (await _apiService.restoreSession()) { _resumePush(); } }
    catch (_) { _apiService.setAuthToken(null); }
    if (mounted) { setState(() => _loading = false); _startInboxEvents(); }
  }

  void _startInboxEvents() {
    if (_pushInbox != null) { unawaited(_pushInbox!.start()); }
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
    if (_push != null) { unawaited(_push!.close().then<void>((_) {}, onError: (Object _) {})); }
    if (_pushInbox != null) { unawaited(_pushInbox!.close().then<void>((_) {}, onError: (Object _) {})); }
    _apiService.onSessionExpired = null;
    _apiService.onAccountDeleted = null;
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
              ? AuthenticatorScreen(apiService: _apiService, child: () => _authenticatedSearch())
              : _personSearch())
          : SignInScreen(apiService: _apiService, accountDeletionConfirmed: _accountDeleted,
              onSignedIn: () { setState(() { _browsePublic = false; _accountDeleted = false; _sessionEpoch++; }); _resumePush(); },
              onBrowsePublic: () => setState(() { _browsePublic = true; _accountDeleted = false; })),
    );
  }

  Widget _authenticatedSearch() => _pushInbox == null ? _personSearch()
    : NativePushInboxEntry(apiService: _apiService, router: _pushInbox!,
        onEnablePush: _push?.enable, onDisablePush: _push?.disable, child: _personSearch());

  Widget _personSearch() => PersonSearchScreen(apiService: _apiService,
              onSignIn: () => setState(() => _browsePublic = false),
              onEnablePush: _push?.enable,
              onDisablePush: _push?.disable,
              onSignOut: () async { await _push?.signOut(); await _apiService.logout(); });
}
