import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:kashyap_mobile/localization/claim_labels.dart';
import 'package:kashyap_mobile/screens/claim_status_screen.dart';
import 'package:kashyap_mobile/services/genealogy_api_service.dart';
import 'native_session_test.dart' show jsonResponse;

void main() {
  for (final tier in ['tier1', 'tier2']) {
    testWidgets('$tier rejection shows claimant feedback and safe next action without reviewer identity', (tester) async {
      final jwt = 'fixture.${base64Url.encode(utf8.encode(jsonEncode({'sub':'owner'})))}.fixture';
      final api = GenealogyApiService(client: MockClient((_) async => jsonResponse({
        'id':'claim', 'claimantUserId':'owner', 'status':'REJECTED',
        '${tier}Decision':'REJECTED', '${tier}Notes':'Fictional rejection reason',
        '${tier}ReviewedBy':'private-reviewer', 'claimantPhoneNumber':'private-phone',
        'evidenceAttachments':[{'mediaUrl':'private-evidence'}],
      })))..setAuthToken(jwt);
      addTearDown(api.dispose);
      await tester.pumpWidget(MaterialApp(home: ClaimStatusScreen(claimId:'claim',api:api)));
      await tester.pumpAndSettle();
      expect(find.text('Fictional rejection reason'), findsOneWidget);
      expect(find.text(claimLabels['rejectedNext']!), findsOneWidget);
      expect(find.textContaining('private-'), findsNothing);
      expect(find.widgetWithText(ElevatedButton,claimLabels['resubmit']!), findsNothing);
      api.setAuthToken('replacement'); await tester.pumpAndSettle();
      expect(find.text('Fictional rejection reason'), findsNothing);
      expect(find.text(claimLabels['session']!), findsOneWidget);
    });
  }
  testWidgets('malformed rejection feedback fails closed without rendering stale status', (tester) async {
    final jwt = 'fixture.${base64Url.encode(utf8.encode(jsonEncode({'sub':'owner'})))}.fixture';
    final api = GenealogyApiService(client: MockClient((_) async => jsonResponse({
      'id':'claim','claimantUserId':'owner','status':'REJECTED','tier1Decision':'REJECTED','tier1Notes':42,
    })))..setAuthToken(jwt);
    addTearDown(api.dispose);
    await tester.pumpWidget(MaterialApp(home: ClaimStatusScreen(claimId:'claim',api:api)));
    await tester.pumpAndSettle();
    expect(find.text(claimStatusLabels['REJECTED']!), findsNothing);
    expect(find.text(claimLabels['statusUnavailable']!), findsOneWidget);
  });

  testWidgets('fresh authorized claim shows correction instructions without private reviewer metadata', (tester) async {
    final api = GenealogyApiService(client: MockClient((request) async {
      expect(request.method, 'GET');
      expect(request.url.path, '/claims/claim');
      return jsonResponse({'id':'claim','status':'CORRECTION_REQUESTED',
        'correctionRequestNotes':'Fictional correction instruction',
        'claimantPhoneNumber':'private-phone','tier1ReviewedBy':'private-reviewer',
        'evidenceAttachments':[{'mediaUrl':'private-evidence'}]});
    }))..setAuthToken('old');
    addTearDown(api.dispose);
    await tester.pumpWidget(MaterialApp(home: ClaimStatusScreen(claimId:'claim',api:api)));
    await tester.pumpAndSettle();
    expect(find.text(claimStatusLabels['CORRECTION_REQUESTED']!), findsOneWidget);
    expect(find.text('Fictional correction instruction'), findsOneWidget);
    expect(find.textContaining('private-'), findsNothing);
  });

  testWidgets('failed refresh clears old decision and suppresses server diagnostic', (tester) async {
    var reads = 0;
    final api = GenealogyApiService(client: MockClient((_) async => ++reads == 1
      ? jsonResponse({'id':'claim','status':'APPROVED'})
      : http.Response('{"message":"Private diagnostic"}',403)))..setAuthToken('old');
    addTearDown(api.dispose);
    await tester.pumpWidget(MaterialApp(home: ClaimStatusScreen(claimId:'claim',api:api)));
    await tester.pumpAndSettle();
    expect(find.text(claimStatusLabels['APPROVED']!), findsOneWidget);
    await tester.tap(find.widgetWithText(OutlinedButton,claimLabels['statusRefresh']!));
    await tester.pumpAndSettle();
    expect(find.text(claimStatusLabels['APPROVED']!), findsNothing);
    expect(find.text(claimLabels['statusUnavailable']!), findsOneWidget);
    expect(find.textContaining('Private diagnostic'), findsNothing);
  });

  testWidgets('account replacement fences delayed status and removes reload controls', (tester) async {
    final response = Completer<http.Response>();
    var reads = 0;
    final api = GenealogyApiService(client: MockClient((_) { reads++; return response.future; }))..setAuthToken('old');
    addTearDown(api.dispose);
    await tester.pumpWidget(MaterialApp(home: ClaimStatusScreen(claimId:'claim',api:api)));
    await tester.pump();
    api.setAuthToken('replacement');
    response.complete(jsonResponse({'id':'claim','status':'CORRECTION_REQUESTED','correctionRequestNotes':'Private old note'}));
    await tester.pumpAndSettle();
    expect(find.text('Private old note'), findsNothing);
    expect(find.byType(OutlinedButton), findsNothing);
    expect(find.text(claimLabels['session']!), findsOneWidget);
    expect(reads,1);
  });

  testWidgets('mismatched returned claim identity fails closed', (tester) async {
    final api = GenealogyApiService(client: MockClient((_) async => jsonResponse({'id':'other','status':'APPROVED'})))..setAuthToken('old');
    addTearDown(api.dispose);
    await tester.pumpWidget(MaterialApp(home: ClaimStatusScreen(claimId:'claim',api:api)));
    await tester.pumpAndSettle();
    expect(find.text(claimStatusLabels['APPROVED']!), findsNothing);
    expect(find.text(claimLabels['statusUnavailable']!), findsOneWidget);
  });
}
