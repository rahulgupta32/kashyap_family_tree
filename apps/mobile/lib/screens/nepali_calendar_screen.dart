import 'package:flutter/material.dart';
import '../services/bs_calendar.dart';
import '../services/bs_calendar_data.dart';
import '../services/genealogy_api_service.dart';
import 'calendar_event_detail_screen.dart';
import 'calendar_events_screen.dart';
import 'calendar_session_guard.dart';

class NepaliCalendarScreen extends StatefulWidget {
  const NepaliCalendarScreen({super.key, required this.api});
  final GenealogyApiService api;

  @override
  State<NepaliCalendarScreen> createState() => _NepaliCalendarScreenState();
}

class _NepaliCalendarScreenState extends State<NepaliCalendarScreen>
    with CalendarSessionGuard<NepaliCalendarScreen> {
  static const _months = ['वैशाख','जेठ','असार','साउन','भदौ','असोज',
    'कार्तिक','मंसिर','पुस','माघ','फागुन','चैत'];
  static const _weekdays = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  late BsDay? _day;
  var _request = 0;
  var _loading = false;
  var _failed = false;
  var _events = <Map>[];
  var _counts = <String,int>{};

  @override
  GenealogyApiService get calendarApi => widget.api;

  @override
  void initState() {
    super.initState();
    _day = BsDay.today();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _load();
    });
  }

  @override
  void clearCalendarSession() {
    _request++;
    _events = [];
    _counts = {};
    _loading = false;
  }

  Future<Map> _period(String source, String view, String date) async {
    final query = Uri(queryParameters:{'source':source,'view':view,'date':date}).query;
    return await widget.api.requestJson('/calendar/period?$query') as Map;
  }

  Future<void> _load() async {
    final day = _day;
    if (day == null || !calendarSessionCurrent) return;
    final request = ++_request;
    setState(() { _loading = true; _failed = false; _events = []; _counts = {}; });
    try {
      final ad = day.ad!.toIso8601String().substring(0,10);
      final results = await Future.wait([
        _period('BS','MONTH',BsDay(day.year,day.month,1).iso),
        _period('BS','DAY',day.iso),
        _period('AD','DAY',ad),
      ]);
      if (!mounted || request != _request || !calendarSessionCurrent) return;
      final events = <Object?,Map>{
        for (final result in results.skip(1))
          for (final event in (result['items'] as List).cast<Map>()) event['id']:event,
      };
      setState(() {
        _counts = {for (final cell in (results.first['days'] as List).cast<Map>())
          cell['date'] as String:(cell['count'] as num).toInt()};
        _events = events.values.toList();
      });
    } catch (_) {
      if (mounted && request == _request && calendarSessionCurrent) {
        setState(() => _failed = true);
      }
    } finally {
      if (mounted && request == _request && calendarSessionCurrent) {
        setState(() => _loading = false);
      }
    }
  }

  void _select(BsDay day) {
    setState(() => _day = day);
    _load();
  }

  @override
  Widget build(BuildContext context) {
    final day = _day;
    return Scaffold(
      appBar: AppBar(title: const Text('पारिवारिक पात्रो · Calendar')),
      body: day == null
          ? const Center(child: Text('यो मिति उपलब्ध छैन · Date outside calendar coverage'))
          : ListView(padding: const EdgeInsets.all(16), children: [
              _month(context,day),
              const SizedBox(height: 16),
              const Text('दैनिक कार्यसूची · Day agenda'),
              Text('${day.iso} BS · ${_adLabel(context,day.ad!)} AD',
                  style: Theme.of(context).textTheme.titleLarge),
              const Text('तिथि र पर्वको तथ्याङ्क उपलब्ध छैन · Tithi and observance data unavailable'),
              if (!calendarSessionCurrent)
                const Text('पारिवारिक कार्यक्रमका लागि साइन इन गर्नुहोस् · Sign in for family events')
              else if (_loading)
                const LinearProgressIndicator()
              else if (_failed)
                TextButton(onPressed: _load,
                  child: const Text('कार्यक्रम लोड भएन · Retry family events'))
              else if (_events.isEmpty)
                const Text('यस दिन कुनै पारिवारिक कार्यक्रम छैन · No family events for this day'),
              for (final event in _events)
                ListTile(title: Text(event['title'] as String),
                  onTap: () {
                    if (!calendarSessionCurrent) return;
                    Navigator.push(context,MaterialPageRoute(builder: (_) =>
                      CalendarEventDetailScreen(api: widget.api,eventId:event['id'] as String)));
                  }),
              if (calendarSessionCurrent)
                OutlinedButton(
                  onPressed: () => Navigator.push(context,MaterialPageRoute(builder: (_) =>
                    CalendarEventsScreen(apiService:widget.api, preferredAdDate: day.ad))),
                  child: const Text('पारिवारिक कार्यक्रम · Manage family events')),
            ]),
    );
  }

  String _adLabel(BuildContext context, DateTime date) =>
      MaterialLocalizations.of(context).formatShortDate(date);

  Widget _month(BuildContext context, BsDay selected) {
    final year=selected.year, month=selected.month;
    final first=BsDay(year,month,1).ad!;
    final count=bsMonths[year]![month-1];
    final last=first.add(Duration(days:count-1));
    final previous=BsDay.fromAd(first.subtract(const Duration(days:1)));
    final next=BsDay.fromAd(last.add(const Duration(days:1)));
    final today=BsDay.today();
    final offset=first.weekday % 7;
    final cells=((offset+count+6)~/7)*7;
    return Column(crossAxisAlignment:CrossAxisAlignment.stretch,children:[
      Row(children:[
        IconButton(tooltip:'Previous month',onPressed:previous==null?null:() =>
          _select(BsDay(previous.year,previous.month,1)),icon:const Icon(Icons.chevron_left)),
        Expanded(child:Text('${_months[month-1]} $year BS',textAlign:TextAlign.center,
          style:Theme.of(context).textTheme.headlineSmall)),
        IconButton(tooltip:'Next month',onPressed:next==null?null:()=>_select(next),
          icon:const Icon(Icons.chevron_right)),
      ]),
      Text('${_adLabel(context,first)} – ${_adLabel(context,last)} AD',
        textAlign:TextAlign.center),
      Wrap(alignment:WrapAlignment.center,spacing:12,children:[
        TextButton(onPressed:today==null?null:()=>_select(today),
          child:const Text('आज · Today')),
        DropdownButton<int>(value:year,items:bsMonths.keys.map((y)=>
          DropdownMenuItem(value:y,child:Text('$y BS'))).toList(),
          onChanged:(value){if(value!=null)_select(BsDay(value,month,1));}),
        DropdownButton<int>(value:month,items:List.generate(12,(i)=>
          DropdownMenuItem(value:i+1,child:Text(_months[i]))),
          onChanged:(value){if(value!=null)_select(BsDay(year,value,1));}),
      ]),
      Row(children:[for(final name in _weekdays) Expanded(child:
        Center(child:Text(name,style:Theme.of(context).textTheme.labelSmall)))]),
      for(var row=0;row<cells;row+=7)
        IntrinsicHeight(child: Row(crossAxisAlignment:CrossAxisAlignment.stretch,children:[
          for(var col=0;col<7;col++) Expanded(child:_cell(context,
            first.add(Duration(days:row+col-offset)),selected,today)),
        ])),
    ]);
  }

  Widget _cell(BuildContext context, DateTime ad, BsDay selected, BsDay? today) {
    final bs = BsDay.fromAd(ad);
    if (bs == null) return const SizedBox(height:48);
    final adjacent = bs.month != selected.month;
    final active = bs.iso == selected.iso;
    final isToday = bs.iso == today?.iso;
    final hasEvents = (_counts[bs.iso]??0)>0;
    final theme = Theme.of(context);
    return Semantics(
      selected:active,
      label:'${bs.iso} BS, ${_adLabel(context,ad)} AD'
        '${isToday?', today':''}${adjacent?', adjacent month':''}${hasEvents?', has family events':''}',
      child: InkWell(
        onTap:()=>_select(bs),
        child: ExcludeSemantics(child: Container(
          constraints:const BoxConstraints(minHeight:48),
          padding:const EdgeInsets.symmetric(vertical:4),
          decoration:BoxDecoration(
            border:Border.all(color:active?theme.colorScheme.primary:theme.dividerColor,
              width:active?2:0.5),
            color:active?theme.colorScheme.primaryContainer:null,
          ),
          child:Column(mainAxisAlignment:MainAxisAlignment.center,children:[
            Text('${bs.day}',style:theme.textTheme.bodyMedium?.copyWith(
              fontWeight:isToday?FontWeight.bold:null,
              decoration:adjacent?TextDecoration.underline:null)),
            Text('${ad.month}/${ad.day}',style:theme.textTheme.labelSmall),
            if(isToday) const Icon(Icons.today,size:12),
            if(hasEvents) const Icon(Icons.event,size:12),
          ]),
        )),
      ),
    );
  }
}
