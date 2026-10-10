import 'package:flutter/material.dart';
import '../models/person.dart';
import '../services/genealogy_api_service.dart';

class FollowManagerScreen extends StatefulWidget {
  final GenealogyApiService apiService;
  const FollowManagerScreen({super.key,required this.apiService});
  @override State<FollowManagerScreen> createState()=>_FollowManagerScreenState();
}
class _FollowManagerScreenState extends State<FollowManagerScreen> {
  final _search=TextEditingController();
  List<dynamic> _follows=[],_branches=[];
  List<PersonSummary> _people=[];
  String? _branch,_error;
  int _generation=3;
  String _group='PARENTS';
  bool _busy=false;
  @override void initState(){super.initState();_load();}
  @override void dispose(){_search.dispose();super.dispose();}
  Future<void> _load() async {
    try{
      final follow=await widget.apiService.requestJson('/notifications/follows') as List;
      final branches=await widget.apiService.requestJson('/genealogy/branches') as List;
      if(mounted){setState((){_follows=follow;_branches=branches;_error=null;});}
    }catch(e){if(mounted){setState(()=>_error=e.toString());}}
  }
  Future<void> _act(Future<void> Function() fn) async {
    setState((){_busy=true;_error=null;});
    try{await fn();await _load();}catch(e){if(mounted){setState(()=>_error=e.toString());}}
    finally{if(mounted){setState(()=>_busy=false);}}
  }
  Future<void> _add(Map<String,dynamic> body)=>_act(() async {
    await widget.apiService.requestJson('/notifications/follows',method:'POST',data:body);
  });
  @override Widget build(BuildContext context)=>Scaffold(appBar:AppBar(title:const Text('अनुसरण (Following)')),
    body:RefreshIndicator(onRefresh:_load,child:ListView(padding:const EdgeInsets.all(16),children:[
      if(_error!=null)Text(_error!,style:const TextStyle(color:Colors.red)),
      const Text('व्यक्ति, परिवार, शाखा वा पुस्ताको स्वीकृत परिवर्तनका सूचनाहरू लिनुहोस्।'),
      const SizedBox(height:12),
      TextField(controller:_search,decoration:const InputDecoration(labelText:'व्यक्ति खोज्नुहोस् (Find person)'),onSubmitted:(_)=>_act(() async {
        final people=await widget.apiService.searchPersons(query:_search.text);
        if(mounted){setState(()=>_people=people);}
      })),
      ElevatedButton(onPressed:_busy?null:()=>_act(() async {
        final people=await widget.apiService.searchPersons(query:_search.text);
        if(mounted){setState(()=>_people=people);}
      }),child:const Text('Search people')),
      ..._people.map((p)=>ListTile(title:Text(p.primaryNameNepali.isNotEmpty?p.primaryNameNepali:p.primaryNameEnglish??'Member'),
        trailing:const Icon(Icons.person_add),onTap:_busy?null:()=>_add({'targetType':'PERSON','personId':p.id}))),
      const Divider(),
      ListTile(title:const Text('नजिकको परिवार (Immediate family)'),trailing:const Icon(Icons.add),
        onTap:_busy?null:()=>_add({'targetType':'IMMEDIATE_FAMILY'})),
      DropdownButtonFormField<String>(initialValue:_group,decoration:const InputDecoration(labelText:'सम्बन्ध समूह (Relationship group)'),
        items:const ['PARENTS','CHILDREN','SPOUSES','SIBLINGS'].map((g)=>DropdownMenuItem(value:g,child:Text(g))).toList(),
        onChanged:(v)=>setState(()=>_group=v??_group)),
      TextButton(onPressed:_busy?null:()=>_add({'targetType':'RELATIONSHIP_GROUP','relationshipGroup':_group}),child:const Text('सम्बन्ध समूह अनुसरण (Follow group)')),
      const Divider(),
      DropdownButtonFormField<String>(initialValue:_branch,decoration:const InputDecoration(labelText:'शाखा (Branch)'),
        items:_branches.map((item){final b=item as Map;return DropdownMenuItem<String>(value:b['id'].toString(),child:Text(b['nameNepali']?.toString()??b['code'].toString()));}).toList(),
        onChanged:(v)=>setState(()=>_branch=v)),
      TextButton(onPressed:_busy||_branch==null?null:()=>_add({'targetType':'BRANCH','branchId':_branch}),child:const Text('शाखा अनुसरण (Follow branch)')),
      Row(children:[const Text('पुस्ता (Generation)'),const SizedBox(width:16),DropdownButton<int>(value:_generation,
        items:List.generate(100,(i)=>DropdownMenuItem(value:i+1,child:Text('${i+1}'))),onChanged:(v)=>setState(()=>_generation=v??_generation)),
        TextButton(onPressed:_busy||_branch==null?null:()=>_add({'targetType':'GENERATION','branchId':_branch,'generation':_generation}),child:const Text('Follow'))]),
      const Divider(),const Text('अनुसरण गरिएका (Following)',style:TextStyle(fontWeight:FontWeight.bold)),
      ..._follows.map((raw){final f=raw as Map;return ListTile(title:Text('${f['targetType']} · ${f['relationshipGroup']??f['branchId']??f['personId']??''}'),
        subtitle:f['generation']==null?null:Text('Generation ${f['generation']}'),
        trailing:IconButton(tooltip:'Unfollow',icon:const Icon(Icons.remove_circle_outline),onPressed:_busy?null:()=>_act(() async {
          await widget.apiService.requestJson('/notifications/follows/${f['id']}',method:'DELETE');
        })));}),
    ])));
}
