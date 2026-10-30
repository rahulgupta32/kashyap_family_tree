import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:kashyap_mobile/screens/member_disputes_screen.dart';
import 'package:kashyap_mobile/screens/person_detail_screen.dart';
import 'package:kashyap_mobile/services/genealogy_api_service.dart';
import 'native_session_test.dart' show MemorySessionStore,jsonResponse;
import 'chat_outbox_test.dart' show MemoryChatOutboxStore;
const person='00000000-0000-4000-8000-000000000031',dispute='00000000-0000-4000-8000-000000000032';
String token(String owner)=>'x.${base64Url.encode(utf8.encode(jsonEncode({'sub':owner})))}.x';
class FailingDisputeStore extends MemorySessionStore {
 bool fail=false;
 @override Future<void> write(String value)async{if(fail)throw StateError('Fictional unavailable storage');await super.write(value);}
}
void main(){
 testWidgets('Person entry discards a late private response after account replacement',(tester)async{
  final response=Completer<http.Response>();
  final api=GenealogyApiService(client:MockClient((_)=>response.future))..setAuthToken(token('owner'));addTearDown(api.dispose);
  await tester.pumpWidget(MaterialApp(home:PersonDetailScreen(personId:person,apiService:api)));await tester.pump();
  api.setAuthToken(token('replacement'));
  response.complete(jsonResponse({'id':person,'primaryNameNepali':'PRIVATE OLD PERSON','primaryNameEnglish':'PRIVATE OLD PERSON','isClaimed':true}));await tester.pumpAndSettle();
  expect(find.text('PRIVATE OLD PERSON'),findsNothing);expect(find.byTooltip('दाबी विवाद (Dispute claim)'),findsNothing);
 });
 testWidgets('Person entry clears displayed private data when the session changes',(tester)async{
  final api=GenealogyApiService(client:MockClient((_)async=>jsonResponse({'id':person,'primaryNameNepali':'PRIVATE OLD PERSON','primaryNameEnglish':'PRIVATE OLD PERSON','isClaimed':true})))..setAuthToken(token('owner'));addTearDown(api.dispose);
  await tester.pumpWidget(MaterialApp(home:PersonDetailScreen(personId:person,apiService:api)));await tester.pumpAndSettle();
  expect(find.text('PRIVATE OLD PERSON'),findsWidgets);
  api.setAuthToken(token('replacement'));await tester.pumpAndSettle();expect(find.text('PRIVATE OLD PERSON'),findsNothing);
 });

 test('failed durable write prevents dispute HTTP, and malformed acknowledgement retains its identity',()async{
  final store=FailingDisputeStore();var posts=0;
  final api=GenealogyApiService(sessionStore:store,chatOutboxStore:MemoryChatOutboxStore(),client:MockClient((r)async{
   if(r.url.path=='/auth/native/verify')return jsonResponse({'accessToken':token('owner'),'refreshToken':'refresh'});
   posts++;return jsonResponse({'id':dispute,'targetPersonId':'wrong-person','status':'OPEN'});
  }));addTearDown(api.dispose);
  await api.verifyOtp('challenge','123456');store.fail=true;
  await expectLater(api.submitMemberDispute({'targetPersonId':person,'reason':'Original reason'}),throwsA(anything));
  expect(posts,0);expect(api.hasPendingDispute,isTrue);store.fail=false;
  await expectLater(api.retryMemberDispute(),throwsFormatException);expect(posts,1);expect(api.hasPendingDispute,isTrue);
 });
 test('uncertain native dispute persists original body/key through restore and terminal retry',()async{
  final store=MemorySessionStore();final sent=<Map<String,dynamic>>[];
  Future<http.Response> send(http.Request r)async{
   if(r.url.path=='/auth/native/verify'||r.url.path=='/auth/native/refresh')return jsonResponse({'accessToken':token('owner'),'refreshToken':'refresh'});
   sent.add(jsonDecode(r.body) as Map<String,dynamic>);
   expect(jsonDecode(store.value!)['pendingDispute'],isNotNull);
   return sent.length==1?http.Response('{}',503):jsonResponse({'id':dispute,'targetPersonId':person,'status':'DISMISSED'});
  }
  final a=GenealogyApiService(client:MockClient(send),sessionStore:store,chatOutboxStore:MemoryChatOutboxStore());
  await a.verifyOtp('challenge','123456');
  await expectLater(a.submitMemberDispute({'targetPersonId':person,'reason':'Private original reason'}),throwsException);
  expect(a.hasPendingDispute,isTrue);a.dispose();
  final b=GenealogyApiService(client:MockClient(send),sessionStore:store,chatOutboxStore:MemoryChatOutboxStore());addTearDown(b.dispose);
  expect(await b.restoreSession(),isTrue);expect(b.hasPendingDispute,isTrue);
  expect((await b.retryMemberDispute())['status'],'DISMISSED');expect(sent[1],sent[0]);expect(b.hasPendingDispute,isFalse);
  expect(jsonDecode(store.value!).containsKey('pendingDispute'),isFalse);
 });
 test('late dispute acknowledgement cannot clear replacement-account state',()async{
  final response=Completer<http.Response>();
  final api=GenealogyApiService(client:MockClient((_)=>response.future))..setAuthToken(token('old'));addTearDown(api.dispose);
  final operation=api.submitMemberDispute({'targetPersonId':person,'reason':'Private old reason'});
  final failure=expectLater(operation,throwsA(anything));await Future<void>.delayed(Duration.zero);
  api.setAuthToken(token('replacement'));response.complete(jsonResponse({'id':dispute,'targetPersonId':person,'status':'OPEN'}));
  await failure;expect(api.chatAccountId,'replacement');expect(api.hasPendingDispute,isFalse);
 });
 testWidgets('owned terminal feedback renders without private backend diagnostics and clears on replacement',(tester)async{
  final api=GenealogyApiService(client:MockClient((_)async=>jsonResponse({'items':[{'id':dispute,'status':'RESOLVED','reason':'Owned fictional dispute','resolutionNotes':'Fictional independent decision'}],'nextCursor':null})))..setAuthToken(token('owner'));addTearDown(api.dispose);
  await tester.pumpWidget(MaterialApp(home:MemberDisputesScreen(api:api)));await tester.pumpAndSettle();
  expect(find.text('Fictional independent decision'),findsOneWidget);expect(find.text(disputeStatuses['RESOLVED']!),findsOneWidget);
  api.setAuthToken(token('replacement'));await tester.pumpAndSettle();expect(find.text('Owned fictional dispute'),findsNothing);expect(find.byType(OutlinedButton),findsNothing);
 });
 testWidgets('failed history refresh clears old private case and hides raw diagnostic',(tester)async{
  var reads=0;final api=GenealogyApiService(client:MockClient((_)async=>++reads==1?jsonResponse({'items':[{'id':dispute,'status':'OPEN','reason':'Old private case'}],'nextCursor':null}):http.Response('{"message":"Private SQL diagnostic"}',403)))..setAuthToken(token('owner'));addTearDown(api.dispose);
  await tester.pumpWidget(MaterialApp(home:MemberDisputesScreen(api:api)));await tester.pumpAndSettle();
  await tester.tap(find.text(disputeLabels['refresh']!));await tester.pumpAndSettle();
  expect(find.text('Old private case'),findsNothing);expect(find.textContaining('Private SQL'),findsNothing);
 });
}
