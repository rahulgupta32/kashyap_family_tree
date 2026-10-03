import 'dart:async';
import 'package:flutter_test/flutter_test.dart';
import 'package:kashyap_mobile/services/chat_outbox.dart';

class MemoryChatOutboxStore implements ChatOutboxStore {
  String? value;
  bool failWrite=false,failClear=false;
  @override
  Future<String?> read() async=>value;
  @override
  Future<void> write(String value) async {if(failWrite){throw StateError('Disk unavailable');}this.value=value;}
  @override
  Future<void> clear() async {if(failClear){throw StateError('Disk unavailable');}value=null;}
}
const conversation='11111111-1111-4111-8111-111111111111';
const otherConversation='22222222-2222-4222-8222-222222222222';
void main(){
 test('persists intent before HTTP and restores immutable identity after restart and a lost response',() async {
  final store=MemoryChatOutboxStore();final committed=<String>{};final attempts=<Map>[];
  Future<void> send(QueuedChatMessage row,String owner) async {
   expect(store.value,contains(row.id));attempts.add(row.toJson());
   if(committed.add(row.id)){throw const ChatSendFailure(503);}
  }
  final first=ChatOutbox(store:store,server:'fixture-api',currentOwner:()=> 'owner',send:send);
  final row=await first.enqueue(conversation,'Preserved after restart');await first.pump();first.dispose();
  final restored=ChatOutbox(store:store,server:'fixture-api',currentOwner:()=> 'owner',send:send);addTearDown(restored.dispose);
  expect((await restored.list()).single.id,row.id);await restored.retry(row.id);await restored.pump();
  expect(await restored.list(),isEmpty);expect(committed.length,1);
  expect(attempts.map((r)=>r['id']).toSet(),{row.id});expect(attempts.map((r)=>r['content']).toSet(),{'Preserved after restart'});
 });
 test('storage failure never sends or reports persistence success',() async {
  final store=MemoryChatOutboxStore()..failWrite=true;var sent=0;
  final queue=ChatOutbox(store:store,server:'fixture-api',currentOwner:()=> 'owner',send:(row,owner)async{sent++;});addTearDown(queue.dispose);
  await expectLater(queue.enqueue(conversation,'Must be saved first'),throwsStateError);await queue.pump();expect(sent,0);
 });
 test('single-flight concurrent pumps and enqueues preserve every message',() async {
  final store=MemoryChatOutboxStore(),gate=Completer<void>();var sent=0;
  final queue=ChatOutbox(store:store,server:'fixture-api',currentOwner:()=> 'owner',send:(row,owner)async{sent++;if(sent==1){await gate.future;}});addTearDown(queue.dispose);
  await queue.enqueue(conversation,'First');final a=queue.pump(),b=queue.pump();
  await Future<void>.delayed(Duration.zero);await queue.enqueue(conversation,'Second');gate.complete();await Future.wait([a,b]);
  expect(sent,2);expect(await queue.list(),isEmpty);
 });
 test('temporary failures back off and block later messages only in the same conversation',() async {
  final store=MemoryChatOutboxStore();var clock=1000;final sent=<String>[];var failing=true;
  final queue=ChatOutbox(store:store,server:'fixture-api',currentOwner:()=> 'owner',now:()=>clock,send:(row,owner)async{sent.add(row.content);if(row.content=='First'&&failing){throw const ChatSendFailure(429);}});addTearDown(queue.dispose);
  await queue.enqueue(conversation,'First');await queue.enqueue(conversation,'Second');await queue.enqueue(otherConversation,'Independent');await queue.pump();
  expect(sent,['First','Independent']);await queue.pump();expect(sent.length,2);
  clock+=2000;failing=false;await queue.pump();expect(sent,['First','Independent','First','Second']);expect(await queue.list(),isEmpty);
 });
 test('permission and conflict errors stop automatic retries but retain the original intent',() async {
  for(final status in [400,403,404,409]){
   var sent=0;final queue=ChatOutbox(store:MemoryChatOutboxStore(),server:'fixture-api',currentOwner:()=> 'owner',send:(row,owner)async{sent++;throw ChatSendFailure(status);});
   final row=await queue.enqueue(conversation,'Review before retry');await queue.pump();await queue.pump();
   expect(sent,1);expect((await queue.list()).single.state,'failed');expect((await queue.list()).single.failureStatus,status);
   await queue.retry(row.id);await queue.pump();expect(sent,2);expect((await queue.list()).single.id,row.id);queue.dispose();
  }
 });
 test('account and API-server changes cannot replay another scope even if deletion fails',() async {
  final store=MemoryChatOutboxStore();var owner='first';var sent=0;
  final queue=ChatOutbox(store:store,server:'one-api',currentOwner:()=>owner,send:(row,owner)async{sent++;});addTearDown(queue.dispose);
  await queue.enqueue(conversation,'Private first-account intent');owner='second';store.failClear=true;
  await expectLater(queue.pump(),throwsStateError);expect(sent,0);store.failClear=false;await queue.pump();expect(sent,0);expect(await queue.list(),isEmpty);
  owner='first';await queue.enqueue(conversation,'First API only');
  final other=ChatOutbox(store:store,server:'other-api',currentOwner:()=>owner,send:(row,owner)async{sent++;});addTearDown(other.dispose);
  await other.pump();expect(sent,0);expect(await other.list(),isEmpty);
 });
 test('logout can wipe storage during an in-flight request without deadlock or resurrection',() async {
  final store=MemoryChatOutboxStore(),gate=Completer<void>();String? owner='first';
  final queue=ChatOutbox(store:store,server:'fixture-api',currentOwner:()=>owner,send:(row,owner)async{await gate.future;});addTearDown(queue.dispose);
  await queue.enqueue(conversation,'In flight');final pending=queue.pump();await Future<void>.delayed(Duration.zero);
  owner=null;await queue.clear().timeout(const Duration(seconds:1));gate.complete();await pending;
  expect(store.value,isNull);owner='second';expect(await queue.list(),isEmpty);
 });
 test('background stop retains uncertain in-flight intent and halts the remaining backlog',() async {
  final store=MemoryChatOutboxStore(),gate=Completer<void>();var sent=0;
  final queue=ChatOutbox(store:store,server:'fixture-api',currentOwner:()=> 'owner',send:(row,owner)async{sent++;await gate.future;});addTearDown(queue.dispose);
  await queue.enqueue(conversation,'First');await queue.enqueue(conversation,'Second');final pending=queue.pump();await Future<void>.delayed(Duration.zero);
  queue.stop();gate.complete();await pending;expect(sent,1);expect((await queue.list()).length,2);
 });
 test('queue bounds and corrupted data fail closed',() async {
  final store=MemoryChatOutboxStore();var sent=0;
  final queue=ChatOutbox(store:store,server:'fixture-api',currentOwner:()=> 'owner',send:(row,owner)async{sent++;});addTearDown(queue.dispose);
  await expectLater(queue.enqueue('invalid','Content'),throwsArgumentError);await expectLater(queue.enqueue(conversation,'x'*4001),throwsArgumentError);
  for(var i=0;i<100;i++){await queue.enqueue(conversation,'Message $i');}
  await expectLater(queue.enqueue(conversation,'Overflow'),throwsStateError);expect((await queue.list()).length,100);
  store.value='corrupted';await expectLater(queue.pump(),throwsFormatException);expect(sent,0);
 });
 test('discard cancels queued retries but cannot delete an in-flight request',() async {
  final store=MemoryChatOutboxStore(),gate=Completer<void>();
  final queue=ChatOutbox(store:store,server:'fixture-api',currentOwner:()=> 'owner',send:(row,owner)async{await gate.future;});addTearDown(queue.dispose);
  final a=await queue.enqueue(conversation,'Sending'),b=await queue.enqueue(conversation,'Discard');
  final pending=queue.pump();await Future<void>.delayed(Duration.zero);await expectLater(queue.discard(a.id),throwsStateError);
  await queue.discard(b.id);gate.complete();await pending;expect(await queue.list(),isEmpty);
 });
}
