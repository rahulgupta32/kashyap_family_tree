import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/testing.dart';
import 'package:kashyap_mobile/localization/calendar_labels.dart';
import 'package:kashyap_mobile/screens/calendar_audience_picker.dart';
import 'package:kashyap_mobile/screens/calendar_events_screen.dart';
import 'package:kashyap_mobile/services/genealogy_api_service.dart';
import 'calendar_composition_test.dart' show tapButton, createDialog, chooseDate, titleKey;
import 'native_session_test.dart' show jsonResponse;

const audienceButton = 'आमन्त्रित समूह छान्नुहोस् (Choose invitation audience)';
const clearButton = 'समूह हटाउनुहोस् (Clear audience)';
const selection = {'type': 'BRANCH', 'branchId': 'branch-1'};

Future<void> selectAudience(WidgetTester tester) async {
  await tapButton(tester, audienceButton);
  await tester.tap(find.byType(DropdownButtonFormField<String>).at(1));
  await tester.pumpAndSettle();
  await tester.tap(find.text('शाखा / Fictional branch').last);
  await tester.pumpAndSettle();
  final preview = find.text('समूह पूर्वावलोकन (Preview audience)');
  await tester.ensureVisible(preview); await tester.tap(preview); await tester.pumpAndSettle();
  final use = find.text('यो समूह प्रयोग गर्नुहोस् (Use audience)');
  await tester.ensureVisible(use); await tester.tap(use); await tester.pumpAndSettle();
}

void main() {
  for (final failure in ['403', '409', 'network']) {
    testWidgets('create $failure retains invitation scope and hides raw server errors on explicit retry', (tester) async {
      final bodies = <Map<String, dynamic>>[];
      final api = GenealogyApiService(client: MockClient((request) async {
        if (request.url.path == '/genealogy/branches') { return jsonResponse([{'id':'branch-1','nameNepali':'शाखा','nameEnglish':'Fictional branch'}]); }
        if (request.url.path == '/calendar/events/preview') { return jsonResponse({
          'previewId':'preview-1','selection':selection,'recipientCount':1,
          'expiresAt':DateTime.now().add(const Duration(minutes:10)).toIso8601String(),
          'recipients':[{'name':'Fictional recipient'}],
        }); }
        if (request.method == 'POST') {
          bodies.add(jsonDecode(request.body) as Map<String, dynamic>);
          if (failure == 'network') { throw StateError('sensitive diagnostic fixture'); }
          return jsonResponse({'message':'sensitive diagnostic fixture'}, int.parse(failure));
        }
        return jsonResponse([]);
      }))..setAuthToken('fixture');
      addTearDown(api.dispose);
      await tester.pumpWidget(MaterialApp(home:CalendarEventsScreen(apiService:api)));
      await tester.pumpAndSettle(); await createDialog(tester);
      await tester.enterText(find.byKey(titleKey),'Private fictional event');
      await chooseDate(tester); await selectAudience(tester);
      await tapButton(tester,calendarLabels['save']!);
      expect(find.text(calendarLabels['createFailed']!),findsOneWidget);
      expect(find.textContaining('sensitive diagnostic fixture'),findsNothing);
      expect(find.text(clearButton),findsOneWidget);
      await tapButton(tester,calendarLabels['save']!);
      expect(bodies.length,2);
      for (final body in bodies) {
        expect(body['audienceScope'],'INVITED_ONLY');
        expect(body['audienceSelection'],selection);
        expect(body['audiencePreviewId'],'preview-1');
      }
      expect(bodies[1],bodies[0]);
      expect(tester.takeException(),isNull);
    });
  }

  testWidgets('cancelling replacement audience selection retains the previous private preview', (tester) async {
    Map<String,dynamic>? submitted;
    final api=GenealogyApiService(client:MockClient((request) async {
      if(request.url.path=='/genealogy/branches') { return jsonResponse([{'id':'branch-1','nameNepali':'शाखा','nameEnglish':'Fictional branch'}]); }
      if(request.url.path=='/calendar/events/preview') { return jsonResponse({'previewId':'preview-1','selection':selection,'recipientCount':1,
        'expiresAt':DateTime.now().add(const Duration(minutes:10)).toIso8601String(),'recipients':[{'name':'Fictional recipient'}]}); }
      if(request.method=='POST'){submitted=jsonDecode(request.body) as Map<String,dynamic>;return jsonResponse({},201);}
      return jsonResponse([]);
    }))..setAuthToken('fixture');addTearDown(api.dispose);
    await tester.pumpWidget(MaterialApp(home:CalendarEventsScreen(apiService:api)));await tester.pumpAndSettle();await createDialog(tester);
    await tester.enterText(find.byKey(titleKey),'Private fictional event');await chooseDate(tester);await selectAudience(tester);
    await tapButton(tester,audienceButton);await tester.pageBack();await tester.pumpAndSettle();
    expect(find.text(clearButton),findsOneWidget);await tapButton(tester,calendarLabels['save']!);
    expect(submitted!['audienceScope'],'INVITED_ONLY');expect(submitted!['audiencePreviewId'],'preview-1');
  });

  testWidgets('expired audience stays selected and blocks repeated saves until explicitly cleared', (tester) async {
    final bodies=<Map<String,dynamic>>[];
    final api=GenealogyApiService(client:MockClient((request) async {
      if(request.method=='POST'){bodies.add(jsonDecode(request.body) as Map<String,dynamic>);return jsonResponse({},201);}
      return jsonResponse([]);
    }))..setAuthToken('fixture');addTearDown(api.dispose);
    await tester.pumpWidget(MaterialApp(home:CalendarEventsScreen(apiService:api)));await tester.pumpAndSettle();await createDialog(tester);
    await tester.enterText(find.byKey(titleKey),'Expired invitation fixture');await chooseDate(tester);
    await tapButton(tester,audienceButton);
    // Model a preview which expires between picker return and submission.
    Navigator.of(tester.element(find.byType(CalendarAudiencePicker))).pop({'audienceSelection':selection,'audiencePreviewId':'expired-preview',
      'expiresAt':DateTime.now().subtract(const Duration(minutes:1)).toIso8601String(),'recipientCount':1});
    await tester.pumpAndSettle();await tapButton(tester,calendarLabels['save']!);
    expect(find.text(calendarLabels['audienceExpired']!),findsOneWidget);expect(find.text(clearButton),findsOneWidget);expect(bodies,isEmpty);
    await tapButton(tester,calendarLabels['save']!);expect(bodies,isEmpty);
    await tapButton(tester,clearButton);await tapButton(tester,calendarLabels['save']!);
    expect(bodies.single['audienceScope'],'COMMUNITY');expect(bodies.single.containsKey('audienceSelection'),isFalse);
  });
}
