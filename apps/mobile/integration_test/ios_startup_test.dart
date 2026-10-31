import 'dart:io';
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:kashyap_mobile/main.dart';
import 'package:kashyap_mobile/screens/sign_in_screen.dart';
import 'package:kashyap_mobile/services/genealogy_api_service.dart';
import 'package:kashyap_mobile/services/session_store.dart';
import 'package:kashyap_mobile/services/firebase_push_source.dart';

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  debugPrint('IOS_TEST BINDING_READY');

  testWidgets('iOS simulator uses real Keychain and opens signed-out bilingual app without backend traffic', (tester) async {
    debugPrint('IOS_TEST TEST_DISCOVERED');
    expect(const bool.fromEnvironment('KASHYAP_DISPOSABLE_IOS_SIMULATOR'), isTrue,
      reason: 'Keychain fixture verification requires an explicitly disposable simulator');
    expect(Platform.isIOS, isTrue, reason: 'This verification must execute on iOS');
    expect(firebasePushConfigured, isFalse,
      reason: 'This credential-free startup test must not initialize a Firebase app');
    expect(Firebase.apps, isEmpty);
    final store = SecureSessionStore();
    const fixture = '{"fixture":"FICTIONAL_IOS_SIMULATOR_ONLY"}';
    await tester.runAsync(() async {
      debugPrint('IOS_TEST KEYCHAIN_CLEAR');
      await store.clear().timeout(const Duration(seconds: 15));
      debugPrint('IOS_TEST KEYCHAIN_WRITE');
      await store.write(fixture).timeout(const Duration(seconds: 15));
      debugPrint('IOS_TEST KEYCHAIN_READ');
      expect(await store.read().timeout(const Duration(seconds: 15)), fixture);
      debugPrint('IOS_TEST KEYCHAIN_DELETE');
      await store.clear().timeout(const Duration(seconds: 15));
      expect(await store.read().timeout(const Duration(seconds: 15)), isNull);
      debugPrint('IOS_TEST KEYCHAIN_VERIFIED');
    });
    var requests = 0;
    final api = GenealogyApiService(baseUrl: 'https://api.invalid', sessionStore: store,
      client: MockClient((_) async {
        requests++;
        return http.Response('{"message":"Unexpected test backend request"}', 500);
      }));
    try {
      debugPrint('IOS_TEST APP_PUMP');
      await tester.pumpWidget(KashyapApp(apiService: api));
      await tester.pumpAndSettle(const Duration(milliseconds: 100),
        EnginePhase.sendSemanticsUpdate, const Duration(seconds: 30));
      expect(find.byType(SignInScreen), findsOneWidget);
      expect(find.text('कश्यप अधिकारी वंशावली'), findsOneWidget);
      expect(find.text('फोन नम्बर (Phone number)'), findsOneWidget);
      expect(requests, 0);
      expect(Firebase.apps, isEmpty);
      debugPrint('IOS_TEST APP_VERIFIED');
    } finally {
      await tester.pumpWidget(const SizedBox.shrink());
      api.dispose();
      await tester.runAsync(() => store.clear().timeout(const Duration(seconds: 15)));
      debugPrint('IOS_TEST CLEANUP_VERIFIED');
    }
  }, timeout: const Timeout(Duration(minutes: 2)));
}
