import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:kashyap_mobile/dev_preview/preview_app.dart';

void main() {
  final binding = IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  testWidgets(
      'offline preview enters without credentials and opens all catalog screens',
      (tester) async {
    await tester.pumpWidget(const DevelopmentPreviewApp());
    await tester.pumpAndSettle();
    await binding.convertFlutterSurfaceToImage();
    Future<void> capture(String name) async {
      await tester.pumpAndSettle();
      await binding.takeScreenshot(name);
    }

    await capture('preview-login');
    final entry = find.byKey(const Key('enter-development-preview'));
    await tester.ensureVisible(entry);
    await tester.tap(entry);
    await tester.pumpAndSettle();
    expect(find.textContaining('नमूना सदस्य'), findsWidgets);
    await capture('preview-dashboard');
    const screens = {
      'Family tree': 'preview-tree',
      'Member profile': 'preview-profile',
      'Calendar': 'preview-calendar',
      'Calendar month/day/agenda': null,
      'Community': 'preview-community',
      'Messaging': 'preview-chat',
      'Notifications': 'preview-notifications',
      'Official notices': null,
      'Account and settings': 'preview-settings',
      'Privacy form': null,
      'Claim form': null,
      'My claims': null,
      'Change proposal form': null,
      'My change requests': null,
      'Approved cultural content': null,
      'Administration / role inspection': 'preview-administration',
      'Locations and maps': null,
    };
    for (final screen in screens.entries) {
      await tester.tap(find.byKey(const Key('preview-catalog')));
      await tester.pumpAndSettle();
      await tester.scrollUntilVisible(find.text(screen.key), 220,
          scrollable: find.byType(Scrollable).last);
      await tester.tap(find.text(screen.key));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull, reason: screen.key);
      if (screen.key == 'Notifications') {
        expect(
            find.text('Synthetic notification — offline only'), findsOneWidget);
      }
      if (screen.value != null) await capture(screen.value!);
      await tester.pageBack();
      await tester.pumpAndSettle();
      await tester.pageBack();
      await tester.pumpAndSettle();
    }
    await tester.tap(find.byKey(const Key('preview-switch-persona')));
    await tester.pumpAndSettle();
    expect(find.text('New / Unclaimed Member'), findsOneWidget);
    await tester.tap(find.byKey(const Key('preview-exit')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('enter-development-preview')), findsOneWidget);
    debugPrint(
        '[OFFLINE PREVIEW DEVICE] Credential-free entry,17 catalog destinations,persona switch and exit verified with synthetic data only');
    await tester.pumpWidget(const SizedBox.shrink());
  });
}
