import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:kashyap_mobile/localization/claim_labels.dart';
import 'package:kashyap_mobile/screens/claim_profile_screen.dart';
import 'package:kashyap_mobile/screens/claim_status_screen.dart';
import 'package:kashyap_mobile/services/genealogy_api_service.dart';
import 'native_session_test.dart' show jsonResponse;
const channel=MethodChannel('kashyap/chat_attachments');
const asset='11111111-1111-4111-8111-111111111111';
Future<void> tap(WidgetTester t,Finder finder)async{
 // Centre the control and settle scroll/layout changes before hit testing.
 // A failure message can move the retry button after the initial submission.
 await Scrollable.ensureVisible(t.element(finder),alignment:0.5);
 await t.pumpAndSettle();
 expect(finder.hitTestable(),findsOneWidget);
 await t.tap(finder);
 await t.pumpAndSettle();
}
Finder submit()=>find.widgetWithText(ElevatedButton,claimLabels['submit']!);
Future<void> form(WidgetTester t,GenealogyApiService api)async{await t.pumpWidget(MaterialApp(home:ClaimProfileScreen(personId:'fictional-person',personName:'Private fictional person',apiService:api)));await t.pumpAndSettle();}
// The multiline input also owns a vertical Scrollable; select its page ancestor.
Future<void> fill(WidgetTester t)async{await t.scrollUntilVisible(find.byKey(const ValueKey('claim-description')),-200,scrollable:find.ancestor(of:find.byKey(const ValueKey('claim-description')),matching:find.byType(Scrollable)));await t.enterText(find.byKey(const ValueKey('claim-description')),'Fictional relationship');await tap(t,find.widgetWithText(CheckboxListTile,claimLabels['truth']!));}
void main(){
 TestWidgetsFlutterBinding.ensureInitialized();
 tearDown(()=>TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger.setMockMethodCallHandler(channel,null));
 testWidgets('notice gates private evidence; upload and lost-response retry preserve exact immutable claim',(t)async{
  final uploads=<dynamic>[],claims=<dynamic>[];
  TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger.setMockMethodCallHandler(channel,(_)async=>{'mimeType':'image/png','dataBase64':'fixture-bytes'});
  final api=GenealogyApiService(client:MockClient((request)async{
   if(request.url.path=='/me/claim-evidence'){uploads.add(jsonDecode(request.body));return jsonResponse({'mediaAssetId':asset,'documentType':'family_photo','quarantineStatus':'CLEAN'});}
   claims.add(jsonDecode(request.body));return claims.length==1?http.Response('{"message":"Private diagnostic"}',503):jsonResponse({'id':'claim','status':'PENDING_TIER1'});
  }))..setAuthToken('old');addTearDown(api.dispose);await form(t,api);
  final choose=find.widgetWithText(OutlinedButton,claimLabels['upload']!);expect(t.widget<OutlinedButton>(choose).onPressed,isNull);
  await tap(t,find.byKey(const ValueKey('claim-evidence-notice')));await tap(t,choose);expect(uploads.single,{'mimeType':'image/png','dataBase64':'fixture-bytes','documentType':'family_photo','evidenceNoticeAccepted':true});
  await fill(t);await tap(t,submit());expect(claims.length,1);expect(find.text('Private diagnostic'),findsNothing);
  expect(t.widget<TextField>(find.byKey(const ValueKey('claim-description'))).enabled,isFalse);
  final retry=find.widgetWithText(ElevatedButton,claimLabels['retry']!);await tap(t,retry);expect(claims.length,2);expect(claims[0],claims[1]);
  expect(find.widgetWithText(OutlinedButton,claimLabels['check']!),findsOneWidget);
  expect(claims[0]['creationKey'],matches(RegExp(r'^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$')));expect(claims[0]['evidenceAttachments'],[{'mediaAssetId':asset,'documentType':'family_photo'}]);
 });
 testWidgets('submitted claim opens fresh delayed correction feedback on a phone',(t)async{
  t.view.physicalSize=const Size(411,731);t.view.devicePixelRatio=1;
  addTearDown(t.view.resetPhysicalSize);addTearDown(t.view.resetDevicePixelRatio);
  const notes='Clarify the fictional relationship before independent review.';
  final feedback=Completer<http.Response>();var creations=0,reads=0;
  final jwt='fixture.${base64Url.encode(utf8.encode(jsonEncode({'sub':'owner'})))}.fixture';
  final api=GenealogyApiService(client:MockClient((r)async{
   if(r.method=='POST'&&r.url.path=='/claims'){
    creations++;return jsonResponse({'id':'claim','status':'PENDING_TIER1'});
   }
   expect(r.method,'GET');expect(r.url.path,'/claims/claim');
   reads++;return feedback.future;
  }))..setAuthToken(jwt);addTearDown(api.dispose);
  await form(t,api);await fill(t);
  await t.scrollUntilVisible(submit(),200,scrollable:find.descendant(of:find.byType(ListView),matching:find.byType(Scrollable)).first);
  await tap(t,submit());
  expect(creations,1);expect(reads,0);expect(api.hasPendingProfileClaim,isFalse);
  final check=find.widgetWithText(OutlinedButton,claimLabels['check']!);
  await t.scrollUntilVisible(check,200,scrollable:find.descendant(of:find.byType(ListView),matching:find.byType(Scrollable)).first);
  await Scrollable.ensureVisible(t.element(check),alignment:0.5);await t.pumpAndSettle();
  expect(check.hitTestable(),findsOneWidget);await t.tap(check);await t.pump();
  await t.pump(const Duration(milliseconds:400));
  expect(find.byType(ClaimStatusScreen),findsOneWidget);expect(reads,1);
  expect(find.text(notes),findsNothing);
  feedback.complete(jsonResponse({'id':'claim','claimantUserId':'owner',
   'status':'CORRECTION_REQUESTED','version':2,'correctionRequestNotes':notes,
   'relationshipDescription':'Fictional relationship'}));
  await t.pumpAndSettle();
  expect(find.text(notes),findsOneWidget);
  expect(find.byKey(const ValueKey('claim-correction-description')),findsOneWidget);
  await t.scrollUntilVisible(find.byKey(const ValueKey('claim-correction-evidence-upload')),200,
   scrollable:find.descendant(of:find.byType(ClaimStatusScreen),matching:find.byType(Scrollable)).first);
  expect(find.byKey(const ValueKey('claim-correction-evidence-upload')),findsOneWidget);
  expect(creations,1);expect(reads,1);expect(t.takeException(),isNull);
 });
 testWidgets('delayed picker cannot upload or restore private draft after account replacement',(t)async{
  final picker=Completer<Map<String,dynamic>?>();var requests=0;
  TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger.setMockMethodCallHandler(channel,(_)=>picker.future);
  final api=GenealogyApiService(client:MockClient((_)async{requests++;return jsonResponse({});}))..setAuthToken('old');addTearDown(api.dispose);await form(t,api);
  await tap(t,find.byKey(const ValueKey('claim-evidence-notice')));
  await t.ensureVisible(find.widgetWithText(OutlinedButton,claimLabels['upload']!));await t.tap(find.widgetWithText(OutlinedButton,claimLabels['upload']!));await t.pump();
  api.setAuthToken('replacement');picker.complete({'mimeType':'image/png','dataBase64':'fixture'});await t.pumpAndSettle();expect(requests,0);expect(find.text('Private fictional person'),findsNothing);expect(find.byType(TextField),findsNothing);
 });
 testWidgets('retained submit callback sends once and ignores delayed response after logout',(t)async{
  final pending=Completer<http.Response>();var requests=0;
  final api=GenealogyApiService(client:MockClient((_)async{requests++;return pending.future;}))..setAuthToken('old');addTearDown(api.dispose);await form(t,api);await fill(t);
  final callback=t.widget<ElevatedButton>(submit()).onPressed!;callback();callback();await t.pump();expect(requests,1);
  api.setAuthToken(null);pending.complete(jsonResponse({'id':'claim','status':'PENDING_TIER1'}));await t.pumpAndSettle();expect(find.text('Private fictional person'),findsNothing);
 });
 testWidgets('failed scan cannot add evidence to the submission',(t)async{
  final claims=<dynamic>[];
  TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger.setMockMethodCallHandler(channel,(_)async=>{'mimeType':'image/png','dataBase64':'fixture'});
  final api=GenealogyApiService(client:MockClient((r)async{if(r.url.path=='/me/claim-evidence'){return http.Response('{"message":"private scan diagnostic"}',503);}claims.add(jsonDecode(r.body));return jsonResponse({'id':'claim'});}))..setAuthToken('old');addTearDown(api.dispose);await form(t,api);
  await tap(t,find.byKey(const ValueKey('claim-evidence-notice')));await tap(t,find.widgetWithText(OutlinedButton,claimLabels['upload']!));await fill(t);await tap(t,submit());expect(claims.single['evidenceAttachments'],isEmpty);expect(find.text('private scan diagnostic'),findsNothing);
 });
}
