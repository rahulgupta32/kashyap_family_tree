import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/testing.dart';
import 'package:kashyap_mobile/services/genealogy_api_service.dart';
import 'package:kashyap_mobile/widgets/profile_photo_editor.dart';
import 'native_session_test.dart' show jsonResponse;
const png='iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEUlEQVQImWMQCdYVCdZlgFAAD9oCUV/9UZEAAAAASUVORK5CYII=';
String token(String owner)=>'header.${base64Url.encode(utf8.encode(jsonEncode({'sub':owner})))}.signature';
void main(){
 const channel=MethodChannel('kashyap/chat_attachments');
 testWidgets('native photo picker previews selected bytes and sends the original with a bounded crop', (tester) async {
  Map<String,dynamic>? submitted;
  TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger.setMockMethodCallHandler(channel,(call) async {expect(call.method,'pickProfile');return {'mimeType':'image/png','dataBase64':png};});
  addTearDown(()=>TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger.setMockMethodCallHandler(channel,null));
  final api=GenealogyApiService(client:MockClient((request) async {
    if(request.method=='POST'){expect(request.url.path,'/profile/photo');submitted=jsonDecode(request.body) as Map<String,dynamic>;return jsonResponse({'assetId':'fixture-asset'});}
    expect(request.url.path,'/profile/media/fixture-asset/processing');return jsonResponse({'status':'FAILED'});
  }))..setAuthToken(token('owner'));
  addTearDown(api.dispose);
  await tester.pumpWidget(MaterialApp(home:Scaffold(body:SingleChildScrollView(child:ProfilePhotoEditor(api:api)))));
  await tester.runAsync(() async {
    await tester.tap(find.byKey(const Key('choose-profile-photo')));
    for(var attempt=0;attempt<100 && find.byKey(const Key('save-profile-photo')).evaluate().isEmpty;attempt++){await Future<void>.delayed(const Duration(milliseconds:20));await tester.pump();}
  });
  await tester.pumpAndSettle();
  expect(find.byKey(const Key('save-profile-photo')),findsOneWidget);
  final slider=tester.widget<Slider>(find.byKey(const Key('photo-crop-left')));slider.onChanged!(2500);await tester.pump();
  await tester.ensureVisible(find.byKey(const Key('save-profile-photo')));await tester.tap(find.byKey(const Key('save-profile-photo')));await tester.pumpAndSettle();
  expect(submitted?['dataBase64'],png);expect(submitted?['crop'],{'left':2500,'top':0,'width':7500,'height':10000});
  expect(find.text('फोटो तयार भएन / Processing failed'),findsOneWidget);expect(find.text('पुनः प्रयास / Retry processing'),findsOneWidget);
 });
 testWidgets('late native picker completion cannot attach a former account file after an account switch',(tester) async {
  final picker=Completer<Map<String,dynamic>>();var requests=0;
  TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger.setMockMethodCallHandler(channel,(call)=>picker.future);
  addTearDown(()=>TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger.setMockMethodCallHandler(channel,null));
  final api=GenealogyApiService(client:MockClient((request) async {requests++;return jsonResponse({});}))..setAuthToken(token('old-owner'));addTearDown(api.dispose);
  await tester.pumpWidget(MaterialApp(home:Scaffold(body:ProfilePhotoEditor(api:api))));
  await tester.tap(find.byKey(const Key('choose-profile-photo')));await tester.pump();api.setAuthToken(token('new-owner'));
  picker.complete({'mimeType':'image/png','dataBase64':png});await tester.pumpAndSettle();
  expect(find.byKey(const Key('save-profile-photo')),findsNothing);expect(requests,0);
 });
 test('photo HTTP requests refuse another account before sending',() async {
  var requests=0;final api=GenealogyApiService(client:MockClient((request) async {requests++;return jsonResponse({});}))..setAuthToken(token('current'));addTearDown(api.dispose);
  await expectLater(api.profilePhotoRequest('/photo','former',method:'POST',data:{'dataBase64':png}),throwsStateError);expect(requests,0);
 });
}
