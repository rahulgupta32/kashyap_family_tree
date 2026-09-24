import 'package:flutter/material.dart';
import '../services/genealogy_api_service.dart';

class HouseholdMapScreen extends StatefulWidget {
  final GenealogyApiService apiService;
  const HouseholdMapScreen({super.key,required this.apiService});
  @override
  State<HouseholdMapScreen> createState()=>_HouseholdMapState();
}
class _HouseholdMapState extends State<HouseholdMapScreen> {
  final _district=TextEditingController();
  List<dynamic> _points=[];
  Map<String,dynamic>? _mine;
  String? _error;
  bool _loading=true;
  @override
  void initState(){super.initState();_load();}
  @override
  void dispose(){_district.dispose();super.dispose();}
  Future<void> _load()async{
    try{
      final response=await widget.apiService.requestJson('/map/households${_district.text.trim().isEmpty?'':'?district=${Uri.encodeQueryComponent(_district.text.trim())}'}');
      final mine=widget.apiService.authToken==null?null:await widget.apiService.requestJson('/map/mine');
      if(mounted){setState((){_points=response['data'] as List;_mine=mine as Map<String,dynamic>?;_error=null;_loading=false;});}
    }catch(e){if(mounted){setState((){_error=e.toString();_loading=false;});}}
  }
  Future<void> _edit()async{
    await Navigator.push(context,MaterialPageRoute(builder:(_)=>_HouseholdEditor(api:widget.apiService,record:_mine)));
    if(mounted){await _load();}
  }
  Future<void> _withdraw()async{
    try{await widget.apiService.requestJson('/map/mine',method:'DELETE');await _load();}
    catch(e){if(mounted){setState(()=>_error=e.toString());}}
  }
  @override
  Widget build(BuildContext context)=>Scaffold(appBar:AppBar(title:const Text('परिवारको स्थान (Localities)'),actions:[IconButton(tooltip:'Refresh map',onPressed:_load,icon:const Icon(Icons.refresh))]),
    body:_loading?const Center(child:CircularProgressIndicator()):RefreshIndicator(onRefresh:_load,child:ListView(padding:const EdgeInsets.all(16),children:[
      const Text('स्थान अनुमानित छ; घरको ठेगाना होइन। Generalized localities only. Device location permission is not required.'),
      if(_error!=null)Text(_error!,style:const TextStyle(color:Colors.red)),
      TextField(controller:_district,decoration:const InputDecoration(labelText:'District filter'),onSubmitted:(_)=>_load()),TextButton(onPressed:_load,child:const Text('Filter localities')),
      if(_points.isNotEmpty)SizedBox(height:260,child:InteractiveViewer(minScale:1,maxScale:4,child:CustomPaint(painter:_LocalityPainter(_points),child:const SizedBox.expand()))),
      if(_points.isEmpty)const Padding(padding:EdgeInsets.all(16),child:Text('कुनै साझा स्थान छैन (No locations shared with you)')),
      ..._points.map((p)=>ListTile(leading:const Icon(Icons.location_on),title:Text((p['title']??p['district']).toString()),subtitle:Text('${p['municipality']??''} · ${p['district']} · ${p['totalHouseholds']??'Approximate locality'}'))),
      if(widget.apiService.authToken!=null)FilledButton(onPressed:_edit,child:const Text('आफ्नो स्थान (Your household locality)')),
      if(_mine!=null)...[Text('Review status: ${_mine!['status']}'),if(_mine!['review_reason']!=null)Text(_mine!['review_reason'] as String),if(_mine!['map_consent']==true)TextButton(onPressed:_withdraw,child:const Text('Withdraw map consent'))],
    ])));
}
class _LocalityPainter extends CustomPainter {
  final List points;
  _LocalityPainter(this.points);
  @override
  void paint(Canvas canvas,Size size){
    final grid=Paint()..color=Colors.blueGrey.shade100..strokeWidth=1;
    canvas.drawRect(Offset.zero&size,Paint()..color=Colors.blueGrey.shade50);
    for(double x=0;x<size.width;x+=40){canvas.drawLine(Offset(x,0),Offset(x,size.height),grid);}
    for(double y=0;y<size.height;y+=40){canvas.drawLine(Offset(0,y),Offset(size.width,y),grid);}
    final lats=points.map((p)=>(p['approxLatitude'] as num).toDouble()).toList()..sort();
    final lngs=points.map((p)=>(p['approxLongitude'] as num).toDouble()).toList()..sort();
    final minLat=lats.first-.2,maxLat=lats.last+.2,minLng=lngs.first-.2,maxLng=lngs.last+.2;
    for(final p in points){final at=Offset(20+((p['approxLongitude'] as num)-minLng)/(maxLng-minLng)*(size.width-40),size.height-20-((p['approxLatitude'] as num)-minLat)/(maxLat-minLat)*(size.height-40));canvas.drawCircle(at,9,Paint()..color=const Color(0xFF800000));canvas.drawCircle(at,3,Paint()..color=Colors.white);}
  }
  @override
  bool shouldRepaint(covariant _LocalityPainter old)=>old.points!=points;
}
class _HouseholdEditor extends StatefulWidget {
  final GenealogyApiService api;final Map<String,dynamic>? record;
  const _HouseholdEditor({required this.api,this.record});
  @override
  State<_HouseholdEditor> createState()=>_HouseholdEditorState();
}
class _HouseholdEditorState extends State<_HouseholdEditor>{
  final _form=GlobalKey<FormState>();
  final _fields={for(final key in ['title','district','municipality','latitude','longitude'])key:TextEditingController()};
  String _visibility='PRIVATE';bool _consent=false,_protected=false,_busy=false;String? _error;
  @override
  void initState(){super.initState();final r=widget.record;if(r!=null){for(final k in ['title','district','municipality']){_fields[k]!.text=r[k].toString();}_fields['latitude']!.text=r['approx_latitude']?.toString()??'';_fields['longitude']!.text=r['approx_longitude']?.toString()??'';_visibility=r['visibility'] as String;_consent=r['map_consent']==true;_protected=r['protected_location']==true;}}
  @override
  void dispose(){for(final c in _fields.values){c.dispose();}super.dispose();}
  Future<void> _save()async{
    if(!_form.currentState!.validate()){return;}setState(()=>_busy=true);
    try{await widget.api.requestJson('/map/mine',method:'PUT',data:{for(final k in ['title','district','municipality'])k:_fields[k]!.text.trim(),'latitude':double.tryParse(_fields['latitude']!.text),'longitude':double.tryParse(_fields['longitude']!.text),'visibility':_visibility,'mapConsent':_consent,'protectedLocation':_protected,'version':widget.record?['version']??0});if(mounted){Navigator.pop(context);}}
    catch(e){if(mounted){setState(()=>_error=e.toString());}}
    finally{if(mounted){setState(()=>_busy=false);}}
  }
  @override
  Widget build(BuildContext context)=>Scaffold(appBar:AppBar(title:const Text('Your household locality')),body:Form(key:_form,child:ListView(padding:const EdgeInsets.all(16),children:[
    if(_error!=null)Text(_error!,style:const TextStyle(color:Colors.red)),
    const Text('A linked adult profile and independent review are required. Coordinates are rounded to 0.1° before saving.'),
    ...['title','district','municipality'].map((k)=>TextFormField(controller:_fields[k],decoration:InputDecoration(labelText:k=='title'?'Household title':k=='district'?'District':'Municipality'),maxLength:k=='title'?150:100,validator:(v)=>v==null||v.trim().isEmpty?'Required':null)),
    ...['latitude','longitude'].map((k)=>TextFormField(controller:_fields[k],keyboardType:const TextInputType.numberWithOptions(decimal:true,signed:true),decoration:InputDecoration(labelText:'Locality $k'),validator:(v){if(!_consent){return null;}final n=double.tryParse(v??'');return n==null||!n.isFinite||n.abs()>(k=='latitude'?90:180)?'Enter a valid coordinate':null;})),
    DropdownButtonFormField<String>(initialValue:_visibility,decoration:const InputDecoration(labelText:'Location audience'),items:['PRIVATE','IMMEDIATE_FAMILY','BRANCH','VERIFIED_COMMUNITY','PUBLIC_AGGREGATE'].map((v)=>DropdownMenuItem(value:v,child:Text(v))).toList(),onChanged:(v)=>setState(()=>_visibility=v!)),
    CheckboxListTile(value:_consent,onChanged:(v)=>setState(()=>_consent=v!),title:const Text('I consent to showing my generalized locality to the selected audience.')),
    CheckboxListTile(value:_protected,onChanged:(v)=>setState(()=>_protected=v!),title:const Text('Keep this location protected and hidden.')),
    FilledButton(onPressed:_busy?null:_save,child:const Text('Save household locality')),
  ])));
}
