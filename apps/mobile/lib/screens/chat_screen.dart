import 'dart:async';
import 'dart:math';
import 'dart:convert';
import 'package:flutter/services.dart';
import 'package:flutter/material.dart';
import '../services/genealogy_api_service.dart';
import '../services/chat_connection.dart';
import '../services/chat_outbox.dart';
import '../models/person.dart';
import 'chat_group_management_screen.dart';
import '../localization/chat_group_labels.dart';

class ChatScreen extends StatefulWidget {
  final GenealogyApiService apiService;
  const ChatScreen({super.key, required this.apiService});
  @override
  State<ChatScreen> createState() => _ChatScreenState();
}
class _ChatScreenState extends State<ChatScreen> {
  List<dynamic> _conversations = [];
  List<PersonSummary> _people = [];
  final _query = TextEditingController();
  String? _error;
  bool _loading = true, _busy = false;
  String _userId = '';
  @override
  void initState() { super.initState(); _load(); }
  @override
  void dispose() { _query.dispose(); super.dispose(); }
  Future<void> _load() async {
    try {
      final profile = await widget.apiService.getMyProfile();
      final rows = await widget.apiService.requestJson('/chat/conversations');
      if (mounted) { setState(() { _conversations = rows as List; _userId = (profile['id'] ?? profile['userId'] ?? profile['user']?['id'] ?? '').toString(); _error = null; _loading = false; }); }
    } catch (e) { if (mounted) { setState(() { _error = e.toString(); _loading = false; }); } }
  }
  Future<void> _open(Map c) async {
    setState(() { _busy = true; _error = null; });
    try {
      if (c['isParticipant'] != true) { await widget.apiService.requestJson('/chat/conversations/${c['id']}/join', method: 'POST'); }
      if (!mounted) { return; }
      await Navigator.push(context, MaterialPageRoute(builder: (_) => ChatConversationScreen(api: widget.apiService, conversation: c, userId: _userId)));
      if (mounted) { await _load(); }
    } catch (e) { if (mounted) { setState(() => _error = e.toString()); } }
    finally { if (mounted) { setState(() => _busy = false); } }
  }
  Future<void> _search() async {
    setState(() { _busy = true; _error = null; });
    try { final people = await widget.apiService.searchPersons(query: _query.text); if (mounted) { setState(() => _people = people); } }
    catch (e) { if (mounted) { setState(() => _error = e.toString()); } }
    finally { if (mounted) { setState(() => _busy = false); } }
  }
  Future<void> _direct(String personId) async {
    try { final c = await widget.apiService.requestJson('/chat/conversations', method: 'POST', data: {'type':'DIRECT', 'personId':personId}); if (mounted) { await _open(c as Map); } }
    catch (e) { if (mounted) { setState(() => _error = e.toString()); } }
  }
  Future<void> _privateGroup() async {
    try {
      final selected=await showDialog<Map<String,dynamic>>(context:context,builder:(_)=>PrivateChatGroupDialog(api:widget.apiService));
      if(selected!=null){final group=await widget.apiService.requestJson('/chat/conversations',method:'POST',data:selected);if(mounted){await _open(group as Map);}}
    }catch(e){if(mounted){setState(()=>_error=e.toString());}}
  }
  Future<void> _group() async {
    try {
      final branches = await widget.apiService.requestJson('/genealogy/branches') as List;
      if (!mounted) { return; }
      final selected = await showDialog<Map<String,dynamic>>(context: context, builder: (_) => _ChatGroupDialog(branches: branches));
      if (selected != null) { final c=await widget.apiService.requestJson('/chat/conversations',method:'POST',data:selected); if(mounted){await _open(c as Map);} }
    } catch(e){if(mounted){setState(()=>_error=e.toString());}}
  }
  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('सन्देश (Messages)'), actions:[IconButton(tooltip:chatGroupLabels['create'],onPressed:_busy?null:_privateGroup,icon:const Icon(Icons.add_circle_outline)),IconButton(tooltip:'Create branch group',onPressed:_busy?null:_group,icon:const Icon(Icons.group_add)),IconButton(tooltip:'Refresh',onPressed:_load,icon:const Icon(Icons.refresh))]),
    body:_loading?const Center(child:CircularProgressIndicator()):RefreshIndicator(onRefresh:_load,child:ListView(padding:const EdgeInsets.all(16),children:[
      if(_error!=null)Text(_error!,style:const TextStyle(color:Colors.red)),
      TextField(controller:_query,decoration:const InputDecoration(labelText:'व्यक्ति खोज्नुहोस् (Find person)'),onSubmitted:(_)=>_search()),
      FilledButton(onPressed:_busy?null:_search,child:const Text('Search people')),
      ..._people.map((p)=>ListTile(title:Text(p.primaryNameNepali.isNotEmpty ? p.primaryNameNepali : p.primaryNameEnglish ?? 'Member'),trailing:const Icon(Icons.chat),onTap:_busy?null:()=>_direct(p.id))),
      const Divider(),
      if(_conversations.isEmpty)const Text('कुनै कुराकानी छैन (No conversations yet)'),
      ..._conversations.map((c)=>ListTile(title:Text(c['title'] as String),subtitle:Text('${c['unreadCount']} unread${c['isParticipant']==true?'':' · Join'}'),trailing:const Icon(Icons.chevron_right),onTap:_busy?null:()=>_open(c as Map))),
    ])),
  );
}

class ChatConversationScreen extends StatefulWidget {
  final GenealogyApiService api;
  final Map conversation;
  final String userId;
  const ChatConversationScreen({super.key,required this.api,required this.conversation,required this.userId});
  @override
  State<ChatConversationScreen> createState()=>_ChatConversationState();
}
class _ChatConversationState extends State<ChatConversationScreen> with WidgetsBindingObserver {
  ChatConnection? _connection;
  StreamSubscription<Map<String,dynamic>>? _subscription;
  StreamSubscription<void>? _outboxSubscription;
  List<QueuedChatMessage> _pending=[];
  Timer? _reconnect;
  final _text=TextEditingController();
  static const _files=MethodChannel('kashyap/chat_attachments');
  Map<String,String>? _attachment;
  List<dynamic> _messages=[];
  String? _error;
  bool _live=false,_sending=false,_typing=false,_active=true;
  int _attempt=0,_epoch=0,_lastTyping=0;
  String get _path=>'/chat/conversations/${widget.conversation['id']}';
  @override
  void initState(){super.initState();WidgetsBinding.instance.addObserver(this);_outboxSubscription=widget.api.chatOutbox.changes.listen((_)=>unawaited(_loadPending()));unawaited(_loadPending());widget.api.chatOutbox.start();_connect();}
  Future<void> _stop() async {_epoch++;_reconnect?.cancel();await _subscription?.cancel();await _connection?.close();_connection=null;}
  @override
  void dispose(){_active=false;widget.api.chatOutbox.stop();unawaited(_outboxSubscription?.cancel());WidgetsBinding.instance.removeObserver(this);unawaited(_stop());_text.dispose();super.dispose();}
  @override
  void didChangeAppLifecycleState(AppLifecycleState state){
    _active=state==AppLifecycleState.resumed;
    if(_active){widget.api.chatOutbox.start();unawaited(_loadPending());_connect();}else{widget.api.chatOutbox.stop();unawaited(_stop());}
  }
  void _retry(){if(!mounted||!_active){return;}_reconnect?.cancel();_reconnect=Timer(Duration(seconds:min(30,1<<min(5,_attempt++))),_connect);}
  Future<void> _connect() async {
    await _stop();final epoch=_epoch;
    if(!mounted||!_active){return;}
    try{
      final connection=await widget.api.openChatConnection();
      if(!mounted||!_active||epoch!=_epoch){await connection.close();return;}_connection=connection;
      _subscription=connection.frames.listen((frame){
        if(!mounted||epoch!=_epoch){return;}
        if(frame['type']=='authenticated'){connection.send({'type':'subscribe','conversationId':widget.conversation['id']});}
        if(frame['type']=='snapshot'&&frame['conversationId']==widget.conversation['id']){
          final merged={for(final m in _messages)m['id']:m,for(final m in frame['messages'] as List)m['id']:m};
          final rows=merged.values.toList()..sort((a,b)=>(a['sequence'] as num).compareTo(b['sequence'] as num));
          setState((){_messages=rows;_typing=(frame['typingUserIds'] as List).isNotEmpty;_live=true;_attempt=0;_error=null;});
          final received=frame['messages'] as List;
          if(received.isNotEmpty){connection.send({'type':'delivered','messageIds':received.map((m)=>m['id']).toList()});if(_active&&ModalRoute.of(context)?.isCurrent!=false){connection.send({'type':'read','sequence':received.last['sequence']});}}
        }
      },onDone:(){if(!mounted||epoch!=_epoch){return;}setState(()=>_live=false);if(connection.closeCode==4403){setState(()=>_error='Conversation access has ended.');}else{_retry();}},onError:(Object e){if(mounted&&epoch==_epoch){setState((){_live=false;_error='Connection interrupted. Reconnecting…';});_retry();}});
    }catch(e){if(mounted&&epoch==_epoch){setState(()=>_error=e.toString());_retry();}}
  }
  Future<void> _loadPending() async {
    try {
      if(widget.api.chatAccountId!=widget.userId){throw StateError('Message session changed');}
      final rows=await widget.api.chatOutbox.list();
      if(mounted){setState((){_pending=rows.where((r)=>r.conversationId==widget.conversation['id']).toList();if(widget.api.chatOutbox.lastError!=null){_error=chatOutboxLabels['storage'];}});}
    }catch(e){if(mounted){setState((){_pending=[];_error=chatOutboxLabels['storage'];});}}
  }
  Future<void> _pump() async {
    try {await widget.api.chatOutbox.pump();}
    catch(e){if(mounted){setState(()=>_error=chatOutboxLabels['storage']);}}
  }
  Future<void> _send() async {
    final content=_text.text.trim();if(content.isEmpty&&_attachment==null){return;}
    setState(()=>_sending=true);
    try{
      if(widget.api.chatAccountId!=widget.userId){throw StateError('Message session changed');}
      await widget.api.chatOutbox.enqueue(widget.conversation['id'] as String,content.isEmpty?'संलग्न फाइल (Attachment)':content,attachment:_attachment);
      if(mounted){_text.clear();setState((){_error=null;_attachment=null;});}
      unawaited(_pump());
    }catch(e){if(mounted){setState(()=>_error=chatOutboxLabels['storage']);}}
    finally{if(mounted){setState(()=>_sending=false);}}
  }
  Future<void> _queuedAction(QueuedChatMessage row,bool discard) async {
    if(discard){
      final confirmed=await showDialog<bool>(context:context,builder:(ctx)=>AlertDialog(title:Text(chatOutboxLabels['confirmDiscard']!),content:Text(chatOutboxLabels['discardNote']!),actions:[TextButton(onPressed:()=>Navigator.pop(ctx,false),child:const Text('Cancel')),FilledButton(onPressed:()=>Navigator.pop(ctx,true),child:Text(chatOutboxLabels['discard']!))]));
      if(confirmed!=true){return;}
    }
    try {if(discard){await widget.api.chatOutbox.discard(row.id);}else{await widget.api.chatOutbox.retry(row.id);unawaited(_pump());}}
    catch(e){if(mounted){setState(()=>_error=chatOutboxLabels['storage']);}}
  }
  Future<void> _pickAttachment() async {
    try{final value=await _files.invokeMapMethod<String,String>('pick');if(mounted&&value!=null&&widget.api.chatAccountId==widget.userId){setState((){_attachment=Map<String,String>.from(value);_error=null;});}}
    catch(e){if(mounted){setState(()=>_error='Choose PNG, JPEG, WebP or PDF up to 5 MB. $e');}}
  }
  Future<void> _downloadAttachment(Map message) async {
    try{final response=await widget.api.downloadChatAttachment(widget.conversation['id'] as String,message['id'] as String,widget.userId);
      if(!mounted||widget.api.chatAccountId!=widget.userId){return;}
      await _files.invokeMethod('save',{'dataBase64':base64Encode(response.bodyBytes),'mimeType':message['attachment']['mimeType'],'fileName':message['attachment']['fileName']});
    }catch(e){if(mounted){setState(()=>_error=e.toString());}}
  }
  Future<void> _report(String messageId) async {
    var reason='';
    final submitted=await showDialog<String>(context:context,builder:(ctx)=>StatefulBuilder(builder:(ctx,update)=>AlertDialog(
      title:const Text('उजुरी (Report message)'),
      content:Column(mainAxisSize:MainAxisSize.min,children:[const Text('यो सन्देश र कारण समीक्षकलाई पठाइनेछ (This message and reason will be shared with a moderator).'),TextField(maxLength:1000,decoration:const InputDecoration(labelText:'उजुरीको कारण (Report reason)'),onChanged:(value)=>update(()=>reason=value))]),
      actions:[TextButton(onPressed:()=>Navigator.pop(ctx),child:const Text('रद्द (Cancel)')),FilledButton(onPressed:reason.trim().isEmpty?null:()=>Navigator.pop(ctx,reason.trim()),child:const Text('पठाउनुहोस् (Submit report)'))])));
    if(submitted==null||!mounted){return;}
    try{await widget.api.requestJson('$_path/messages/$messageId/report',method:'POST',data:{'reason':submitted});if(mounted){ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content:Text('उजुरी पठाइयो (Report submitted)')));}}
    catch(e){if(mounted){setState(()=>_error=e.toString());}}
  }
  Future<void> _older()async{
    try{final rows=await widget.api.requestJson('$_path/messages?before=${_messages.first['sequence']}') as List;if(mounted){setState(()=>_messages=[...rows,..._messages]);}}
    catch(e){if(mounted){setState(()=>_error=e.toString());}}
  }
  Future<void> _action(String action)async{
    if(action=='Info'){await Navigator.push(context,MaterialPageRoute(builder:(_)=>ChatGroupManagementScreen(api:widget.api,conversationId:widget.conversation['id'] as String)));if(mounted&&_active&&_messages.isNotEmpty){_connection?.send({'type':'read','sequence':_messages.last['sequence']});}return;}

    final confirmed=await showDialog<bool>(context:context,builder:(ctx)=>AlertDialog(title:Text('$action conversation?'),actions:[TextButton(onPressed:()=>Navigator.pop(ctx,false),child:const Text('Cancel')),FilledButton(onPressed:()=>Navigator.pop(ctx,true),child:Text(action))]));
    if(confirmed!=true){return;}
    try{await widget.api.requestJson('$_path/${action.toLowerCase()}',method:'POST');if(mounted){Navigator.pop(context);}}
    catch(e){if(mounted){setState(()=>_error=e.toString());}}
  }
  @override
  Widget build(BuildContext context)=>Scaffold(appBar:AppBar(title:Text(widget.conversation['title'] as String),actions:[PopupMenuButton<String>(onSelected:_action,itemBuilder:(_)=>[if(widget.conversation['type']!='DIRECT')PopupMenuItem(value:'Info',child:Text(chatGroupLabels['info']!)),const PopupMenuItem(value:'Leave',child:Text('Leave conversation')),if(widget.conversation['type']=='DIRECT')const PopupMenuItem(value:'Block',child:Text('Block messages'))])]),
    body:Column(children:[
      Text(_live?'Live':'Connecting…'),if(_error!=null)Text(_error!,style:const TextStyle(color:Colors.red)),
      Expanded(child:ListView(padding:const EdgeInsets.all(16),children:[
        if(_messages.length>=100)TextButton(onPressed:_older,child:const Text('Load earlier messages')),
        ..._messages.map((m){final own=m['senderUserId']==widget.userId;return Card(color:own?Colors.amber.shade50:null,child:ListTile(title:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[Text(m['isDeleted']==true?'Message removed':m['content'] as String),if(m['attachment']!=null&&m['isDeleted']!=true)TextButton(onPressed:()=>_downloadAttachment(m as Map),child:const Text('डाउनलोड (Download attachment)'))]),subtitle:Text('${own?'You':'Member'} · ${own&&(m['readByUserIds'] as List).any((id)=>id!=widget.userId)?chatReceiptLabels['read']:own&&(m['deliveredToUserIds'] as List? ?? []).any((id)=>id!=widget.userId)?chatReceiptLabels['delivered']:chatReceiptLabels['sent']}'),trailing:own&&m['isDeleted']!=true?IconButton(tooltip:'Remove message',icon:const Icon(Icons.delete_outline),onPressed:()async{try{await widget.api.requestJson('$_path/messages/${m['id']}',method:'DELETE');}catch(e){if(mounted){setState(()=>_error=e.toString());}}}):!own&&m['isDeleted']!=true?IconButton(tooltip:'उजुरी (Report message)',icon:const Icon(Icons.flag_outlined),onPressed:()=>_report(m['id'] as String)):null));}),
      ])),
      if(_pending.isNotEmpty)ConstrainedBox(constraints:const BoxConstraints(maxHeight:160),child:ListView(shrinkWrap:true,children:_pending.map((row)=>ListTile(key:ValueKey('queued-${row.id}'),title:Text(row.content),subtitle:Text(row.state=='failed'?chatOutboxLabels['failed']!:chatOutboxLabels['queued']!),trailing:Row(mainAxisSize:MainAxisSize.min,children:[IconButton(tooltip:chatOutboxLabels['retry'],onPressed:()=>_queuedAction(row,false),icon:const Icon(Icons.refresh)),IconButton(tooltip:chatOutboxLabels['discard'],onPressed:()=>_queuedAction(row,true),icon:const Icon(Icons.close))]))).toList())),
      if(_attachment!=null)Row(children:[const Expanded(child:Text('संलग्न फाइल चयन गरियो (Attachment selected)')),TextButton(onPressed:()=>setState(()=>_attachment=null),child:const Text('हटाउनुहोस् (Clear attachment)'))]),
      if(_typing)const Text('Someone is typing…'),
      SafeArea(top:false,child:Padding(padding:const EdgeInsets.all(12),child:Row(crossAxisAlignment:CrossAxisAlignment.end,children:[IconButton(tooltip:'संलग्न फाइल (Attach file)',onPressed:_sending?null:_pickAttachment,icon:const Icon(Icons.attach_file)),Expanded(child:TextField(controller:_text,maxLength:4000,minLines:1,maxLines:4,decoration:const InputDecoration(labelText:'सन्देश (Your message)'),onChanged:(_){setState((){});final now=DateTime.now().millisecondsSinceEpoch;if(_live&&now-_lastTyping>1500){_lastTyping=now;_connection?.send({'type':'typing'});}})),IconButton(tooltip:'Send message',onPressed:_sending||(_text.text.trim().isEmpty&&_attachment==null)?null:_send,icon:const Icon(Icons.send))])),
      ),
    ]));
}

class _ChatGroupDialog extends StatefulWidget {
  final List branches;
  const _ChatGroupDialog({required this.branches});
  @override
  State<_ChatGroupDialog> createState()=>_ChatGroupDialogState();
}
class _ChatGroupDialogState extends State<_ChatGroupDialog> {
  final _name=TextEditingController();
  String? _branch;
  @override
  void dispose(){_name.dispose();super.dispose();}
  @override
  Widget build(BuildContext context)=>AlertDialog(
    title:const Text('शाखा समूह (Branch group)'),content:SingleChildScrollView(child:Column(mainAxisSize:MainAxisSize.min,children:[
      DropdownButtonFormField<String>(initialValue:_branch,decoration:const InputDecoration(labelText:'Branch'),items:widget.branches.map((b)=>DropdownMenuItem<String>(value:b['id'] as String,child:Text((b['nameNepali']??b['name_nepali']??b['code']).toString()))).toList(),onChanged:(value)=>setState(()=>_branch=value)),
      TextField(controller:_name,maxLength:150,onChanged:(_)=>setState((){}),decoration:const InputDecoration(labelText:'Group title')),
    ])),actions:[TextButton(onPressed:()=>Navigator.pop(context),child:const Text('Cancel')),FilledButton(onPressed:_branch==null||_name.text.trim().isEmpty?null:()=>Navigator.pop(context,{'type':'FAMILY_BRANCH','branchId':_branch,'title':_name.text.trim()}),child:const Text('Create'))]);
}
