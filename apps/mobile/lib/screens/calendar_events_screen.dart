import 'package:flutter/material.dart';
import '../services/genealogy_api_service.dart';
import '../localization/calendar_labels.dart';

class CalendarEventsScreen extends StatefulWidget {
  final GenealogyApiService apiService;

  const CalendarEventsScreen({super.key, required this.apiService});

  @override
  State<CalendarEventsScreen> createState() => _CalendarEventsScreenState();
}

class _CalendarEventsScreenState extends State<CalendarEventsScreen> {
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
    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final events = await widget.apiService.getCalendarEvents();
      if (mounted) { setState(() {
        _events = events;
      }); }
    } catch (e) {
      if (mounted) { setState(() {
        _error = e.toString().replaceAll('Exception: ', '');
      }); }
    } finally {
      if (mounted) { setState(() {
        _loading = false;
      }); }
    }
  }

  Future<void> _rsvp(String eventId, String response) async {
    setState(() => _savingRsvps.add(eventId));
    try {
      await widget.apiService.rsvpEvent(eventId, response);
      final events = await widget.apiService.getCalendarEvents();
      if (mounted) { setState(() => _events = events); }
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(error.toString())));
      }
    } finally {
      if (mounted) { setState(() => _savingRsvps.remove(eventId)); }
    }
  }

  Future<void> _create() async {
    final title = TextEditingController();
    DateTime? selected;
    var reminder = false;
    var busy = false;
    String? error;
    try {
      await showDialog<void>(context: context, builder: (dialogContext) => StatefulBuilder(builder: (context, update) => AlertDialog(
        title: Text(calendarLabels['create']!),
        content: SingleChildScrollView(child: Column(mainAxisSize: MainAxisSize.min, children: [
          TextField(controller: title, decoration: InputDecoration(labelText: calendarLabels['title'])),
          TextButton(onPressed: busy ? null : () async {
            final date = await showDatePicker(context: context, initialDate: DateTime.now().add(const Duration(days: 1)),
              firstDate: DateTime.now(), lastDate: DateTime(2100));
            if (date == null || !context.mounted) return;
            final time = await showTimePicker(context: context, initialTime: const TimeOfDay(hour: 10, minute: 0));
            if (time != null && context.mounted) update(() => selected = DateTime(date.year, date.month, date.day, time.hour, time.minute));
          }, child: Text(selected?.toString() ?? calendarLabels['time']!)),
          CheckboxListTile(title: Text(calendarLabels['reminder']!), value: reminder, onChanged: busy ? null : (value) => update(() => reminder = value ?? false)),
          Text(calendarLabels['dateNote']!),
          if(error != null) Text(error!, style: const TextStyle(color: Colors.red)),
        ])),
        actions: [
          TextButton(onPressed: busy ? null : () => Navigator.pop(dialogContext), child: Text(calendarLabels['close']!)),
          TextButton(onPressed: busy ? null : () async {
            if(title.text.trim().isEmpty || selected == null) {update(() => error = calendarLabels['required']); return;}
            update(() {busy = true; error = null;});
            try {
              await widget.apiService.requestJson('/calendar/events', method: 'POST', body: {
                'title': title.text.trim(), 'eventType': 'GENERAL_EVENT', 'audienceScope': 'COMMUNITY',
                'startsAt': selected!.toUtc().toIso8601String(), 'reminderOffsets': reminder ? [60] : <int>[],
              });
              if(dialogContext.mounted) Navigator.pop(dialogContext);
              await _loadEvents();
            } catch(e) {if(dialogContext.mounted) update(() {busy = false; error = e.toString();});}
          }, child: Text(calendarLabels['save']!)),
        ],
      )));
    } finally {title.dispose();}
  }

  Future<void> _manage(Map event, {bool cancel = false}) async {
    final controller = TextEditingController(text: cancel ? '' : event['title'] as String? ?? '');
    final result = await showDialog<String>(context: context, builder: (context) => AlertDialog(
      title: Text(calendarLabels[cancel ? 'cancel' : 'edit']!),
      content: TextField(controller: controller, decoration: InputDecoration(labelText: calendarLabels[cancel ? 'reason' : 'title'])),
      actions: [TextButton(onPressed: () => Navigator.pop(context), child: Text(calendarLabels['close']!)),
        TextButton(onPressed: () => Navigator.pop(context, controller.text.trim()), child: Text(calendarLabels['save']!))],
    ));
    controller.dispose();
    if(result == null || !mounted) return;
    try {
      await widget.apiService.requestJson('/calendar/events/${event['id']}${cancel ? '/cancel' : ''}', method: cancel ? 'POST' : 'PATCH',
        body: {'version': event['version'], (cancel ? 'reason' : 'title'): result});
      await _loadEvents();
    } catch(e) {if(mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));}
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('सांस्कृतिक तथा पारिवारिक पात्रो (Calendar)'),
        actions: [
          IconButton(tooltip: calendarLabels['create'], onPressed: _create, icon: const Icon(Icons.add)),
          IconButton(onPressed: _loadEvents, icon: const Icon(Icons.refresh)),
        ],
      ),
      body: _loading
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
                        ElevatedButton(onPressed: _loadEvents, child: const Text('पुनः प्रयास गर्नुहोस्')),
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
