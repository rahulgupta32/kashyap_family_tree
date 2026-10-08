import 'package:flutter/material.dart';
import '../models/person.dart';
import '../services/genealogy_api_service.dart';

class CalendarAudiencePicker extends StatefulWidget {
  final GenealogyApiService api;
  const CalendarAudiencePicker({super.key, required this.api});
  @override
  State<CalendarAudiencePicker> createState() => _CalendarAudiencePickerState();
}

class _CalendarAudiencePickerState extends State<CalendarAudiencePicker> {
  final _generation = TextEditingController();
  final _query = TextEditingController();
  String _type = 'BRANCH';
  String? _branch;
  PersonSummary? _ancestor;
  List<dynamic> _branches = [];
  List<PersonSummary> _roots = [];
  Map<String, dynamic>? _preview;
  String? _error;
  bool _busy = false;
  int _epoch = 0;

  @override
  void initState() { super.initState(); _loadBranches(); }
  @override
  void dispose() { _epoch++; _generation.dispose(); _query.dispose(); super.dispose(); }

  void _change(VoidCallback change) {
    _epoch++;
    setState(() {change(); _preview = null; _error = null; _busy = false;});
  }
  Future<void> _loadBranches() async {
    final epoch = ++_epoch;
    setState(() => _busy = true);
    try {
      final result = await widget.api.requestJson('/genealogy/branches');
      if (mounted && epoch == _epoch) setState(() => _branches = result as List);
    } catch (e) { if (mounted && epoch == _epoch) setState(() => _error = e.toString()); }
    finally { if (mounted && epoch == _epoch) setState(() => _busy = false); }
  }
  Map<String, dynamic>? _selection() {
    if (_type == 'DESCENDANTS') return _ancestor == null ? null : {'type': _type, 'ancestorPersonId': _ancestor!.id};
    if (_branch == null) return null;
    if (_type == 'GENERATION') {
      final generation = int.tryParse(_generation.text);
      if (generation == null || generation < 1 || generation > 100) return null;
      return {'type': _type, 'branchId': _branch, 'generation': generation};
    }
    return {'type': _type, 'branchId': _branch};
  }
  Future<void> _search() async {
    final epoch = ++_epoch, token = widget.api.authToken;
    setState(() {_busy = true; _error = null; _roots = [];});
    try {
      final roots = await widget.api.searchPersons(query: _query.text.trim());
      if (mounted && epoch == _epoch && token == widget.api.authToken) setState(() => _roots = roots);
    } catch(e) {if (mounted && epoch == _epoch) setState(() => _error = e.toString());}
    finally {if (mounted && epoch == _epoch) setState(() => _busy = false);}
  }
  Future<void> _resolve() async {
    final selection = _selection();
    if (selection == null) {setState(() => _error = 'समूह छान्नुहोस् (Choose a valid audience)'); return;}
    final epoch = ++_epoch, token = widget.api.authToken;
    setState(() {_busy = true; _error = null; _preview = null;});
    try {
      final result = await widget.api.requestJson('/calendar/events/preview', method: 'POST', data: {
        'audienceScope': 'INVITED_ONLY', 'audienceSelection': selection,
      });
      if (!mounted || epoch != _epoch) return;
      if (token != widget.api.authToken) {setState(() => _error = 'सत्र परिवर्तन भयो, फेरि पूर्वावलोकन गर्नुहोस् (Session changed; preview again)'); return;}
      setState(() => _preview = Map<String, dynamic>.from(result as Map));
    } catch(e) {if (mounted && epoch == _epoch) setState(() => _error = e.toString());}
    finally {if (mounted && epoch == _epoch) setState(() => _busy = false);}
  }
  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('आमन्त्रित समूह (Invitation audience)')),
    body: SingleChildScrollView(padding: const EdgeInsets.all(16), child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      DropdownButtonFormField<String>(initialValue: _type, decoration: const InputDecoration(labelText: 'छनोट विधि (Selection method)'),
        items: const [DropdownMenuItem(value: 'BRANCH', child: Text('शाखा (Branch)')), DropdownMenuItem(value: 'GENERATION', child: Text('पुस्ता (Generation)')),
          DropdownMenuItem(value: 'DESCENDANTS', child: Text('वंशज (Descendants)'))],
        onChanged: _busy ? null : (value) => _change(() {_type = value!; _ancestor = null; _roots = [];})),
      if (_type != 'DESCENDANTS') DropdownButtonFormField<String>(initialValue: _branch, decoration: const InputDecoration(labelText: 'आमन्त्रण शाखा (Invitation branch)'),
        items: _branches.map((b) => DropdownMenuItem<String>(value: b['id'] as String, child: Text('${b['nameNepali']} / ${b['nameEnglish']}'))).toList(),
        onChanged: _busy ? null : (value) => _change(() => _branch = value)),
      if (_type != 'DESCENDANTS' && _branches.isEmpty) TextButton(onPressed: _busy ? null : _loadBranches, child: const Text('शाखा फेरि लोड गर्नुहोस् (Reload branches)')),
      if (_type == 'GENERATION') TextField(controller: _generation, enabled: !_busy, keyboardType: TextInputType.number,
        decoration: const InputDecoration(labelText: 'पुस्ता १–१०० (Generation 1–100)'), onChanged: (_) => _change(() {})),
      if (_type == 'DESCENDANTS') ...[
        TextField(controller: _query, enabled: !_busy, decoration: const InputDecoration(labelText: 'पूर्वज खोज्नुहोस् (Find ancestor)'),
          onChanged: (_) => _change(() {_ancestor = null; _roots = [];})),
        TextButton(onPressed: _busy || _query.text.trim().length < 2 ? null : _search, child: const Text('पूर्वज खोज्नुहोस् (Search ancestor)')),
        for (final root in _roots) Semantics(selected: _ancestor?.id == root.id, child: ListTile(title: Text('${root.primaryNameNepali} / ${root.primaryNameEnglish ?? ''}'),
          subtitle: Text('पुस्ता (Generation): ${root.generation}${_ancestor?.id == root.id ? ' · Selected ancestor' : ''}'),
          selected: _ancestor?.id == root.id, onTap: _busy ? null : () => _change(() => _ancestor = root))),
      ],
      const SizedBox(height: 12),
      const Text('प्रमाणित योग्य खाताहरू मात्र समावेश हुन्छन्। वंशज छनोटमा पूर्वज स्वयं र निजी वा संरक्षित अभिलेखका मार्ग समावेश हुँदैनन्। (Only eligible verified accounts are included; descendants exclude the ancestor and paths through private or protected records.)'),
      const Text('स्वीकृत सम्बन्ध समूह उपलब्ध छैनन्। (Authority-defined relationship groups are unavailable.)'),
      if (_error != null) Text(_error!, style: const TextStyle(color: Colors.red)),
      if (_busy) const LinearProgressIndicator(),
      TextButton(onPressed: _busy ? null : _resolve, child: const Text('समूह पूर्वावलोकन (Preview audience)')),
      if (_preview != null) ...[
        Text('आमन्त्रित खाताहरू (Recipient accounts): ${_preview!['recipientCount']}'),
        Text('म्याद (Expires): ${_preview!['expiresAt']}'),
        for (final recipient in _preview!['recipients'] as List) Text(recipient['name'] as String),
        ElevatedButton(onPressed: _busy || _preview!['recipientCount'] == 0 ? null : () {
          final expires = DateTime.tryParse(_preview!['expiresAt'] as String);
          if (expires == null || !expires.isAfter(DateTime.now())) {setState(() {_preview = null; _error = 'म्याद सकियो, फेरि पूर्वावलोकन गर्नुहोस् (Preview expired; preview again)';}); return;}
          Navigator.pop(context, {'audienceSelection': _preview!['selection'], 'audiencePreviewId': _preview!['previewId'], 'expiresAt': _preview!['expiresAt'], 'recipientCount': _preview!['recipientCount']});
        }, child: const Text('यो समूह प्रयोग गर्नुहोस् (Use audience)')),
      ],
    ])),
  );
}
