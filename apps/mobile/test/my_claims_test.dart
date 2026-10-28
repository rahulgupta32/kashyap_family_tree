import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:kashyap_mobile/localization/claim_labels.dart';
import 'package:kashyap_mobile/localization/my_claim_labels.dart';
import 'package:kashyap_mobile/screens/claim_status_screen.dart';
import 'package:kashyap_mobile/screens/my_claims_screen.dart';
import 'package:kashyap_mobile/screens/person_search_screen.dart';
import 'package:kashyap_mobile/services/genealogy_api_service.dart';
import 'native_session_test.dart' show jsonResponse;

Map<String,dynamic> claim() => {'id':'owned-claim','status':'PENDING_TIER1',
  'targetPersonId':'target-person',
  'claimantPhoneNumber':'private-phone','evidenceAttachments':[{'mediaUrl':'private-url'}]};

Map<String,dynamic> page(List<dynamic> items, [String? next]) => {'items':items,'nextCursor':next};

void main() {
  final hundred = List.generate(100,(index)=>{...claim(),'id':'claim-$index'});
  testWidgets('older pages are explicit and bounded with latest reset', (tester) async {
    final queries = <Map<String,String>>[];
    final api = GenealogyApiService(client:MockClient((request) async {
      queries.add(request.url.queryParameters);
      return jsonResponse(request.url.queryParameters['cursor'] == null
        ? page(hundred,'cursor_one') : page([{...claim(),'id':'old-claim'}]));
    }))..setAuthToken('member');
    addTearDown(api.dispose);
    await tester.pumpWidget(MaterialApp(home:MyClaimsScreen(api:api)));
    await tester.pumpAndSettle();
    expect(queries,[{'paged':'true'}]);
    final older = find.byKey(const ValueKey('older-claims'));
    await Scrollable.ensureVisible(tester.element(older),alignment:0.5);
    await tester.pumpAndSettle();await tester.tap(older);await tester.pumpAndSettle();
    expect(queries,[{'paged':'true'},{'paged':'true','cursor':'cursor_one'}]);
    expect(find.byKey(const ValueKey('my-claim-old-claim')),findsOneWidget);
    expect(find.byKey(const ValueKey('my-claim-claim-0')),findsNothing);
    expect(older,findsNothing); // Terminal older page.
    final latest = find.widgetWithText(OutlinedButton,myClaimLabels['reload']!);
    await Scrollable.ensureVisible(tester.element(latest),alignment:0.5);
    await tester.pumpAndSettle();await tester.tap(latest);await tester.pumpAndSettle();
    expect(queries.last,{'paged':'true'});
    expect(find.byKey(const ValueKey('my-claim-old-claim')),findsNothing);
    expect(find.byKey(const ValueKey('my-claim-claim-0')),findsOneWidget);
  });

  testWidgets('older page failure clears rows and cursors and disables retained navigation', (tester) async {
    var reads = 0;
    final api = GenealogyApiService(client:MockClient((_) async => ++reads == 1
      ? jsonResponse(page(hundred,'cursor_one')) : http.Response('{"message":"Private diagnostic"}',403)))..setAuthToken('member');
    addTearDown(api.dispose);
    await tester.pumpWidget(MaterialApp(home:MyClaimsScreen(api:api)));
    await tester.pumpAndSettle();
    final retainedRow = tester.widget<ListTile>(find.byKey(const ValueKey('my-claim-claim-0'))).onTap!;
    final older = tester.widget<OutlinedButton>(find.byKey(const ValueKey('older-claims'))).onPressed!;
    older();older();await tester.pumpAndSettle();retainedRow();older();await tester.pumpAndSettle();
    expect(reads,2);expect(find.byType(ListTile),findsNothing);
    expect(find.byKey(const ValueKey('older-claims')),findsNothing);
    expect(find.byType(ClaimStatusScreen),findsNothing);
    expect(find.text(myClaimLabels['unavailable']!),findsOneWidget);
    expect(find.textContaining('Private diagnostic'),findsNothing);
  });

  testWidgets('replacement session fences an in-flight older page and retained page callbacks', (tester) async {
    var reads = 0;
    final pending = Completer<http.Response>();
    final api = GenealogyApiService(client:MockClient((_) => ++reads == 1
      ? Future.value(jsonResponse(page(hundred,'cursor_one'))) : pending.future))..setAuthToken('old');
    addTearDown(api.dispose);
    await tester.pumpWidget(MaterialApp(home:MyClaimsScreen(api:api)));
    await tester.pumpAndSettle();
    final older = tester.widget<OutlinedButton>(find.byKey(const ValueKey('older-claims'))).onPressed!;
    older();await tester.pump();api.setAuthToken('replacement');older();
    pending.complete(jsonResponse(page([{...claim(),'id':'private-old'}])));
    await tester.pumpAndSettle();
    expect(reads,2);expect(find.byType(ListTile),findsNothing);
    expect(find.text(myClaimLabels['session']!),findsOneWidget);
    expect(find.byType(OutlinedButton),findsNothing);
  });

  testWidgets('repeated continuation cursor fails closed instead of looping history', (tester) async {
    final api = GenealogyApiService(client:MockClient((_) async => jsonResponse(page(hundred,'cursor_one'))))..setAuthToken('member');
    addTearDown(api.dispose);
    await tester.pumpWidget(MaterialApp(home:MyClaimsScreen(api:api)));
    await tester.pumpAndSettle();
    tester.widget<OutlinedButton>(find.byKey(const ValueKey('older-claims'))).onPressed!();
    await tester.pumpAndSettle();
    expect(find.text(myClaimLabels['unavailable']!),findsOneWidget);
    expect(find.byType(ListTile),findsNothing);
    expect(find.byKey(const ValueKey('older-claims')),findsNothing);
  });

  testWidgets('explicit recovery retries original body then opens fresh claim status', (tester) async {
    final bodies = <dynamic>[];
    final paths = <String>[];
    final api = GenealogyApiService(client:MockClient((request) async {
      paths.add('${request.method} ${request.url.path}');
      if (request.method == 'POST') {
        bodies.add(jsonDecode(request.body));
        return bodies.length == 1 ? http.Response('{"message":"Private diagnostic"}',503)
            : jsonResponse({'id':'recovered','targetPersonId':'target'});
      }
      if (request.url.path == '/claims/mine') return jsonResponse(page([]));
      if (request.url.path == '/claims/recovered') return jsonResponse({'id':'recovered','status':'PENDING_TIER1'});
      return jsonResponse({},404);
    }))..setAuthToken('member');
    addTearDown(api.dispose);
    await expectLater(api.createProfileClaim({'targetPersonId':'target',
      'relationshipDescription':'Original private relation','statementOfTruth':true}),throwsException);
    expect(api.hasPendingProfileClaim,isTrue);
    await tester.pumpWidget(MaterialApp(home:MyClaimsScreen(api:api)));
    await tester.pumpAndSettle();
    expect(bodies.length,1); // Discovery must never retry automatically.
    final button = find.byKey(const ValueKey('recover-pending-claim'));
    await Scrollable.ensureVisible(tester.element(button),alignment:0.5);
    await tester.pumpAndSettle();await tester.tap(button);await tester.pumpAndSettle();
    expect(bodies.length,2);expect(bodies[1],bodies[0]);
    expect(api.hasPendingProfileClaim,isFalse);
    expect(find.byType(ClaimStatusScreen),findsOneWidget);
    expect(paths,['POST /claims','GET /claims/mine','POST /claims','GET /claims/recovered']);
    await tester.pageBack();await tester.pumpAndSettle();
    expect(paths.last,'GET /claims/mine');
    expect(find.byKey(const ValueKey('recover-pending-claim')),findsNothing);
  });

  testWidgets('uncertain explicit recovery stays pending and coalesces retained callbacks', (tester) async {
    var posts = 0;
    final pending = Completer<http.Response>();
    final api = GenealogyApiService(client:MockClient((request) {
      if (request.method == 'POST') {
        posts++;
        return posts == 1 ? Future.value(http.Response('{}',503)) : pending.future;
      }
      return Future.value(jsonResponse(page([])));
    }))..setAuthToken('member');
    addTearDown(api.dispose);
    await expectLater(api.createProfileClaim({'targetPersonId':'target',
      'relationshipDescription':'Original relation','statementOfTruth':true}),throwsException);
    await tester.pumpWidget(MaterialApp(home:MyClaimsScreen(api:api)));
    await tester.pumpAndSettle();
    final callback = tester.widget<ElevatedButton>(find.byKey(const ValueKey('recover-pending-claim'))).onPressed!;
    callback();callback();await tester.pump();expect(posts,2);
    pending.complete(http.Response('{"message":"Private diagnostic"}',503));
    await tester.pumpAndSettle();
    expect(posts,2);expect(api.hasPendingProfileClaim,isTrue);
    expect(find.text(myClaimLabels['recoveryUnconfirmed']!),findsOneWidget);
    expect(find.textContaining('Private diagnostic'),findsNothing);
    expect(find.byType(ClaimStatusScreen),findsNothing);
    expect(tester.widget<ElevatedButton>(find.byKey(const ValueKey('recover-pending-claim'))).onPressed,isNotNull);
  });

  testWidgets('session replacement during recovery cannot navigate or retry old claim', (tester) async {
    var posts = 0;
    final pending = Completer<http.Response>();
    final api = GenealogyApiService(client:MockClient((request) {
      if (request.method == 'POST') {
        posts++;
        return posts == 1 ? Future.value(http.Response('{}',503)) : pending.future;
      }
      return Future.value(jsonResponse(page([])));
    }))..setAuthToken('member');
    addTearDown(api.dispose);
    await expectLater(api.createProfileClaim({'targetPersonId':'target',
      'relationshipDescription':'Original relation','statementOfTruth':true}),throwsException);
    await tester.pumpWidget(MaterialApp(home:MyClaimsScreen(api:api)));
    await tester.pumpAndSettle();
    final callback = tester.widget<ElevatedButton>(find.byKey(const ValueKey('recover-pending-claim'))).onPressed!;
    callback();await tester.pump();expect(posts,2);
    api.setAuthToken('replacement');callback();
    pending.complete(jsonResponse({'id':'old-claim','targetPersonId':'target'}));
    await tester.pumpAndSettle();
    expect(posts,2);expect(find.byType(ClaimStatusScreen),findsNothing);
    expect(find.text(myClaimLabels['session']!),findsOneWidget);
    expect(find.byKey(const ValueKey('recover-pending-claim')),findsNothing);
  });

  testWidgets('owned discovery opens a freshly authorized status and reloads on return', (tester) async {
    final paths = <String>[];
    final api = GenealogyApiService(client: MockClient((request) async {
      expect(request.method,'GET');
      paths.add(request.url.path);
      if (request.url.path == '/claims/mine') return jsonResponse(page([claim()]));
      if (request.url.path == '/claims/owned-claim') return jsonResponse({'id':'owned-claim','status':'APPROVED'});
      return jsonResponse({},404);
    }))..setAuthToken('member');
    addTearDown(api.dispose);
    await tester.pumpWidget(MaterialApp(home:MyClaimsScreen(api:api)));
    await tester.pumpAndSettle();
    expect(find.text('${myClaimLabels['reference']} owned-claim'),findsOneWidget);
    expect(find.textContaining('private-'),findsNothing);
    await tester.tap(find.byKey(const ValueKey('my-claim-owned-claim')));
    await tester.pumpAndSettle();
    expect(find.byType(ClaimStatusScreen),findsOneWidget);
    expect(find.text(claimStatusLabels['APPROVED']!),findsOneWidget);
    await tester.pageBack();
    await tester.pumpAndSettle();
    expect(paths,['/claims/mine','/claims/owned-claim','/claims/mine']);
  });

  testWidgets('empty collection is explicit and does not expose review controls', (tester) async {
    final api = GenealogyApiService(client:MockClient((_) async => jsonResponse(page([]))))..setAuthToken('member');
    addTearDown(api.dispose);
    await tester.pumpWidget(MaterialApp(home:MyClaimsScreen(api:api)));
    await tester.pumpAndSettle();
    expect(find.text(myClaimLabels['empty']!),findsOneWidget);
    expect(find.byType(ListTile),findsNothing);
  });

  testWidgets('refresh clears private rows and retained row callback after authorization failure', (tester) async {
    var requests = 0;
    final api = GenealogyApiService(client:MockClient((_) async => ++requests == 1
      ? jsonResponse(page([claim()])) : http.Response('{"message":"Private diagnostic"}',403)))..setAuthToken('member');
    addTearDown(api.dispose);
    await tester.pumpWidget(MaterialApp(home:MyClaimsScreen(api:api)));
    await tester.pumpAndSettle();
    final retained = tester.widget<ListTile>(find.byKey(const ValueKey('my-claim-owned-claim'))).onTap!;
    await tester.tap(find.widgetWithText(OutlinedButton,myClaimLabels['reload']!));
    await tester.pumpAndSettle();
    retained();
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('my-claim-owned-claim')),findsNothing);
    expect(find.text('Private diagnostic'),findsNothing);
    expect(find.text(myClaimLabels['unavailable']!),findsOneWidget);
    expect(find.byType(ClaimStatusScreen),findsNothing);
    expect(requests,2);
  });

  testWidgets('replacement account discards delayed collection and cannot reopen old rows', (tester) async {
    final pending = Completer<http.Response>();
    var requests = 0;
    final api = GenealogyApiService(client:MockClient((_) { requests++; return pending.future; }))..setAuthToken('old');
    addTearDown(api.dispose);
    await tester.pumpWidget(MaterialApp(home:MyClaimsScreen(api:api)));
    await tester.pump();
    api.setAuthToken('replacement');
    pending.complete(jsonResponse(page([claim()])));
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('my-claim-owned-claim')),findsNothing);
    expect(find.text(myClaimLabels['session']!),findsOneWidget);
    expect(find.byType(OutlinedButton),findsNothing);
    expect(requests,1);
  });

  for (final invalid in <String,dynamic>{
    'duplicate identity':[claim(),claim()],
    'unknown status':[{...claim(),'status':'UNKNOWN'}],
    'unbounded collection':List.generate(101,(index)=>{...claim(),'id':'claim-$index'}),
  }.entries) {
    testWidgets('${invalid.key} rejects the entire collection', (tester) async {
      final api = GenealogyApiService(client:MockClient((_) async => jsonResponse(page(invalid.value))))..setAuthToken('member');
      addTearDown(api.dispose);
      await tester.pumpWidget(MaterialApp(home:MyClaimsScreen(api:api)));
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey('my-claim-owned-claim')),findsNothing);
      expect(find.text(myClaimLabels['unavailable']!),findsOneWidget);
      expect(find.byType(ListTile),findsNothing);
    });
  }

  testWidgets('authenticated drawer reaches owned discovery without selecting a person', (tester) async {
    final paths = <String>[];
    final api = GenealogyApiService(client:MockClient((request) async {
      paths.add(request.url.path);
      if (request.url.path == '/genealogy/search') return jsonResponse({'items':[],'total':0,'page':1,'limit':20});
      if (request.url.path == '/claims/mine') return jsonResponse(page([]));
      return jsonResponse({},404);
    }))..setAuthToken('member');
    addTearDown(api.dispose);
    await tester.pumpWidget(MaterialApp(home:PersonSearchScreen(apiService:api)));
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Open navigation menu'));
    await tester.pumpAndSettle();
    final destination = find.text(myClaimLabels['title']!);
    final scroll = find.descendant(of:find.byType(Drawer),matching:find.byType(Scrollable));
    await tester.scrollUntilVisible(destination,150,scrollable:scroll.first);
    await tester.pumpAndSettle();
    await tester.tap(destination.hitTestable());
    await tester.pumpAndSettle();
    expect(find.byType(MyClaimsScreen),findsOneWidget);
    expect(paths,['/genealogy/search','/claims/mine']);
  });

  testWidgets('public drawer has no owned-claim discovery destination', (tester) async {
    final api = GenealogyApiService(client:MockClient((_) async => jsonResponse({'items':[],'total':0,'page':1,'limit':20})));
    addTearDown(api.dispose);
    await tester.pumpWidget(MaterialApp(home:PersonSearchScreen(apiService:api)));
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Open navigation menu'));
    await tester.pumpAndSettle();
    expect(find.text(myClaimLabels['title']!),findsNothing);
  });
}
