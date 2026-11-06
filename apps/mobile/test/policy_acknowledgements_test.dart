import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:kashyap_mobile/screens/policy_acknowledgements_screen.dart';
import 'package:kashyap_mobile/services/genealogy_api_service.dart';
import 'native_session_test.dart' show jsonResponse;
Map<String,dynamic> policy()=>{'id':'fictional-policy','kind':'PRIVACY','version':1,'titleNe':'काल्पनिक','titleEn':'Fictional policy','bodyNe':'परीक्षण मात्र','bodyEn':'Fictional text only','contentHash':'a'*64,'acceptedAt':null};
Finder confirm()=>find.widgetWithText(ElevatedButton,'स्वीकार पुष्टि (Confirm acknowledgement)');
Future<void> select(WidgetTester tester)async{final f=find.byType(CheckboxListTile);await tester.ensureVisible(f);await tester.tap(f);await tester.pumpAndSettle();}
void main(){
 testWidgets('empty approved catalogue stays unavailable without acknowledgement controls',(tester)async{
  final api=GenealogyApiService(client:MockClient((_)async=>jsonResponse({'documents':[]})))..setAuthToken('old');addTearDown(api.dispose);
  await tester.pumpWidget(MaterialApp(home:PolicyAcknowledgementsScreen(api:api)));await tester.pumpAndSettle();
  expect(find.text('स्वीकृत नीति उपलब्ध छैन (Approved policy unavailable)'),findsOneWidget);expect(confirm(),findsNothing);
 });
 testWidgets('explicit selection retries identical account-bound content after lost response',(tester)async{
  final bodies=<dynamic>[];var accepted=false;
  final api=GenealogyApiService(client:MockClient((request)async{
   if(request.method=='POST'){bodies.add(jsonDecode(request.body));if(bodies.length==1){return http.Response('{"message":"Private diagnostic"}',503);}accepted=true;return jsonResponse({'acceptedAt':'2030-01-01'});}
   return jsonResponse({'documents':[{...policy(),'acceptedAt':accepted?'2030-01-01':null}]});
  }))..setAuthToken('old');addTearDown(api.dispose);
  await tester.pumpWidget(MaterialApp(home:PolicyAcknowledgementsScreen(api:api)));await tester.pumpAndSettle();
  expect(tester.widget<ElevatedButton>(confirm()).onPressed,isNull);await select(tester);
  await tester.ensureVisible(confirm());await tester.tap(confirm());await tester.pumpAndSettle();expect(find.textContaining('Private diagnostic'),findsNothing);expect(confirm(),findsOneWidget);
  await tester.tap(confirm());await tester.pumpAndSettle();expect(bodies.length,2);expect(bodies[0],bodies[1]);expect(bodies[0],{'documentId':'fictional-policy','contentHash':'a'*64,'accepted':true});expect(confirm(),findsNothing);
 });
 testWidgets('session replacement immediately clears policy and checked intent',(tester)async{
  var posts=0;
  final api=GenealogyApiService(client:MockClient((request)async{if(request.method=='POST'){posts++;}return jsonResponse({'documents':[policy()]});}))..setAuthToken('old');addTearDown(api.dispose);
  await tester.pumpWidget(MaterialApp(home:PolicyAcknowledgementsScreen(api:api)));await tester.pumpAndSettle();await select(tester);
  final retained=tester.widget<ElevatedButton>(confirm()).onPressed!;api.setAuthToken('replacement');retained();await tester.pumpAndSettle();
  expect(find.textContaining('Fictional policy'),findsNothing);expect(find.byType(CheckboxListTile),findsNothing);expect(posts,0);
 });
 testWidgets('concurrent retained confirm callbacks send one request',(tester)async{
  final pending=Completer<http.Response>();var posts=0;
  final api=GenealogyApiService(client:MockClient((request)async{if(request.method=='POST'){posts++;return pending.future;}return jsonResponse({'documents':[policy()]});}))..setAuthToken('old');addTearDown(api.dispose);
  await tester.pumpWidget(MaterialApp(home:PolicyAcknowledgementsScreen(api:api)));await tester.pumpAndSettle();await select(tester);
  final retained=tester.widget<ElevatedButton>(confirm()).onPressed!;retained();retained();await tester.pump();expect(posts,1);
  api.setAuthToken(null);pending.complete(jsonResponse({'acceptedAt':'2030-01-01'}));await tester.pumpAndSettle();expect(find.byType(CheckboxListTile),findsNothing);
 });
}
