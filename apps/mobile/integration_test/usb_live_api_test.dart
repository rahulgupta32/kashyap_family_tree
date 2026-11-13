import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:http/http.dart' as http;
import 'package:kashyap_mobile/main.dart';
import 'package:kashyap_mobile/screens/person_search_screen.dart';
import 'package:kashyap_mobile/services/api_endpoint_config.dart';
import 'package:kashyap_mobile/services/genealogy_api_service.dart';
import 'package:kashyap_mobile/services/session_store.dart';

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  testWidgets(
      'USB loopback reaches ready API, creates and clears a real phone session',
      (tester) async {
    expect(kDebugMode, isTrue);
    expect(const bool.fromEnvironment('KASHYAP_DISPOSABLE_USB_TEST'), isTrue);
    expect(mobileApiBaseUrl, 'http://127.0.0.1:3010');
    const phone = '+9779847100077';
    Future<Map<String, dynamic>> request(String path,
        {Map<String, dynamic>? data}) async {
      return (await tester.runAsync(() async {
        final uri = Uri.parse('$mobileApiBaseUrl$path');
        final response = data == null
            ? await http.get(uri).timeout(const Duration(seconds: 5))
            : await http
                .post(uri,
                    headers: {'Content-Type': 'application/json'},
                    body: jsonEncode(data))
                .timeout(const Duration(seconds: 5));
        expect(response.statusCode, inInclusiveRange(200, 299));
        return jsonDecode(response.body) as Map<String, dynamic>;
      }))!;
    }

    Future<void> until(Finder finder) async {
      final deadline = DateTime.now().add(const Duration(seconds: 15));
      while (finder.evaluate().isEmpty && DateTime.now().isBefore(deadline)) {
        await tester.pump(const Duration(milliseconds: 100));
      }
      expect(finder, findsOneWidget);
    }

    Future<void> press(Finder finder) async {
      await tester.ensureVisible(finder);
      await tester.pumpAndSettle();
      await tester.tap(finder);
      await tester.pump();
    }

    await request('/health/ready');
    await request('/auth/test-clear-cooldown', data: {'phoneNumber': phone});
    final store = SecureSessionStore();
    await tester.runAsync(store.clear);
    final service = GenealogyApiService();
    try {
      await tester.pumpWidget(KashyapApp(apiService: service));
      await until(find.byKey(const Key('sign-in-phone')));
      await tester.enterText(find.byKey(const Key('sign-in-phone')), phone);
      await press(find.byKey(const Key('sign-in-submit')));
      await until(find.byKey(const Key('sign-in-code')));
      // Only the isolated NODE_ENV=test backend exposes this pre-existing fixture helper.
      final otp = await request(
          '/auth/test-otp?phoneNumber=${Uri.encodeComponent(phone)}');
      await tester.enterText(
          find.byKey(const Key('sign-in-code')), otp['otp'] as String);
      await press(find.byKey(const Key('sign-in-submit')));
      await until(find.byType(PersonSearchScreen));
      expect(service.authToken, isNotNull);
      final profile = await tester.runAsync(service.getMyProfile);
      expect(profile, isA<Map<String, dynamic>>());
      await press(find.byTooltip('Sign out'));
      await until(find.byKey(const Key('sign-in-phone')));
      expect(service.authToken, isNull);
      expect(await tester.runAsync(store.read), isNull);
      debugPrint(
          '[USB DEVICE] loopback readiness, native phone login, profile and logout passed; synthetic provider only');
    } finally {
      await tester.pumpWidget(const SizedBox.shrink());
      service.dispose();
      await tester.runAsync(store.clear);
    }
  });
}
