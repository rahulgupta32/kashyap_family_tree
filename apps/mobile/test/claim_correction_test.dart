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

String token(String owner) => 'fixture.${base64Url.encode(utf8.encode(jsonEncode({'sub':owner})))}.fixture';
Map<String,dynamic> detail({String owner='owner',String status='CORRECTION_REQUESTED',int version=7}) => {
  'id':'claim','claimantUserId':owner,'status':status,'version':version,
  'relationshipDescription':'Original relation','correctionRequestNotes':'Fictional review request',
};
Future<void> fill(WidgetTester t) async {
  await t.enterText(find.byKey(const ValueKey('claim-correction-description')),'Updated relation');
  final truth=find.byKey(const ValueKey('claim-correction-truth'));
  await Scrollable.ensureVisible(t.element(truth),alignment:0.5);
  await t.pumpAndSettle();await t.tap(truth);await t.pumpAndSettle();
}
Future<void> press(WidgetTester t) async {
  final button=find.widgetWithText(ElevatedButton,claimLabels['resubmit']!);
  await Scrollable.ensureVisible(t.element(button),alignment:0.5);await t.pumpAndSettle();
  expect(button.hitTestable(),findsOneWidget);await t.tap(button);await t.pumpAndSettle();
}
void main(){
 testWidgets('claimant correction sends loaded version and reloads authoritative status',(t)async{
  var reads=0;final bodies=<dynamic>[];
  final api=GenealogyApiService(client:MockClient((r)async{
   if(r.method=='GET'){reads++;return jsonResponse(detail(status:reads==1?'CORRECTION_REQUESTED':'PENDING_TIER1',version:reads==1?7:8));}
   expect(r.url.path,'/claims/claim/resubmit');bodies.add(jsonDecode(r.body));return jsonResponse(detail(status:'PENDING_TIER1',version:8));
  }))..setAuthToken(token('owner'));addTearDown(api.dispose);
  await t.pumpWidget(MaterialApp(home:ClaimStatusScreen(claimId:'claim',api:api)));await t.pumpAndSettle();
  await fill(t);await press(t);
  expect(bodies,[{'expectedVersion':7,'relationshipDescription':'Updated relation','statementOfTruth':true}]);
  expect(reads,2);expect(find.text(claimStatusLabels['PENDING_TIER1']!),findsOneWidget);
  expect(find.byKey(const ValueKey('claim-correction-description')),findsNothing);
 });
 testWidgets('uncertain correction retains disabled draft and requires current-state reload',(t)async{
  var reads=0,posts=0;
  final api=GenealogyApiService(client:MockClient((r)async{
   if(r.method=='GET'){reads++;if(reads==2)return http.Response('{}',503);return jsonResponse(detail(status:reads==1?'CORRECTION_REQUESTED':'PENDING_TIER1'));}
   posts++;return http.Response('{"message":"private internal failure"}',503);
  }))..setAuthToken(token('owner'));addTearDown(api.dispose);
  await t.pumpWidget(MaterialApp(home:ClaimStatusScreen(claimId:'claim',api:api)));await t.pumpAndSettle();
  await fill(t);await press(t);
  expect(posts,1);expect(find.textContaining('private internal'),findsNothing);
  expect(find.widgetWithText(ElevatedButton,claimLabels['resubmit']!),findsNothing);
  final draft=t.widget<TextField>(find.byKey(const ValueKey('claim-unconfirmed-correction')));
  expect(draft.enabled,isFalse);expect(draft.controller!.text,'Updated relation');
  final reload=find.widgetWithText(OutlinedButton,claimLabels['statusRefresh']!);
  await Scrollable.ensureVisible(t.element(reload),alignment:0.5);await t.pumpAndSettle();await t.tap(reload);await t.pumpAndSettle();
  expect(posts,1);expect(reads,2);
  expect(t.widget<TextField>(find.byKey(const ValueKey('claim-unconfirmed-correction'))).controller!.text,'Updated relation');
  await Scrollable.ensureVisible(t.element(reload),alignment:0.5);await t.pumpAndSettle();await t.tap(reload);await t.pumpAndSettle();
  expect(posts,1);expect(reads,3);expect(find.text(claimStatusLabels['PENDING_TIER1']!),findsOneWidget);
 });
 testWidgets('reviewer cannot receive claimant correction controls',(t)async{
  final api=GenealogyApiService(client:MockClient((_)async=>jsonResponse(detail(owner:'another'))))..setAuthToken(token('reviewer'));addTearDown(api.dispose);
  await t.pumpWidget(MaterialApp(home:ClaimStatusScreen(claimId:'claim',api:api)));await t.pumpAndSettle();
  expect(find.text(claimStatusLabels['CORRECTION_REQUESTED']!),findsOneWidget);
  expect(find.byType(ElevatedButton),findsNothing);expect(find.byType(TextField),findsNothing);
 });
 testWidgets('retained correction callback is single-flight and account replacement clears draft',(t)async{
  final result=Completer<http.Response>();var posts=0;
  final api=GenealogyApiService(client:MockClient((r){if(r.method=='GET')return Future.value(jsonResponse(detail()));posts++;return result.future;}))..setAuthToken(token('owner'));addTearDown(api.dispose);
  await t.pumpWidget(MaterialApp(home:ClaimStatusScreen(claimId:'claim',api:api)));await t.pumpAndSettle();await fill(t);
  final callback=t.widget<ElevatedButton>(find.widgetWithText(ElevatedButton,claimLabels['resubmit']!)).onPressed!;
  callback();callback();await t.pump();expect(posts,1);
  api.setAuthToken(token('replacement'));callback();
  result.complete(jsonResponse(detail(status:'PENDING_TIER1')));await t.pumpAndSettle();
  expect(posts,1);expect(find.byType(TextField),findsNothing);expect(find.text('Updated relation'),findsNothing);expect(find.text(claimLabels['session']!),findsOneWidget);
 });
}
