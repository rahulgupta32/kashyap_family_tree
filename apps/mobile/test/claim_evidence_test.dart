import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:kashyap_mobile/localization/claim_labels.dart';
import 'package:kashyap_mobile/screens/claim_profile_screen.dart';
import 'package:kashyap_mobile/services/genealogy_api_service.dart';
import 'native_session_test.dart' show jsonResponse;
const channel=MethodChannel('kashyap/chat_attachments');
const asset='11111111-1111-4111-8111-111111111111';
Future<void> tap(WidgetTester t,Finder finder)async{await t.ensureVisible(finder);await t.tap(finder);await t.pumpAndSettle();}
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
  expect(claims[0]['creationKey'],matches(RegExp(r'^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$')));expect(claims[0]['evidenceAttachments'],[{'mediaAssetId':asset,'documentType':'family_photo'}]);
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
