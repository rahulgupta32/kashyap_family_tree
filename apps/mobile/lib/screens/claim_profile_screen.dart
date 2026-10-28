import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../services/genealogy_api_service.dart';
import '../localization/claim_labels.dart';
import 'claim_status_screen.dart';

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
 String type='family_photo';String? message;String? submittedClaimId;
 bool get current=>mounted&&!expired&&identical(widget.apiService,_api)&&_api.authToken!=null&&_api.pushSessionGeneration==_generation;
 @override
 void initState(){super.initState();_api=widget.apiService;_generation=_api.pushSessionGeneration;_api.sessionChanges.addListener(changed);}
 void changed(){if(!current&&mounted){setState((){expired=true;description.clear();attachments.clear();submittedClaimId=null;truth=false;notice=false;busy=false;message=claimLabels['session'];});}}
 @override
 void didUpdateWidget(covariant ClaimProfileScreen oldWidget){super.didUpdateWidget(oldWidget);if(oldWidget.personId!=widget.personId){expired=true;}changed();}
 @override
 void dispose(){_api.sessionChanges.removeListener(changed);description.dispose();attachments.clear();super.dispose();}
 Future<void> choose()async{
  if(!current||busy||_api.hasPendingProfileClaim||attachments.length>=5||!notice){return;}
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
 Future<void> submit()async{
  if(!current||busy||success){return;}
  if(!_api.hasPendingProfileClaim&&(!truth||description.text.trim().isEmpty||description.text.trim().length>2000)){setState(()=>message=claimLabels['required']);return;}
  setState((){busy=true;message=null;});
  try{
   if(_api.hasPendingProfileClaim&&_api.pendingProfileClaimTargetId!=widget.personId){
    throw StateError('Resolve original pending claim first');
   }
   final registered=_api.hasPendingProfileClaim?await _api.retryPendingProfileClaim():await _api.createProfileClaim({
    'targetPersonId':widget.personId,'relationshipDescription':description.text.trim(),
    'statementOfTruth':true,'evidenceAttachments':attachments.map((e)=>Map<String,dynamic>.from(e)).toList(),
   });
   if(current){setState((){success=true;submittedClaimId=registered['id'] is String && (registered['id'] as String).isNotEmpty ? registered['id'] as String : null;message='${claimLabels['submitted']} · ${registered['status']??''}';});}
  }catch(_){if(current){setState((){message=claimLabels['unconfirmed'];});}}
  finally{if(current){setState(()=>busy=false);}}
 }
 @override
 Widget build(BuildContext context){
  final editable=current&&!busy&&!success&&!_api.hasPendingProfileClaim;
  return Scaffold(appBar:AppBar(title:Text(claimLabels['title']!)),body:expired?Center(child:Text(claimLabels['session']!)):ListView(padding:const EdgeInsets.all(16),children:[
   Text(widget.personName),
   if(_api.hasPendingProfileClaim&&_api.pendingProfileClaimTargetId!=widget.personId)Text(claimLabels['otherPending']!),
   if(message!=null)Semantics(liveRegion:true,child:Text(message!)),
   TextField(key:const ValueKey('claim-description'),controller:description,enabled:editable,maxLines:3,maxLength:2000,decoration:InputDecoration(labelText:claimLabels['description'])),
   CheckboxListTile(value:truth,onChanged:editable?(value){if(current){setState(()=>truth=value??false);}}:null,title:Text(claimLabels['truth']!)),
   Text(claimLabels['notice']!),
   CheckboxListTile(key:const ValueKey('claim-evidence-notice'),value:notice,onChanged:editable?(value){if(current){setState(()=>notice=value??false);}}:null,title:Text(claimLabels['noticeCheck']!)),
   DropdownButtonFormField<String>(initialValue:type,decoration:const InputDecoration(labelText:'प्रमाण प्रकार (Evidence category)'),items:const [DropdownMenuItem(value:'family_photo',child:Text('पारिवारिक फोटो (Family photo)')),DropdownMenuItem(value:'event_invitation',child:Text('कार्यक्रम निमन्त्रणा (Event invitation)')),DropdownMenuItem(value:'clan_record',child:Text('पारिवारिक अभिलेख (Family record)'))],onChanged:editable?(value){if(current&&value!=null){setState(()=>type=value);}}:null),
   OutlinedButton(onPressed:editable&&notice&&attachments.length<5?choose:null,child:Text(claimLabels['upload']!)),
   for(final a in attachments)ListTile(title:Text(a['documentType'] as String),trailing:IconButton(tooltip:claimLabels['remove'],icon:const Icon(Icons.remove_circle_outline),onPressed:editable?(){if(current){setState(()=>attachments.remove(a));}}:null)),
   if(success&&submittedClaimId!=null)OutlinedButton(onPressed:current?(){
    if(current){Navigator.of(context).push(MaterialPageRoute(builder:(_)=>ClaimStatusScreen(claimId:submittedClaimId!,api:_api)));}
   }:null,child:Text(claimLabels['check']!)),
   if(busy)const Center(child:CircularProgressIndicator()),
   ElevatedButton(onPressed:!current||busy||success||(_api.hasPendingProfileClaim&&_api.pendingProfileClaimTargetId!=widget.personId)?null:submit,child:Text(claimLabels[!_api.hasPendingProfileClaim?'submit':'retry']!)),
  ]));
 }
}
