import 'package:flutter/material.dart';
import 'services/genealogy_api_service.dart';
import 'theme/app_theme.dart';
import 'screens/person_search_screen.dart';

void main() {
  runApp(const KashyapApp());
}

class KashyapApp extends StatefulWidget {
  final String? initialToken;
  const KashyapApp({super.key, this.initialToken});

  @override
  State<KashyapApp> createState() => _KashyapAppState();
}

class _KashyapAppState extends State<KashyapApp> {
  late final GenealogyApiService _apiService;

  @override
  void initState() {
    super.initState();
    _apiService = GenealogyApiService();
    if (widget.initialToken != null) {
      _apiService.setAuthToken(widget.initialToken);
    }
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'कश्यप अधिकारी वंशावली',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.theme,
      home: PersonSearchScreen(apiService: _apiService),
    );
  }
}
