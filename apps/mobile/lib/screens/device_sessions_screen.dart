import 'package:flutter/material.dart';
import '../services/genealogy_api_service.dart';

class DeviceSessionsScreen extends StatefulWidget {
  final GenealogyApiService apiService;
  const DeviceSessionsScreen({super.key, required this.apiService});
  @override
  State<DeviceSessionsScreen> createState() => _DeviceSessionsScreenState();
}
class _DeviceSessionsScreenState extends State<DeviceSessionsScreen> {
  List<Map<String,dynamic>> _items=[];
  String? _next, _error;
  bool _busy=false;
  int _epoch=0;
  String? _owner;
  @override
  void initState(){super.initState();_owner=widget.apiService.chatAccountId;_load();}
  bool _current(int epoch)=>mounted&&epoch==_epoch&&_owner!=null&&_owner==widget.apiService.chatAccountId;
  @override
  void dispose(){_epoch++;_items=[];super.dispose();}
  Future<void> _load([String? cursor]) async {
    final epoch=++_epoch;
    setState((){_items=[];_next=null;_error=null;_busy=true;});
    try {
      if(_owner==null||_owner!=widget.apiService.chatAccountId){throw const FormatException('Account changed');}
      final data=await widget.apiService.requestJson('/auth/sessions${cursor==null?'':'?cursor=${Uri.encodeComponent(cursor)}'}',boundAccountId:_owner);
      if(data is! Map||data['items'] is! List){throw const FormatException('Invalid devices');}
      final items=List<Map<String,dynamic>>.from((data['items'] as List).map((item)=>Map<String,dynamic>.from(item as Map)));
      if(_current(epoch)){setState((){_items=items;_next=data['nextCursor'] as String?;});}
    } catch(_){if(mounted&&epoch==_epoch){setState((){_items=[];_error='उपकरण सूची अनुपलब्ध छ। (Device list unavailable. Refresh to retry.)';});}}
    finally{if(mounted&&epoch==_epoch){setState((){_busy=false;if(_owner!=widget.apiService.chatAccountId){_items=[];_next=null;}});}}
  }
  Future<void> _revoke(String id) async {
    final confirmed=await showDialog<bool>(context:context,builder:(context)=>AlertDialog(
      title:const Text('साइन आउट गर्ने? (Sign out device?)'),
      content:const Text('यो अर्को उपकरणलाई फेरि साइन इन गर्नुपर्नेछ। (The selected other device will need to sign in again.)'),
      actions:[TextButton(onPressed:()=>Navigator.pop(context,false),child:const Text('रद्द (Cancel)')),
        TextButton(onPressed:()=>Navigator.pop(context,true),child:const Text('पुष्टि (Confirm sign out)'))]));
    if(!mounted||confirmed!=true||_busy){return;}
    final epoch=++_epoch;setState((){_busy=true;_error=null;});
    try {
      if(!_current(epoch)){throw const FormatException('Account changed');}
      await widget.apiService.requestJson('/auth/sessions/$id/revoke',method:'POST',boundAccountId:_owner);
      if(_current(epoch)){await _load();}
    } catch(_){if(mounted&&epoch==_epoch){setState((){_items=[];_next=null;_error='कार्य पुष्टि भएन। सूची ताजा गर्नुहोस्। (Action unconfirmed. Refresh the list before retrying.)';});}}
    finally{if(mounted&&epoch==_epoch){setState((){_busy=false;if(_owner!=widget.apiService.chatAccountId){_items=[];_next=null;}});}}
  }
  @override
  Widget build(BuildContext context)=>Scaffold(appBar:AppBar(title:const Text('मेरा उपकरणहरू (My devices)')),
    body:ListView(padding:const EdgeInsets.all(16),children:[
      const Text('उपकरणका नाम ग्राहकले दिएको विवरण हुन्। (Recorded device labels do not prove device identity.)'),
      if(_error!=null)Semantics(liveRegion:true,child:Text(_error!)),
      if(_busy)const Center(child:CircularProgressIndicator()),
      ElevatedButton(onPressed:_busy?null:()=>_load(),child:const Text('सूची ताजा गर्नुहोस् (Refresh devices)')),
      for(final item in _items)Card(child:Padding(padding:const EdgeInsets.all(12),child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
        Text('${item['platform']} — ${item['label']??'Device'}'),Text('सुरु (Created): ${item['createdAt']}'),Text('म्याद (Expires): ${item['expiresAt']}'),
        if(item['isCurrent']==true)const Text('यो उपकरण (This device)')
        else ElevatedButton(onPressed:_busy?null:()=>_revoke(item['id'] as String),child:const Text('साइन आउट गर्नुहोस् (Sign out device)')),
      ]))),
      if(_next!=null)TextButton(onPressed:_busy?null:()=>_load(_next),child:const Text('अर्को पृष्ठ (Next devices)')),
    ]));
}
