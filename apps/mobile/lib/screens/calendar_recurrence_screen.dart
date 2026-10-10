import 'dart:async';
import 'package:flutter/material.dart';
import '../services/genealogy_api_service.dart';

class CalendarRecurrenceScreen extends StatefulWidget {
  final GenealogyApiService api;
  final Map? source;
  const CalendarRecurrenceScreen({super.key, required this.api, this.source});
  @override
  State<CalendarRecurrenceScreen> createState() => _CalendarRecurrenceScreenState();
}

class _CalendarRecurrenceScreenState extends State<CalendarRecurrenceScreen> {
  final _reference = TextEditingController();
  final _reason = TextEditingController();
  final _time = TextEditingController(text: '09:00');
  final _year = TextEditingController();
  String? _owner, _policy, _next, _error;
  bool _busy = false, _queue = false, _consent = false, _expired = false;
  List<dynamic> _items = [];
  Map? _preview;
  Timer? _sessionWatch;

  @override
  void initState() {
    super.initState();
    _owner = widget.api.chatAccountId;
    final nepal = DateTime.now().toUtc().add(const Duration(hours: 5, minutes: 45));
    _year.text = '${nepal.year + 1}';
    _sessionWatch = Timer.periodic(const Duration(milliseconds: 500), (_) => _current());
    _run(() => _load());
  }
  bool _current() {
    if (!mounted) return false;
    if (_expired) return false;
    if (_owner == null || widget.api.chatAccountId != _owner) {
      setState(() {
        _expired = true; _items = []; _next = null; _preview = null;
        _reference.clear(); _reason.clear(); _time.clear(); _year.clear();
        _consent = false; _policy = null; _busy = false;
        _error = 'खाता बदलियो। फेरि खोल्नुहोस् (Session changed; reopen this screen)';
      });
      return false;
    }
    return true;
  }
  @override
  void dispose() {
    _sessionWatch?.cancel();
    for (final c in [_reference, _reason, _time, _year]) { c.dispose(); }
    super.dispose();
  }
  Future<dynamic> _request(String suffix, {Map<String, dynamic>? data}) {
    if (!_current()) throw StateError('Session changed');
    return widget.api.requestJson('/calendar/recurrences$suffix', method: data == null ? 'GET' : 'POST', data: data, boundAccountId: _owner);
  }
  Future<void> _load({bool more = false}) async {
    final query = Uri(queryParameters: {'queue': '$_queue', if (more && _next != null) 'after': _next!}).query;
    final page = await _request('?$query') as Map;
    if (!_current()) return;
    setState(() { _items = more ? [..._items, ...page['items'] as List] : page['items'] as List; _next = page['nextAfter'] as String?; });
  }
  Future<void> _run(Future<void> Function() action) async {
    if (_busy || !_current()) return;
    setState(() { _busy = true; _error = null; _preview = null; });
    try { await action(); }
    catch (e) { if (_current()) setState(() => _error = e.toString()); }
    finally { if (_current()) setState(() => _busy = false); }
  }
  Future<void> _propose() async {
    if (!_consent || _policy == null || _reference.text.trim().length < 10 || !RegExp(r'^([01]\d|2[0-3]):[0-5]\d$').hasMatch(_time.text)) {
      setState(() => _error = 'सहमति, नीति, समय र प्रमाण आवश्यक (Consent, policy, time and evidence required)'); return;
    }
    await _request('', data: {'sourceEventId': widget.source!['id'], 'sourceVersion': widget.source!['version'], 'localTime': _time.text, 'leapDayPolicy': _policy, 'sourceRef': _reference.text.trim(), 'consent': true});
    if (!_current()) return;
    setState(() { _consent = false; _reference.clear(); });
    await _load();
  }
  Future<void> _decide(Map row, String decision) async {
    final reason = _reason.text.trim();
    if (reason.length < 10) { setState(() => _error = 'कारण कम्तीमा १० अक्षर (Reason needs at least 10 characters)'); return; }
    await _request('/${row['id']}/decisions', data: {'version': row['version'], 'decision': decision, 'reason': reason});
    await _load();
  }
  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('वार्षिक निजी सम्झना (Annual reminders)')),
    body: ListView(padding: const EdgeInsets.all(16), children: [
      const Text('स्वतन्त्र स्वीकृति पछि मूल कार्यक्रमको अर्को वर्षदेखि निजी सम्झना। तिथि तथा सांस्कृतिक नियम उपलब्ध छैनन्। (Private reminders start the year after the source event, after independent approval. Cultural recurrence is unavailable.)'),
      if (_error != null) Text(_error!, key: const ValueKey('recurrence-error'), style: const TextStyle(color: Colors.red)),
      if (_busy) const LinearProgressIndicator(),
      if (!_expired) ...[
        if (widget.source != null) ...[
          Text('${widget.source!['title']} · v${widget.source!['version']}'),
          TextField(controller: _time, enabled: !_busy, decoration: const InputDecoration(labelText: 'नेपाल समय HH:mm (Nepal time)')),
          DropdownButtonFormField<String>(initialValue: _policy, decoration: const InputDecoration(labelText: 'फेब्रुअरी २९ नीति (Leap-day policy)'), items: const [
            DropdownMenuItem(value: 'SKIP_YEAR', child: Text('वर्ष छोड्ने (Skip non-leap year)')),
            DropdownMenuItem(value: 'FEBRUARY_28', child: Text('फेब्रुअरी २८ (February 28)')),
            DropdownMenuItem(value: 'MARCH_01', child: Text('मार्च १ (March 1)')),
          ], onChanged: _busy ? null : (v) => setState(() => _policy = v)),
          TextField(controller: _reference, enabled: !_busy, maxLength: 500, decoration: const InputDecoration(labelText: 'मिति प्रमाण सन्दर्भ (Date evidence reference)')),
          CheckboxListTile(value: _consent, title: const Text('निजी सम्झनामा सहमति (Consent to private reminders)'), onChanged: _busy ? null : (v) => setState(() => _consent = v ?? false)),
          TextButton(onPressed: _busy ? null : () => _run(_propose), child: const Text('स्वीकृतिका लागि प्रस्ताव (Propose for approval)')),
        ],
        SwitchListTile(value: _queue, title: const Text('स्वतन्त्र समीक्षा (Independent review queue)'), subtitle: const Text('अधिकृत Super Admin मात्र (Authorized Super Admin only)'), onChanged: _busy ? null : (v) { setState(() { _queue = v; _items = []; _next = null; }); _run(() => _load()); }),
        TextField(controller: _reason, enabled: !_busy, maxLength: 1000, decoration: const InputDecoration(labelText: 'निर्णय वा फिर्ताको कारण (Decision or withdrawal reason)')),
        TextField(controller: _year, enabled: !_busy, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'AD वर्ष 2000–2090 (Preview year)')),
        TextButton(onPressed: _busy ? null : () => _run(() => _load()), child: const Text('पुनः लोड (Reload proposals)')),
        if (_preview != null) Text('${_preview!['year']}: ${_preview!['startsAt'] ?? 'यो वर्ष सम्झना छैन (No occurrence)'} · Asia/Kathmandu · ${_preview!['deliveryEnabled'] == true ? 'पठाउन योग्य (Delivery eligible)' : 'पठाइँदैन (Delivery blocked)'}', key: const ValueKey('recurrence-preview')),
        ..._items.map((row) => Card(child: Padding(padding: const EdgeInsets.all(12), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('${row['source_date']} · ${row['local_time']} Asia/Kathmandu · ${row['leap_policy']} · ${row['state']} · v${row['version']}'),
          Text('${row['source_ref']}'),
          Text('मूल कार्यक्रम (Source): ${row['source_event_id']} · v${row['source_version']}'),
          Wrap(children: [
            TextButton(onPressed: _busy ? null : () => _run(() async {
              final year = _year.text.trim();
              if (!RegExp(r'^\d{4}$').hasMatch(year) || int.parse(year) < 2000 || int.parse(year) > 2090) throw const FormatException('Supported AD year required');
              final preview = await _request('/${row['id']}/preview?year=$year') as Map;
              if (_current()) setState(() => _preview = preview);
            }), child: const Text('पूर्वावलोकन (Preview)')),
            if (_queue) ...['APPROVED', 'REJECTED'].map((decision) => TextButton(onPressed: _busy ? null : () => _run(() => _decide(row as Map, decision)), child: Text(decision == 'APPROVED' ? 'स्वीकृत (Approve)' : 'अस्वीकृत (Reject)')))
            else if (['PENDING', 'APPROVED'].contains(row['state'])) TextButton(onPressed: _busy ? null : () => _run(() => _decide(row as Map, 'WITHDRAWN')), child: const Text('सहमति फिर्ता (Withdraw)')),
          ]),
        ])))),
        if (_next != null) TextButton(onPressed: _busy ? null : () => _run(() => _load(more: true)), child: const Text('थप प्रस्ताव (More proposals)')),
      ],
    ]),
  );
}
