import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:kashyap_mobile/screens/sign_in_screen.dart';
import 'package:kashyap_mobile/services/genealogy_api_service.dart';
import 'native_session_test.dart' show MemorySessionStore;
import 'chat_outbox_test.dart' show MemoryChatOutboxStore;

void main() {
  testWidgets('email entry requests and verifies through native email transport', (tester) async {
    final requests = <String>[];
    final store = MemorySessionStore();
    final api = GenealogyApiService(sessionStore: store, chatOutboxStore: MemoryChatOutboxStore(),
      client: MockClient((request) async {
        requests.add(request.url.path);
        final body = jsonDecode(request.body);
        if (request.url.path == '/auth/email/request') {
          expect(body, {'email': 'member@example.org'});
          return http.Response(jsonEncode({'otpSessionId': 'test-challenge'}), 200);
        }
        expect(request.url.path, '/auth/email/native/verify');
        expect(body['otpSessionId'], 'test-challenge');
        expect(body['code'], '123456');
        expect(body['deviceInfo']['platform'], 'android');
        return http.Response(jsonEncode({'accessToken': 'email-access', 'refreshToken': 'email-refresh'}), 200);
      }));
    var signedIn = false;
    await tester.pumpWidget(MaterialApp(home: SignInScreen(apiService: api,
      onSignedIn: () { signedIn = true; }, onBrowsePublic: () {})));
    await tester.tap(find.byKey(const Key('sign-in-email-method')));
    await tester.pump();
    await tester.enterText(find.byKey(const Key('sign-in-email')), 'member@example.org');
    await tester.tap(find.byKey(const Key('sign-in-submit')));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const Key('sign-in-code')), '123456');
    await tester.ensureVisible(find.byKey(const Key('sign-in-submit')));
    await tester.tap(find.byKey(const Key('sign-in-submit')));
    await tester.pumpAndSettle();
    expect(signedIn, isTrue);
    expect(requests, ['/auth/email/request', '/auth/email/native/verify']);
    expect(store.value, contains('email-refresh'));
    await tester.pumpWidget(const SizedBox.shrink());
    api.dispose();
  });
}
