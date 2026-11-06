import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/testing.dart';
import 'package:kashyap_mobile/screens/change_request_screen.dart';
import 'package:kashyap_mobile/services/genealogy_api_service.dart';
import 'native_session_test.dart' show jsonResponse;

void main() {
  for (final type in ['ADD_CHILD', 'RECORD_DEATH']) {
    testWidgets(
        '$type submits its actual existing backend fields rather than edit-person fields',
        (tester) async {
      Map<String, dynamic>? body;
      final api = GenealogyApiService(client: MockClient((r) async {
        expect(r.url.path, '/change-requests');
        body = jsonDecode(r.body);
        return jsonResponse({'id': 'request'}, 201);
      }))
        ..setAuthToken('mock');
      addTearDown(api.dispose);
      await tester.pumpWidget(MaterialApp(
          home: ChangeRequestScreen(
              personId: 'person',
              personName: 'Synthetic person',
              apiService: api)));
      await tester.tap(find.byType(DropdownButtonFormField<String>).first);
      await tester.pumpAndSettle();
      await tester.tap(find
          .text(type == 'ADD_CHILD'
              ? 'सन्तान थप (Add Child)'
              : 'मृत्यु दर्ता (Record Death)')
          .last);
      await tester.pumpAndSettle();
      if (type == 'ADD_CHILD') {
        await tester.enterText(
            find.byKey(const ValueKey('child-nepali-name')), 'परीक्षण बच्चा');
      } else {
        await tester.enterText(
            find.byKey(const ValueKey('death-date-bs')), '2083-07-20');
        await tester.enterText(
            find.byKey(const ValueKey('death-year-bs')), '2083');
      }
      await tester.enterText(find.byType(TextField).last,
          'Synthetic owner proposal for independent review');
      final save = find.text('प्रस्ताव पेश गर्नुहोस् (Submit Proposal)');
      await tester.ensureVisible(save);
      await tester.pumpAndSettle();
      await tester.tap(save);
      await tester.pumpAndSettle();
      expect(body!['type'], type);
      expect(body!['targetPersonId'], 'person');
      expect(
          body!['proposedChanges'],
          type == 'ADD_CHILD'
              ? {
                  'primaryNameNepali': 'परीक्षण बच्चा',
                  'gender': 'OTHER',
                  'livingStatus': 'LIVING'
                }
              : {'deathDateBs': '2083-07-20', 'deathYearBs': 2083});
    });
  }
}
