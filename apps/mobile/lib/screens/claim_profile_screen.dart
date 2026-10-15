import 'package:flutter/material.dart';
import 'dart:math';
import 'package:flutter/services.dart';
import '../services/genealogy_api_service.dart';
import '../localization/claim_labels.dart';

class ClaimProfileScreen extends StatefulWidget {
 final String personId,personName;
 final GenealogyApiService apiService;
 const ClaimProfileScreen({super.key,required this.personId,required this.personName,required this.apiService});
 @override
 State<ClaimProfileScreen> createState()=>_ClaimProfileScreenState();
}
class _ClaimProfileScreenState extends State<ClaimProfileScreen>{
 static const channel=MethodChannel('kashyap/chat_attachments');
 final description=TextEditingController();
 final List<Map<String,dynamic>> attachments=[];
 late final GenealogyApiService _api;
 late final int _generation;
 bool truth=false,notice=false,busy=false,success=false,expired=false;
 String type='family_photo';String? message;Map<String,dynamic>? pending;
 bool get current=>mounted&&!expired&&identical(widget.apiService,_api)&&_api.authToken!=null&&_api.pushSessionGeneration==_generation;
 @override
 void initState(){super.initState();_api=widget.apiService;_generation=_api.pushSessionGeneration;_api.sessionChanges.addListener(changed);}
 void changed(){if(!current&&mounted){setState((){expired=true;description.clear();attachments.clear();pending=null;truth=false;notice=false;busy=false;message=claimLabels['session'];});}}
 @override
 void didUpdateWidget(covariant ClaimProfileScreen oldWidget){super.didUpdateWidget(oldWidget);if(oldWidget.personId!=widget.personId){expired=true;}changed();}
 @override
 void dispose(){_api.sessionChanges.removeListener(changed);description.dispose();attachments.clear();pending=null;super.dispose();}
 Future<void> choose()async{
  if(!current||busy||pending!=null||attachments.length>=5||!notice){return;}
  setState((){busy=true;message=null;});
  final selectedType=type;
  try{
   final file=await channel.invokeMapMethod<String,dynamic>('pickProfile');
   if(!current||file==null){return;}
   if(!['image/jpeg','image/png','image/webp'].contains(file['mimeType'])||file['dataBase64'] is! String||(file['dataBase64'] as String).length>13981016){throw const FormatException('Invalid evidence image');}
   final result=await _api.requestJson('/me/claim-evidence',method:'POST',data:{'mimeType':file['mimeType'],'dataBase64':file['dataBase64'],'documentType':selectedType,'evidenceNoticeAccepted':true}) as Map;
   if(current){setState(()=>attachments.add({'mediaAssetId':result['mediaAssetId'],'documentType':result['documentType']}));}
  }catch(_){if(current){setState(()=>message=claimLabels['uploadFailed']);}}
  finally{if(current){setState(()=>busy=false);}}
 }
 String newKey(){final random=Random.secure();final bytes=List<int>.generate(16,(_)=>random.nextInt(256));bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;final hex=bytes.map((b)=>b.toRadixString(16).padLeft(2,'0')).join();return '${hex.substring(0,8)}-${hex.substring(8,12)}-${hex.substring(12,16)}-${hex.substring(16,20)}-${hex.substring(20)}';}
 Future<void> submit()async{
  if(!current||busy||success){return;}
  if(pending==null&&(!truth||description.text.trim().isEmpty||description.text.trim().length>2000)){setState(()=>message=claimLabels['required']);return;}
  pending??={'creationKey':newKey(),'targetPersonId':widget.personId,'relationshipDescription':description.text.trim(),'statementOfTruth':true,'evidenceAttachments':attachments.map((e)=>Map<String,dynamic>.from(e)).toList()};
  setState((){busy=true;message=null;});
  try{
   final registered=await _api.requestJson('/claims',method:'POST',data:pending) as Map;
   if(current){setState((){success=true;message='${claimLabels['submitted']} · ${registered['status']??''}';});}
  }catch(_){if(current){setState((){message=claimLabels['unconfirmed'];});}}
  finally{if(current){setState(()=>busy=false);}}
 }
 @override
 Widget build(BuildContext context){
  final editable=current&&!busy&&!success&&pending==null;
  return Scaffold(appBar:AppBar(title:Text(claimLabels['title']!)),body:expired?Center(child:Text(claimLabels['session']!)):ListView(padding:const EdgeInsets.all(16),children:[
   Text(widget.personName),
   if(message!=null)Semantics(liveRegion:true,child:Text(message!)),
   TextField(key:const ValueKey('claim-description'),controller:description,enabled:editable,maxLines:3,maxLength:2000,decoration:InputDecoration(labelText:claimLabels['description'])),
   CheckboxListTile(value:truth,onChanged:editable?(value){if(current){setState(()=>truth=value??false);}}:null,title:Text(claimLabels['truth']!)),
   Text(claimLabels['notice']!),
   CheckboxListTile(key:const ValueKey('claim-evidence-notice'),value:notice,onChanged:editable?(value){if(current){setState(()=>notice=value??false);}}:null,title:Text(claimLabels['noticeCheck']!)),
   DropdownButtonFormField<String>(initialValue:type,decoration:const InputDecoration(labelText:'प्रमाण प्रकार (Evidence category)'),items:const [DropdownMenuItem(value:'family_photo',child:Text('पारिवारिक फोटो (Family photo)')),DropdownMenuItem(value:'event_invitation',child:Text('कार्यक्रम निमन्त्रणा (Event invitation)')),DropdownMenuItem(value:'clan_record',child:Text('पारिवारिक अभिलेख (Family record)'))],onChanged:editable?(value){if(current&&value!=null){setState(()=>type=value);}}:null),
   OutlinedButton(onPressed:editable&&notice&&attachments.length<5?choose:null,child:Text(claimLabels['upload']!)),
   for(final a in attachments)ListTile(title:Text(a['documentType'] as String),trailing:IconButton(tooltip:claimLabels['remove'],icon:const Icon(Icons.remove_circle_outline),onPressed:editable?(){if(current){setState(()=>attachments.remove(a));}}:null)),
   if(busy)const Center(child:CircularProgressIndicator()),
   ElevatedButton(onPressed:!current||busy||success?null:submit,child:Text(claimLabels[pending==null?'submit':'retry']!)),
  ]));
 }
}
