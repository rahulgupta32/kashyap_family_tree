import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:kashyap_mobile/services/genealogy_api_service.dart';
import 'package:kashyap_mobile/screens/calendar_events_screen.dart';
import 'package:kashyap_mobile/localization/calendar_labels.dart';
import 'native_session_test.dart' show jsonResponse, MemorySessionStore;
import 'calendar_create_retry_test.dart' show draft, token, FailingStore;
import 'calendar_composition_test.dart' show tapButton, createDialog, chooseDate, titleKey;

class GatedCleanupStore extends MemorySessionStore {
 bool blockCleanup=false;
 final cleanupStarted=Completer<void>();
 final releaseCleanup=Completer<void>();
 @override
 Future<void> write(String value) async {
  if(blockCleanup && !(jsonDecode(value) as Map).containsKey('pendingCalendarCreate')) {
   if(!cleanupStarted.isCompleted) { cleanupStarted.complete(); }
   await releaseCleanup.future;throw StateError('Unconfirmed cleanup');
  }
  await super.write(value);
 }
}
void main(){
 test('a rejected create is closed by the server before a new key is generated',()async{
  final bodies=<Map<String,dynamic>>[];var creates=0;
  final api=GenealogyApiService(client:MockClient((r)async{
   bodies.add(jsonDecode(r.body) as Map<String,dynamic>);
   if(r.url.path.endsWith('creation-resolution')) { return jsonResponse({'outcome':'ABANDONED'},201); }
   creates++;return creates==1?jsonResponse({},400):jsonResponse({'id':'new-event'},201);
  }))..setAuthToken(token('owner'));addTearDown(api.dispose);
  await expectLater(api.createCalendarEvent(draft()),throwsException);
  expect(await api.resolveCalendarCreate(),'ABANDONED');expect(bodies[1],bodies[0]);expect(api.hasPendingCalendarCreate,isFalse);
  await api.createCalendarEvent(draft());expect(bodies[2]['creationKey'],isNot(bodies[0]['creationKey']));
 });
 test('committed result recovery uses the original payload and sends no second create',()async{
  var creates=0;Map<String,dynamic>? original;
  final api=GenealogyApiService(client:MockClient((r)async{
   final body=jsonDecode(r.body) as Map<String,dynamic>;
   if(r.url.path.endsWith('creation-resolution')) { expect(body,original);return jsonResponse({'outcome':'CREATED','eventId':'existing'},201); }
   creates++;original=body;throw StateError('lost acknowledgement');
  }))..setAuthToken(token('owner'));addTearDown(api.dispose);
  await expectLater(api.createCalendarEvent(draft()),throwsStateError);
  expect(await api.resolveCalendarCreate(),'CREATED');expect(creates,1);expect(api.hasPendingCalendarCreate,isFalse);
 });
 test('lost resolution responses and malformed confirmations retain the same key',()async{
  final bodies=<String>[];var attempts=0;
  final api=GenealogyApiService(client:MockClient((r)async{
   if(!r.url.path.endsWith('creation-resolution')) { return jsonResponse({},503); }
   bodies.add(r.body);attempts++;
   if(attempts==1) { throw StateError('lost response'); }
   if(attempts==2) { return jsonResponse({'outcome':'CREATED'},201); }
   return jsonResponse({'outcome':'ABANDONED'},201);
  }))..setAuthToken(token('owner'));addTearDown(api.dispose);
  await expectLater(api.createCalendarEvent(draft()),throwsException);
  await expectLater(api.resolveCalendarCreate(),throwsStateError);expect(api.hasPendingCalendarCreate,isTrue);
  await expectLater(api.resolveCalendarCreate(),throwsFormatException);expect(api.hasPendingCalendarCreate,isTrue);
  expect(await api.resolveCalendarCreate(),'ABANDONED');expect(bodies.toSet().length,1);
 });
 test('resolution acknowledgement cleanup failure retains durable pending identity',()async{
  final store=FailingStore();var resolutions=0;
  final api=GenealogyApiService(sessionStore:store,client:MockClient((r)async{
   if(r.url.path=='/auth/native/verify') { return jsonResponse({'accessToken':token('owner'),'refreshToken':'refresh'}); }
   if(r.url.path.endsWith('creation-resolution')) { resolutions++;store.fail=resolutions==1;return jsonResponse({'outcome':'ABANDONED'},201); }
   return jsonResponse({},409);
  }));addTearDown(api.dispose);await api.verifyOtp('otp','123456');
  await expectLater(api.createCalendarEvent(draft()),throwsException);final key=jsonDecode(store.value!)['pendingCalendarCreate']['key'];
  await expectLater(api.resolveCalendarCreate(),throwsStateError);expect(api.hasPendingCalendarCreate,isTrue);
  expect(jsonDecode(store.value!)['pendingCalendarCreate']['key'],key);
  store.fail=false;expect(await api.resolveCalendarCreate(),'ABANDONED');expect(api.hasPendingCalendarCreate,isFalse);
 });
 test('queued token refresh cannot erase an intent while durable cleanup is unconfirmed',()async{
  final store=GatedCleanupStore();var refreshed=false;
  final api=GenealogyApiService(sessionStore:store,client:MockClient((r)async{
   if(r.url.path=='/auth/native/verify') { return jsonResponse({'accessToken':token('owner'),'refreshToken':'refresh'}); }
   if(r.url.path=='/auth/native/refresh') { refreshed=true;return jsonResponse({'accessToken':token('owner'),'refreshToken':'rotated'}); }
   if(r.url.path=='/probe') { return refreshed?jsonResponse({'ok':true}):jsonResponse({},401); }
   if(r.url.path.endsWith('creation-resolution')) { return jsonResponse({'outcome':'CREATED','eventId':'existing'},201); }
   return jsonResponse({'id':'existing'},201);
  }));addTearDown(api.dispose);await api.verifyOtp('otp','123456');store.blockCleanup=true;
  final creating=expectLater(api.createCalendarEvent(draft()),throwsStateError);
  await store.cleanupStarted.future;expect(api.hasPendingCalendarCreate,isTrue);
  final probe=api.requestJson('/probe');await Future<void>.delayed(Duration.zero);
  store.releaseCleanup.complete();await creating;await probe;
  expect(jsonDecode(store.value!)['pendingCalendarCreate'],isNotNull);expect(api.hasPendingCalendarCreate,isTrue);
  store.blockCleanup=false;expect(await api.resolveCalendarCreate(),'CREATED');expect(api.hasPendingCalendarCreate,isFalse);
 });
 test('a late resolution cannot clear or expose state across account replacement',()async{
  final response=Completer<http.Response>();var sent=0;
  final api=GenealogyApiService(client:MockClient((r)async{
   if(r.url.path.endsWith('creation-resolution')) { sent++;return response.future; }
   return jsonResponse({},503);
  }))..setAuthToken(token('old'));addTearDown(api.dispose);
  await expectLater(api.createCalendarEvent(draft()),throwsException);
  final resolving=api.resolveCalendarCreate();await Future<void>.delayed(Duration.zero);
  await expectLater(api.resolveCalendarCreate(),throwsStateError);expect(sent,1);
  api.setAuthToken(token('new'));response.complete(jsonResponse({'outcome':'CREATED','eventId':'old-event'},201));
  await expectLater(resolving,throwsStateError);expect(api.hasPendingCalendarCreate,isFalse);
 });
 testWidgets('explicit outcome resolution closes a rejected draft and permits a fresh event',(tester)async{
  final creates=<Map<String,dynamic>>[];
  final api=GenealogyApiService(client:MockClient((r)async{
   if(r.url.path.endsWith('creation-resolution')) { return jsonResponse({'outcome':'ABANDONED'},201); }
   if(r.method=='POST') { creates.add(jsonDecode(r.body) as Map<String,dynamic>);return creates.length==1?jsonResponse({},400):jsonResponse({'id':'new-event'},201); }
   return jsonResponse([]);
  }))..setAuthToken('fixture');addTearDown(api.dispose);
  await tester.pumpWidget(MaterialApp(home:CalendarEventsScreen(apiService:api)));await tester.pumpAndSettle();await createDialog(tester);
  await tester.enterText(find.byKey(titleKey),'Rejected fixture');await chooseDate(tester);await tapButton(tester,calendarLabels['save']!);
  expect(tester.widget<TextField>(find.byKey(titleKey)).enabled,isFalse);
  await tapButton(tester,calendarLabels['resolveCreate']!);expect(find.byType(AlertDialog),findsNothing);expect(api.hasPendingCalendarCreate,isFalse);
  await createDialog(tester);expect(tester.widget<TextField>(find.byKey(titleKey)).controller!.text,'');
  await tester.enterText(find.byKey(titleKey),'Fresh fixture');await chooseDate(tester);await tapButton(tester,calendarLabels['save']!);
  expect(creates.length,2);expect(creates[1]['creationKey'],isNot(creates[0]['creationKey']));expect(tester.takeException(),isNull);
 });
}
