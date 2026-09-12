import 'package:flutter/material.dart';

class AppTheme {
  // Heritage Modern Palette
  static const Color heritageBrown = Color(0xFF4A2C1A);
  static const Color saffron = Color(0xFFD18B28);
  static const Color saffronLight = Color(0xFFE8A849);
  static const Color warmCream = Color(0xFFFFF8ED);
  static const Color cardBg = Color(0xFFFFFFFF);
  static const Color textDark = Color(0xFF2C2523);
  static const Color textMuted = Color(0xFF756A63);
  static const Color livingGreen = Color(0xFF2E7D32);
  static const Color deceasedSlate = Color(0xFF546E7A);

  static ThemeData get theme {
    return ThemeData(
      useMaterial3: true,
      colorScheme: ColorScheme.fromSeed(
        seedColor: saffron,
        primary: saffron,
        secondary: heritageBrown,
        surface: warmCream,
        background: warmCream,
      ),
      scaffoldBackgroundColor: warmCream,
      appBarTheme: const AppBarTheme(
        backgroundColor: heritageBrown,
        foregroundColor: Colors.white,
        elevation: 0,
        centerTitle: false,
      ),
      cardTheme: CardTheme(
        color: cardBg,
        elevation: 1,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12),
          side: const BorderSide(color: Color(0xFFEADBCE), width: 1),
        ),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: saffron,
          foregroundColor: Colors.white,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(8),
          ),
          textStyle: const TextStyle(fontWeight: FontWeight.bold),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: Colors.white,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(8),
          borderSide: const BorderSide(color: Color(0xFFD3C5B8)),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(8),
          borderSide: const BorderSide(color: Color(0xFFD3C5B8)),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(8),
          borderSide: const BorderSide(color: saffron, width: 2),
        ),
      ),
    );
  }
}
