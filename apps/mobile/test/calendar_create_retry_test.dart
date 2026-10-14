import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:kashyap_mobile/services/genealogy_api_service.dart';
import 'package:kashyap_mobile/screens/calendar_events_screen.dart';
import 'package:kashyap_mobile/localization/calendar_labels.dart';
import 'native_session_test.dart' show MemorySessionStore, jsonResponse;
import 'calendar_composition_test.dart' show tapButton, createDialog, chooseDate, titleKey;

String token(String owner) => '${base64Url.encode(utf8.encode('{}'))}.${base64Url.encode(utf8.encode(jsonEncode({'sub':owner})))}.signature';
Map<String,dynamic> draft() => {'title':'Private fixture','eventType':'GENERAL_EVENT','audienceScope':'INVITED_ONLY',
  'startsAt':'2027-01-02T04:15:00Z','audiencePreviewId':'preview','audienceSelection':{'type':'BRANCH','branchId':'branch'}};

class FailingStore extends MemorySessionStore {
  bool fail = false;
  @override
  Future<void> write(String value) async { if(fail) { throw StateError('storage unavailable'); } await super.write(value); }
}
void main() {
 test('lost response persists exact intent before HTTP and restores through token rotation',() async {
  final store=MemorySessionStore();final sent=<Map<String,dynamic>>[];
  final first=GenealogyApiService(sessionStore:store,client:MockClient((request)async {
   if(request.url.path=='/auth/native/verify') { return jsonResponse({'accessToken':token('owner'),'refreshToken':'refresh'}); }
   expect(jsonDecode(store.value!)['pendingCalendarCreate'],isNotNull);
   sent.add(jsonDecode(request.body) as Map<String,dynamic>);throw StateError('response lost after commit');
  }));
  await first.verifyOtp('otp','123456');await expectLater(first.createCalendarEvent(draft()),throwsStateError);
  expect(first.hasPendingCalendarCreate,isTrue);first.dispose();
  final restored=GenealogyApiService(sessionStore:store,client:MockClient((request)async {
   if(request.url.path=='/auth/native/refresh') { return jsonResponse({'accessToken':token('owner'),'refreshToken':'rotated'}); }
   sent.add(jsonDecode(request.body) as Map<String,dynamic>);return jsonResponse({'id':'one-event'},201);
  }));addTearDown(restored.dispose);
  expect(await restored.restoreSession(),isTrue);expect(restored.hasPendingCalendarCreate,isTrue);
  expect(await restored.createCalendarEvent(),{'id':'one-event'});expect(sent[1],sent[0]);
  expect(sent[0]['creationKey'],matches(RegExp(r'^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$')));
  expect(restored.hasPendingCalendarCreate,isFalse);expect(jsonDecode(store.value!).containsKey('pendingCalendarCreate'),isFalse);
 });
 test('unresolved body is immutable and account replacement uses a new identity',()async {
  final sent=<Map<String,dynamic>>[];
  final api=GenealogyApiService(client:MockClient((r)async{sent.add(jsonDecode(r.body) as Map<String,dynamic>);return jsonResponse({'message':'unavailable'},503);}))..setAuthToken(token('first'));
  addTearDown(api.dispose);final body=draft();await expectLater(api.createCalendarEvent(body),throwsException);
  (body['audienceSelection'] as Map)['branchId']='changed';body['title']='Changed';
  await expectLater(api.createCalendarEvent(body),throwsException);expect(sent[1],sent[0]);
  api.setAuthToken(token('second'));expect(api.hasPendingCalendarCreate,isFalse);
  await expectLater(api.createCalendarEvent(body),throwsException);expect(sent[2]['creationKey'],isNot(sent[0]['creationKey']));expect(sent[2]['title'],'Changed');
 });
 test('secure storage failure prevents sending and preserves retry identity',()async {
  final store=FailingStore();var writes=0;
  final api=GenealogyApiService(sessionStore:store,client:MockClient((r)async {
   if(r.url.path=='/auth/native/verify') { return jsonResponse({'accessToken':token('owner'),'refreshToken':'refresh'}); }
   writes++;return jsonResponse({'id':'event'},201);
  }));addTearDown(api.dispose);await api.verifyOtp('otp','123456');store.fail=true;
  await expectLater(api.createCalendarEvent(draft()),throwsStateError);expect(writes,0);expect(api.hasPendingCalendarCreate,isTrue);
  store.fail=false;await api.createCalendarEvent();expect(writes,1);expect(api.hasPendingCalendarCreate,isFalse);
 });
 test('failed durable acknowledgement cleanup keeps the original key for safe replay',()async {
  final store=FailingStore();final sent=<Map<String,dynamic>>[];
  final api=GenealogyApiService(sessionStore:store,client:MockClient((r)async {
   if(r.url.path=='/auth/native/verify') { return jsonResponse({'accessToken':token('owner'),'refreshToken':'refresh'}); }
   sent.add(jsonDecode(r.body) as Map<String,dynamic>);if(sent.length==1) { store.fail=true; }
   return jsonResponse({'id':'one-event'},201);
  }));addTearDown(api.dispose);await api.verifyOtp('otp','123456');
  await expectLater(api.createCalendarEvent(draft()),throwsStateError);expect(api.hasPendingCalendarCreate,isTrue);
  store.fail=false;await api.createCalendarEvent();expect(sent[1],sent[0]);expect(api.hasPendingCalendarCreate,isFalse);
 });
 test('401 refresh retries the exact body and key in the same session',()async {
  final sent=<String>[];var refreshed=false;
  final api=GenealogyApiService(sessionStore:MemorySessionStore(),client:MockClient((r)async {
   if(r.url.path=='/auth/native/verify') { return jsonResponse({'accessToken':token('owner'),'refreshToken':'refresh'}); }
   if(r.url.path=='/auth/native/refresh') { refreshed=true;return jsonResponse({'accessToken':token('owner'),'refreshToken':'rotated'}); }
   sent.add(r.body);return refreshed?jsonResponse({'id':'event'},201):jsonResponse({},401);
  }));addTearDown(api.dispose);await api.verifyOtp('otp','123456');final generation=api.pushSessionGeneration;
  await api.createCalendarEvent(draft());expect(sent.length,2);expect(sent[1],sent[0]);expect(api.pushSessionGeneration,generation);
 });
 test('concurrent taps send once and late old-session acknowledgement cannot leak pending state',()async {
  final response=Completer<http.Response>();var writes=0;
  final api=GenealogyApiService(client:MockClient((r)async{writes++;return response.future;}))..setAuthToken(token('old'));
  addTearDown(api.dispose);final old=api.createCalendarEvent(draft());await Future<void>.delayed(Duration.zero);
  await expectLater(api.createCalendarEvent(draft()),throwsStateError);expect(writes,1);
  api.setAuthToken(token('new'));response.complete(jsonResponse({'id':'old-event'},201));
  await expectLater(old,throwsStateError);expect(api.hasPendingCalendarCreate,isFalse);
 });
 test('malformed acknowledgement retains retry identity',()async {
  final api=GenealogyApiService(client:MockClient((r)async=>jsonResponse({},201)))..setAuthToken(token('owner'));addTearDown(api.dispose);
  await expectLater(api.createCalendarEvent(draft()),throwsFormatException);expect(api.hasPendingCalendarCreate,isTrue);
 });
 test('restoration refuses pending state belonging to another account or server',()async {
  for(final mismatch in ['owner','server']) {
   final store=MemorySessionStore()..value=jsonEncode({'accessToken':token('owner'),'refreshToken':'refresh',
    'pendingCalendarCreate':{'owner':mismatch=='owner'?'another':'owner','server':mismatch=='server'?'another-server':'https://calendar.example.test','key':'00000000-0000-4000-8000-000000000001','body':draft()}});
   final api=GenealogyApiService(baseUrl:'https://calendar.example.test',sessionStore:store,client:MockClient((_)async=>throw StateError('must not send')));addTearDown(api.dispose);
   expect(await api.restoreSession(),isFalse);expect(api.hasPendingCalendarCreate,isFalse);expect(store.value,isNull);
  }
 });
 testWidgets('closing a failed create and reopening resolves its original identity before a new draft',(tester)async {
  final sent=<Map<String,dynamic>>[];
  final api=GenealogyApiService(client:MockClient((r)async{
   if(r.method=='POST') {
    sent.add(jsonDecode(r.body) as Map<String,dynamic>);
    if(sent.length==1) { throw StateError('lost response'); }
    return jsonResponse({'id':'one-event'},201);
   }
   return jsonResponse([]);
  }))..setAuthToken('fixture');addTearDown(api.dispose);
  await tester.pumpWidget(MaterialApp(home:CalendarEventsScreen(apiService:api)));await tester.pumpAndSettle();await createDialog(tester);
  await tester.enterText(find.byKey(titleKey),'Original draft');await chooseDate(tester);await tapButton(tester,calendarLabels['save']!);
  expect(tester.widget<TextField>(find.byKey(titleKey)).enabled,isFalse);
  await tapButton(tester,calendarLabels['close']!);
  await tester.tap(find.widgetWithIcon(IconButton,Icons.add));await tester.pumpAndSettle();
  expect(sent.length,2);expect(sent[1],sent[0]);expect(find.byType(AlertDialog),findsNothing);expect(api.hasPendingCalendarCreate,isFalse);
 });
}
