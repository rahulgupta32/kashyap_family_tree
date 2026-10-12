import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:kashyap_mobile/main.dart';
import 'package:kashyap_mobile/screens/sign_in_screen.dart';
import 'package:kashyap_mobile/services/genealogy_api_service.dart';
import 'package:kashyap_mobile/services/session_store.dart';

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('iOS simulator uses real Keychain and opens signed-out bilingual app without backend traffic', (tester) async {
    expect(const bool.fromEnvironment('KASHYAP_DISPOSABLE_IOS_SIMULATOR'), isTrue,
      reason: 'Keychain fixture verification requires an explicitly disposable simulator');
    expect(Platform.isIOS, isTrue, reason: 'This verification must execute on iOS');
    final store = SecureSessionStore();
    const fixture = '{"fixture":"FICTIONAL_IOS_SIMULATOR_ONLY"}';
    await tester.runAsync(() async {
      await store.clear();
      await store.write(fixture);
      expect(await store.read(), fixture);
      await store.clear();
      expect(await store.read(), isNull);
    });
    var requests = 0;
    final api = GenealogyApiService(baseUrl: 'https://api.invalid', sessionStore: store,
      client: MockClient((_) async {
        requests++;
        return http.Response('{"message":"Unexpected test backend request"}', 500);
      }));
    try {
      await tester.pumpWidget(KashyapApp(apiService: api));
      await tester.pumpAndSettle();
      expect(find.byType(SignInScreen), findsOneWidget);
      expect(find.text('कश्यप अधिकारी वंशावली'), findsOneWidget);
      expect(find.text('फोन नम्बर (Phone number)'), findsOneWidget);
      expect(requests, 0);
    } finally {
      await tester.pumpWidget(const SizedBox.shrink());
      api.dispose();
      await tester.runAsync(store.clear);
    }
  });
}
