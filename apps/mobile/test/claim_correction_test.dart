import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
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
  await t.scrollUntilVisible(button,200,scrollable:find.descendant(of:find.byType(ListView),matching:find.byType(Scrollable)).first);
  await Scrollable.ensureVisible(t.element(button),alignment:0.5);await t.pumpAndSettle();
  expect(button.hitTestable(),findsOneWidget);await t.tap(button);await t.pumpAndSettle();
}
const picker=MethodChannel('kashyap/chat_attachments');
const asset='11111111-1111-4111-8111-111111111111';
Future<void> choose(WidgetTester t)async{
 final notice=find.byKey(const ValueKey('claim-correction-evidence-notice'));
 final scroll=find.descendant(of:find.byType(ListView),matching:find.byType(Scrollable)).first;
 t.state<ScrollableState>(scroll).position.jumpTo(0);await t.pumpAndSettle();
 await t.scrollUntilVisible(notice,200,scrollable:scroll);
 await Scrollable.ensureVisible(t.element(notice),alignment:0.5);await t.pumpAndSettle();await t.tap(notice);await t.pumpAndSettle();
 final upload=find.byKey(const ValueKey('claim-correction-evidence-upload'));
 await t.scrollUntilVisible(upload,200,scrollable:scroll);
 await Scrollable.ensureVisible(t.element(upload),alignment:0.5);await t.pumpAndSettle();await t.tap(upload);await t.pumpAndSettle();
}
void main(){
 TestWidgetsFlutterBinding.ensureInitialized();
 tearDown(()=>TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger.setMockMethodCallHandler(picker,null));
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
  await t.scrollUntilVisible(find.widgetWithText(ElevatedButton,claimLabels['resubmit']!),200,scrollable:find.descendant(of:find.byType(ListView),matching:find.byType(Scrollable)).first);
  final callback=t.widget<ElevatedButton>(find.widgetWithText(ElevatedButton,claimLabels['resubmit']!)).onPressed!;
  callback();callback();await t.pump();expect(posts,1);
  api.setAuthToken(token('replacement'));callback();
  result.complete(jsonResponse(detail(status:'PENDING_TIER1')));await t.pumpAndSettle();
  expect(posts,1);expect(find.byType(TextField),findsNothing);expect(find.text('Updated relation'),findsNothing);expect(find.text(claimLabels['session']!),findsOneWidget);
 });
 testWidgets('correction notice gates scanned private evidence and appends only new references',(t)async{
  TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger.setMockMethodCallHandler(picker,(_)async=>{'mimeType':'image/png','dataBase64':'fictional-bytes'});
  var reads=0;final uploads=<dynamic>[],bodies=<dynamic>[];
  final api=GenealogyApiService(client:MockClient((r)async{
   if(r.method=='GET'){reads++;return jsonResponse(detail(status:reads==1?'CORRECTION_REQUESTED':'PENDING_TIER1'));}
   if(r.url.path=='/me/claim-evidence'){uploads.add(jsonDecode(r.body));return jsonResponse({'mediaAssetId':asset,'documentType':'family_photo','quarantineStatus':'CLEAN'});}
   bodies.add(jsonDecode(r.body));return jsonResponse(detail(status:'PENDING_TIER1'));
  }))..setAuthToken(token('owner'));addTearDown(api.dispose);
  await t.pumpWidget(MaterialApp(home:ClaimStatusScreen(claimId:'claim',api:api)));await t.pumpAndSettle();await fill(t);
  final upload=find.byKey(const ValueKey('claim-correction-evidence-upload'));
  await t.scrollUntilVisible(upload,200,scrollable:find.descendant(of:find.byType(ListView),matching:find.byType(Scrollable)).first);
  expect(t.widget<OutlinedButton>(upload).onPressed,isNull);expect(uploads,isEmpty);
  await choose(t);expect(uploads,[{'mimeType':'image/png','dataBase64':'fictional-bytes','documentType':'family_photo','evidenceNoticeAccepted':true}]);
  await press(t);
  expect(bodies,[{'expectedVersion':7,'relationshipDescription':'Updated relation','statementOfTruth':true,'evidenceAttachments':[{'mediaAssetId':asset,'documentType':'family_photo'}]}]);
 });
 testWidgets('delayed correction picker cannot upload across account replacement',(t)async{
  final selected=Completer<Map<String,dynamic>?>();var uploads=0;
  TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger.setMockMethodCallHandler(picker,(_)=>selected.future);
  final api=GenealogyApiService(client:MockClient((r)async{
   if(r.method=='GET')return jsonResponse(detail());uploads++;return jsonResponse({});
  }))..setAuthToken(token('owner'));addTearDown(api.dispose);
  await t.pumpWidget(MaterialApp(home:ClaimStatusScreen(claimId:'claim',api:api)));await t.pumpAndSettle();
  final notice=find.byKey(const ValueKey('claim-correction-evidence-notice'));
  final scroll=find.descendant(of:find.byType(ListView),matching:find.byType(Scrollable)).first;
  await t.scrollUntilVisible(notice,200,scrollable:scroll);await Scrollable.ensureVisible(t.element(notice),alignment:0.5);await t.pumpAndSettle();await t.tap(notice);await t.pumpAndSettle();
  final upload=find.byKey(const ValueKey('claim-correction-evidence-upload'));
  await t.scrollUntilVisible(upload,200,scrollable:scroll);await Scrollable.ensureVisible(t.element(upload),alignment:0.5);await t.pumpAndSettle();await t.tap(upload);await t.pump();
  api.setAuthToken(token('replacement'));selected.complete({'mimeType':'image/png','dataBase64':'private-old-bytes'});await t.pumpAndSettle();
  expect(uploads,0);expect(find.byType(TextField),findsNothing);expect(find.text(claimLabels['session']!),findsOneWidget);
 });
 testWidgets('failed correction scan cannot be included in resubmission',(t)async{
  TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger.setMockMethodCallHandler(picker,(_)async=>{'mimeType':'image/png','dataBase64':'fictional-bytes'});
  final bodies=<dynamic>[];var reads=0;
  final api=GenealogyApiService(client:MockClient((r)async{
   if(r.method=='GET'){reads++;return jsonResponse(detail(status:reads==1?'CORRECTION_REQUESTED':'PENDING_TIER1'));}
   if(r.url.path=='/me/claim-evidence')return http.Response('{"message":"Private scan diagnostic"}',503);
   bodies.add(jsonDecode(r.body));return jsonResponse(detail(status:'PENDING_TIER1'));
  }))..setAuthToken(token('owner'));addTearDown(api.dispose);
  await t.pumpWidget(MaterialApp(home:ClaimStatusScreen(claimId:'claim',api:api)));await t.pumpAndSettle();await fill(t);await choose(t);
  expect(find.textContaining('Private scan diagnostic'),findsNothing);await press(t);
  expect(bodies.single.containsKey('evidenceAttachments'),isFalse);
 });

}
