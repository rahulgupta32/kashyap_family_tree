import 'package:flutter/material.dart';
import '../services/genealogy_api_service.dart';
import '../services/calendar_time.dart';
import '../widgets/heritage.dart';
import 'calendar_session_guard.dart';

class CalendarEventDetailScreen extends StatefulWidget {
  final GenealogyApiService api;
  final String eventId;
  final Future<void> Function(Map<String, dynamic>)? onEdit, onCancel;
  const CalendarEventDetailScreen(
      {super.key,
      required this.api,
      required this.eventId,
      this.onEdit,
      this.onCancel});
  @override
  State<CalendarEventDetailScreen> createState() =>
      _CalendarEventDetailScreenState();
}

class _CalendarEventDetailScreenState extends State<CalendarEventDetailScreen>
    with CalendarSessionGuard<CalendarEventDetailScreen> {
  @override
  GenealogyApiService get calendarApi => widget.api;
  Map<String, dynamic>? _event;
  List<Map<String, dynamic>>? _history;
  bool _busy = false, _historyFailed = false;
  String? _error;
  int _epoch = 0;
  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void clearCalendarSession() {
    _epoch++;
    _event = null;
    _history = null;
    _error = calendarSessionChanged;
    _busy = false;
  }

  Future<void> _load() async {
    if (!checkCalendarSession()) return;
    final epoch = ++_epoch;
    setState(() {
      _busy = true;
      _event = null;
      _history = null;
      _error = null;
      _historyFailed = false;
    });
    try {
      final event = await widget.api.getCalendarEvent(widget.eventId);
      if (!checkCalendarSession() || epoch != _epoch) return;
      setState(() => _event = event);
      if (event['canManage'] == true) {
        try {
          final rows = await widget.api.getCalendarEventHistory(widget.eventId);
          if (checkCalendarSession() && epoch == _epoch) {
            setState(() => _history = rows);
          }
        } catch (_) {
          if (checkCalendarSession() && epoch == _epoch) {
            setState(() => _historyFailed = true);
          }
        }
      }
    } catch (_) {
      if (checkCalendarSession() && epoch == _epoch) {
        setState(() => _error =
            'कार्यक्रम उपलब्ध छैन वा हेर्ने अनुमति छैन। (Event unavailable or access denied.)');
      }
    } finally {
      if (checkCalendarSession() && epoch == _epoch) {
        setState(() => _busy = false);
      }
    }
  }

  Future<void> _rsvp(String response) async {
    if (_busy || !checkCalendarSession()) return;
    setState(() => _busy = true);
    try {
      await widget.api.rsvpEvent(widget.eventId, response);
      if (checkCalendarSession()) await _load();
    } catch (_) {
      if (checkCalendarSession()) {
        setState(() {
          _error =
              'उपस्थिति सुरक्षित भएन। फेरि लोड गर्नुहोस्। (RSVP not confirmed. Reload before retrying.)';
          _busy = false;
        });
      }
    }
  }

  Future<void> _manage(
      Future<void> Function(Map<String, dynamic>) action) async {
    if (_busy || _event == null || !checkCalendarSession()) return;
    setState(() => _busy = true);
    try { await action(_event!); if (checkCalendarSession()) await _load(); }
    catch (_) { if (checkCalendarSession()) setState(() { _busy=false; _error='कार्य पुष्टि भएन। पुनः लोड गर्नुहोस्। (Action unconfirmed. Reload.)'; }); }
  }

  @override
  Widget build(BuildContext context) {
    final event = _event;
    return Scaffold(
        appBar: AppBar(
            title: const Text('कार्यक्रम विवरण (Event details)'),
            actions: [
              IconButton(
                  tooltip: 'Reload event',
                  onPressed: _busy || !calendarSessionCurrent ? null : _load,
                  icon: const Icon(Icons.refresh)),
            ]),
        body: !calendarSessionCurrent
            ? const Center(child: Text(calendarSessionChanged))
            : ListView(padding: const EdgeInsets.all(20), children: [
                if (_busy) const LinearProgressIndicator(),
                if (_error != null)
                  HeritageEmpty(
                      icon: Icons.event_busy_outlined,
                      message: _error!,
                      action: TextButton(
                          onPressed: _busy ? null : _load,
                          child: const Text('Retry'))),
                if (event != null) ...[
                  HeritageHeading(event['title'] as String,
                      icon: Icons.event_outlined),
                  Card(
                      child: Padding(
                          padding: const EdgeInsets.all(18),
                          child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(event['lifecycleState'] == 'CANCELLED'
                                    ? 'रद्द भएको (Cancelled)'
                                    : 'सक्रिय (Active)'),
                                const SizedBox(height: 12),
                                if (event['startsAt'] is String)
                                  Text(formatNepalInstant(
                                      event['startsAt'] as String)),
                                if (event['solarDate'] is String)
                                  Text(
                                      'विक्रम संवत् (BS): ${event['solarDate']}'),
                                if (event['startsAt'] == null &&
                                    event['solarDate'] == null)
                                  const Text(
                                      'तिथिमा आधारित · मिति रूपान्तरण उपलब्ध छैन (Tithi-based; date conversion unavailable)'),
                                if (event['description'] is String &&
                                    event['description'].isNotEmpty)
                                  Padding(
                                      padding: const EdgeInsets.only(top: 12),
                                      child:
                                          Text(event['description'] as String)),
                                if (event['location'] is String &&
                                    event['location'].isNotEmpty)
                                  Padding(
                                      padding: const EdgeInsets.only(top: 12),
                                      child: Text(
                                          'स्थान (Venue): ${event['location']}')),
                                if (event['rsvpCounts'] is Map)
                                  Text(
                                      'उपस्थिति (Attendance): ${event['rsvpCounts']['going']} Going · ${event['rsvpCounts']['maybe']} Maybe · ${event['rsvpCounts']['declined']} Declined'),
                              ]))),
                  if (event['lifecycleState'] != 'CANCELLED')
                    Wrap(spacing: 8, children: [
                      for (final option in const {
                        'GOING': 'जानेछु (Going)',
                        'MAYBE': 'सम्भवतः (Maybe)',
                        'DECLINED': 'जान्न (Decline)'
                      }.entries)
                        ChoiceChip(
                            key: ValueKey('detail-rsvp-${option.key}'),
                            label: Text(option.value),
                            selected: event['myRsvp'] == option.key,
                            onSelected:
                                _busy ? null : (_) => _rsvp(option.key)),
                    ]),
                  if (event['canManage'] == true) ...[
                    if (event['lifecycleState'] != 'CANCELLED')
                      Wrap(children: [
                        if (widget.onEdit != null)
                          TextButton(
                              onPressed:
                                  _busy ? null : () => _manage(widget.onEdit!),
                              child: const Text('सम्पादन (Edit event)')),
                        if (widget.onCancel != null)
                          TextButton(
                              onPressed: _busy
                                  ? null
                                  : () => _manage(widget.onCancel!),
                              child:
                                  const Text('रद्द गर्नुहोस् (Cancel event)')),
                      ]),
                    const HeritageHeading('कार्यक्रम इतिहास · Event history',
                        icon: Icons.history),
                    if (_historyFailed)
                      const Text('इतिहास उपलब्ध छैन। (History unavailable.)'),
                    if (_history != null && _history!.isEmpty)
                      const Text('इतिहास खाली छ। (No history.)'),
                    for (final row in _history ?? <Map<String, dynamic>>[])
                      Card(
                          child: ListTile(
                        title: Text('v${row['version']} · ${row['action']}'),
                        subtitle: Text(row['createdAt'] is String
                            ? formatNepalInstant(row['createdAt'] as String)
                            : ''),
                      )),
                  ],
                ],
              ]));
  }
}
