import 'package:flutter/material.dart';
import '../services/genealogy_api_service.dart';

class CalendarPeriodScreen extends StatefulWidget {
 final GenealogyApiService api;
 const CalendarPeriodScreen({super.key,required this.api});
 @override
 State<CalendarPeriodScreen> createState()=>_CalendarPeriodScreenState();
}
class _CalendarPeriodScreenState extends State<CalendarPeriodScreen>{
 final _date=TextEditingController();
 String _source='AD',_view='MONTH';
 bool _busy=false;
 String? _error;
 Map? _page;
 @override
 void initState(){super.initState();final today=DateTime.now().toUtc().add(const Duration(hours:5,minutes:45));_date.text='${today.year}-${today.month.toString().padLeft(2,'0')}-${today.day.toString().padLeft(2,'0')}';}
 @override
 void dispose(){_date.dispose();super.dispose();}
 void _clear(){setState((){_page=null;_error=null;});}
 Future<void> _load({String? view,String? date,String? before})async{
  setState((){_view=view??_view;_date.text=date??_date.text;_busy=true;_page=null;_error=null;});
  final query=Uri(queryParameters:{'source':_source,'view':_view,'date':_date.text.trim(),if(before!=null)'before':before}).query;
  try{final result=await widget.api.requestJson('/calendar/period?$query') as Map;if(mounted){setState(()=>_page=result);}}
  catch(e){if(mounted){setState(()=>_error=e.toString());}}finally{if(mounted){setState(()=>_busy=false);}}
 }
 @override
 Widget build(BuildContext context){
  final items=(_page?['items'] as List?)??[];
  final groups=items.map((e)=>e['displayDate']??'UNDATED').toSet();
  return Scaffold(appBar:AppBar(title:const Text('पात्रो दृश्य (Calendar views)')),body:ListView(padding:const EdgeInsets.all(16),children:[
   const Text('AD times use Asia/Kathmandu. Select the original calendar; switching source does not convert an event or the selected date. BS month cells are numbered days; weekday conversion is unavailable.'),
   DropdownButtonFormField<String>(initialValue:_source,decoration:const InputDecoration(labelText:'Date source'),items:['AD','BS'].map((v)=>DropdownMenuItem(value:v,child:Text(v))).toList(),onChanged:_busy?null:(v){_clear();setState(()=>_source=v!);}),
   DropdownButtonFormField<String>(initialValue:_view,key:ValueKey(_view),decoration:const InputDecoration(labelText:'Calendar view'),items:const [DropdownMenuItem(value:'DAY',child:Text('दिन (Day)')),DropdownMenuItem(value:'MONTH',child:Text('महिना (Month)')),DropdownMenuItem(value:'AGENDA',child:Text('कार्यसूची (Agenda for month)'))],onChanged:_busy?null:(v){_clear();setState(()=>_view=v!);}),
   TextField(controller:_date,enabled:!_busy,decoration:const InputDecoration(labelText:'Source date (YYYY-MM-DD)'),onChanged:(_)=>_clear()),
   TextButton(onPressed:_busy?null:()=>_load(),child:const Text('Show calendar period')),
   if(_error!=null)Text(_error!,style:const TextStyle(color:Colors.red)),
   if(_busy)const Center(child:CircularProgressIndicator()),
   if(_page!=null)...[
    Text("${_page!['period']['source']} · ${_page!['period']['view']} · ${_page!['period']['date']}. Counts cover all currently accessible events; each event page contains at most 50."),
    Wrap(children:[TextButton(onPressed:_page!['period']['previousDate']==null?null:()=>_load(date:_page!['period']['previousDate'] as String),child:const Text('Previous calendar period')),TextButton(onPressed:_page!['period']['nextDate']==null?null:()=>_load(date:_page!['period']['nextDate'] as String),child:const Text('Next calendar period'))]),
    if(_view=='MONTH')Wrap(spacing:4,runSpacing:4,children:(_page!['days'] as List).map((d)=>SizedBox(width:85,child:OutlinedButton(onPressed:()=>_load(view:'DAY',date:d['date'] as String),child:Text("${d['date'].toString().substring(8)}\n${d['count']} events",textAlign:TextAlign.center)))).toList()),
    if((_page!['undatedCount'] as int)>0)Text("Undated Tithi: ${_page!['undatedCount']} events. Conversion unavailable; these events are not assigned to a day."),
    if(items.isEmpty)const Text('No accessible events in this period.'),
    ...groups.map((group)=>Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
     Text(group=='UNDATED'?'Undated Tithi — conversion unavailable':group as String),
     ...items.where((e)=>(e['displayDate']??'UNDATED')==group).map((e)=>Card(child:Padding(padding:const EdgeInsets.all(12),child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[Text(e['title'] as String),Text(e['startsAt']!=null?"AD instant: ${e['startsAt']}":e['solarDate']!=null?"BS: ${e['solarDate']}":"Tithi: ${e['tithiYearBs']} / ${e['tithiMonthBs']} · ${e['tithiPaksha']} ${e['tithiNumber']}"),Text("${e['eventType']} · ${e['lifecycleState']}"),if(e['description']!=null)Text(e['description'] as String)])))),
    ])),
    TextButton(onPressed:_busy?null:()=>_load(),child:const Text('First calendar period page')),
    TextButton(onPressed:_busy||_page!['nextBefore']==null?null:()=>_load(before:_page!['nextBefore'] as String),child:const Text('More period events')),
   ],
  ]));
 }
}
