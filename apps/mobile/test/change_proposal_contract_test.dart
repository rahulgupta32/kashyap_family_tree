import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/testing.dart';
import 'package:kashyap_mobile/screens/change_request_screen.dart';
import 'package:kashyap_mobile/services/genealogy_api_service.dart';
import 'native_session_test.dart' show jsonResponse;

void main() {
  testWidgets('only confirmed private evidence joins the proposal payload', (
    tester,
  ) async {
    const picker = MethodChannel('kashyap/chat_attachments');
    final messenger =
        TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;
    messenger.setMockMethodCallHandler(picker, (call) async {
      expect(call.method, 'pickProfile');
      return {'mimeType': 'image/png', 'dataBase64': 'dGVzdA=='};
    });
    addTearDown(() => messenger.setMockMethodCallHandler(picker, null));

    const assetId = '84e3c15e-34d1-4e07-a7d8-27e15a998e98';
    var uploads = 0;
    Map<String, dynamic>? proposal;
    final api = GenealogyApiService(
      client: MockClient((request) async {
        final body = jsonDecode(request.body) as Map<String, dynamic>;
        if (request.url.path == '/me/claim-evidence') {
          expect(body, {
            'mimeType': 'image/png',
            'dataBase64': 'dGVzdA==',
            'documentType': 'family_photo',
            'evidenceNoticeAccepted': true,
          });
          return jsonResponse({
            'mediaAssetId': ++uploads == 1 ? 'quarantined' : assetId,
            'quarantineStatus': uploads == 1 ? 'QUARANTINED' : 'CLEAN',
          }, 201);
        }
        expect(request.url.path, '/change-requests');
        proposal = body;
        return jsonResponse({'id': 'request'}, 201);
      }),
    )..setAuthToken('mock');
    addTearDown(api.dispose);

    await tester.pumpWidget(
      MaterialApp(
        home: ChangeRequestScreen(
          personId: 'person',
          personName: 'Synthetic person',
          apiService: api,
        ),
      ),
    );

    Future<void> tapVisible(Finder finder) async {
      await tester.ensureVisible(finder);
      await tester.pumpAndSettle();
      await tester.tap(finder);
      await tester.pumpAndSettle();
    }

    await tester.enterText(
      find.byKey(const ValueKey('new-proposal-reason')),
      'Family record for independent review',
    );
    await tester.enterText(
      find.byType(TextField).first,
      'Fictional birthplace',
    );
    await tester.testTextInput.receiveAction(TextInputAction.done);
    FocusManager.instance.primaryFocus?.unfocus();
    await tester.pumpAndSettle();
    await tapVisible(find.text('निजी प्रमाण (Private evidence) · 0/5'));
    final upload = find.byKey(const ValueKey('proposal-evidence-upload'));
    expect(tester.widget<OutlinedButton>(upload).onPressed, isNull);
    await tapVisible(find.byKey(const ValueKey('proposal-evidence-notice')));
    await tapVisible(upload);
    expect(find.textContaining('Evidence upload unconfirmed'), findsOneWidget);
    expect(find.text('निजी प्रमाण (Private evidence) · 0/5'), findsOneWidget);
    await tapVisible(upload);
    expect(find.text('निजी प्रमाण (Private evidence) · 1/5'), findsOneWidget);
    await tapVisible(find.byKey(const ValueKey('new-proposal-submit')));
    expect(uploads, 2);
    expect(proposal?['evidenceAssetIds'], [assetId]);
    expect(proposal?['proposedChanges'], {
      'birthPlace': 'Fictional birthplace',
    });
  }, variant: const TargetPlatformVariant({TargetPlatform.android, TargetPlatform.iOS}));

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
