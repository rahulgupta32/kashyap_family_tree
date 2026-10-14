import 'calendar_audience_picker.dart';
import 'calendar_session_guard.dart';
import 'package:flutter/material.dart';
import 'calendar_period_screen.dart';
import 'calendar_recurrence_screen.dart';
import '../services/genealogy_api_service.dart';
import '../localization/calendar_labels.dart';

class CalendarEventsScreen extends StatefulWidget {
  final GenealogyApiService apiService;

  const CalendarEventsScreen({super.key, required this.apiService});

  @override
  State<CalendarEventsScreen> createState() => _CalendarEventsScreenState();
}

class _CalendarEventsScreenState extends State<CalendarEventsScreen> with CalendarSessionGuard<CalendarEventsScreen> {
  @override
  GenealogyApiService get calendarApi => widget.apiService;
  int _epoch = 0;
  DialogRoute<dynamic>? _activeDialog;

  @override
  void clearCalendarSession() {
    _epoch++;
    _events = [];
    _savingRsvps.clear();
    _error = calendarSessionChanged;
    _loading = false;
    final dialog = _activeDialog;
    if (dialog != null && dialog.isActive) dialog.navigator?.removeRoute(dialog);
    _activeDialog = null;
  }
  bool _loading = true;
  List<dynamic> _events = [];
  String? _error;
  final Set<String> _savingRsvps = {};

  @override
  void initState() {
    super.initState();
    _loadEvents();
  }

  Future<void> _loadEvents() async {
    if (!checkCalendarSession()) return;
    final epoch = ++_epoch;
    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final events = await widget.apiService.getCalendarEvents();
      if (epoch == _epoch && checkCalendarSession()) { setState(() {
        _events = events;
      }); }
    } catch (e) {
      if (epoch == _epoch && checkCalendarSession()) { setState(() {
        _error = e.toString().replaceAll('Exception: ', '');
      }); }
    } finally {
      if (epoch == _epoch && checkCalendarSession()) { setState(() {
        _loading = false;
      }); }
    }
  }

  Future<void> _rsvp(String eventId, String response) async {
    if (!checkCalendarSession() || _savingRsvps.contains(eventId)) return;
    setState(() => _savingRsvps.add(eventId));
    try {
      await widget.apiService.rsvpEvent(eventId, response);
      if (!checkCalendarSession()) return;
      await _loadEvents();
    } catch (error) {
      if (mounted && checkCalendarSession()) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(error.toString())));
      }
    } finally {
      if (checkCalendarSession()) { setState(() => _savingRsvps.remove(eventId)); }
    }
  }

  Future<void> _create() async {
    if (!checkCalendarSession() || _activeDialog != null) return;
    final title = TextEditingController();
    DateTime? selected;
    var reminder = false;
    var busy = false;
    String? error;
    Map<String,dynamic>? audience;
    try {
      final route = DialogRoute<void>(context: context, builder: (dialogContext) => StatefulBuilder(builder: (context, update) => AlertDialog(
        title: Text(calendarLabels['create']!),
        content: SingleChildScrollView(child: Column(mainAxisSize: MainAxisSize.min, children: [
          TextField(controller: title, decoration: InputDecoration(labelText: calendarLabels['title'])),
          TextButton(onPressed: busy ? null : () async {
            if (!checkCalendarSession()) return;
            final date = await showDatePicker(context: context, initialDate: DateTime.now().add(const Duration(days: 1)),
              firstDate: DateTime.now(), lastDate: DateTime(2100));
            if (date == null || !context.mounted || !checkCalendarSession()) return;
            final time = await showTimePicker(context: context, initialTime: const TimeOfDay(hour: 10, minute: 0));
            if (time != null && context.mounted && checkCalendarSession()) update(() => selected = DateTime(date.year, date.month, date.day, time.hour, time.minute));
          }, child: Text(selected?.toString() ?? calendarLabels['time']!)),
          CheckboxListTile(title: Text(calendarLabels['reminder']!), value: reminder, onChanged: busy ? null : (value) { if(checkCalendarSession()) update(() => reminder = value ?? false); }),
          Text(calendarLabels['dateNote']!),
          TextButton(onPressed: busy ? null : () async {
            if (!checkCalendarSession()) return;
            final picked=await Navigator.of(dialogContext).push<Map<String,dynamic>>(MaterialPageRoute(builder:(_)=>CalendarAudiencePicker(api:widget.apiService)));
            if(dialogContext.mounted && checkCalendarSession())update(()=>audience=picked);
          },child:const Text('आमन्त्रित समूह छान्नुहोस् (Choose invitation audience)')),
          if(audience!=null)...[
            Text('आमन्त्रित खाताहरू (Recipient accounts): ${audience!['recipientCount']}'),
            const Text('छानिएको समूहका खाताहरू मात्र कार्यक्रम हेर्न सक्छन्। (Only invited accounts can view this event.)'),
            TextButton(onPressed:busy?null:(){if(checkCalendarSession())update(()=>audience=null);},child:const Text('समूह हटाउनुहोस् (Clear audience)')),
          ],
          if(error != null) Text(error!, style: const TextStyle(color: Colors.red)),
        ])),
        actions: [
          TextButton(onPressed: busy ? null : () {if(checkCalendarSession()) Navigator.pop(dialogContext);}, child: Text(calendarLabels['close']!)),
          TextButton(onPressed: busy ? null : () async {
            if (!checkCalendarSession()) return;
            if(title.text.trim().isEmpty || selected == null) {update(() => error = calendarLabels['required']); return;}
            if(audience!=null){
              final expiry=DateTime.tryParse(audience!['expiresAt'] as String);
              if(expiry==null||!expiry.isAfter(DateTime.now())){update((){audience=null;error='म्याद सकियो, समूह फेरि छान्नुहोस् (Preview expired; choose the audience again)';});return;}
            }
            update(() {busy = true; error = null;});
            try {
              await widget.apiService.requestJson('/calendar/events', method: 'POST', data: {
                'title': title.text.trim(), 'eventType': 'GENERAL_EVENT', 'audienceScope': audience==null?'COMMUNITY':'INVITED_ONLY',
                if(audience!=null)'audienceSelection':audience!['audienceSelection'],
                if(audience!=null)'audiencePreviewId':audience!['audiencePreviewId'],
                'startsAt': selected!.toUtc().toIso8601String(), 'reminderOffsets': reminder ? [60] : <int>[],
              });
              if(!checkCalendarSession()) return;
              if(dialogContext.mounted) Navigator.pop(dialogContext);
              await _loadEvents();
            } catch(e) {if(dialogContext.mounted && checkCalendarSession()) update(() {busy = false; error = e.toString(); audience=null;});}
          }, child: Text(calendarLabels['save']!)),
        ],
      )));
      _activeDialog = route;
      await Navigator.of(context).push(route);
      await route.completed;
    } finally {_activeDialog = null; title.dispose();}
  }

  Future<void> _manage(Map event, {bool cancel = false}) async {
    if (!checkCalendarSession() || _activeDialog != null) return;
    final controller = TextEditingController(text: cancel ? '' : event['title'] as String? ?? '');
    final route = DialogRoute<String>(context: context, builder: (context) => AlertDialog(
      title: Text(calendarLabels[cancel ? 'cancel' : 'edit']!),
      content: TextField(controller: controller, decoration: InputDecoration(labelText: calendarLabels[cancel ? 'reason' : 'title'])),
      actions: [TextButton(onPressed: () {if(checkCalendarSession()) Navigator.pop(context);}, child: Text(calendarLabels['close']!)),
        TextButton(onPressed: () {if(checkCalendarSession()) Navigator.pop(context, controller.text.trim());}, child: Text(calendarLabels['save']!))],
    ));
    _activeDialog = route;
    final result = await Navigator.of(context).push(route);
    await route.completed;
    controller.dispose();
    _activeDialog = null;
    if(result == null || !checkCalendarSession()) return;
    try {
      await widget.apiService.requestJson('/calendar/events/${event['id']}${cancel ? '/cancel' : ''}', method: cancel ? 'POST' : 'PATCH',
        data: {'version': event['version'], (cancel ? 'reason' : 'title'): result});
      await _loadEvents();
    } catch(e) {if(mounted && checkCalendarSession()) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));}
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('सांस्कृतिक तथा पारिवारिक पात्रो (Calendar)'),
        actions: [
          IconButton(tooltip: 'Calendar day month agenda', onPressed: !calendarSessionCurrent ? null : () { if(checkCalendarSession()) Navigator.push(context, MaterialPageRoute(builder: (_) => CalendarPeriodScreen(api: widget.apiService))); }, icon: const Icon(Icons.calendar_month)),
          IconButton(tooltip: 'Browse all calendar events', onPressed: !calendarSessionCurrent ? null : () { if(checkCalendarSession()) Navigator.push(context, MaterialPageRoute(builder: (_) => CalendarBrowseScreen(api: widget.apiService))); }, icon: const Icon(Icons.list_alt)),
          IconButton(tooltip: 'वार्षिक सम्झना (Annual reminders)', onPressed: !calendarSessionCurrent ? null : () { if(checkCalendarSession()) Navigator.push(context, MaterialPageRoute(builder: (_) => CalendarRecurrenceScreen(api: widget.apiService))); }, icon: const Icon(Icons.event_repeat)),
          IconButton(tooltip: calendarLabels['create'], onPressed: !calendarSessionCurrent ? null : _create, icon: const Icon(Icons.add)),
          IconButton(onPressed: !calendarSessionCurrent ? null : _loadEvents, icon: const Icon(Icons.refresh)),
        ],
      ),
      body: !calendarSessionCurrent ? const Center(child: Text(calendarSessionChanged)) : _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(
                  child: Padding(
                    padding: const EdgeInsets.all(24.0),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Text(_error!, textAlign: TextAlign.center, style: const TextStyle(color: Colors.red)),
                        const SizedBox(height: 12),
                        ElevatedButton(onPressed: !calendarSessionCurrent ? null : _loadEvents, child: const Text('पुनः प्रयास गर्नुहोस्')),
                      ],
                    ),
                  ),
                )
              : _events.isEmpty
                  ? const Center(child: Text('कुनै कार्यक्रम दर्ता गरिएको छैन।'))
                  : ListView.builder(
                      itemCount: _events.length,
                      padding: const EdgeInsets.all(12),
                      itemBuilder: (context, idx) {
                        final ev = _events[idx];
                        return Card(
                          margin: const EdgeInsets.only(bottom: 12),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                          child: ListTile(
                            leading: CircleAvatar(
                              backgroundColor: Colors.amber.shade100,
                              child: Icon(Icons.event, color: Colors.amber.shade900),
                            ),
                            title: Text(
                              ev['title'] ?? 'कार्यक्रम',
                              style: const TextStyle(fontWeight: FontWeight.bold),
                            ),
                            subtitle: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                const SizedBox(height: 4),
                                Text('मिति: ${ev['startsAt'] ?? ev['solarDate'] ?? 'तिथि आधारित'} • दायरा: ${ev['audienceScope']}'),
                                if(ev['lifecycleState'] == 'CANCELLED') Text(calendarLabels['cancelled']!),
                                if(ev['rsvpCounts'] != null) Text('${calendarLabels['attendance']}: ${ev['rsvpCounts']['going']} Going · ${ev['rsvpCounts']['maybe']} Maybe'),
                                if(ev['canManage'] == true && ev['lifecycleState'] != 'CANCELLED') Wrap(children: [
                                  if(ev['startsAt'] != null && ev['recurrenceRuleId'] == null && ['GENERAL_EVENT','COMMUNITY_MEETING'].contains(ev['eventType']))
                                    TextButton(onPressed: () { if(checkCalendarSession()) Navigator.push(context, MaterialPageRoute(builder: (_) => CalendarRecurrenceScreen(api: widget.apiService, source: Map<String,dynamic>.from(ev as Map)))); }, child: const Text('वार्षिक सम्झना प्रस्ताव (Propose annual reminder)')),
                                  TextButton(onPressed: () => _manage(ev as Map), child: Text(calendarLabels['edit']!)),
                                  TextButton(onPressed: () => _manage(ev as Map, cancel: true), child: Text(calendarLabels['cancel']!)),
                                ]),
                                if (ev['location'] != null) Text('स्थान: ${ev['location']}'),
                                if (widget.apiService.authToken != null)
                                  Wrap(spacing: 8, children: [
                                    for (final option in const {'GOING': 'जानेछु (Going)', 'MAYBE': 'सम्भवतः (Maybe)', 'DECLINED': 'जान्न (Decline)'}.entries)
                                      ChoiceChip(
                                        key: ValueKey('rsvp-${ev['id']}-${option.key}'),
                                        label: Text(option.value),
                                        selected: ev['myRsvp'] == option.key,
                                        onSelected: _savingRsvps.contains(ev['id']) || ev['lifecycleState'] == 'CANCELLED' ? null
                                            : (_) => _rsvp(ev['id'] as String, option.key),
                                      ),
                                  ]),
                              ],
                            ),
                            trailing: ev['myRsvp'] != null
                                ? Chip(label: Text(ev['myRsvp'], style: const TextStyle(fontSize: 10)))
                                : null,
                          ),
                        );
                      },
                    ),
    );
  }
}

class CalendarBrowseScreen extends StatefulWidget {
 final GenealogyApiService api;
 const CalendarBrowseScreen({super.key,required this.api});
 @override
 State<CalendarBrowseScreen> createState()=>_CalendarBrowseScreenState();
}
class _CalendarBrowseScreenState extends State<CalendarBrowseScreen> with CalendarSessionGuard<CalendarBrowseScreen>{
 @override
 GenealogyApiService get calendarApi => widget.api;
 int _epoch=0;
 @override
 void clearCalendarSession(){_epoch++;_year.clear();_month=null;_items=[];_next=null;_cursor=null;_error=calendarSessionChanged;_busy=false;}
 final _year=TextEditingController();
 String? _month,_next,_cursor,_error;
 List<dynamic> _items=[];
 bool _busy=true;
 @override
 void initState(){super.initState();_load();}
 @override
 void dispose(){_year.dispose();super.dispose();}
 Future<void> _load([String? before])async{
  if(!checkCalendarSession())return;
  final epoch=++_epoch;
  setState((){_busy=true;_error=null;_items=[];_next=null;_cursor=before;});
  final query=Uri(queryParameters:{if(before!=null)'before':before,if(_year.text.trim().isNotEmpty)'yearBs':_year.text.trim(),if(_month!=null)'monthBs':_month!}).query;
  try{final result=await widget.api.requestJson('/calendar/browse?$query') as Map;
   if(epoch==_epoch && checkCalendarSession()){setState((){_items=result['items'] as List;_next=result['nextBefore'] as String?;});}
  }catch(e){if(epoch==_epoch && checkCalendarSession()){setState(()=>_error=e.toString());}}finally{if(epoch==_epoch && checkCalendarSession()){setState(()=>_busy=false);}}
 }
 @override
 Widget build(BuildContext context)=>Scaffold(appBar:AppBar(title:const Text('सबै कार्यक्रम (Browse all events)')),body:!calendarSessionCurrent?const Center(child:Text(calendarSessionChanged)):ListView(padding:const EdgeInsets.all(16),children:[
  const Text('Newest submissions first. BS filters use stored BS/Tithi metadata; AD events are not converted.'),
  TextField(controller:_year,enabled:!_busy,keyboardType:TextInputType.number,decoration:const InputDecoration(labelText:'BS year (2000–2090)'),onChanged:(_){if(checkCalendarSession())setState((){_epoch++;_next=null;_items=[];});}),
  DropdownButtonFormField<String>(initialValue:_month,decoration:const InputDecoration(labelText:'BS month'),items:[const DropdownMenuItem(value:'',child:Text('All months')),...List.generate(12,(i)=>DropdownMenuItem(value:'${i+1}',child:Text('${i+1}')))],onChanged:_busy?null:(v){if(checkCalendarSession())setState((){_epoch++;_month=v==''?null:v;_next=null;_items=[];});}),
  TextButton(onPressed:_busy?null:()=>_load(),child:const Text('Apply calendar filters')),
  if(_error!=null)...[Text(_error!),TextButton(onPressed:_busy?null:()=>_load(_cursor),child:const Text('Retry calendar page'))],
  if(_busy)const Center(child:CircularProgressIndicator())else if(_items.isEmpty)const Text('No accessible events in this page.')else ..._items.map((e)=>Card(child:Padding(padding:const EdgeInsets.all(12),child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
   Text(e['title'] as String),Text(e['solarDate']!=null?"BS: ${e['solarDate']}":e['startsAt']!=null?"AD: ${e['startsAt']}":"Tithi: ${e['tithiYearBs']} / ${e['tithiMonthBs']} · ${e['tithiPaksha']} ${e['tithiNumber']} (conversion unavailable)"),Text("${e['eventType']} · ${e['audienceScope']} · ${e['lifecycleState']}"),if(e['description']!=null)Text(e['description'] as String),
  ])))),
  TextButton(onPressed:_busy?null:()=>_load(),child:const Text('Latest calendar events')),
  TextButton(onPressed:_busy||_next==null?null:()=>_load(_next),child:const Text('Older calendar events')),
 ]));
}
