import 'dart:async';
import 'dart:convert';
import 'dart:math';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

abstract class ChatOutboxStore {
  Future<String?> read();
  Future<void> write(String value);
  Future<void> clear();
}
class SecureChatOutboxStore implements ChatOutboxStore {
  static const _key = 'kashyap_chat_outbox_v1';
  final FlutterSecureStorage _storage = const FlutterSecureStorage();
  @override
  Future<String?> read() => _storage.read(key: _key);
  @override
  Future<void> write(String value) => _storage.write(key: _key, value: value);
  @override
  Future<void> clear() => _storage.delete(key: _key);
}
class ChatSendFailure implements Exception {
  final int status;
  const ChatSendFailure(this.status);
  bool get retryable => status == 408 || status == 429 || status >= 500;
}
class QueuedChatMessage {
  final String id, conversationId, content, state;
  final int createdAt, attempts, nextAttemptAt;
  final int? failureStatus;
  final Map<String,String>? attachment;
  const QueuedChatMessage({required this.id, required this.conversationId, required this.content,
    required this.createdAt, this.state = 'queued', this.attempts = 0, this.nextAttemptAt = 0, this.failureStatus,this.attachment});
  Map<String,dynamic> toJson() => {'id':id,'conversationId':conversationId,'content':content,'createdAt':createdAt,
    'state':state,'attempts':attempts,'nextAttemptAt':nextAttemptAt,'failureStatus':failureStatus,if(attachment!=null)'attachment':attachment};
  factory QueuedChatMessage.fromJson(Map value) {
    final row = QueuedChatMessage(id:value['id'] as String,conversationId:value['conversationId'] as String,
      content:value['content'] as String,createdAt:value['createdAt'] as int,state:value['state'] as String,
      attempts:value['attempts'] as int,nextAttemptAt:value['nextAttemptAt'] as int,failureStatus:value['failureStatus'] as int?,attachment:value['attachment']==null?null:Map<String,String>.unmodifiable(Map<String,String>.from(value['attachment'] as Map)));
    if (!_uuid.hasMatch(row.id) || !_uuid.hasMatch(row.conversationId) || row.content.trim().isEmpty || row.content.length>4000 ||
      !['queued','failed'].contains(row.state) || row.createdAt<0 || row.attempts<0 || row.nextAttemptAt<0 || !_validAttachment(row.attachment)) {
      throw const FormatException('Invalid queued message');
    }
    return row;
  }
  QueuedChatMessage failed(int attempts, int next, int? status, bool retryable) => QueuedChatMessage(
    id:id,conversationId:conversationId,content:content,createdAt:createdAt,attempts:attempts,
    nextAttemptAt:next,state:retryable?'queued':'failed',failureStatus:status,attachment:attachment);
  QueuedChatMessage retry() => QueuedChatMessage(id:id,conversationId:conversationId,content:content,createdAt:createdAt,attachment:attachment);
}
bool _validAttachment(Map<String,String>? value)=>value==null||['image/png','image/jpeg','image/webp','application/pdf'].contains(value['mimeType'])&&(value['dataBase64']?.isNotEmpty??false)&&(value['dataBase64']!.length<=6990508)&&value['dataBase64']!.length%4==0&&RegExp(r'^[A-Za-z0-9+/]*={0,2}$').hasMatch(value['dataBase64']!);
final _uuid = RegExp(r'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$');
String _messageId() {
  final random=Random.secure();
  final bytes=List<int>.generate(16,(_)=>random.nextInt(256));
  bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
  final h=bytes.map((b)=>b.toRadixString(16).padLeft(2,'0')).join();
  return '${h.substring(0,8)}-${h.substring(8,12)}-${h.substring(12,16)}-${h.substring(16,20)}-${h.substring(20)}';
}

/// One serialized storage writer and one network pump. Network calls never hold
/// the storage lock: session revocation can wipe the queue during a request.
class ChatOutbox {
  final ChatOutboxStore store;
  final String server;
  final String? Function() currentOwner;
  final Future<void> Function(QueuedChatMessage message,String owner) send;
  final int Function() now;
  final _changes=StreamController<void>.broadcast();
  Future<void> _tail=Future.value();
  Future<void>? _pumping;
  String? _inFlight;
  int _generation=0;
  bool _auto=false,_disposed=false;
  Timer? _timer;
  Object? lastError;
  ChatOutbox({required this.store,required this.server,required this.currentOwner,required this.send,int Function()? now})
    :now=now??(()=>DateTime.now().millisecondsSinceEpoch);
  Stream<void> get changes=>_changes.stream;
  bool get isSending=>_inFlight!=null;
  void _notify(){if(!_disposed){_changes.add(null);}}
  Future<T> _locked<T>(Future<T> Function() work) {
    final pending=_tail.then((_)=>work());
    _tail=pending.then<void>((_) {},onError:(Object e,StackTrace s) {});
    return pending;
  }
  String _owner(){final owner=currentOwner();if(owner==null||owner.isEmpty){throw StateError('Sign in for queued messages');}return owner;}
  Future<List<QueuedChatMessage>> _read(String owner) async {
    final saved=await store.read();
    if(saved==null){return [];}
    final value=jsonDecode(saved);
    if(value is! Map || value['version']!=1 || value['items'] is! List){throw const FormatException('Unreadable message queue');}
    if(value['owner']!=owner||value['server']!=server){await store.clear();return [];}
    final rows=(value['items'] as List).map((v)=>QueuedChatMessage.fromJson(v as Map)).toList();
    if(rows.length>100||rows.map((r)=>r.id).toSet().length!=rows.length){throw const FormatException('Invalid message queue');}
    return rows;
  }
  Future<void> _save(String owner,List<QueuedChatMessage> rows,int generation) async {
    if(currentOwner()!=owner||generation!=_generation){throw StateError('Session changed');}
    final value=jsonEncode({'version':1,'owner':owner,'server':server,'items':rows.map((r)=>r.toJson()).toList()});
    if(utf8.encode(value).length>8*1024*1024){throw StateError('Message queue storage limit reached');}
    await store.write(value);
  }
  Future<List<QueuedChatMessage>> list() => _locked(() async {
    final owner=_owner(),generation=_generation;
    final rows=await _read(owner);
    if(currentOwner()!=owner||generation!=_generation){throw StateError('Session changed');}return rows;
  });
  Future<QueuedChatMessage> enqueue(String conversation,String content,{Map<String,String>? attachment}) => _locked(() async {
    final owner=_owner(),generation=_generation;content=content.trim();
    if(!_uuid.hasMatch(conversation)||content.isEmpty||content.length>4000||!_validAttachment(attachment)){throw ArgumentError('Invalid queued message');}
    final rows=await _read(owner);if(rows.length>=100){throw StateError('Message queue is full');}
    final row=QueuedChatMessage(id:_messageId(),conversationId:conversation,content:content,createdAt:now(),attachment:attachment==null?null:Map<String,String>.unmodifiable(attachment));
    await _save(owner,[...rows,row],generation);_notify();return row;
  });
  Future<void> retry(String id) => _locked(() async {
    final owner=_owner(),generation=_generation;
    final rows=await _read(owner);
    if(id==_inFlight){throw StateError('Message is sending');}
    final index=rows.indexWhere((r)=>r.id==id);if(index<0){throw StateError('Queued message not found');}
    rows[index]=rows[index].retry();await _save(owner,rows,generation);_notify();
  });
  Future<void> discard(String id) => _locked(() async {
    final owner=_owner(),generation=_generation;
    final rows=await _read(owner);
    if(id==_inFlight){throw StateError('Message is sending');}
    rows.removeWhere((r)=>r.id==id);await _save(owner,rows,generation);_notify();
  });
  Future<void> clear() {
    _generation++;stop();
    return _locked(() async {await store.clear();_notify();});
  }
  void start(){if(_disposed){return;}_auto=true;_tick();}
  void stop(){_auto=false;_generation++;_timer?.cancel();}
  void _tick(){
    if(!_auto||_disposed){return;}
    _timer?.cancel();
    unawaited(pump().catchError((Object e){lastError=e;_notify();}).whenComplete((){
      if(_auto&&!_disposed){_timer=Timer(const Duration(seconds:2),_tick);}
    }));
  }
  Future<void> pump() {
    if(_pumping!=null){return _pumping!;}
    final pending=_drain();_pumping=pending;
    return pending.whenComplete(()=>_pumping=null);
  }
  Future<void> _drain() async {
    final owner=_owner(),generation=_generation;
    while(!_disposed&&generation==_generation&&currentOwner()==owner){
      final row=await _locked(() async {
        if(currentOwner()!=owner||generation!=_generation||_disposed){return null;}
        final rows=await _read(owner),blocked=<String>{};
        for(final item in rows){
          if(blocked.contains(item.conversationId)){continue;}
          if(item.state=='failed'||item.nextAttemptAt>now()){blocked.add(item.conversationId);continue;}
          _inFlight=item.id;return item;
        }
        return null;
      });
      if(row==null){return;}
      int? status;bool success=false,retryable=true;
      try{if(currentOwner()!=owner||generation!=_generation){return;}await send(row,owner);success=true;}
      on ChatSendFailure catch(e){status=e.status;retryable=e.retryable;}
      on StateError {retryable=false;}
      catch(_){retryable=true;}
      finally{_inFlight=null;}
      if(currentOwner()!=owner||generation!=_generation||_disposed){return;}
      await _locked(() async {
        if(currentOwner()!=owner||generation!=_generation){return;}
        final rows=await _read(owner),index=rows.indexWhere((r)=>r.id==row.id);
        if(index<0){return;}
        if(success){rows.removeAt(index);}else{
          final attempts=min(1000,row.attempts+1),delay=min(60,2<<min(5,row.attempts));
          rows[index]=row.failed(attempts,now()+delay*1000,status,retryable);
        }
        await _save(owner,rows,generation);lastError=null;_notify();
      });
    }
  }
  void dispose(){_disposed=true;_generation++;stop();unawaited(_changes.close());}
}
