import 'package:flutter/material.dart';
import 'services/genealogy_api_service.dart';
import 'theme/app_theme.dart';
import 'screens/person_search_screen.dart';

void main() {
  runApp(const KashyapApp());
}

class KashyapApp extends StatelessWidget {
  const KashyapApp({Key? key}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    final apiService = GenealogyApiService();

    return MaterialApp(
      title: 'कश्यप अधिकारी वंशावली',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.theme,
      home: PersonSearchScreen(apiService: apiService),
    );
  }
}
