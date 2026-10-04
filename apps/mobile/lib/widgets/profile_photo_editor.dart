import 'dart:async';
import 'dart:convert';
import 'dart:math' as math;
import 'dart:typed_data';
import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../services/genealogy_api_service.dart';

class ProfilePhotoEditor extends StatefulWidget {
  final GenealogyApiService api;
  final String? initialAsset;
  const ProfilePhotoEditor({super.key,required this.api,this.initialAsset});
  @override State<ProfilePhotoEditor> createState()=>_ProfilePhotoEditorState();
}
class _ProfilePhotoEditorState extends State<ProfilePhotoEditor> {
  static const channel=MethodChannel('kashyap/chat_attachments');
  String? _owner,_asset,_mime,_encoded,_error;
  String _status='';bool _busy=false;
  Uint8List? _thumbnail;
  ui.Image? _preview;
  Timer? _timer;
  int _generation=0;
  Map<String,int> _crop={'left':0,'top':0,'width':10000,'height':10000};
  @override void initState(){super.initState();_owner=widget.api.chatAccountId;_asset=widget.initialAsset;if(_asset!=null){unawaited(_check());}}
  @override void didUpdateWidget(ProfilePhotoEditor old){super.didUpdateWidget(old);if(old.initialAsset!=widget.initialAsset){_asset=widget.initialAsset;_thumbnail=null;_timer?.cancel();if(_asset!=null){unawaited(_check());}}}
  bool _current(int generation)=>mounted&&generation==_generation&&_owner!=null&&widget.api.chatAccountId==_owner;
  @override void dispose(){_generation++;_timer?.cancel();_preview?.dispose();super.dispose();}
  Future<void> _check() async {
    final generation=_generation,asset=_asset,owner=_owner;if(asset==null||owner==null){return;}
    try{
      final result=await widget.api.profilePhotoRequest('/media/$asset/processing',owner);
      if(!_current(generation)||_asset!=asset){return;}
      setState(()=>_status=result['status'] as String);
      if(_status=='READY'){
        final response=await widget.api.downloadProfilePhoto(asset,owner);
        if(_current(generation)&&_asset==asset){setState(()=>_thumbnail=response.bodyBytes);}
      }else if(_status=='PENDING'){_timer?.cancel();_timer=Timer(const Duration(seconds:3),()=>unawaited(_check()));}
    }catch(error){if(_current(generation)){setState(()=>_error='फोटो उपलब्ध छैन / Photo unavailable');}}
  }
  Future<void> _choose() async {
    final generation=++_generation;final nextOwner=widget.api.chatAccountId;
    if(nextOwner!=_owner){_asset=null;_thumbnail=null;_encoded=null;final previous=_preview;_preview=null;WidgetsBinding.instance.addPostFrameCallback((_){previous?.dispose();});}
    _owner=nextOwner;
    if(_owner==null){setState(()=>_error='साइन इन गर्नुहोस् / Sign in first');return;}
    setState((){_busy=true;_error=null;});ui.Image? decoded;
    try{
      final file=await channel.invokeMapMethod<String,dynamic>('pickProfile');
      if(!_current(generation)||file==null){return;}
      final mime=file['mimeType'],encoded=file['dataBase64'];
      if(!['image/jpeg','image/png','image/webp'].contains(mime)||encoded is! String||encoded.length>13981016){throw const FormatException('Choose an image up to 10 MB');}
      final bytes=base64Decode(encoded);if(bytes.length>10*1024*1024){throw const FormatException('Image too large');}
      final buffer=await ui.ImmutableBuffer.fromUint8List(bytes);
      try{
        final descriptor=await ui.ImageDescriptor.encoded(buffer);
        try{
          if(descriptor.width>8192||descriptor.height>8192||descriptor.width*descriptor.height>20000000){throw const FormatException('Image dimensions exceed the limit');}
          final scale=math.min(1.0,math.min(512/descriptor.width,512/descriptor.height));
          final codec=await descriptor.instantiateCodec(targetWidth:math.max(1,(descriptor.width*scale).round()),targetHeight:math.max(1,(descriptor.height*scale).round()));
          try{decoded=(await codec.getNextFrame()).image;}finally{codec.dispose();}
        }finally{descriptor.dispose();}
      }finally{buffer.dispose();}
      if(!_current(generation)){decoded?.dispose();return;}
      final previous=_preview;
      setState((){_preview=decoded;_mime=mime as String;_encoded=encoded;_crop={'left':0,'top':0,'width':10000,'height':10000};});
      WidgetsBinding.instance.addPostFrameCallback((_){previous?.dispose();});
    }catch(error){decoded?.dispose();if(_current(generation)){setState(()=>_error='मान्य JPEG, PNG वा WebP छान्नुहोस् / Choose a valid JPEG, PNG or WebP');}}
    finally{if(_current(generation)){setState(()=>_busy=false);}}
  }
  Future<void> _upload() async {
    final generation=_generation,owner=_owner;if(owner==null||_encoded==null||_busy){return;}
    setState((){_busy=true;_error=null;});
    try{
      final result=await widget.api.profilePhotoRequest('/photo',owner,method:'POST',data:{'mimeType':_mime,'dataBase64':_encoded,'crop':_crop});
      if(!_current(generation)){return;}
      final previous=_preview;
      setState((){_asset=result['assetId'] as String;_status='PENDING';_preview=null;_encoded=null;_thumbnail=null;});
      WidgetsBinding.instance.addPostFrameCallback((_){previous?.dispose();});
      unawaited(_check());
    }catch(error){if(_current(generation)){setState(()=>_error='फोटो सुरक्षित भएन। पुनः प्रयास गर्नुहोस् / Photo upload failed; retry');}}
    finally{if(_current(generation)){setState(()=>_busy=false);}}
  }
  Future<void> _remove() async {
    final generation=_generation,owner=_owner;if(owner==null){return;}
    setState(()=>_busy=true);
    try{final result=await widget.api.profilePhotoRequest('/photo',owner,method:'DELETE');if(_current(generation)){_timer?.cancel();setState((){_asset=null;_thumbnail=null;_status=result['retainedForEvidence']==true?'प्रमाणका लागि राखिएको छ / Retained as evidence':'';});}}
    catch(error){if(_current(generation)){setState(()=>_error='फोटो हटाउन सकिएन / Could not remove photo');}}
    finally{if(_current(generation)){setState(()=>_busy=false);}}
  }
  Future<void> _retry() async {final generation=_generation,owner=_owner,asset=_asset;if(owner==null||asset==null){return;}try{await widget.api.profilePhotoRequest('/media/$asset/retry',owner,method:'POST');if(_current(generation)){setState((){_error=null;_status='PENDING';});unawaited(_check());}}catch(error){if(_current(generation)){setState(()=>_error='पुनः प्रयास असफल भयो / Retry unavailable');}}}
  @override Widget build(BuildContext context){if(_owner!=widget.api.chatAccountId){return const Text('खाता बदलिएको छ / Account changed');}return Card(child:Padding(padding:const EdgeInsets.all(12),child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
    const Text('प्रोफाइल फोटो / Profile photo',style:TextStyle(fontWeight:FontWeight.bold)),
    const SizedBox(height:8),
    _thumbnail==null?const CircleAvatar(radius:32,child:Text('क')):Image.memory(_thumbnail!,width:96,height:96,fit:BoxFit.cover,errorBuilder:(_,__,___)=>const Text('Photo unavailable')),
    if(_status.isNotEmpty)Text(_status=='PENDING'?'फोटो तयार हुँदैछ / Processing photo':_status=='FAILED'?'फोटो तयार भएन / Processing failed':_status=='READY'?'फोटो तयार छ / Photo ready':_status),
    if(_error!=null)Text(_error!,style:const TextStyle(color:Colors.red)),
    TextButton(key:const Key('choose-profile-photo'),onPressed:_busy?null:_choose,child:const Text('फोटो छान्नुहोस् / Choose photo')),
    if(_preview!=null)...[
      SizedBox(width:240,height:240,child:CustomPaint(painter:_CropPainter(_preview!,_crop))),
      const Text('काट्ने क्षेत्र प्रतिशतमा / Crop area in percent'),
      for(final field in ['left','top','width','height'])Column(children:[Text('${{'left':'बायाँ / Left','top':'माथि / Top','width':'चौडाइ / Width','height':'उचाइ / Height'}[field]} ${(_crop[field]!/100).round()}%'),Slider(key:Key('photo-crop-$field'),value:_crop[field]!.toDouble(),min:field=='width'||field=='height'?100:0,max:field=='left'||field=='top'?9900:10000,divisions:99,onChanged:_busy?null:(value){setState((){_crop[field]=value.round();_crop['width']=math.min(_crop['width']!,10000-_crop['left']!);_crop['height']=math.min(_crop['height']!,10000-_crop['top']!);});})]),
      TextButton(key:const Key('save-profile-photo'),onPressed:_busy?null:_upload,child:const Text('काटेर सुरक्षित गर्नुहोस् / Save cropped photo')),
      TextButton(onPressed:_busy?null:(){final previous=_preview;setState((){_preview=null;_encoded=null;});WidgetsBinding.instance.addPostFrameCallback((_){previous?.dispose();});},child:const Text('रद्द गर्नुहोस् / Cancel')),
    ],
    if(_asset!=null)...[TextButton(onPressed:_busy?null:_remove,child:const Text('फोटो हटाउनुहोस् / Remove photo')),if(_status=='FAILED'||_status=='NOT_SCHEDULED'||_error!=null)TextButton(onPressed:_busy?null:_retry,child:const Text('पुनः प्रयास / Retry processing'))],
  ])));}
}
class _CropPainter extends CustomPainter {
 final ui.Image image;final Map<String,int> crop;
 _CropPainter(this.image,Map<String,int> crop):crop=Map.of(crop);
 @override void paint(Canvas canvas,Size size){final source=Rect.fromLTWH(image.width*crop['left']!/10000,image.height*crop['top']!/10000,image.width*crop['width']!/10000,image.height*crop['height']!/10000);final scale=math.min(size.width/source.width,size.height/source.height);final target=Size(source.width*scale,source.height*scale);canvas.drawImageRect(image,source,Rect.fromLTWH((size.width-target.width)/2,(size.height-target.height)/2,target.width,target.height),Paint());}
 @override bool shouldRepaint(_CropPainter old)=>old.image!=image||old.crop.toString()!=crop.toString();
}
