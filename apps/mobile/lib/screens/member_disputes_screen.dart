import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../services/genealogy_api_service.dart';
import '../localization/claim_labels.dart';

const disputeLabels = {
  'title':'मेरा विवाद (My disputes)',
  'reason':'विवादको कारण (Dispute reason)',
  'confirm':'स्वतन्त्र समीक्षा चाहन्छु; यसले खाता स्वतः सार्दैन। (Request independent review; no automatic account transfer.)',
  'submit':'विवाद पेश गर्नुहोस् (Submit dispute)',
  'retry':'मूल विवाद पुनः प्रयास (Retry original dispute)',
  'resolve':'मूल अनुरोध समाधान (Resolve original submission)',
  'closeConfirm':'पहिले दर्ता भएको विवाद पुनः प्राप्त गर्नुहोस्; नभए मूल अनुरोध स्थायी बन्द गर्नुहोस्। कुनै दर्ता भएको विवाद फिर्ता हुँदैन। (Recover a recorded dispute; otherwise permanently close this submission. Existing disputes are never withdrawn.)',
  'refresh':'विवाद स्थिति पुनः लोड (Reload dispute status)',
  'older':'अघिल्ला विवाद (Older disputes)',
  'unavailable':'विवाद कार्य पुष्टि भएन। मूल अनुरोध पुनः प्रयास वा स्थिति पुनः लोड गर्नुहोस्। (Unconfirmed; retry the original request or reload status.)',
};
const disputeStatuses = {'OPEN':'समीक्षा बाँकी (Open)', 'UNDER_REVIEW':'समीक्षामा (Under review)',
  'DISMISSED':'विवाद खारेज (Dismissed)', 'RESOLVED':'विवाद स्वीकार (Upheld)'};

class MemberDisputesScreen extends StatefulWidget {
  final GenealogyApiService api;
  final String? personId;
  const MemberDisputesScreen({super.key,required this.api,this.personId});
  @override
  State<MemberDisputesScreen> createState()=>_MemberDisputesScreenState();
}
class _MemberDisputesScreenState extends State<MemberDisputesScreen> {
  late final GenealogyApiService _api;
  late final int _generation;
  final _reason=TextEditingController();
  final _evidence=<Map<String,dynamic>>[];
  bool _expired=false,_loading=false,_saving=false,_uploading=false,_confirm=false,_notice=false,_closeConfirmed=false;
  String? _error,_cursor,_resultNotice;
  String _type='family_photo';
  List<Map<String,dynamic>> _items=[];
  bool get _current=>mounted&&!_expired&&identical(widget.api,_api)&&_api.authToken!=null&&_api.pushSessionGeneration==_generation;
  bool get _editable=>_current&&!_saving&&!_uploading&&!_api.hasPendingDispute;
  @override
  void initState(){super.initState();_api=widget.api;_generation=_api.pushSessionGeneration;_api.sessionChanges.addListener(_changed);_load();}
  void _changed(){if(mounted&&!_current)setState((){_expired=true;_items=[];_evidence.clear();_reason.clear();_cursor=_error=_resultNotice=null;_confirm=_notice=_closeConfirmed=false;});}
  @override
  void didUpdateWidget(covariant MemberDisputesScreen oldWidget){super.didUpdateWidget(oldWidget);if(!identical(oldWidget.api,widget.api)||oldWidget.personId!=widget.personId){_expired=true;_changed();}}
  Future<void> _load([String? cursor])async{
    if(!_current||_loading||_saving||_uploading)return;
    setState((){_loading=true;_items=[];_cursor=null;_error=null;});
    try{
      final data=await _api.requestJson(Uri(path:'/claims/disputes/mine',queryParameters:cursor==null?null:{'cursor':cursor}).toString());
      if(!_current)return;
      if(data is! Map||data['items'] is! List||(data['items'] as List).length>100||(data['nextCursor']!=null&&data['nextCursor'] is! String))throw const FormatException('Unavailable dispute history');
      final rows=<Map<String,dynamic>>[];
      for(final value in data['items']){
        if(value is! Map||value['id'] is! String||value['reason'] is! String||!disputeStatuses.containsKey(value['status'])||
          (value['resolutionNotes']!=null&&value['resolutionNotes'] is! String)){throw const FormatException('Unavailable dispute state');}
        rows.add(Map<String,dynamic>.from(value));
      }
      setState((){_items=rows;_cursor=data['nextCursor'] as String?;});
    }catch(_){if(_current)setState(()=>_error=disputeLabels['unavailable']);}
    finally{if(_current)setState(()=>_loading=false);}
  }
  Future<void> _upload()async{
    if(!_editable||!_notice||_evidence.length>=5)return;
    setState((){_uploading=true;_error=null;});
    final category=_type;
    try{
      final file=await const MethodChannel('kashyap/chat_attachments').invokeMapMethod<String,dynamic>('pickProfile');
      if(!_current||file==null)return;
      if(!['image/jpeg','image/png','image/webp'].contains(file['mimeType'])||file['dataBase64'] is! String||(file['dataBase64'] as String).length>13981016)throw const FormatException('Unavailable image');
      final data=await _api.requestJson('/me/claim-evidence',method:'POST',data:{'mimeType':file['mimeType'],'dataBase64':file['dataBase64'],'documentType':category,'evidenceNoticeAccepted':true});
      if(!_current)return;
      if(data is! Map||data['mediaAssetId'] is! String||!RegExp(r'^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[1-5][a-fA-F0-9]{3}-[89abAB][a-fA-F0-9]{3}-[a-fA-F0-9]{12}$').hasMatch(data['mediaAssetId'])||data['quarantineStatus']!='CLEAN'||data['documentType']!=category||_evidence.any((e)=>e['mediaAssetId']==data['mediaAssetId']))throw const FormatException('Unconfirmed evidence');
      setState(()=>_evidence.add({'mediaAssetId':data['mediaAssetId'],'documentType':category}));
    }catch(_){if(_current)setState(()=>_error=claimLabels['uploadFailed']);}
    finally{if(_current)setState(()=>_uploading=false);}
  }
  Future<void> _submit()async{
    if(!_current||_saving||_loading||_uploading)return;
    final retry=_api.hasPendingDispute;
    if(!retry&&(!_confirm||widget.personId==null||_reason.text.trim().isEmpty||_reason.text.length>4000))return;
    setState((){_saving=true;_error=null;_resultNotice=null;});
    var confirmed=false;
    try{
      if(retry){await _api.retryMemberDispute();}
      else{await _api.submitMemberDispute({'targetPersonId':widget.personId,'reason':_reason.text.trim(),
        if(_evidence.isNotEmpty)'evidenceAttachments':_evidence.map((e)=>Map<String,dynamic>.from(e)).toList()});}
      if(!_current)return;
      confirmed=true;_reason.clear();_evidence.clear();_confirm=_notice=false;
    }catch(_){if(_current)setState(()=>_error=disputeLabels['unavailable']);}
    finally{if(_current){setState(()=>_saving=false);if(confirmed)await _load();}}
  }
  Future<void> _resolve()async{
    if(!_current||_saving||_loading||_uploading||!_closeConfirmed||!_api.hasPendingDispute)return;
    setState((){_saving=true;_error=null;_resultNotice=null;});var confirmed=false;
    try{
      final result=await _api.resolveMemberDispute();if(!_current)return;
      confirmed=true;_reason.clear();_evidence.clear();_confirm=_notice=_closeConfirmed=false;
      _resultNotice=result['outcome']=='ABANDONED'
        ?'मूल अनुरोध स्थायी बन्द भयो; दर्ता भएको कुनै विवाद फिर्ता भएको छैन। (Original submission permanently closed; no recorded dispute was withdrawn.)'
        :'दर्ता भएको विवाद पुनः प्राप्त भयो। (Recorded dispute recovered.)';
    }catch(_){if(_current)setState(()=>_error=disputeLabels['unavailable']);}
    finally{if(_current){setState(()=>_saving=false);if(confirmed)await _load();}}
  }
  @override
  void dispose(){_api.sessionChanges.removeListener(_changed);_reason.dispose();_evidence.clear();super.dispose();}
  @override
  Widget build(BuildContext context)=>Scaffold(appBar:AppBar(title:Text(disputeLabels['title']!)),
    body:!_current?Center(child:Text(claimLabels['session']!)):ListView(padding:const EdgeInsets.all(16),children:[
      if(_loading||_saving||_uploading)const Center(child:CircularProgressIndicator()),
      if(_error!=null)Semantics(liveRegion:true,child:Text(_error!)),
      if(_resultNotice!=null)Semantics(liveRegion:true,child:Text(_resultNotice!)),
      if(_api.hasPendingDispute)...[
        ElevatedButton(onPressed:_saving||_loading||_uploading?null:_submit,child:Text(disputeLabels['retry']!)),
        CheckboxListTile(key:const ValueKey('dispute-close-confirm'),value:_closeConfirmed,onChanged:_saving||_loading||_uploading?null:(value){if(_current)setState(()=>_closeConfirmed=value??false);},title:Text(disputeLabels['closeConfirm']!)),
        OutlinedButton(onPressed:_closeConfirmed&&!_saving&&!_loading&&!_uploading?_resolve:null,child:Text(disputeLabels['resolve']!)),
      ],
      if(widget.personId!=null&&!_api.hasPendingDispute)...[
        TextField(key:const ValueKey('dispute-reason'),controller:_reason,enabled:_editable,maxLength:4000,maxLines:3,decoration:InputDecoration(labelText:disputeLabels['reason'])),
        CheckboxListTile(key:const ValueKey('dispute-confirm'),value:_confirm,onChanged:_editable?(value){if(_editable)setState(()=>_confirm=value??false);}:null,title:Text(disputeLabels['confirm']!)),
        Text(claimLabels['notice']!),
        CheckboxListTile(key:const ValueKey('dispute-evidence-notice'),value:_notice,onChanged:_editable?(value){if(_editable)setState(()=>_notice=value??false);}:null,title:Text(claimLabels['noticeCheck']!)),
        DropdownButtonFormField<String>(initialValue:_type,decoration:InputDecoration(labelText:claimLabels['evidenceCategory']),items:const[
          DropdownMenuItem(value:'family_photo',child:Text('पारिवारिक फोटो (Family photo)')),
          DropdownMenuItem(value:'event_invitation',child:Text('कार्यक्रम निमन्त्रणा (Event invitation)')),
          DropdownMenuItem(value:'clan_record',child:Text('पारिवारिक अभिलेख (Family record)')),
        ],onChanged:_editable?(value){if(_editable&&value!=null)setState(()=>_type=value);}:null),
        OutlinedButton(onPressed:_editable&&_notice&&_evidence.length<5?_upload:null,child:Text(claimLabels['upload']!)),
        for(final item in _evidence)ListTile(title:Text('${claimLabels['additionalEvidence']}: ${item['documentType']}'),trailing:IconButton(tooltip:claimLabels['remove'],onPressed:_editable?(){if(_editable)setState(()=>_evidence.remove(item));}:null,icon:const Icon(Icons.remove_circle_outline))),
        ElevatedButton(onPressed:_editable&&_confirm&&!_loading?_submit:null,child:Text(disputeLabels['submit']!)),
      ],
      OutlinedButton(onPressed:_loading||_saving||_uploading?null:()=>_load(),child:Text(disputeLabels['refresh']!)),
      for(final item in _items)Card(child:Padding(padding:const EdgeInsets.all(12),child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
        Text(disputeStatuses[item['status']]!),Text(item['reason'] as String),if(item['resolutionNotes']!=null)Text(item['resolutionNotes'] as String),
      ]))),
      if(_cursor!=null)OutlinedButton(onPressed:_loading||_saving||_uploading?null:()=>_load(_cursor),child:Text(disputeLabels['older']!)),
    ]));
}
