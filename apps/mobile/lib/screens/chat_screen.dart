import 'dart:async';
import 'dart:math';
import 'package:flutter/material.dart';
import '../services/genealogy_api_service.dart';
import '../services/chat_connection.dart';
import '../models/person.dart';

String _messageId() {
  final random = Random.secure();
  final bytes = List<int>.generate(16, (_) => random.nextInt(256));
  bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
  final hex = bytes.map((b) => b.toRadixString(16).padLeft(2, '0')).join();
  return '${hex.substring(0,8)}-${hex.substring(8,12)}-${hex.substring(12,16)}-${hex.substring(16,20)}-${hex.substring(20)}';
}

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
    appBar: AppBar(title: const Text('सन्देश (Messages)'), actions:[IconButton(tooltip:'Create branch group',onPressed:_busy?null:_group,icon:const Icon(Icons.group_add)),IconButton(tooltip:'Refresh',onPressed:_load,icon:const Icon(Icons.refresh))]),
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
  Timer? _reconnect;
  final _text=TextEditingController();
  List<dynamic> _messages=[];
  String? _error,_retryId,_retryContent;
  bool _live=false,_sending=false,_typing=false,_active=true;
  int _attempt=0,_epoch=0,_lastTyping=0;
  String get _path=>'/chat/conversations/${widget.conversation['id']}';
  @override
  void initState(){super.initState();WidgetsBinding.instance.addObserver(this);_connect();}
  Future<void> _stop() async {_epoch++;_reconnect?.cancel();await _subscription?.cancel();await _connection?.close();_connection=null;}
  @override
  void dispose(){_active=false;WidgetsBinding.instance.removeObserver(this);unawaited(_stop());_text.dispose();super.dispose();}
  @override
  void didChangeAppLifecycleState(AppLifecycleState state){
    _active=state==AppLifecycleState.resumed;
    if(_active){_connect();}else{unawaited(_stop());}
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
          if(rows.isNotEmpty){connection.send({'type':'read','sequence':rows.last['sequence']});}
        }
      },onDone:(){if(!mounted||epoch!=_epoch){return;}setState(()=>_live=false);if(connection.closeCode==4403){setState(()=>_error='Conversation access has ended.');}else{_retry();}},onError:(Object e){if(mounted&&epoch==_epoch){setState((){_live=false;_error='Connection interrupted. Reconnecting…';});_retry();}});
    }catch(e){if(mounted&&epoch==_epoch){setState(()=>_error=e.toString());_retry();}}
  }
  Future<void> _send() async {
    final content=_text.text.trim();if(content.isEmpty){return;}
    setState(()=>_sending=true);
    try{
      if(_retryContent!=content){_retryId=_messageId();_retryContent=content;}
      await widget.api.requestJson('$_path/messages',method:'POST',data:{'content':content,'clientMessageId':_retryId});
      if(mounted){_text.clear();setState(()=>_error=null);}_retryId=null;_retryContent=null;
    }catch(e){if(mounted){setState(()=>_error=e.toString());}}
    finally{if(mounted){setState(()=>_sending=false);}}
  }
  Future<void> _older()async{
    try{final rows=await widget.api.requestJson('$_path/messages?before=${_messages.first['sequence']}') as List;if(mounted){setState(()=>_messages=[...rows,..._messages]);}}
    catch(e){if(mounted){setState(()=>_error=e.toString());}}
  }
  Future<void> _action(String action)async{
    final confirmed=await showDialog<bool>(context:context,builder:(ctx)=>AlertDialog(title:Text('$action conversation?'),actions:[TextButton(onPressed:()=>Navigator.pop(ctx,false),child:const Text('Cancel')),FilledButton(onPressed:()=>Navigator.pop(ctx,true),child:Text(action))]));
    if(confirmed!=true){return;}
    try{await widget.api.requestJson('$_path/${action.toLowerCase()}',method:'POST');if(mounted){Navigator.pop(context);}}
    catch(e){if(mounted){setState(()=>_error=e.toString());}}
  }
  @override
  Widget build(BuildContext context)=>Scaffold(appBar:AppBar(title:Text(widget.conversation['title'] as String),actions:[PopupMenuButton<String>(onSelected:_action,itemBuilder:(_)=>[const PopupMenuItem(value:'Leave',child:Text('Leave conversation')),if(widget.conversation['type']=='DIRECT')const PopupMenuItem(value:'Block',child:Text('Block messages'))])]),
    body:Column(children:[
      Text(_live?'Live':'Connecting…'),if(_error!=null)Text(_error!,style:const TextStyle(color:Colors.red)),
      Expanded(child:ListView(padding:const EdgeInsets.all(16),children:[
        if(_messages.length>=100)TextButton(onPressed:_older,child:const Text('Load earlier messages')),
        ..._messages.map((m){final own=m['senderUserId']==widget.userId;return Card(color:own?Colors.amber.shade50:null,child:ListTile(title:Text(m['isDeleted']==true?'Message removed':m['content'] as String),subtitle:Text('${own?'You':'Member'} · ${own&&(m['readByUserIds'] as List).any((id)=>id!=widget.userId)?'Read':'Sent'}'),trailing:own&&m['isDeleted']!=true?IconButton(tooltip:'Remove message',icon:const Icon(Icons.delete_outline),onPressed:()async{try{await widget.api.requestJson('$_path/messages/${m['id']}',method:'DELETE');}catch(e){if(mounted){setState(()=>_error=e.toString());}}}):null));}),
      ])),
      if(_typing)const Text('Someone is typing…'),
      SafeArea(top:false,child:Padding(padding:const EdgeInsets.all(12),child:Row(crossAxisAlignment:CrossAxisAlignment.end,children:[Expanded(child:TextField(controller:_text,maxLength:4000,minLines:1,maxLines:4,decoration:const InputDecoration(labelText:'सन्देश (Your message)'),onChanged:(_){setState((){});final now=DateTime.now().millisecondsSinceEpoch;if(_live&&now-_lastTyping>1500){_lastTyping=now;_connection?.send({'type':'typing'});}})),IconButton(tooltip:'Send message',onPressed:_sending||_text.text.trim().isEmpty?null:_send,icon:const Icon(Icons.send))])),
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
