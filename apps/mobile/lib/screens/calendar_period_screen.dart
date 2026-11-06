import 'package:flutter/material.dart';
import '../theme/app_theme.dart';
import '../widgets/heritage.dart';
import 'calendar_session_guard.dart';
import '../services/genealogy_api_service.dart';
import '../services/calendar_time.dart';

class CalendarPeriodScreen extends StatefulWidget {
 final GenealogyApiService api;
 const CalendarPeriodScreen({super.key,required this.api});
 @override
 State<CalendarPeriodScreen> createState()=>_CalendarPeriodScreenState();
}
class _CalendarPeriodScreenState extends State<CalendarPeriodScreen> with CalendarSessionGuard<CalendarPeriodScreen>{
 @override
 GenealogyApiService get calendarApi => widget.api;
 int _epoch=0;
 @override
 void clearCalendarSession(){_epoch++;_date.clear();_page=null;_error=calendarSessionChanged;_busy=false;}
 final _date=TextEditingController();
 String _source='AD',_view='MONTH';
 bool _busy=false;
 String? _error;
 Map? _page;
 @override
 void initState(){super.initState();final today=nepalWallClock(DateTime.now());_date.text='${today.year}-${today.month.toString().padLeft(2,'0')}-${today.day.toString().padLeft(2,'0')}';}
 @override
 void dispose(){_date.dispose();super.dispose();}
 void _clear(){if(!checkCalendarSession())return;_epoch++;setState((){_page=null;_error=null;});}
 Future<void> _load({String? view,String? date,String? before})async{
  if(!checkCalendarSession())return;
  final epoch=++_epoch;
  setState((){_view=view??_view;_date.text=date??_date.text;_busy=true;_page=null;_error=null;});
  final query=Uri(queryParameters:{'source':_source,'view':_view,'date':_date.text.trim(),if(before!=null)'before':before}).query;
  try{final result=await widget.api.requestJson('/calendar/period?$query') as Map;if(epoch==_epoch && checkCalendarSession()){setState(()=>_page=result);}}
  catch(e){if(epoch==_epoch && checkCalendarSession()){setState(()=>_error=e.toString());}}finally{if(epoch==_epoch && checkCalendarSession()){setState(()=>_busy=false);}}
 }
 @override
 Widget build(BuildContext context){
  final items=(_page?['items'] as List?)??[];
  final groups=items.map((e)=>e['displayDate']??'UNDATED').toSet();
  return Scaffold(appBar:AppBar(title:const Text('पात्रो दृश्य (Calendar views)')),body:!calendarSessionCurrent?const Center(child:Text(calendarSessionChanged)):ListView(padding:const EdgeInsets.all(16),children:[
   const HeritageHeading('पारिवारिक पात्रो · Family calendar', subtitle: 'Explore family events and shared traditions.', icon: Icons.calendar_month_outlined),
   const Padding(padding: EdgeInsets.only(bottom:16), child: Text('Nepal time · UTC+05:45. AD and BS dates are shown in their original calendar.', style: TextStyle(color:AppTheme.textMuted,fontSize:12))),
   if(_source=='BS') const Text('BS days are numbered; weekday conversion is unavailable.'),
   DropdownButtonFormField<String>(initialValue:_source,decoration:const InputDecoration(labelText:'Date source'),items:['AD','BS'].map((v)=>DropdownMenuItem(value:v,child:Text(v))).toList(),onChanged:_busy?null:(v){if(!checkCalendarSession())return;_clear();setState(()=>_source=v!);}),
   DropdownButtonFormField<String>(initialValue:_view,key:ValueKey(_view),decoration:const InputDecoration(labelText:'Calendar view'),items:const [DropdownMenuItem(value:'DAY',child:Text('दिन (Day)')),DropdownMenuItem(value:'MONTH',child:Text('महिना (Month)')),DropdownMenuItem(value:'AGENDA',child:Text('कार्यसूची (Agenda for month)'))],onChanged:_busy?null:(v){if(!checkCalendarSession())return;_clear();setState(()=>_view=v!);}),
   TextField(controller:_date,enabled:!_busy,decoration:const InputDecoration(labelText:'Source date (YYYY-MM-DD)'),onChanged:(_)=>_clear()),
   TextButton(onPressed:_busy?null:()=>_load(),child:const Text('Show calendar period')),
   if(_error!=null)Text(_error!,style:const TextStyle(color:Colors.red)),
   if(_busy)const Center(child:CircularProgressIndicator()),
   if(_page!=null)...[
    Text("${_page!['period']['source']} · ${_page!['period']['view']} · ${_page!['period']['date']}. Counts cover all currently accessible events; each event page contains at most 50."),
    Wrap(children:[TextButton(onPressed:_page!['period']['previousDate']==null?null:(){if(checkCalendarSession() && !_busy && _page!=null)_load(date:_page!['period']['previousDate'] as String);},child:const Text('Previous calendar period')),TextButton(onPressed:_page!['period']['nextDate']==null?null:(){if(checkCalendarSession() && !_busy && _page!=null)_load(date:_page!['period']['nextDate'] as String);},child:const Text('Next calendar period'))]),
    if(_view=='MONTH') _monthGrid(),
    if((_page!['undatedCount'] as int)>0)Text("Undated Tithi: ${_page!['undatedCount']} events. Conversion unavailable; these events are not assigned to a day."),
    if(items.isEmpty)const Text('No accessible events in this period.'),
    ...groups.map((group)=>Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
     Text(group=='UNDATED'?'Undated Tithi — conversion unavailable':group as String),
     ...items.where((e)=>(e['displayDate']??'UNDATED')==group).map((e)=>Card(child:Padding(padding:const EdgeInsets.all(12),child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[Text(e['title'] as String),Text(e['startsAt']!=null?formatNepalInstant(e['startsAt'] as String):e['solarDate']!=null?"BS: ${e['solarDate']}":"Tithi: ${e['tithiYearBs']} / ${e['tithiMonthBs']} · ${e['tithiPaksha']} ${e['tithiNumber']}"),Text("${e['eventType']} · ${e['lifecycleState']}"),if(e['description']!=null)Text(e['description'] as String)])))),
    ])),
    TextButton(onPressed:_busy?null:()=>_load(),child:const Text('First calendar period page')),
    TextButton(onPressed:_busy||_page!['nextBefore']==null?null:(){if(checkCalendarSession() && !_busy && _page!=null)_load(before:_page!['nextBefore'] as String);},child:const Text('More period events')),
   ],
  ]));
 }
 Widget _monthGrid() {
  final days = _page!['days'] as List;
  final first = days.isEmpty ? null : DateTime.tryParse(days.first['date'].toString());
  final offset = _source == 'AD' && first != null ? first.weekday % 7 : 0;
  return Card(child: Padding(padding: const EdgeInsets.all(12), child: LayoutBuilder(builder:(context, constraints) {
   final width = (constraints.maxWidth - 24) / 7;
   return Column(children:[
    if(_source=='AD') Row(children:[for(final name in const ['S','M','T','W','T','F','S']) Expanded(child:Padding(padding:const EdgeInsets.symmetric(vertical:12),child:Text(name,textAlign:TextAlign.center,style:const TextStyle(color:AppTheme.textMuted,fontSize:12))))]),
    Wrap(spacing:4,runSpacing:4,children:[
     for(var i=0;i<offset;i++) SizedBox(width:width,height:60),
     ...days.map((d)=>SizedBox(width:width, child:OutlinedButton(key:ValueKey('calendar-day-${d['date']}'),
      style:OutlinedButton.styleFrom(padding:const EdgeInsets.symmetric(vertical:10,horizontal:1),minimumSize:const Size(0,60),backgroundColor:(d['count'] as num)>0?AppTheme.softPeach:Colors.white),
      onPressed:()=>_load(view:'DAY',date:d['date'] as String),
      child:Column(children:[Text(d['date'].toString().substring(8),style:const TextStyle(fontSize:14,fontWeight:FontWeight.w600)),Text("${d['count']} events",style:const TextStyle(fontSize:8))])))),
    ]),
   ]);
  })));
 }

}
