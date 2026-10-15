import 'package:flutter/material.dart';
import '../localization/policy_labels.dart';
import '../services/genealogy_api_service.dart';

class PolicyAcknowledgementsScreen extends StatefulWidget {
 final GenealogyApiService api;
 const PolicyAcknowledgementsScreen({super.key,required this.api});
 @override
 State<PolicyAcknowledgementsScreen> createState()=>_PolicyAcknowledgementsScreenState();
}
class _PolicyAcknowledgementsScreenState extends State<PolicyAcknowledgementsScreen>{
 List<dynamic> _documents=[];
 final Set<String> _checked={};
 String? _error;
 bool _busy=false,_expired=false;
 int _epoch=0;
 late final int _generation;
 late final GenealogyApiService _api;
 bool get _current=>mounted&&!_expired&&identical(widget.api,_api)&&widget.api.authToken!=null&&widget.api.pushSessionGeneration==_generation;
 @override
 void initState(){super.initState();_api=widget.api;_generation=widget.api.pushSessionGeneration;widget.api.sessionChanges.addListener(_changed);_load();}
 void _changed(){if(!_current&&mounted){setState((){_expired=true;_epoch++;_documents=[];_checked.clear();_busy=false;_error=policyLabels['sessionChanged']!;});}}
 @override
 void didUpdateWidget(covariant PolicyAcknowledgementsScreen oldWidget){super.didUpdateWidget(oldWidget);_changed();}
 @override
 void dispose(){_api.sessionChanges.removeListener(_changed);_epoch++;super.dispose();}
 Future<void> _load()async{
  if(!_current){return;}
  final epoch=++_epoch;setState((){_busy=true;_error=null;_documents=[];_checked.clear();});
  try{final result=await widget.api.requestJson('/me/policies') as Map;
   if(_current&&epoch==_epoch){setState(()=>_documents=result['documents'] as List);}
  }catch(_){if(_current&&epoch==_epoch){setState(()=>_error=policyLabels['unavailable']!);}}
  finally{if(_current&&epoch==_epoch){setState(()=>_busy=false);}}
 }
 Future<void> _accept(Map d)async{
  if(!_current||_busy||!_checked.contains(d['id'])||d['acceptedAt']!=null){return;}
  final epoch=++_epoch;setState((){_busy=true;_error=null;});
  try{await widget.api.requestJson('/me/policies/acknowledgements',method:'POST',data:{'documentId':d['id'],'contentHash':d['contentHash'],'accepted':true});
   if(_current&&epoch==_epoch){await _load();}
  }catch(_){if(_current&&epoch==_epoch){setState(()=>_error=policyLabels['unconfirmed']!);}}
  finally{if(_current&&epoch==_epoch){setState(()=>_busy=false);}}
 }
 @override
 Widget build(BuildContext context)=>Scaffold(appBar:AppBar(title:Text(policyLabels['title']!)),body:ListView(padding:const EdgeInsets.all(16),children:[
  if(_error!=null)Semantics(liveRegion:true,child:Text(_error!)),
  if(_busy)const Center(child:CircularProgressIndicator()),
  ElevatedButton(onPressed:!_current||_busy?null:_load,child:Text(policyLabels['reload']!)),
  if(_current&&!_busy&&_error==null&&_documents.isEmpty)Text(policyLabels['noApprovedPolicy']!),
  for(final d in _documents)Card(child:Padding(padding:const EdgeInsets.all(16),child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
   Text('${d['titleNe']} / ${d['titleEn']} · ${d['version']}'),Text(d['bodyNe'] as String),Text(d['bodyEn'] as String),
   if(d['acceptedAt']!=null)Text("${policyLabels['acknowledged']}: ${d['acceptedAt']}")else ...[
    CheckboxListTile(value:_checked.contains(d['id']),onChanged:!_current||_busy?null:(value){if(!_current||_busy){return;}setState((){if(value==true){_checked.add(d['id'] as String);}else{_checked.remove(d['id']);}});},title:Text(policyLabels['select']!)),
    ElevatedButton(onPressed:!_current||_busy||!_checked.contains(d['id'])?null:()=>_accept(d as Map),child:Text(policyLabels['confirm']!)),
   ],
  ]))),
 ]));
}
