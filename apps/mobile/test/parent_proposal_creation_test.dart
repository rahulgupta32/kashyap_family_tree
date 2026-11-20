import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/testing.dart';
import 'package:kashyap_mobile/screens/change_request_screen.dart';
import 'package:kashyap_mobile/services/genealogy_api_service.dart';
import 'native_session_test.dart' show jsonResponse;

Future<void> choose(WidgetTester tester, String key, String label) async {
  final dropdown = find.byKey(ValueKey(key));
  await tester.ensureVisible(dropdown);
  await tester.tap(dropdown);
  await tester.pumpAndSettle();
  await tester.tap(find.text(label).last);
  await tester.pumpAndSettle();
}

Future<void> parentForm(WidgetTester tester, GenealogyApiService api) async {
  await tester.pumpWidget(MaterialApp(
      home: ChangeRequestScreen(
          personId: 'target-person',
          personName: 'Synthetic target',
          apiService: api)));
  await tester.pumpAndSettle();
  await choose(tester, 'proposal-request-type',
      'जैविक अभिभावक थप (Add Biological Parent)');
}

Future<void> submit(WidgetTester tester) async {
  final button = find.byKey(const ValueKey('new-proposal-submit'));
  await tester.ensureVisible(button);
  await tester.tap(button);
  await tester.pumpAndSettle();
}

Future<void> nameAndReason(WidgetTester tester) async {
  await tester.enterText(
      find.byKey(const ValueKey('parent-nepali-name')), '  परीक्षण अभिभावक  ');
  await tester.enterText(find.byKey(const ValueKey('new-proposal-reason')),
      '  Synthetic new-person proposal for review  ');
}

void main() {
  for (final state in {
    'LIVING': 'जीवित (Living)',
    'DECEASED': 'मृतक (Deceased)',
    'UNKNOWN': 'अज्ञात (Unknown)'
  }.entries) {
    testWidgets(
        'new parent proposal sends explicitly selected ${state.key} facts only',
        (tester) async {
      Map<String, dynamic>? sent;
      final api = GenealogyApiService(client: MockClient((r) async {
        expect(r.method, 'POST');
        expect(r.url.path, '/change-requests');
        sent = jsonDecode(r.body);
        return jsonResponse({'id': 'parent-request'}, 201);
      }))
        ..setAuthToken('mock-access');
      addTearDown(api.dispose);
      await parentForm(tester, api);
      expect(
          tester
              .widget<DropdownButtonFormField<String>>(
                  find.byKey(const ValueKey('parent-gender')))
              .initialValue,
          isNull);
      expect(
          tester
              .widget<DropdownButtonFormField<String>>(
                  find.byKey(const ValueKey('parent-living-status')))
              .initialValue,
          isNull);
      await nameAndReason(tester);
      await tester.enterText(find.byKey(const ValueKey('parent-english-name')),
          '  Synthetic parent  ');
      await choose(tester, 'parent-gender', 'अज्ञात (Unknown)');
      await choose(tester, 'parent-living-status', state.value);
      await submit(tester);
      expect(sent, {
        'targetPersonId': 'target-person',
        'type': 'ADD_PARENT',
        'proposedChanges': {
          'primaryNameNepali': 'परीक्षण अभिभावक',
          'primaryNameEnglish': 'Synthetic parent',
          'gender': 'UNKNOWN',
          'livingStatus': state.key
        },
        'reason': 'Synthetic new-person proposal for review',
      });
    });
  }
  testWidgets(
      'parent name, gender, living status and reason are each required before a request',
      (tester) async {
    var writes = 0;
    final api = GenealogyApiService(client: MockClient((r) async {
      writes++;
      return jsonResponse({'id': 'request'}, 201);
    }))
      ..setAuthToken('mock-access');
    addTearDown(api.dispose);
    await parentForm(tester, api);
    await tester.enterText(
        find.byKey(const ValueKey('new-proposal-reason')), 'Synthetic reason');
    await submit(tester);
    expect(writes, 0);
    await tester.enterText(
        find.byKey(const ValueKey('parent-nepali-name')), 'Synthetic name');
    await submit(tester);
    expect(writes, 0);
    await choose(tester, 'parent-gender', 'अन्य (Other)');
    await submit(tester);
    expect(writes, 0);
    await choose(tester, 'parent-living-status', 'जीवित (Living)');
    await tester.enterText(
        find.byKey(const ValueKey('new-proposal-reason')), ' ');
    await submit(tester);
    expect(writes, 0);
  });
  testWidgets(
      'switching other request drafts into parent does not leak fields or inferred identity',
      (tester) async {
    Map<String, dynamic>? sent;
    final api = GenealogyApiService(client: MockClient((r) async {
      sent = jsonDecode(r.body);
      return jsonResponse({'id': 'request'}, 201);
    }))
      ..setAuthToken('mock-access');
    addTearDown(api.dispose);
    await tester.pumpWidget(MaterialApp(
        home: ChangeRequestScreen(
            personId: 'target-person',
            personName: 'Synthetic target',
            apiService: api)));
    await tester.enterText(
        find.byType(TextField).at(0), 'Do not copy birth place');
    await tester.enterText(
        find.byType(TextField).at(1), 'Do not copy occupation');
    await choose(
        tester, 'proposal-request-type', 'मृत्यु दर्ता (Record Death)');
    await tester.enterText(
        find.byKey(const ValueKey('death-date-bs')), '2083-01-02');
    await tester.enterText(find.byKey(const ValueKey('death-year-bs')), '2083');
    await choose(tester, 'proposal-request-type', 'सन्तान थप (Add Child)');
    await tester.enterText(find.byKey(const ValueKey('child-nepali-name')),
        'Do not copy child name');
    await choose(tester, 'proposal-request-type', 'जीवनसाथी थप (Add Spouse)');
    await tester.enterText(find.byKey(const ValueKey('spouse-nepali-name')),
        'Do not copy spouse name');
    await choose(tester, 'spouse-gender', 'महिला (Female)');
    await choose(tester, 'spouse-living-status', 'जीवित (Living)');
    await choose(tester, 'proposal-request-type',
        'जैविक अभिभावक थप (Add Biological Parent)');
    expect(
        tester
            .widget<TextField>(find.byKey(const ValueKey('parent-nepali-name')))
            .controller!
            .text,
        isEmpty);
    expect(
        tester
            .widget<DropdownButtonFormField<String>>(
                find.byKey(const ValueKey('parent-gender')))
            .initialValue,
        isNull);
    await nameAndReason(tester);
    await choose(tester, 'parent-gender', 'अन्य (Other)');
    await choose(tester, 'parent-living-status', 'मृतक (Deceased)');
    await submit(tester);
    expect(sent!['proposedChanges'], {
      'primaryNameNepali': 'परीक्षण अभिभावक',
      'gender': 'OTHER',
      'livingStatus': 'DECEASED'
    });
  });
  testWidgets(
      'replacement session clears parent draft and prevents retained submit',
      (tester) async {
    var writes = 0;
    final api = GenealogyApiService(client: MockClient((r) async {
      writes++;
      return jsonResponse({'id': 'request'}, 201);
    }))
      ..setAuthToken('mock-access');
    addTearDown(api.dispose);
    await parentForm(tester, api);
    await nameAndReason(tester);
    await choose(tester, 'parent-gender', 'अन्य (Other)');
    await choose(tester, 'parent-living-status', 'जीवित (Living)');
    final callback = tester
        .widget<ElevatedButton>(
            find.byKey(const ValueKey('new-proposal-submit')))
        .onPressed!;
    api.setAuthToken('replacement-session');
    await tester.pumpAndSettle();
    callback();
    await tester.pumpAndSettle();
    expect(writes, 0);
    expect(find.byKey(const ValueKey('parent-nepali-name')), findsNothing);
    expect(find.text('सत्र बदलियो (Session changed)'), findsOneWidget);
  });
  testWidgets(
      'duplicate retained submission sends once while parent request is pending',
      (tester) async {
    var writes = 0;
    final response = Completer<void>();
    final api = GenealogyApiService(client: MockClient((r) async {
      writes++;
      await response.future;
      return jsonResponse({'id': 'request'}, 201);
    }))
      ..setAuthToken('mock-access');
    addTearDown(api.dispose);
    await parentForm(tester, api);
    await nameAndReason(tester);
    await choose(tester, 'parent-gender', 'महिला (Female)');
    await choose(tester, 'parent-living-status', 'जीवित (Living)');
    final callback = tester
        .widget<ElevatedButton>(
            find.byKey(const ValueKey('new-proposal-submit')))
        .onPressed!;
    callback();
    callback();
    await tester.pump();
    expect(writes, 1);
    expect(
        tester
            .widget<ElevatedButton>(
                find.byKey(const ValueKey('new-proposal-submit')))
            .onPressed,
        isNull);
    response.complete();
    await tester.pumpAndSettle();
    expect(writes, 1);
  });
}
