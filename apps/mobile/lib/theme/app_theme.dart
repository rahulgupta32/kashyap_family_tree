import 'package:flutter/material.dart';

/// The supplied Modern Heritage design, shared by every native workflow.
class AppTheme {
  static const heritageBrown = Color(0xFF68452C);
  static const saffron = Color(0xFF8D4B00);
  static const saffronLight = Color(0xFFD78000);
  static const warmCream = Color(0xFFFFFBEF);
  static const cardBg = Colors.white;
  static const textDark = Color(0xFF29231E);
  static const textMuted = Color(0xFF786E63);
  static const livingGreen = Color(0xFF3D7359);
  static const deceasedSlate = Color(0xFF697282);
  static const outline = Color(0xFFE8DFD1);
  static const softPeach = Color(0xFFFFD9BF);
  static const fieldBg = Color(0xFFF6F6FB);

  static TextStyle get editorial => const TextStyle(
        fontFamily: 'PlayfairDisplay',
        fontFamilyFallback: ['NotoSansDevanagari'],
        color: textDark,
        fontWeight: FontWeight.w600,
        height: 1.3,
      );

  static ThemeData get theme {
    final rounded =
        RoundedRectangleBorder(borderRadius: BorderRadius.circular(8));
    final text = Typography.material2021().black.apply(
          fontFamily: 'Inter',
          fontFamilyFallback: const ['NotoSansDevanagari'],
          bodyColor: textDark,
          displayColor: textDark,
        );
    return ThemeData(
      useMaterial3: true,
      fontFamily: 'Inter',
          fontFamilyFallback: const ['NotoSansDevanagari'],
      colorScheme: const ColorScheme.light(
          primary: saffron,
          secondary: heritageBrown,
          surface: warmCream,
          onSurface: textDark,
          primaryContainer: softPeach,
          onPrimaryContainer: heritageBrown,
          outline: outline),
      scaffoldBackgroundColor: warmCream,
      textTheme: text.copyWith(
        headlineLarge: editorial.copyWith(fontSize: 30),
        headlineMedium: editorial.copyWith(fontSize: 26),
        headlineSmall: editorial.copyWith(fontSize: 22),
        titleLarge: editorial.copyWith(fontSize: 21),
        titleMedium: editorial.copyWith(fontSize: 18),
        bodyLarge: text.bodyLarge?.copyWith(fontSize: 15, height: 1.6),
        bodyMedium: text.bodyMedium?.copyWith(fontSize: 14, height: 1.55),
        bodySmall: text.bodySmall
            ?.copyWith(fontSize: 12, color: textMuted, height: 1.5),
      ),
      appBarTheme: AppBarTheme(
          backgroundColor: warmCream,
          foregroundColor: heritageBrown,
          surfaceTintColor: Colors.transparent,
          elevation: 0,
          scrolledUnderElevation: 0,
          centerTitle: true,
          titleTextStyle:
              editorial.copyWith(color: heritageBrown, fontSize: 20)),
      cardTheme: CardThemeData(
          color: cardBg,
          surfaceTintColor: Colors.transparent,
          elevation: 0,
          margin: const EdgeInsets.symmetric(vertical: 6),
          shape: rounded.copyWith(
              side: const BorderSide(color: outline, width: 0.8))),
      dividerTheme:
          const DividerThemeData(color: outline, thickness: 1, space: 24),
      iconTheme: const IconThemeData(color: heritageBrown, size: 22),
      filledButtonTheme: FilledButtonThemeData(
          style: FilledButton.styleFrom(
              backgroundColor: saffron,
              foregroundColor: Colors.white,
              minimumSize: const Size(48, 48),
              shape: rounded,
              textStyle: const TextStyle(
                  fontFamily: 'Inter',
          fontFamilyFallback: ['NotoSansDevanagari'],
                  fontWeight: FontWeight.w600,
                  fontSize: 14))),
      elevatedButtonTheme: ElevatedButtonThemeData(
          style: ElevatedButton.styleFrom(
              backgroundColor: saffron,
              foregroundColor: Colors.white,
              elevation: 0,
              minimumSize: const Size(48, 48),
              shape: rounded)),
      outlinedButtonTheme: OutlinedButtonThemeData(
          style: OutlinedButton.styleFrom(
              foregroundColor: heritageBrown,
              minimumSize: const Size(48, 48),
              shape: rounded,
              side: const BorderSide(color: outline))),
      textButtonTheme: TextButtonThemeData(
          style: TextButton.styleFrom(
              foregroundColor: saffron, minimumSize: const Size(48, 48))),
      floatingActionButtonTheme: FloatingActionButtonThemeData(
          backgroundColor: saffron,
          foregroundColor: Colors.white,
          elevation: 2,
          shape: rounded),
      inputDecorationTheme: InputDecorationTheme(
          filled: true,
          fillColor: fieldBg,
          contentPadding: const EdgeInsets.all(16),
          labelStyle: const TextStyle(color: textMuted, fontSize: 13),
          hintStyle: const TextStyle(color: textMuted, fontSize: 13),
          border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
          enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(8),
              borderSide: const BorderSide(color: outline)),
          focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(8),
              borderSide: const BorderSide(color: saffron, width: 1.5))),
      chipTheme: ChipThemeData(
          backgroundColor: cardBg,
          selectedColor: softPeach,
          showCheckmark: false,
          side: const BorderSide(color: outline),
          shape: rounded,
          labelStyle: const TextStyle(
              fontFamily: 'Inter',
          fontFamilyFallback: ['NotoSansDevanagari'], fontSize: 12, color: heritageBrown),
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6)),
      listTileTheme: const ListTileThemeData(
          iconColor: heritageBrown,
          contentPadding: EdgeInsets.symmetric(horizontal: 16, vertical: 6)),
      navigationBarTheme: NavigationBarThemeData(
          backgroundColor: warmCream,
          surfaceTintColor: Colors.transparent,
          indicatorColor: softPeach,
          height: 74,
          labelTextStyle: WidgetStateProperty.all(const TextStyle(
              fontFamily: 'Inter',
          fontFamilyFallback: ['NotoSansDevanagari'],
              fontSize: 11,
              color: heritageBrown,
              fontWeight: FontWeight.w500))),
      progressIndicatorTheme: const ProgressIndicatorThemeData(color: saffron),
      dialogTheme: DialogThemeData(
          backgroundColor: warmCream,
          surfaceTintColor: Colors.transparent,
          shape:
              RoundedRectangleBorder(borderRadius: BorderRadius.circular(12))),
      snackBarTheme: const SnackBarThemeData(
          backgroundColor: heritageBrown, behavior: SnackBarBehavior.floating),
    );
  }
}
