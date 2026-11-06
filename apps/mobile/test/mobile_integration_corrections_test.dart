import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/testing.dart';
import 'package:kashyap_mobile/screens/my_change_requests_screen.dart';
import 'package:kashyap_mobile/services/genealogy_api_service.dart';
import 'native_session_test.dart' show jsonResponse, MemorySessionStore;
import 'chat_outbox_test.dart' show MemoryChatOutboxStore;

String token(String owner) =>
    'fixture.${base64Url.encode(utf8.encode(jsonEncode({
          'sub': owner
        })))}.fixture';
void main() {
  testWidgets(
      'own proposal discovery filters other authorized reviewer rows and resubmission preserves unrelated fields',
      (tester) async {
    Map<String, dynamic>? body;
    var pending = false;
    final row = {
      'id': 'change',
      'requesterUserId': 'owner',
      'type': 'EDIT_PERSON',
      'status': 'CORRECTION_REQUESTED',
      'version': 2,
      'reason': 'Synthetic reason',
      'correctionNotes': 'Please correct',
      'proposedChanges': {
        'birthPlace': 'Original',
        'education': 'Retain original'
      }
    };
    final api = GenealogyApiService(client: MockClient((r) async {
      if (r.method == 'POST') {
        expect(r.url.path, '/change-requests/change/resubmit');
        body = jsonDecode(r.body);
        pending = true;
        return jsonResponse({...row, 'status': 'PENDING'});
      }
      if (r.url.path == '/change-requests') {
        return jsonResponse([
          row,
          {
            ...row,
            'id': 'foreign',
            'requesterUserId': 'other',
            'reason': 'Do not show other request'
          }
        ]);
      }
      return jsonResponse(
          {...row, 'status': pending ? 'PENDING' : 'CORRECTION_REQUESTED'});
    }))
      ..setAuthToken(token('owner'));
    addTearDown(api.dispose);
    await tester
        .pumpWidget(MaterialApp(home: MyChangeRequestsScreen(api: api)));
    await tester.pumpAndSettle();
    expect(find.text('Do not show other request'), findsNothing);
    await tester.tap(find.text('Synthetic reason'));
    await tester.pumpAndSettle();
    await tester.enterText(
        find.byKey(const ValueKey('proposal-birth')), 'Corrected');
    await tester.ensureVisible(find.byKey(const ValueKey('proposal-resubmit')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('proposal-resubmit')));
    await tester.pumpAndSettle();
    expect(body!['proposedChanges'],
        {'birthPlace': 'Corrected', 'education': 'Retain original'});
    expect(find.byKey(const ValueKey('proposal-resubmit')), findsNothing);
    api.setAuthToken(token('other'));
    await tester.pumpAndSettle();
    expect(find.text('Synthetic reason'), findsNothing);
  });
  test(
      'global logout validates acknowledgement before clearing the local session',
      () async {
    var malformed = true;
    final api = GenealogyApiService(
        sessionStore: MemorySessionStore(), chatOutboxStore: MemoryChatOutboxStore(),
        client: MockClient((r) async {
          expect(r.method, 'POST');
          expect(r.url.path, '/auth/logout-all');
          return jsonResponse(
              {'success': true, 'revokedCount': malformed ? '2' : 2});
        }))
      ..setAuthToken(token('owner'));
    addTearDown(api.dispose);
    await expectLater(api.logoutAll(), throwsFormatException);
    expect(api.authToken, isNotNull);
    malformed = false;
    await api.logoutAll();
    expect(api.authToken, isNull);
  });
}
