import 'dart:async';
import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:kashyap_mobile/services/genealogy_api_service.dart';
import 'chat_outbox_test.dart' show MemoryChatOutboxStore, conversation;
import 'native_session_test.dart' show MemorySessionStore;
String token(String user)=>'header.${base64Url.encode(utf8.encode(jsonEncode({'sub':user})))}.signature';
void main(){
 test('a revoked chat session clears its queue inside the pump without a deadlock',() async {
  final store=MemoryChatOutboxStore();
  final api=GenealogyApiService(chatOutboxStore:store,sessionStore:MemorySessionStore(),client:MockClient((_) async=>http.Response('{}',401)))..setAuthToken(token('first'));
  addTearDown(api.dispose);await api.chatOutbox.enqueue(conversation,'Revoked intent');
  await api.chatOutbox.pump().timeout(const Duration(seconds:1));expect(api.authToken,isNull);expect(store.value,isNull);
 });
 test('an in-flight 401 cannot retry the previous account message with a new account token',() async {
  final store=MemoryChatOutboxStore(),gate=Completer<void>();final headers=<String>[];
  final api=GenealogyApiService(chatOutboxStore:store,sessionStore:MemorySessionStore(),client:MockClient((request) async {
   headers.add(request.headers['Authorization']!);await gate.future;return http.Response('{}',401);
  }))..setAuthToken(token('first'));
  addTearDown(api.dispose);await api.chatOutbox.enqueue(conversation,'First account only');final pending=api.chatOutbox.pump();
  await Future<void>.delayed(Duration.zero);api.setAuthToken(token('second'));gate.complete();await pending;
  expect(headers,['Bearer ${token('first')}']);expect(api.authToken,token('second'));expect(await api.chatOutbox.list(),isEmpty);
 });
 test('logout wipes a persistent queue while a request is in flight and cannot resurrect it',() async {
  final store=MemoryChatOutboxStore(),gate=Completer<void>();
  final api=GenealogyApiService(chatOutboxStore:store,sessionStore:MemorySessionStore(),client:MockClient((request) async {
   if(request.url.path=='/auth/logout'){return http.Response('{}',200);}
   await gate.future;return http.Response('{"id":"committed"}',201);
  }))..setAuthToken(token('first'));
  addTearDown(api.dispose);await api.chatOutbox.enqueue(conversation,'Logout in flight');final pending=api.chatOutbox.pump();await Future<void>.delayed(Duration.zero);
  await api.logout().timeout(const Duration(seconds:1));gate.complete();await pending;expect(store.value,isNull);expect(api.authToken,isNull);
 });
 test('logout immediately stops remaining replay while its server response is delayed',() async {
  final store=MemoryChatOutboxStore(),chatGate=Completer<void>(),logoutGate=Completer<void>();var chatCalls=0;
  final api=GenealogyApiService(chatOutboxStore:store,sessionStore:MemorySessionStore(),client:MockClient((request) async {
   if(request.url.path=='/auth/logout'){await logoutGate.future;return http.Response('{}',200);}
   chatCalls++;await chatGate.future;return http.Response('{"id":"committed"}',201);
  }))..setAuthToken(token('first'));
  addTearDown(api.dispose);await api.chatOutbox.enqueue(conversation,'First');await api.chatOutbox.enqueue(conversation,'Must stop');
  final pending=api.chatOutbox.pump();await Future<void>.delayed(Duration.zero);
  final logout=api.logout();chatGate.complete();await pending;expect(chatCalls,1);
  logoutGate.complete();await logout;expect(store.value,isNull);
 });

}
