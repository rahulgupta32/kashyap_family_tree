import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:kashyap_mobile/screens/change_request_screen.dart';
import 'package:kashyap_mobile/services/genealogy_api_service.dart';
import 'native_session_test.dart' show jsonResponse;
import 'parent_proposal_creation_test.dart' show choose, submit;

const parentLabel = 'जैविक अभिभावक थप (Add Biological Parent)';
const spouseLabel = 'जीवनसाथी थप (Add Spouse)';
const existingLabel = 'पहिलेको व्यक्ति (Existing person)';
const newLabel = 'नयाँ व्यक्ति (New person)';

Map<String, dynamic> person(String id, String name) => {
      'id': id,
      'primaryNameNepali': name,
      'primaryNameEnglish': 'Synthetic $name',
      'branchName': 'Synthetic branch',
      'generation': 2,
      'gender': 'OTHER',
      'livingStatus': 'UNKNOWN',
    };

Future<void> form(WidgetTester tester, GenealogyApiService api,
    {String relation = 'parent'}) async {
  await tester.pumpWidget(MaterialApp(
      home: ChangeRequestScreen(
          personId: 'target-person',
          personName: 'Synthetic target',
          apiService: api)));
  await tester.pumpAndSettle();
  await choose(tester, 'proposal-request-type',
      relation == 'parent' ? parentLabel : spouseLabel);
  await choose(tester, '$relation-person-mode', existingLabel);
}

Future<void> search(WidgetTester tester, String relation, String query) async {
  final field = find.byKey(ValueKey('$relation-person-query'));
  await tester.ensureVisible(field);
  await tester.enterText(field, query);
  // Render the new query revision before interacting with its search control.
  await tester.pump();
  final button = find.byKey(ValueKey('$relation-person-search'));
  await tester.ensureVisible(button);
  await tester.tap(button);
  await tester.pumpAndSettle();
}

Future<void> select(WidgetTester tester, String relation, String id) async {
  final result = find.byKey(ValueKey('$relation-person-result-$id'));
  await tester.ensureVisible(result);
  await tester.tap(result);
  await tester.pumpAndSettle();
}

void main() {
  for (final relation in ['parent', 'spouse']) {
    testWidgets('existing $relation submission uses selected identity only',
        (tester) async {
      Map<String, dynamic>? sent;
      final api = GenealogyApiService(client: MockClient((r) async {
        expect(r.headers['authorization'], 'Bearer synthetic-session');
        if (r.method == 'GET') {
          expect(r.url.path, '/genealogy/search');
          expect(r.url.queryParameters['query'], 'Synthetic name');
          return jsonResponse({
            'items': [
              person('target-person', 'Self'),
              person('', 'Invalid identity'),
              {...person('archived', 'Archived'), 'isArchived': true},
              person('existing-$relation', 'Chosen name')
            ]
          });
        }
        expect(r.url.path, '/change-requests');
        sent = jsonDecode(r.body);
        return jsonResponse({'id': 'request'}, 201);
      }))
        ..setAuthToken('synthetic-session');
      addTearDown(api.dispose);
      await form(tester, api, relation: relation);
      expect(find.byKey(ValueKey('$relation-nepali-name')), findsNothing);
      await search(tester, relation, '  Synthetic name  ');
      expect(find.text('Self'), findsNothing);
      expect(find.text('Invalid identity'), findsNothing);
      expect(find.text('Archived'), findsNothing);
      expect(find.textContaining('Synthetic branch'), findsOneWidget);
      await select(tester, relation, 'existing-$relation');
      expect(find.byKey(ValueKey('$relation-person-selected')), findsOneWidget);
      await tester.enterText(find.byKey(const ValueKey('new-proposal-reason')),
          '  Synthetic relationship for independent review  ');
      await submit(tester);
      expect(sent, {
        'targetPersonId': 'target-person',
        'type': relation == 'parent' ? 'ADD_PARENT' : 'ADD_SPOUSE',
        'proposedChanges': {'${relation}PersonId': 'existing-$relation'},
        'reason': 'Synthetic relationship for independent review',
      });
    });
  }

  testWidgets(
      'unselected or changed search cannot submit an arbitrary identity',
      (tester) async {
    var writes = 0;
    final api = GenealogyApiService(client: MockClient((r) async {
      if (r.method == 'GET') {
        return jsonResponse({
          'items': [person('found', 'Found person')]
        });
      }
      writes++;
      return jsonResponse({'id': 'request'}, 201);
    }))
      ..setAuthToken('synthetic-session');
    addTearDown(api.dispose);
    await form(tester, api);
    await tester.enterText(
        find.byKey(const ValueKey('new-proposal-reason')), 'Synthetic reason');
    await search(tester, 'parent', 'Name');
    await submit(tester);
    expect(writes, 0);
    await select(tester, 'parent', 'found');
    await tester.enterText(find.byKey(const ValueKey('parent-person-query')),
        'A different person');
    await tester.pump();
    expect(find.byKey(const ValueKey('parent-person-selected')), findsNothing);
    await submit(tester);
    expect(writes, 0);
  });

  testWidgets(
      'parent and spouse selections and new-person drafts stay separate',
      (tester) async {
    Map<String, dynamic>? sent;
    final api = GenealogyApiService(client: MockClient((r) async {
      if (r.method == 'GET') {
        final name = r.url.queryParameters['query']!;
        return jsonResponse({
          'items': [person(name, name)]
        });
      }
      sent = jsonDecode(r.body);
      return jsonResponse({'id': 'request'}, 201);
    }))
      ..setAuthToken('synthetic-session');
    addTearDown(api.dispose);
    await form(tester, api);
    await choose(tester, 'parent-person-mode', newLabel);
    await tester.enterText(find.byKey(const ValueKey('parent-nepali-name')),
        'Do not submit this new-person draft');
    await choose(tester, 'parent-person-mode', existingLabel);
    await search(tester, 'parent', 'Parent');
    await select(tester, 'parent', 'Parent');
    await choose(tester, 'proposal-request-type', spouseLabel);
    await choose(tester, 'spouse-person-mode', existingLabel);
    expect(find.byKey(const ValueKey('spouse-person-selected')), findsNothing);
    expect(
        tester
            .widget<TextField>(
                find.byKey(const ValueKey('spouse-person-query')))
            .controller!
            .text,
        isEmpty);
    await search(tester, 'spouse', 'Spouse');
    await select(tester, 'spouse', 'Spouse');
    await choose(tester, 'proposal-request-type', parentLabel);
    expect(find.textContaining('Selected): Parent'), findsOneWidget);
    await tester.enterText(find.byKey(const ValueKey('new-proposal-reason')),
        'Synthetic parent link');
    await submit(tester);
    expect(sent!['proposedChanges'], {'parentPersonId': 'Parent'});
  });

  testWidgets(
      'late search results and retained result callbacks cannot cross relation types',
      (tester) async {
    final late = Completer<http.Response>();
    final api = GenealogyApiService(client: MockClient((r) async {
      if (r.url.queryParameters['query'] == 'Late') return late.future;
      return jsonResponse({
        'items': [person('parent-id', 'Parent result')]
      });
    }))
      ..setAuthToken('synthetic-session');
    addTearDown(api.dispose);
    await form(tester, api);
    await search(tester, 'parent', 'Parent');
    final callback = tester
        .widget<ListTile>(
            find.byKey(const ValueKey('parent-person-result-parent-id')))
        .onTap!;
    await search(tester, 'parent', 'Late');
    await choose(tester, 'proposal-request-type', spouseLabel);
    await choose(tester, 'spouse-person-mode', existingLabel);
    callback();
    late.complete(jsonResponse({
      'items': [person('late-id', 'Late parent result')]
    }));
    await tester.pumpAndSettle();
    expect(find.text('Late parent result'), findsNothing);
    expect(find.byKey(const ValueKey('spouse-person-selected')), findsNothing);
    await choose(tester, 'proposal-request-type', parentLabel);
    expect(find.byKey(const ValueKey('parent-person-result-late-id')),
        findsNothing);
    expect(find.byKey(const ValueKey('parent-person-selected')), findsNothing);
  });

  testWidgets('newer query wins over an older in-flight search',
      (tester) async {
    final old = Completer<http.Response>();
    final api = GenealogyApiService(client: MockClient((r) async {
      if (r.url.queryParameters['query'] == 'Old') return old.future;
      return jsonResponse({
        'items': [person('new-id', 'New result')]
      });
    }))
      ..setAuthToken('synthetic-session');
    addTearDown(api.dispose);
    await form(tester, api);
    await search(tester, 'parent', 'Old');
    await search(tester, 'parent', 'New');
    old.complete(jsonResponse({
      'items': [person('old-id', 'Old result')]
    }));
    await tester.pumpAndSettle();
    expect(find.text('Old result'), findsNothing);
    expect(find.text('New result'), findsOneWidget);
    await select(tester, 'parent', 'new-id');
    expect(find.textContaining('Selected): New result'), findsOneWidget);
  });

  testWidgets('session replacement clears selection and ignores pending search',
      (tester) async {
    final late = Completer<http.Response>();
    var writes = 0;
    final api = GenealogyApiService(client: MockClient((r) async {
      if (r.method == 'POST') {
        writes++;
        return jsonResponse({'id': 'request'}, 201);
      }
      if (r.url.queryParameters['query'] == 'Late') return late.future;
      return jsonResponse({
        'items': [person('person', 'Original result')]
      });
    }))
      ..setAuthToken('synthetic-session');
    addTearDown(api.dispose);
    await form(tester, api);
    await search(tester, 'parent', 'Name');
    await select(tester, 'parent', 'person');
    await tester.enterText(
        find.byKey(const ValueKey('new-proposal-reason')), 'Synthetic reason');
    final callback = tester
        .widget<ElevatedButton>(
            find.byKey(const ValueKey('new-proposal-submit')))
        .onPressed!;
    await search(tester, 'parent', 'Late');
    api.setAuthToken('replacement');
    callback();
    late.complete(jsonResponse({
      'items': [person('late', 'Private old result')]
    }));
    await tester.pumpAndSettle();
    expect(writes, 0);
    expect(find.text('सत्र बदलियो (Session changed)'), findsOneWidget);
    expect(find.text('Private old result'), findsNothing);
    expect(find.byKey(const ValueKey('parent-person-selected')), findsNothing);
  });

  testWidgets('retained submit callback cannot duplicate a successful request', (tester) async {
    var writes = 0;
    final api = GenealogyApiService(client: MockClient((r) async {
      if (r.method == 'GET') return jsonResponse({'items': [person('selected', 'Selected person')]});
      writes++;
      return jsonResponse({'id': 'request'}, 201);
    }))..setAuthToken('synthetic-session');
    addTearDown(api.dispose);
    await form(tester, api);
    await search(tester, 'parent', 'Name');
    await select(tester, 'parent', 'selected');
    await tester.enterText(find.byKey(const ValueKey('new-proposal-reason')), 'Synthetic reason');
    final callback = tester.widget<ElevatedButton>(find.byKey(const ValueKey('new-proposal-submit'))).onPressed!;
    await submit(tester);
    expect(writes, 1);
    callback();
    await tester.pumpAndSettle();
    expect(writes, 1);
  });

  testWidgets('search callback from the previous query cannot start a request', (tester) async {
    var reads = 0;
    final api = GenealogyApiService(client: MockClient((r) async {
      reads++;
      return jsonResponse({'items': []});
    }))..setAuthToken('synthetic-session');
    addTearDown(api.dispose);
    await form(tester, api);
    final oldSearch = tester.widget<TextButton>(find.byKey(const ValueKey('parent-person-search'))).onPressed!;
    await tester.enterText(find.byKey(const ValueKey('parent-person-query')), 'A new query');
    await tester.pump();
    oldSearch();
    await tester.pumpAndSettle();
    expect(reads, 0);
    await search(tester, 'parent', 'A new query');
    expect(reads, 1);
    expect(find.textContaining('No matching person'), findsOneWidget);
  });

  testWidgets('empty search, error, empty results and retry stay explicit',
      (tester) async {
    var reads = 0;
    final api = GenealogyApiService(client: MockClient((r) async {
      reads++;
      if (reads == 1) return jsonResponse({'error': 'private diagnostic'}, 503);
      return jsonResponse({'items': []});
    }))
      ..setAuthToken('synthetic-session');
    addTearDown(api.dispose);
    await form(tester, api);
    await search(tester, 'parent', ' ');
    expect(reads, 0);
    expect(find.textContaining('Enter a name to search'), findsOneWidget);
    await search(tester, 'parent', 'Synthetic');
    expect(find.textContaining('Search failed'), findsOneWidget);
    expect(find.textContaining('private diagnostic'), findsNothing);
    await search(tester, 'parent', 'Synthetic');
    expect(reads, 2);
    expect(find.textContaining('No matching person'), findsOneWidget);
  });
}
