import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/testing.dart';
import 'package:kashyap_mobile/screens/my_change_requests_screen.dart';
import 'package:kashyap_mobile/services/genealogy_api_service.dart';
import 'mobile_integration_corrections_test.dart' show token;
import 'native_session_test.dart' show jsonResponse;

Map<String, dynamic> proposalRow(String type, Map<String, dynamic> proposal,
        {String status = 'CORRECTION_REQUESTED', String owner = 'owner'}) =>
    {
      'id': 'spouse',
      'requesterUserId': owner,
      'type': type,
      'status': status,
      'version': 2,
      'reason': 'Correct synthetic proposal',
      'proposedChanges': proposal,
    };

Future<void> submit(WidgetTester tester) async {
  final button = find.byKey(const ValueKey('proposal-resubmit'));
  await tester.ensureVisible(button);
  await tester.tap(button);
  await tester.pumpAndSettle();
}

void main() {
  for (final type in ['ADD_SPOUSE', 'ADD_SPOUSE_LINK']) {
    testWidgets(
        '$type new-person correction preserves stored facts and evidence',
        (tester) async {
      Map<String, dynamic>? sent;
      final proposal = <String, dynamic>{
        'primaryNameNepali': 'पहिले',
        'primaryNameEnglish': 'Before',
        'gender': 'FEMALE',
        'livingStatus': 'DECEASED',
        'marriageDateBs': '2060-02-10',
        'evidenceAssetIds': ['retain-private-evidence'],
        'additionalContext': {'retain': true},
      };
      final row = proposalRow(type, proposal);
      final api = GenealogyApiService(client: MockClient((r) async {
        if (r.method == 'POST') {
          expect(r.url.path, '/change-requests/spouse/resubmit');
          sent = jsonDecode(r.body);
        }
        return jsonResponse(
            {...row, 'status': sent == null ? row['status'] : 'PENDING'});
      }))
        ..setAuthToken(token('owner'));
      addTearDown(api.dispose);
      await tester.pumpWidget(MaterialApp(
          home: MyChangeRequestsScreen(api: api, initialId: 'spouse')));
      await tester.pumpAndSettle();
      await tester.enterText(
          find.byKey(const ValueKey('proposal-spouse-nepali')), 'सच्याइएको');
      await tester.enterText(
          find.byKey(const ValueKey('proposal-spouse-english')), 'Corrected');
      await tester.tap(find.byKey(const ValueKey('proposal-spouse-gender')));
      await tester.pumpAndSettle();
      await tester.tap(find.text('अन्य (Other)').last);
      await tester.pumpAndSettle();
      await submit(tester);
      expect(sent!['proposedChanges'], {
        ...proposal,
        'primaryNameNepali': 'सच्याइएको',
        'primaryNameEnglish': 'Corrected',
        'gender': 'OTHER',
      });
      expect(find.text('$type · PENDING'), findsOneWidget);
      expect(find.byKey(const ValueKey('proposal-resubmit')), findsNothing);
    });
    for (final alias in ['spousePersonId', 'spouseId']) {
      testWidgets(
          '$type preserves existing target alias $alias and permits reason only',
          (tester) async {
        Map<String, dynamic>? sent;
        final proposal = <String, dynamic>{
          alias: 'existing-spouse',
          'primaryNameNepali': 'Retained original proposal name',
          'gender': 'OTHER',
          'livingStatus': 'DECEASED',
          'evidenceAssetId': 'retain',
        };
        final row = proposalRow(type, proposal, status: 'CONFLICT_DETECTED');
        final api = GenealogyApiService(client: MockClient((r) async {
          if (r.method == 'POST') sent = jsonDecode(r.body);
          return jsonResponse(
              {...row, 'status': sent == null ? row['status'] : 'PENDING'});
        }))
          ..setAuthToken(token('owner'));
        addTearDown(api.dispose);
        await tester.pumpWidget(MaterialApp(
            home: MyChangeRequestsScreen(api: api, initialId: 'spouse')));
        await tester.pumpAndSettle();
        expect(
            find.byKey(const ValueKey('proposal-spouse-nepali')), findsNothing);
        expect(
            find.byKey(const ValueKey('proposal-spouse-gender')), findsNothing);
        expect(find.byType(TextField), findsOneWidget);
        await tester.enterText(find.byKey(const ValueKey('proposal-reason')),
            'Correct relationship evidence explanation');
        await submit(tester);
        expect(sent, {
          'proposedChanges': proposal,
          'reason': 'Correct relationship evidence explanation'
        });
      });
    }
  }

  testWidgets(
      'spouse correction retains explicit UNKNOWN gender and living status',
      (tester) async {
    Map<String, dynamic>? sent;
    final proposal = <String, dynamic>{
      'primaryNameNepali': 'Original',
      'gender': 'UNKNOWN',
      'livingStatus': 'UNKNOWN',
      'evidenceAssetId': 'retain'
    };
    final row = proposalRow('ADD_SPOUSE', proposal);
    final api = GenealogyApiService(client: MockClient((r) async {
      if (r.method == 'POST') sent = jsonDecode(r.body);
      return jsonResponse(
          {...row, 'status': sent == null ? row['status'] : 'PENDING'});
    }))
      ..setAuthToken(token('owner'));
    addTearDown(api.dispose);
    await tester.pumpWidget(MaterialApp(
        home: MyChangeRequestsScreen(api: api, initialId: 'spouse')));
    await tester.pumpAndSettle();
    expect(
        tester
            .widget<DropdownButtonFormField<String>>(
                find.byKey(const ValueKey('proposal-spouse-gender')))
            .initialValue,
        'UNKNOWN');
    await tester.enterText(
        find.byKey(const ValueKey('proposal-spouse-nepali')), 'Corrected');
    await submit(tester);
    expect(sent!['proposedChanges'],
        {...proposal, 'primaryNameNepali': 'Corrected'});
  });

  testWidgets(
      'new spouse correction requires explicit name and gender before POST',
      (tester) async {
    var writes = 0;
    final row = proposalRow('ADD_SPOUSE',
        {'primaryNameNepali': 'Original', 'evidenceAssetId': 'retain'});
    final api = GenealogyApiService(client: MockClient((r) async {
      if (r.method == 'POST') writes++;
      return jsonResponse(row);
    }))
      ..setAuthToken(token('owner'));
    addTearDown(api.dispose);
    await tester.pumpWidget(MaterialApp(
        home: MyChangeRequestsScreen(api: api, initialId: 'spouse')));
    await tester.pumpAndSettle();
    await submit(tester);
    expect(writes, 0);
    await tester.tap(find.byKey(const ValueKey('proposal-spouse-gender')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('अन्य (Other)').last);
    await tester.pumpAndSettle();
    await tester.enterText(
        find.byKey(const ValueKey('proposal-spouse-nepali')), ' ');
    await submit(tester);
    expect(writes, 0);
    expect(
        find.textContaining('Spouse name and gender required'), findsOneWidget);
  });

  testWidgets('spouse terminal and already pending proposals remain read-only',
      (tester) async {
    for (final status in [
      'PENDING',
      'APPROVED',
      'REJECTED',
      'WITHDRAWN',
      'SUPERSEDED'
    ]) {
      final api = GenealogyApiService(client: MockClient((r) async {
        expect(r.method, 'GET');
        return jsonResponse(proposalRow(
            'ADD_SPOUSE_LINK', {'spouseId': 'existing'},
            status: status));
      }))
        ..setAuthToken(token('owner'));
      await tester.pumpWidget(MaterialApp(
          home: MyChangeRequestsScreen(
              key: ValueKey(status), api: api, initialId: 'spouse')));
      await tester.pumpAndSettle();
      expect(find.text('ADD_SPOUSE_LINK · $status'), findsOneWidget);
      expect(find.byKey(const ValueKey('proposal-resubmit')), findsNothing);
      await tester.pumpWidget(const SizedBox.shrink());
      api.dispose();
    }
  });

  testWidgets(
      'replacement account clears spouse draft and blocks retained submit callback',
      (tester) async {
    var writes = 0;
    final api = GenealogyApiService(client: MockClient((r) async {
      if (r.method == 'POST') writes++;
      return jsonResponse(proposalRow('ADD_SPOUSE',
          {'primaryNameNepali': 'Private draft', 'gender': 'OTHER'}));
    }))
      ..setAuthToken(token('owner'));
    addTearDown(api.dispose);
    await tester.pumpWidget(MaterialApp(
        home: MyChangeRequestsScreen(api: api, initialId: 'spouse')));
    await tester.pumpAndSettle();
    final callback = tester
        .widget<FilledButton>(find.byKey(const ValueKey('proposal-resubmit')))
        .onPressed!;
    api.setAuthToken(token('replacement'));
    await tester.pumpAndSettle();
    callback();
    await tester.pumpAndSettle();
    expect(writes, 0);
    expect(find.text('Private draft'), findsNothing);
    expect(find.byKey(const ValueKey('proposal-spouse-nepali')), findsNothing);
    expect(find.textContaining('Session changed'), findsOneWidget);
  });

  testWidgets('foreign spouse request detail never exposes correction controls',
      (tester) async {
    final api = GenealogyApiService(client: MockClient((r) async {
      expect(r.method, 'GET');
      return jsonResponse(proposalRow(
          'ADD_SPOUSE', {'primaryNameNepali': 'Foreign private draft'},
          owner: 'other'));
    }))
      ..setAuthToken(token('owner'));
    addTearDown(api.dispose);
    await tester.pumpWidget(MaterialApp(
        home: MyChangeRequestsScreen(api: api, initialId: 'spouse')));
    await tester.pumpAndSettle();
    expect(find.text('Foreign private draft'), findsNothing);
    expect(find.byKey(const ValueKey('proposal-resubmit')), findsNothing);
    expect(find.textContaining('Request unavailable or access denied'),
        findsOneWidget);
  });
}
