import 'package:flutter/material.dart';
import '../services/genealogy_api_service.dart';
import 'chat_screen.dart';
import 'calendar_events_screen.dart';
import 'person_search_screen.dart';

class NotificationInboxScreen extends StatefulWidget {
  final GenealogyApiService apiService;
  const NotificationInboxScreen({super.key, required this.apiService});
  @override
  State<NotificationInboxScreen> createState() => _NotificationInboxScreenState();
}

class _NotificationInboxScreenState extends State<NotificationInboxScreen> {
  List<dynamic> _items=[];
  String? _cursor,_error;
  Map<String,dynamic>? _preferences;
  bool _loading=true,_busy=false;

  @override
  void initState(){super.initState();_load();}
  Future<void> _load({bool older=false}) async {
    if(older && _cursor==null)return;
    setState((){_loading=true;_error=null;});
    try {
      final page=await widget.apiService.requestJson('/notifications${older?'?cursor=${Uri.encodeQueryComponent(_cursor!)}':''}') as Map<String,dynamic>;
      final prefs=older?_preferences:await widget.apiService.requestJson('/notifications/preferences') as Map<String,dynamic>;
      if(mounted){setState((){_items=older?[..._items,...(page['items'] as List)]:page['items'] as List;
        _cursor=page['nextCursor'] as String?;_preferences=prefs;});}
    } catch(e){if(mounted)setState(()=>_error=e.toString());}
    finally{if(mounted)setState(()=>_loading=false);}
  }

  Future<void> _open(Map notice) async {
    setState((){_busy=true;_error=null;});
    try {
      await widget.apiService.requestJson('/notifications/${notice['id']}/read',method:'POST');
      if(!mounted)return;
      final target=notice['destination'];
      if(target=='/chat'){await Navigator.push(context,MaterialPageRoute(builder:(_)=>ChatScreen(apiService:widget.apiService)));}
      else if(target=='/calendar'){await Navigator.push(context,MaterialPageRoute(builder:(_)=>CalendarEventsScreen(apiService:widget.apiService)));}
      else if(target=='/claims'||target=='/change-requests'){
        // Notifications intentionally omit private person IDs. Let the member
        // select an authorized person before opening a governed workflow.
        await Navigator.push(context,MaterialPageRoute(builder:(_)=>PersonSearchScreen(apiService:widget.apiService)));
      }
      await _load();
    } catch(e){if(mounted)setState(()=>_error=e.toString());}
    finally{if(mounted)setState(()=>_busy=false);}
  }

  Future<void> _preference(String key,bool value) async {
    setState(()=>_busy=true);
    try {final prefs=await widget.apiService.requestJson('/notifications/preferences',method:'PATCH',data:{key:value});
      if(mounted)setState(()=>_preferences=prefs as Map<String,dynamic>);}
    catch(e){if(mounted)setState(()=>_error=e.toString());}
    finally{if(mounted)setState(()=>_busy=false);}
  }

  @override
  Widget build(BuildContext context)=>Scaffold(appBar:AppBar(title:const Text('सूचनाहरू (Notifications)'),actions:[
      IconButton(tooltip:'Refresh notifications',onPressed:_busy?null:()=>_load(),icon:const Icon(Icons.refresh)),
    ]),body:RefreshIndicator(onRefresh:_load,child:ListView(padding:const EdgeInsets.all(16),children:[
      if(_error!=null)Text(_error!,style:const TextStyle(color:Colors.red)),
      if(_preferences!=null)ExpansionTile(title:const Text('सूचना प्राथमिकताहरू (Preferences)'),children:[
        for(final item in const <(String,String)>[
          ('inAppEnabled','इन एप सूचना (In app)'),('workflowEnabled','दाबी र संशोधन (Workflows)'),
          ('chatEnabled','सन्देश (Messages)'),('familyEventsEnabled','कार्यक्रम (Events)')])
          SwitchListTile(title:Text(item.$2),value:_preferences![item.$1]==true,
            onChanged:_busy?null:(v)=>_preference(item.$1,v)),
      ]),
      TextButton(onPressed:_busy?null:() async {try{await widget.apiService.requestJson('/notifications/read-all',method:'POST');await _load();}
        catch(e){if(mounted)setState(()=>_error=e.toString());}},child:const Text('सबै पढियो (Mark all read)')),
      if(_items.isEmpty&&!_loading)const Text('अहिलेसम्म सूचना छैन। (No notifications yet.)'),
      ..._items.map((raw){final n=raw as Map;return Card(child:ListTile(
        leading:Icon(n['readAt']==null?Icons.notifications_active:Icons.notifications_none),
        title:Text(n['message']?.toString()??''),subtitle:Text(n['createdAt']?.toString()??''),
        trailing:n['readAt']!=null?IconButton(tooltip:'Mark unread',icon:const Icon(Icons.mark_email_unread),onPressed:_busy?null:() async {
          try {await widget.apiService.requestJson('/notifications/${n['id']}/unread',method:'POST');await _load();}
          catch(e){if(mounted){setState(()=>_error=e.toString());}}
        }):null,
        onTap:_busy?null:()=>_open(n),));}),
      if(_cursor!=null)TextButton(onPressed:_loading||_busy?null:()=>_load(older:true),child:const Text('पुराना सूचनाहरू (Load older)')),
      if(_loading)const Center(child:CircularProgressIndicator()),
    ])));
}
