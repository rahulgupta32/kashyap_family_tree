import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:http/http.dart' as http;
import 'package:kashyap_mobile/main.dart';
import 'package:kashyap_mobile/screens/person_detail_screen.dart';
import 'package:kashyap_mobile/screens/person_search_screen.dart';
import 'package:kashyap_mobile/screens/claim_profile_screen.dart';
import 'package:kashyap_mobile/services/genealogy_api_service.dart';
import 'package:kashyap_mobile/services/session_store.dart';

const base = String.fromEnvironment('API_BASE_URL');
const phone = String.fromEnvironment('M4_PHONE');
const search = String.fromEnvironment('M4_SEARCH');
const rootId = String.fromEnvironment('M4_ROOT');
const parentId = String.fromEnvironment('M4_PARENT');
const childId = String.fromEnvironment('M4_CHILD');
const eventId = String.fromEnvironment('M4_EVENT');

Future<dynamic> api(String path, {String? token, Map<String, dynamic>? data}) async {
  final headers = {'Content-Type': 'application/json', if (token != null) 'Authorization': 'Bearer $token'};
  final uri = Uri.parse('$base$path');
  final response = await (data == null ? http.get(uri, headers: headers)
    : http.post(uri, headers: headers, body: jsonEncode(data))).timeout(const Duration(seconds: 20));
  expect(response.statusCode, inInclusiveRange(200, 299), reason: '$path HTTP ${response.statusCode}');
  return jsonDecode(response.body);
}

Future<String> reviewerLogin(String number) async {
  await api('/auth/test-clear-cooldown', data: {'phoneNumber': number});
  final challenge = await api('/auth/otp/request', data: {'phoneNumber': number});
  final code = await api('/auth/test-otp?phoneNumber=${Uri.encodeComponent(number)}');
  final session = await api('/auth/native/verify', data: {
    'otpSessionId': challenge['otpSessionId'], 'code': code['otp'],
    'deviceInfo': {'deviceId': 'android-review-$number', 'platform': 'android', 'appVersion': 'acceptance'},
  });
  return session['accessToken'] as String;
}

Future<void> until(WidgetTester tester, Finder finder) async {
  final deadline = DateTime.now().add(const Duration(seconds: 30));
  while (finder.evaluate().isEmpty && DateTime.now().isBefore(deadline)) {
    await tester.pump(const Duration(milliseconds: 100));
  }
  expect(finder, findsWidgets);
  await tester.pumpAndSettle(const Duration(milliseconds: 100), EnginePhase.sendSemanticsUpdate, const Duration(seconds: 10));
}

Future<void> press(WidgetTester tester, Finder finder) async {
  // Dismiss the native keyboard before calculating scroll and hit-test positions.
  FocusManager.instance.primaryFocus?.unfocus();
  await tester.pumpAndSettle(const Duration(milliseconds: 100), EnginePhase.sendSemanticsUpdate, const Duration(seconds: 10));
  await Scrollable.ensureVisible(tester.element(finder), alignment: 0.5);
  await tester.pumpAndSettle(const Duration(milliseconds: 100), EnginePhase.sendSemanticsUpdate, const Duration(seconds: 10));
  expect(finder.hitTestable(), findsWidgets, reason: 'The action must be visible and tappable');
  await tester.tap(finder.hitTestable());
  await tester.pump();
}

Future<void> back(WidgetTester tester) async {
  await press(tester, find.byType(BackButton));
  await tester.pumpAndSettle(const Duration(milliseconds: 100), EnginePhase.sendSemanticsUpdate, const Duration(seconds: 10));
}

Future<void> drawer(WidgetTester tester, String label) async {
  await press(tester, find.byTooltip('Open navigation menu'));
  await tester.pumpAndSettle(const Duration(milliseconds: 100), EnginePhase.sendSemanticsUpdate, const Duration(seconds: 10));
  await press(tester, find.text(label));
  await tester.pumpAndSettle(const Duration(milliseconds: 100), EnginePhase.sendSemanticsUpdate, const Duration(seconds: 10));
}

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  WidgetController.hitTestWarningShouldBeFatal = true;
  testWidgets('Authenticated M4 workflows on Android with live API and PostgreSQL', (tester) async {
    expect([base, phone, search, rootId, parentId, childId, eventId].every((v) => v.isNotEmpty), isTrue,
      reason: 'Run the guarded fixture script and supply --dart-define-from-file');
    await SecureSessionStore().clear();
    final service = GenealogyApiService();
    addTearDown(service.dispose);
    debugPrint('[M4 DEVICE] Live API=$base root=$rootId parent=$parentId child=$childId');
    await tester.pumpWidget(KashyapApp(apiService: service));
    await until(tester, find.byKey(const Key('sign-in-phone')));
    await tester.enterText(find.byKey(const Key('sign-in-phone')), phone);
    await press(tester, find.byKey(const Key('sign-in-submit')));
    await until(tester, find.byKey(const Key('sign-in-code')));
    // CI uses the explicit test SMS provider. OTP verification, sessions and all
    // business requests still use the real NestJS service and PostgreSQL.
    final otp = await api('/auth/test-otp?phoneNumber=${Uri.encodeComponent(phone)}');
    await tester.enterText(find.byKey(const Key('sign-in-code')), otp['otp'] as String);
    await press(tester, find.byKey(const Key('sign-in-submit')));
    await until(tester, find.byType(PersonSearchScreen));
    expect(service.authToken, isNotNull);
    expect(await SecureSessionStore().read(), isNotNull);
    expect((await service.getMyProfile())['personId'], isNull);
    debugPrint('[M4 DEVICE] Native OTP sign-in and encrypted session persistence passed');

    await drawer(tester, 'प्रोफाइल तथा गोपनीयता (Profile Privacy)');
    await until(tester, find.byType(TextField));
    const address = 'Fictional Android address';
    await tester.enterText(find.byType(TextField).at(0), address);
    await press(tester, find.text('सेटिङहरू सुरक्षित गर्नुहोस् (Save Settings)'));
    await until(tester, find.text('प्रोफाइल तथा गोपनीयता सेटिङ सफलतापूर्वक सुरक्षित गरियो।'));
    final unlinked = await service.getMyProfile();
    expect(unlinked['personId'], isNull);
    expect(unlinked['person']['currentAddress'], address);
    await back(tester);

    final results = await service.searchPersons(query: search);
    expect(results.indexWhere((p) => p.id == rootId), greaterThan(0));
    await tester.enterText(find.byType(TextField), search);
    await until(tester, find.text('जनक अधिकारी'));
    await press(tester, find.text('जनक अधिकारी'));
    await until(tester, find.text('अभिभावकहरू (Parents)'));
    expect(tester.widget<PersonDetailScreen>(find.byType(PersonDetailScreen)).personId, rootId);
    final person = await service.getPerson(rootId);
    final child = person.children.singleWhere((c) => c.targetPersonId == childId);
    expect(child.id, isNot(childId));
    expect(person.parents.any((p) => p.targetPersonId == parentId), isTrue);
    await press(tester, find.text('नन्दन अधिकारी'));
    await until(tester, find.text('अभिभावकहरू (Parents)'));
    expect(tester.widget<PersonDetailScreen>(find.byType(PersonDetailScreen)).personId, childId);
    await back(tester);
    expect(tester.widget<PersonDetailScreen>(find.byType(PersonDetailScreen)).personId, rootId);
    await press(tester, find.byIcon(Icons.account_tree));
    await until(tester, find.text('पितामह अधिकारी'));
    expect(find.text('जनक अधिकारी'), findsWidgets);
    expect(find.text('नन्दन अधिकारी'), findsWidgets);
    final tree = await service.getTree(rootId);
    expect(tree.ancestors.any((p) => p.id == parentId), isTrue);
    expect(tree.children.any((p) => p.id == childId), isTrue);
    await back(tester);
    await back(tester);
    debugPrint('[M4 DEVICE] Non-first search selection, relative IDs and rendered three-generation tree passed');

    await drawer(tester, 'दाबी प्रमाणीकरण (Profile Claims)');
    expect(tester.widget<ClaimProfileScreen>(find.byType(ClaimProfileScreen)).personId, rootId);
    await tester.enterText(find.byType(TextField), 'Fictional Android claimant with independently reviewed lineage.');
    await press(tester, find.byType(CheckboxListTile));
    await press(tester, find.text('दाबी पेश गर्नुहोस् (Submit Claim)'));
    await until(tester, find.text('तपाईंको प्रोफाइल दाबी सफलतापूर्वक दर्ता भयो। समीक्षा पश्चात् सूचित गरिनेछ।'));
    final claims = await api('/claims', token: service.authToken) as List;
    final claim = claims.singleWhere((c) => c['targetPersonId'] == rootId);
    expect(claim['status'], 'PENDING_TIER1');
    final tier1 = await reviewerLogin('+9779800000002');
    final tier2 = await reviewerLogin('+9779800000001');
    await api('/claims/${claim['id']}/tier1-review', token: tier1,
      data: {'decision': 'VOUCHED', 'notes': 'Independent fictional device fixture review.'});
    await api('/claims/${claim['id']}/tier2-review', token: tier2,
      data: {'decision': 'APPROVED', 'notes': 'Separate final reviewer, fictional acceptance only.'});
    final approved = await api('/claims/${claim['id']}', token: service.authToken);
    expect(approved['status'], 'APPROVED');
    expect(approved['tier1ReviewedBy'], isNot(approved['tier2ReviewedBy']));
    expect((await service.getMyProfile())['personId'], rootId);
    await back(tester);
    debugPrint('[M4 DEVICE] Mobile claim submitted and two distinct API reviewers approved persisted ownership');

    await drawer(tester, 'संशोधन अनुरोध (Change Requests)');
    await tester.enterText(find.byType(TextField).at(0), 'Fictional Android birthplace');
    await tester.enterText(find.byType(TextField).at(1), 'Fictional Android occupation');
    await tester.enterText(find.byType(TextField).at(2), 'Independent review required for this fictional correction.');
    await press(tester, find.text('प्रस्ताव पेश गर्नुहोस् (Submit Proposal)'));
    await until(tester, find.text('वंशवृक्ष संशोधन अनुरोध सफलतापूर्वक दर्ता भयो। शाखा प्रशासकले परीक्षण गर्नेछन्।'));
    final requests = await api('/change-requests', token: service.authToken) as List;
    final change = requests.singleWhere((r) => r['targetPersonId'] == rootId);
    expect(change['status'], 'PENDING');
    await api('/change-requests/${change['id']}/review', token: tier2,
      data: {'status': 'APPROVED', 'reviewNotes': 'Reviewed fictional device correction.'});
    final corrected = await api('/genealogy/people/$rootId', token: service.authToken);
    expect(corrected['occupation'], 'Fictional Android occupation');
    expect(corrected['birthPlace'], 'Fictional Android birthplace');
    await back(tester);

    await drawer(tester, 'प्रोफाइल तथा गोपनीयता (Profile Privacy)');
    await until(tester, find.byType(TextField));
    await tester.enterText(find.byType(TextField).at(0), address);
    await press(tester, find.text('सेटिङहरू सुरक्षित गर्नुहोस् (Save Settings)'));
    await until(tester, find.text('प्रोफाइल तथा गोपनीयता सेटिङ सफलतापूर्वक सुरक्षित गरियो।'));
    await back(tester);
    await drawer(tester, 'प्रोफाइल तथा गोपनीयता (Profile Privacy)');
    await until(tester, find.byType(TextField));
    expect(tester.widget<TextField>(find.byType(TextField).at(0)).controller!.text, address);
    expect((await service.getMyProfile())['person']['currentAddress'], address);
    await back(tester);
    debugPrint('[M4 DEVICE] Governed change and linked/unlinked profile save/reload passed');

    await drawer(tester, 'पात्रो तथा कार्यक्रम (Calendar)');
    final going = find.byKey(const ValueKey('rsvp-$eventId-GOING'));
    await until(tester, going);
    await press(tester, going);
    final rsvpDeadline = DateTime.now().add(const Duration(seconds: 20));
    while (!tester.widget<ChoiceChip>(going).selected && DateTime.now().isBefore(rsvpDeadline)) {
      await tester.pump(const Duration(milliseconds: 100));
    }
    expect(tester.widget<ChoiceChip>(going).selected, isTrue);
    expect((await api('/calendar/events/$eventId', token: service.authToken))['myRsvp'], 'GOING');
    await back(tester);
    final restored = GenealogyApiService();
    addTearDown(restored.dispose);
    expect(await restored.restoreSession(), isTrue);
    expect((await restored.getMyProfile())['personId'], rootId);
    await restored.logout();
    expect(await SecureSessionStore().read(), isNull);
    debugPrint('[M4 DEVICE] Persisted RSVP, native refresh and logout passed. Live acceptance complete.');
    await tester.pumpWidget(const SizedBox.shrink());
  }, timeout: const Timeout(Duration(minutes: 8)));
}
