import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kashyap_mobile/screens/authenticator_screen.dart';
import 'package:kashyap_mobile/services/genealogy_api_service.dart';

class SecurityApi extends GenealogyApiService {
  bool required = true;
  bool eligible = true;
  bool enrolled = true;
  bool verified = false;
  bool failStatus = false;
  bool failProofCheck = false;
  final List<String> operations = [];
  @override
  Future<dynamic> requestJson(String path, {String method = 'GET', Map<String, dynamic>? data, String? boundAccountId}) async {
    operations.add(path);
    if (path.endsWith('/status')) {
      if (failStatus) { throw Exception('offline'); }
      return <String, dynamic>{'required': required, 'eligible': eligible, 'enrolled': enrolled, 'verified': verified};
    }
    if (path.endsWith('/enroll') || path.endsWith('/replace/start')) { return {'secret': 'SYNTHETICKEY'}; }
    verified = true;
    if (failProofCheck) { failStatus = true; }
    if (path.endsWith('/confirm') || path.endsWith('/recovery-codes/renew')) {
      enrolled = true;
      return {'recoveryCodes': List.generate(10, (i) => i.toString().padLeft(32, '0'))};
    }
    return {'success': true};
  }
}

void main() {
  Future<void> open(WidgetTester tester, SecurityApi api) async {
    await tester.pumpWidget(MaterialApp(home: AuthenticatorScreen(apiService: api,
      child: () => const Scaffold(body: Text('Protected home')))));
    await tester.pumpAndSettle();
  }
  testWidgets('failed status stays closed and retry permits an ordinary member', (tester) async {
    final api = SecurityApi()..failStatus = true..required = false;
    await open(tester, api);
    expect(find.text('Protected home'), findsNothing);
    api.failStatus = false;
    await tester.tap(find.text('Retry security check'));
    await tester.pumpAndSettle();
    expect(find.text('Protected home'), findsOneWidget);
  });
  testWidgets('challenge validates a recovery code and rechecks server proof', (tester) async {
    final api = SecurityApi();
    await open(tester, api);
    expect(find.text('Protected home'), findsNothing);
    await tester.tap(find.text('Use recovery code'));
    await tester.pump();
    await tester.enterText(find.byType(TextField), 'a' * 32);
    await tester.pump();
    await tester.tap(find.text('Verify'));
    await tester.pumpAndSettle();
    expect(api.operations, contains('/auth/mfa/recover'));
    expect(find.text('Protected home'), findsOneWidget);
  });
  testWidgets('enrollment requires saving once-displayed codes before continuing', (tester) async {
    tester.view.physicalSize = const Size(1200, 1800);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final api = SecurityApi()..enrolled = false;
    await open(tester, api);
    await tester.tap(find.text('Set up authenticator'));
    await tester.pumpAndSettle();
    expect(find.text('SYNTHETICKEY'), findsOneWidget);
    await tester.enterText(find.byType(TextField), '123456');
    await tester.pump();
    await tester.tap(find.text('Verify'));
    await tester.pumpAndSettle();
    expect(find.text('SYNTHETICKEY'), findsNothing);
    expect(find.text('Protected home'), findsNothing);
    expect(find.text('0' * 32), findsOneWidget);
    await tester.tap(find.text('I saved the codes — continue'));
    await tester.pumpAndSettle();
    expect(find.text('0' * 32), findsNothing);
    expect(find.text('Protected home'), findsOneWidget);
  });
  testWidgets('failed proof recheck shows retry instead of stale setup controls', (tester) async {
    final api = SecurityApi()..failProofCheck = true;
    await open(tester, api);
    await tester.enterText(find.byType(TextField), '123456');
    await tester.pump();
    await tester.tap(find.text('Verify'));
    await tester.pumpAndSettle();
    expect(find.text('Protected home'), findsNothing);
    expect(find.text('Retry security check'), findsOneWidget);
    expect(find.byType(TextField), findsNothing);
    api.failStatus = false;
    await tester.tap(find.text('Retry security check'));
    await tester.pumpAndSettle();
    expect(find.text('Protected home'), findsOneWidget);
  });
  testWidgets('expired setup can obtain a fresh key without submitting an old code', (tester) async {
    final api = SecurityApi()..enrolled = false;
    await open(tester, api);
    await tester.tap(find.text('Set up authenticator'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Restart expired setup'));
    await tester.pumpAndSettle();
    expect(api.operations.where((path) => path == '/auth/mfa/enroll').length, 2);
    expect(api.operations, isNot(contains('/auth/mfa/confirm')));
    expect(find.text('SYNTHETICKEY'), findsOneWidget);
  });

  testWidgets('explicit security entry permits eligible unenrolled authority setup', (tester) async {
    final api = SecurityApi()..required = false..enrolled = false;
    await tester.pumpWidget(MaterialApp(home: AuthenticatorScreen(apiService: api,
      enrollmentRequested: true, child: () => const Text('Security complete'))));
    await tester.pumpAndSettle();
    expect(find.text('Set up authenticator'), findsOneWidget);
    expect(find.text('Security complete'), findsNothing);
  });
  testWidgets('explicit security entry offers no enrollment to ordinary members', (tester) async {
    final api = SecurityApi()..required = false..eligible = false..enrolled = false;
    await tester.pumpWidget(MaterialApp(home: AuthenticatorScreen(apiService: api,
      enrollmentRequested: true, child: () => const Text('Security complete'))));
    await tester.pumpAndSettle();
    expect(find.text('Set up authenticator'), findsNothing);
    expect(find.text('Security complete'), findsOneWidget);
  });

  testWidgets('verified authority renews codes and acknowledges the replacement list', (tester) async {
    tester.view.physicalSize = const Size(1200, 1800); tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize); addTearDown(tester.view.resetDevicePixelRatio);
    final api = SecurityApi()..verified = true;
    await tester.pumpWidget(MaterialApp(home: AuthenticatorScreen(apiService: api, manageCredentials: true,
      child: () => const Text('Security complete'))));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField), '123456'); await tester.pump();
    await tester.tap(find.text('Renew recovery codes')); await tester.pumpAndSettle();
    expect(api.operations, contains('/auth/mfa/recovery-codes/renew'));
    expect(find.text('0' * 32), findsOneWidget);
    await tester.tap(find.text('I saved the codes — continue')); await tester.pumpAndSettle();
    expect(find.text('0' * 32), findsNothing); expect(find.text('Manage authenticator'), findsOneWidget);
  });
  testWidgets('replacement confirms the new key through the replacement endpoint', (tester) async {
    tester.view.physicalSize = const Size(1200, 1800); tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize); addTearDown(tester.view.resetDevicePixelRatio);
    final api = SecurityApi()..verified = true;
    await tester.pumpWidget(MaterialApp(home: AuthenticatorScreen(apiService: api, manageCredentials: true,
      child: () => const Text('Security complete'))));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField), '123456'); await tester.pump();
    await tester.tap(find.text('Replace authenticator')); await tester.pumpAndSettle();
    expect(find.text('SYNTHETICKEY'), findsOneWidget);
    await tester.enterText(find.byType(TextField), '654321'); await tester.pump();
    await tester.tap(find.text('Verify')); await tester.pumpAndSettle();
    expect(api.operations, contains('/auth/mfa/replace/confirm'));
    expect(find.text('SYNTHETICKEY'), findsNothing);
    expect(find.text('I saved the codes — continue'), findsOneWidget);
  });

}
