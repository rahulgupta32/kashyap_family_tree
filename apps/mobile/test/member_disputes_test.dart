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
 testWidgets('pending controls wait for the original HTTP outcome and explicit confirmation before recovery',(tester)async{
  await tester.binding.setSurfaceSize(const Size(1000,1800));
  addTearDown(()=>tester.binding.setSurfaceSize(null));
  final response=Completer<http.Response>();var resolutions=0;
  final api=GenealogyApiService(client:MockClient((r)async{
   if(r.method=='GET')return jsonResponse({'items':[],'nextCursor':null});
   if(r.url.path.endsWith('/dispute'))return response.future;
   resolutions++;return jsonResponse({'outcome':'CREATED','dispute':{'id':dispute,'targetPersonId':person,'status':'OPEN'}});
  }))..setAuthToken(token('owner'));addTearDown(api.dispose);
  await tester.pumpWidget(MaterialApp(home:MemberDisputesScreen(api:api,personId:person)));await tester.pumpAndSettle();
  await tester.enterText(find.byKey(const ValueKey('dispute-reason')),'Original synthetic reason');
  await tester.tap(find.byKey(const ValueKey('dispute-confirm')));await tester.pump();
  final submit=find.widgetWithText(ElevatedButton,disputeLabels['submit']!);
  await tester.ensureVisible(submit);await tester.tap(submit);await tester.pump();await tester.pump();
  final confirmation=find.byKey(const ValueKey('dispute-close-confirm'));
  final recovery=find.widgetWithText(OutlinedButton,disputeLabels['resolve']!);
  expect(api.hasPendingDispute,isTrue);
  expect(tester.widget<CheckboxListTile>(confirmation).onChanged,isNull);
  expect(tester.widget<OutlinedButton>(recovery).onPressed,isNull);
  expect(resolutions,0);
  response.complete(http.Response('{}',503));await tester.pumpAndSettle();
  expect(tester.widget<CheckboxListTile>(confirmation).onChanged,isNotNull);
  expect(tester.widget<CheckboxListTile>(confirmation).value,isFalse);
  expect(tester.widget<OutlinedButton>(recovery).onPressed,isNull);
  await tester.ensureVisible(confirmation);await tester.tap(confirmation);await tester.pumpAndSettle();
  expect(tester.widget<CheckboxListTile>(confirmation).value,isTrue);
  expect(tester.widget<OutlinedButton>(recovery).onPressed,isNotNull);
  await tester.ensureVisible(recovery);await tester.tap(recovery);await tester.pumpAndSettle();
  expect(resolutions,1);expect(api.hasPendingDispute,isFalse);
  expect(find.textContaining('Recorded dispute recovered'),findsOneWidget);
  expect(find.text(disputeStatuses['OPEN']!),findsOneWidget);
 });

 test('authoritative closure reuses immutable body and survives uncertain durable cleanup',()async{
  final store=FailingDisputeStore();final sent=<Map<String,dynamic>>[];var failCleanup=true;
  final api=GenealogyApiService(sessionStore:store,chatOutboxStore:MemoryChatOutboxStore(),client:MockClient((r)async{
   if(r.url.path=='/auth/native/verify')return jsonResponse({'accessToken':token('owner'),'refreshToken':'refresh'});
   sent.add(jsonDecode(r.body) as Map<String,dynamic>);
   if(r.url.path.endsWith('/dispute'))return http.Response('{}',503);
   expect(r.url.path,'/claims/people/$person/dispute-resolution');
   if(failCleanup){store.fail=true;failCleanup=false;}
   return jsonResponse({'outcome':'ABANDONED'});
  }));addTearDown(api.dispose);await api.verifyOtp('challenge','123456');
  await expectLater(api.submitMemberDispute({'targetPersonId':person,'reason':'Original private reason'}),throwsException);
  await expectLater(api.resolveMemberDispute(),throwsA(anything));expect(api.hasPendingDispute,isTrue);
  store.fail=false;expect(await api.resolveMemberDispute(),{'outcome':'ABANDONED'});
  expect(sent[1],sent[0]);expect(sent[2],sent[0]);expect(api.hasPendingDispute,isFalse);
 });
 test('malformed closure cannot discard pending intent; a recorded case is recovered instead of withdrawn',()async{
  var resolves=0;
  final api=GenealogyApiService(client:MockClient((r)async{
   if(r.url.path.endsWith('/dispute'))return http.Response('{}',503);
   resolves++;return jsonResponse(resolves==1?{'outcome':'ABANDONED','extra':'invalid'}:
    {'outcome':'CREATED','dispute':{'id':dispute,'targetPersonId':person,'status':'DISMISSED'}});
  }))..setAuthToken(token('owner'));addTearDown(api.dispose);
  await expectLater(api.submitMemberDispute({'targetPersonId':person,'reason':'Original reason'}),throwsException);
  await expectLater(api.resolveMemberDispute(),throwsFormatException);expect(api.hasPendingDispute,isTrue);
  expect((await api.resolveMemberDispute())['outcome'],'CREATED');expect(api.hasPendingDispute,isFalse);
 });
 testWidgets('permanent closure requires explicit confirmation and clears only an authoritative outcome',(tester)async{
  final api=GenealogyApiService(client:MockClient((r)async{
   if(r.method=='GET')return jsonResponse({'items':[],'nextCursor':null});
   if(r.url.path.endsWith('/dispute'))return http.Response('{}',503);
   return jsonResponse({'outcome':'ABANDONED'});
  }))..setAuthToken(token('owner'));addTearDown(api.dispose);
  await expectLater(api.submitMemberDispute({'targetPersonId':person,'reason':'Original reason'}),throwsException);
  await tester.pumpWidget(MaterialApp(home:MemberDisputesScreen(api:api)));await tester.pumpAndSettle();
  final button=find.widgetWithText(OutlinedButton,disputeLabels['resolve']!);
  expect(tester.widget<OutlinedButton>(button).onPressed,isNull);
  await tester.tap(find.byKey(const ValueKey('dispute-close-confirm')));await tester.pumpAndSettle();
  await tester.tap(button);await tester.pumpAndSettle();expect(api.hasPendingDispute,isFalse);
  expect(find.textContaining('Original submission permanently closed'),findsOneWidget);
 });

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
