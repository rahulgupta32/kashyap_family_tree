import 'package:flutter/material.dart';
import 'services/genealogy_api_service.dart';
import 'theme/app_theme.dart';
import 'screens/person_search_screen.dart';
import 'screens/sign_in_screen.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const KashyapApp());
}

class KashyapApp extends StatefulWidget {
  final String? initialToken;
  final GenealogyApiService? apiService;
  const KashyapApp({super.key, this.initialToken, this.apiService});

  @override
  State<KashyapApp> createState() => _KashyapAppState();
}

class _KashyapAppState extends State<KashyapApp> {
  late final GenealogyApiService _apiService;
  bool _loading = true;
  bool _browsePublic = false;
  int _sessionEpoch = 0;

  @override
  void initState() {
    super.initState();
    _apiService = widget.apiService ?? GenealogyApiService();
    _apiService.onSessionExpired = () {
      if (mounted) { setState(() { _browsePublic = false; _sessionEpoch++; }); }
    };
    if (widget.initialToken != null) {
      _apiService.setAuthToken(widget.initialToken);
      _loading = false;
    } else {
      _restoreSession();
    }
  }

  Future<void> _restoreSession() async {
    try { await _apiService.restoreSession(); }
    catch (_) { _apiService.setAuthToken(null); }
    if (mounted) { setState(() => _loading = false); }
  }

  @override
  void dispose() {
    _apiService.onSessionExpired = null;
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
          ? PersonSearchScreen(apiService: _apiService,
              onSignIn: () => setState(() => _browsePublic = false),
              onSignOut: () async { await _apiService.logout(); })
          : SignInScreen(apiService: _apiService,
              onSignedIn: () => setState(() { _browsePublic = false; _sessionEpoch++; }),
              onBrowsePublic: () => setState(() => _browsePublic = true)),
    );
  }
}
