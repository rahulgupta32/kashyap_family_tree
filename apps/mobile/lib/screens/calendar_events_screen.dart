import 'package:flutter/material.dart';
import '../services/genealogy_api_service.dart';

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

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('सांस्कृतिक तथा पारिवारिक पात्रो (Calendar)'),
        actions: [
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
                                Text('मिति: ${ev['solarDate'] ?? 'तिथि आधारित'} • दायरा: ${ev['audienceScope']}'),
                                if (ev['location'] != null) Text('स्थान: ${ev['location']}'),
                                if (widget.apiService.authToken != null)
                                  Wrap(spacing: 8, children: [
                                    for (final option in const {'GOING': 'जानेछु (Going)', 'MAYBE': 'सम्भवतः (Maybe)', 'DECLINED': 'जान्न (Decline)'}.entries)
                                      ChoiceChip(
                                        key: ValueKey('rsvp-${ev['id']}-${option.key}'),
                                        label: Text(option.value),
                                        selected: ev['myRsvp'] == option.key,
                                        onSelected: _savingRsvps.contains(ev['id']) ? null
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
