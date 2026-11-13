import 'package:flutter/material.dart';
import '../services/genealogy_api_service.dart';
import '../models/person.dart';
import '../localization/chat_group_labels.dart';

String _name(PersonSummary p) => p.primaryNameNepali.isNotEmpty ? p.primaryNameNepali : p.primaryNameEnglish ?? 'Member';

class PrivateChatGroupDialog extends StatefulWidget {
  final GenealogyApiService api;
  const PrivateChatGroupDialog({super.key, required this.api});
  @override
  State<PrivateChatGroupDialog> createState() => _PrivateChatGroupDialogState();
}
class _PrivateChatGroupDialogState extends State<PrivateChatGroupDialog> {
  final _title=TextEditingController(), _description=TextEditingController(), _query=TextEditingController();
  List<PersonSummary> _people=[];
  final Map<String,PersonSummary> _selected={};
  bool _busy=false;
  String? _error;
  @override
  void dispose(){_title.dispose();_description.dispose();_query.dispose();super.dispose();}
  Future<void> _search() async {
    setState((){_busy=true;_error=null;});
    try{final people=await widget.api.searchPersons(query:_query.text);if(mounted){setState(()=>_people=people);}}
    catch(e){if(mounted){setState(()=>_error=e.toString());}}
    finally{if(mounted){setState(()=>_busy=false);}}
  }
  @override
  Widget build(BuildContext context)=>AlertDialog(title:Text(chatGroupLabels['create']!),
    content:SingleChildScrollView(child:Column(mainAxisSize:MainAxisSize.min,children:[
      if(_error!=null)Text(_error!),
      TextField(controller:_title,maxLength:150,decoration:InputDecoration(labelText:chatGroupLabels['title']),onChanged:(_)=>setState((){})),
      TextField(controller:_description,maxLength:1000,decoration:InputDecoration(labelText:chatGroupLabels['description'])),
      TextField(controller:_query,decoration:InputDecoration(labelText:chatGroupLabels['search']),onChanged:(_)=>setState((){})),
      TextButton(onPressed:_busy||_query.text.trim().length<2?null:_search,child:Text(chatGroupLabels['search']!)),
      ..._people.map((p)=>CheckboxListTile(title:Text(_name(p)),value:_selected.containsKey(p.id),
        onChanged:_busy||_selected.length>=49&&!_selected.containsKey(p.id)?null:(checked)=>setState((){if(checked==true){_selected[p.id]=p;}else{_selected.remove(p.id);}}))),
      Text('${chatGroupLabels['selected']}: ${_selected.length}/49'),Text(chatGroupLabels['historyNote']!),
    ])),actions:[TextButton(onPressed:()=>Navigator.pop(context),child:Text(chatGroupLabels['close']!)),
      FilledButton(onPressed:_busy||_title.text.trim().isEmpty||_selected.isEmpty?null:()=>Navigator.pop(context,{
        'type':'GROUP','title':_title.text.trim(),'description':_description.text.trim(),'memberPersonIds':_selected.keys.toList(),
      }),child:Text(chatGroupLabels['create']!))]);
}

class ChatGroupManagementScreen extends StatefulWidget {
  final GenealogyApiService api;
  final String conversationId;
  const ChatGroupManagementScreen({super.key,required this.api,required this.conversationId});
  @override
  State<ChatGroupManagementScreen> createState()=>_ChatGroupManagementState();
}
class _ChatGroupManagementState extends State<ChatGroupManagementScreen> {
  final _title=TextEditingController(),_description=TextEditingController(),_query=TextEditingController();
  Map<String,dynamic>? _info;
  List<PersonSummary> _people=[];
  bool _busy=false;
  String? _error;
  String get _path=>'/chat/conversations/${widget.conversationId}';
  @override
  void initState(){super.initState();_reload();}
  @override
  void dispose(){_title.dispose();_description.dispose();_query.dispose();super.dispose();}
  Future<void> _reload()async{
    try{final info=await widget.api.requestJson(_path) as Map<String,dynamic>;if(mounted){setState((){_info=info;_title.text=info['title'];_description.text=info['description']??'';});}}
    catch(e){if(mounted){setState((){_info=null;_error=e.toString();});}}
  }
  Future<void> _change(String path,String method,Map<String,dynamic> data,{String? confirm})async{
    if(_busy||_info==null){return;}
    if(confirm!=null){final accepted=await showDialog<bool>(context:context,builder:(ctx)=>AlertDialog(title:Text(confirm),actions:[
      TextButton(onPressed:()=>Navigator.pop(ctx,false),child:Text(chatGroupLabels['close']!)),
      FilledButton(onPressed:()=>Navigator.pop(ctx,true),child:Text(chatGroupLabels['confirm']!))]));if(accepted!=true||!mounted){return;}}
    setState((){_busy=true;_error=null;});
    try{await widget.api.requestJson('$_path$path',method:method,data:{...data,'version':_info!['version']});}
    catch(e){if(mounted){setState(()=>_error=e.toString());}}
    await _reload();if(mounted){setState(()=>_busy=false);}
  }
  Future<void> _search()async{
    setState((){_busy=true;_error=null;});
    try{final people=await widget.api.searchPersons(query:_query.text);if(mounted){setState(()=>_people=people);}}
    catch(e){if(mounted){setState(()=>_error=e.toString());}}
    finally{if(mounted){setState(()=>_busy=false);}}
  }
  @override
  Widget build(BuildContext context)=>Scaffold(appBar:AppBar(title:Text(chatGroupLabels['info']!),actions:[IconButton(tooltip:'Refresh group',onPressed:_busy?null:_reload,icon:const Icon(Icons.refresh))]),
    body:ListView(padding:const EdgeInsets.all(16),children:[if(_error!=null)Text(_error!,style:const TextStyle(color:Colors.red)),
      if(_info!=null)...[
        Text('${_info!['title']} · ${_info!['myRole']} · ${_info!['memberCount']}'),Text(_info!['description']??''),
        if(_info!['canManage']==true)...[
          TextField(controller:_title,maxLength:150,decoration:InputDecoration(labelText:chatGroupLabels['title'])),
          TextField(controller:_description,maxLength:1000,decoration:InputDecoration(labelText:chatGroupLabels['description'])),
          FilledButton(onPressed:_busy?null:()=>_change('','PATCH',{'title':_title.text.trim(),'description':_description.text.trim()}),child:Text(chatGroupLabels['save']!)),
          TextField(controller:_query,decoration:InputDecoration(labelText:chatGroupLabels['search']),onChanged:(_)=>setState((){})),
          TextButton(onPressed:_busy||_query.text.trim().length<2?null:_search,child:Text(chatGroupLabels['search']!)),
          ..._people.map((p)=>TextButton(onPressed:_busy?null:()=>_change('/members','POST',{'personId':p.id}),child:Text('${chatGroupLabels['add']}: ${_name(p)}'))),
        ],
        ...(_info!['members'] as List).map((m)=>Card(child:Padding(padding:const EdgeInsets.all(8),child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
          Text('${m['name']} · ${m['role']}'),Wrap(spacing:8,children:[
            if(_info!['isOwner']==true&&m['role']!='OWNER')...[
              TextButton(onPressed:_busy?null:()=>_change('/members/${m['userId']}','PATCH',{'role':m['role']=='ADMIN'?'MEMBER':'ADMIN'}),child:Text(chatGroupLabels[m['role']=='ADMIN'?'demote':'promote']!)),
              TextButton(onPressed:_busy?null:()=>_change('/owner','POST',{'userId':m['userId']},confirm:chatGroupLabels['transfer']),child:Text(chatGroupLabels['transfer']!)),
            ],
            if(_info!['canManage']==true&&m['role']!='OWNER'&&(_info!['isOwner']==true||m['role']=='MEMBER'))
              TextButton(onPressed:_busy?null:()=>_change('/members/${m['userId']}','DELETE',{},confirm:chatGroupLabels['remove']),child:Text(chatGroupLabels['remove']!)),
          ]),
        ])))),Text(chatGroupLabels['historyNote']!),Text(chatGroupLabels['transferNote']!),
      ],
    ]));
}
