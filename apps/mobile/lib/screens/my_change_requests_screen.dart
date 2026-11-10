import 'package:flutter/material.dart';
import '../services/genealogy_api_service.dart';

const _correctableTypes = {
  'EDIT_PERSON',
  'RECORD_DEATH',
  'ADD_CHILD',
  'ADD_SPOUSE',
  'ADD_SPOUSE_LINK'
};
bool _spouseProposal(Object? type) =>
    type == 'ADD_SPOUSE' || type == 'ADD_SPOUSE_LINK';
bool _existingRelative(Map proposal, Object? type) => _spouseProposal(type)
    ? proposal['spousePersonId'] != null || proposal['spouseId'] != null
    : proposal['childPersonId'] != null;

/// Member proposals only; administration remains in the authorized portal.
class MyChangeRequestsScreen extends StatefulWidget {
  final GenealogyApiService api;
  final String? initialId;
  const MyChangeRequestsScreen({super.key, required this.api, this.initialId});
  @override
  State<MyChangeRequestsScreen> createState() => _MyChangeRequestsScreenState();
}

class _MyChangeRequestsScreenState extends State<MyChangeRequestsScreen> {
  late final int _session;
  late final String? _owner;
  final _birth = TextEditingController(),
      _occupation = TextEditingController(),
      _reason = TextEditingController(),
      _deathDate = TextEditingController(),
      _deathYear = TextEditingController(),
      _childNepali = TextEditingController(),
      _childEnglish = TextEditingController();
  String? _childGender;
  List<Map<String, dynamic>> _items = [];
  Map<String, dynamic>? _selected;
  String? _id, _error;
  bool _busy = false, _expired = false;
  int _epoch = 0;
  bool get _current =>
      mounted &&
      !_expired &&
      widget.api.pushSessionGeneration == _session &&
      widget.api.chatAccountId == _owner &&
      _owner != null;
  @override
  void initState() {
    super.initState();
    _session = widget.api.pushSessionGeneration;
    _owner = widget.api.chatAccountId;
    _id = widget.initialId;
    widget.api.sessionChanges.addListener(_changed);
    _load();
  }

  void _clear() {
    _items = [];
    _selected = null;
    _birth.clear();
    _occupation.clear();
    _reason.clear();
    _deathDate.clear();
    _deathYear.clear();
    _childNepali.clear();
    _childEnglish.clear();
    _childGender = null;
  }

  void _changed() {
    if (mounted && !_current) {
      setState(() {
        _expired = true;
        _epoch++;
        _clear();
        _busy = false;
        _error = 'सत्र बदलियो (Session changed)';
      });
    }
  }

  @override
  void dispose() {
    widget.api.sessionChanges.removeListener(_changed);
    _birth.dispose();
    _occupation.dispose();
    _reason.dispose();
    _deathDate.dispose();
    _deathYear.dispose();
    _childNepali.dispose();
    _childEnglish.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    if (!_current) return;
    final epoch = ++_epoch;
    setState(() {
      _busy = true;
      _error = null;
      _clear();
    });
    try {
      if (_id == null) {
        final result = await widget.api
            .requestJson('/change-requests', boundAccountId: _owner);
        if (result is! List) throw const FormatException();
        final rows = result
            .whereType<Map>()
            .where((r) => r['requesterUserId'] == _owner)
            .map((r) => Map<String, dynamic>.from(r))
            .toList();
        if (_current && epoch == _epoch) setState(() => _items = rows);
      } else {
        final result = await widget.api.requestJson(
            '/change-requests/${Uri.encodeComponent(_id!)}',
            boundAccountId: _owner);
        if (result is! Map ||
            result['id'] != _id ||
            result['requesterUserId'] != _owner ||
            result['proposedChanges'] is! Map ||
            result['status'] is! String) {
          throw const FormatException();
        }
        if (_current && epoch == _epoch) {
          setState(() {
            _selected = Map<String, dynamic>.from(result);
            _birth.text =
                result['proposedChanges']['birthPlace']?.toString() ?? '';
            _occupation.text =
                result['proposedChanges']['occupation']?.toString() ?? '';
            _reason.text = result['reason']?.toString() ?? '';
            _childNepali.text =
                result['proposedChanges']['primaryNameNepali']?.toString() ??
                    '';
            _childEnglish.text =
                result['proposedChanges']['primaryNameEnglish']?.toString() ??
                    '';
            final gender = result['proposedChanges']['gender'];
            _childGender = {'MALE', 'FEMALE', 'OTHER'}.contains(gender)
                ? gender as String
                : null;
            _deathDate.text =
                result['proposedChanges']['deathDateBs']?.toString() ?? '';
            _deathYear.text =
                result['proposedChanges']['deathYearBs']?.toString() ?? '';
          });
        }
      }
    } catch (_) {
      if (_current && epoch == _epoch) {
        setState(() => _error =
            'अनुरोध उपलब्ध छैन वा अनुमति छैन। (Request unavailable or access denied.)');
      }
    } finally {
      if (_current && epoch == _epoch) setState(() => _busy = false);
    }
  }

  Future<void> _resubmit() async {
    final row = _selected;
    if (!_current ||
        _busy ||
        row == null ||
        !_correctableTypes.contains(row['type']) ||
        !{'CORRECTION_REQUESTED', 'CONFLICT_DETECTED'}
            .contains(row['status'])) {
      return;
    }
    if (_reason.text.trim().isEmpty) {
      setState(() => _error = 'कारण आवश्यक छ (Reason is required)');
      return;
    }
    final proposed = Map<String, dynamic>.from(row['proposedChanges'] as Map);
    if (row['type'] == 'ADD_CHILD' || _spouseProposal(row['type'])) {
      // Existing-person links retain their immutable target; do not turn them into new people.
      if (!_existingRelative(proposed, row['type'])) {
        if (_childNepali.text.trim().isEmpty || _childGender == null) {
          setState(() => _error = _spouseProposal(row['type'])
              ? 'जीवनसाथीको नाम र लिङ्ग आवश्यक छ (Spouse name and gender required)'
              : 'बच्चाको नाम र लिङ्ग आवश्यक छ (Child name and gender required)');
          return;
        }
        proposed['primaryNameNepali'] = _childNepali.text.trim();
        proposed['gender'] = _childGender;
        proposed.remove('primaryNameEnglish');
        if (_childEnglish.text.trim().isNotEmpty) {
          proposed['primaryNameEnglish'] = _childEnglish.text.trim();
        }
      }
    } else if (row['type'] == 'RECORD_DEATH') {
      final date = _deathDate.text.trim(), year = _deathYear.text.trim();
      if ((date.isNotEmpty &&
              !RegExp(r'^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[0-2])$')
                  .hasMatch(date)) ||
          (year.isNotEmpty && !RegExp(r'^\d{4}$').hasMatch(year))) {
        setState(() => _error =
            'BS मिति YYYY-MM-DD वा चार अङ्कको वर्ष दिनुहोस् (Enter a stored BS date/year; no conversion)');
        return;
      }
      proposed.remove('deathDateBs');
      proposed.remove('deathYearBs');
      if (date.isNotEmpty) proposed['deathDateBs'] = date;
      if (year.isNotEmpty) proposed['deathYearBs'] = int.parse(year);
    } else {
      // Preserve unrelated original proposal fields.
      if (proposed.containsKey('birthPlace') || _birth.text.trim().isNotEmpty) {
        proposed['birthPlace'] = _birth.text.trim();
      }
      if (proposed.containsKey('occupation') ||
          _occupation.text.trim().isNotEmpty) {
        proposed['occupation'] = _occupation.text.trim();
      }
    }
    setState(() => _busy = true);
    var confirmed = false;
    try {
      await widget.api.requestJson(
          '/change-requests/${Uri.encodeComponent(_id!)}/resubmit',
          method: 'POST',
          boundAccountId: _owner,
          data: {'proposedChanges': proposed, 'reason': _reason.text.trim()});
      confirmed = true;
    } catch (_) {
      if (_current) {
        setState(() => _error =
            'पुनः पेश भएको पुष्टि भएन। स्थिति पुनः लोड गर्नुहोस्। (Resubmission unconfirmed. Reload current status.)');
      }
    } finally {
      if (_current) {
        setState(() {
          _selected = null;
          _busy = false;
        });
        if (confirmed) await _load();
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final row = _selected;
    final editable = row != null &&
        _correctableTypes.contains(row['type']) &&
        {'CORRECTION_REQUESTED', 'CONFLICT_DETECTED'}.contains(row['status']);
    return Scaffold(
        appBar: AppBar(
            title: const Text('मेरा संशोधनहरू (My change requests)'),
            actions: [
              if (_id != null)
                IconButton(
                    tooltip: 'All my requests',
                    onPressed: _busy || !_current
                        ? null
                        : () {
                            _id = null;
                            _load();
                          },
                    icon: const Icon(Icons.list)),
              IconButton(
                  tooltip: 'Reload requests',
                  onPressed: _busy || !_current ? null : _load,
                  icon: const Icon(Icons.refresh))
            ]),
        body: ListView(padding: const EdgeInsets.all(20), children: [
          if (_busy) const LinearProgressIndicator(),
          if (_error != null) Text(_error!),
          if (!_busy && !_expired && _id == null && _items.isEmpty)
            const Text('कुनै आफ्नै अनुरोध छैन (No own requests found)'),
          for (final item in _items)
            Card(
                child: ListTile(
                    title: Text('${item['type']} · ${item['status']}'),
                    subtitle: Text(item['reason']?.toString() ?? ''),
                    onTap: () {
                      _id = item['id'] as String;
                      _load();
                    })),
          if (row != null) ...[
            Text('${row['type']} · ${row['status']}',
                style: Theme.of(context).textTheme.titleLarge),
            if (row['correctionNotes'] is String)
              Text(row['correctionNotes'] as String),
            if (row['reviewNotes'] is String)
              Text(row['reviewNotes'] as String),
            Text('अनुरोध संस्करण (Request version): ${row['version']}'),
            if (editable) ...[
              if (row['type'] == 'ADD_CHILD' ||
                  _spouseProposal(row['type'])) ...[
                if (!_existingRelative(
                    row['proposedChanges'] as Map, row['type'])) ...[
                  TextField(
                      key: ValueKey(_spouseProposal(row['type'])
                          ? 'proposal-spouse-nepali'
                          : 'proposal-child-nepali'),
                      controller: _childNepali,
                      enabled: !_busy,
                      decoration: InputDecoration(
                          labelText: _spouseProposal(row['type'])
                              ? 'जीवनसाथीको नेपाली नाम (Spouse name in Nepali)'
                              : 'बच्चाको नेपाली नाम (Child name in Nepali)')),
                  TextField(
                      key: ValueKey(_spouseProposal(row['type'])
                          ? 'proposal-spouse-english'
                          : 'proposal-child-english'),
                      controller: _childEnglish,
                      enabled: !_busy,
                      decoration: InputDecoration(
                          labelText: _spouseProposal(row['type'])
                              ? 'जीवनसाथीको अंग्रेजी नाम (Spouse name in English)'
                              : 'बच्चाको अंग्रेजी नाम (Child name in English)')),
                  DropdownButtonFormField<String>(
                      key: ValueKey(_spouseProposal(row['type'])
                          ? 'proposal-spouse-gender'
                          : 'proposal-child-gender'),
                      initialValue: _childGender,
                      decoration:
                          const InputDecoration(labelText: 'लिङ्ग (Gender)'),
                      items: const [
                        DropdownMenuItem(
                            value: 'MALE', child: Text('पुरुष (Male)')),
                        DropdownMenuItem(
                            value: 'FEMALE', child: Text('महिला (Female)')),
                        DropdownMenuItem(
                            value: 'OTHER', child: Text('अन्य (Other)'))
                      ],
                      onChanged: _busy
                          ? null
                          : (value) => setState(() => _childGender = value)),
                ] else
                  Text(_spouseProposal(row['type'])
                      ? 'विद्यमान जीवनसाथीको सम्बन्ध लक्ष्य सुरक्षित छ। (Existing spouse link target is preserved.)'
                      : 'विद्यमान बच्चाको सम्बन्ध लक्ष्य सुरक्षित छ। (Existing child link target is preserved.)'),
              ] else if (row['type'] == 'RECORD_DEATH') ...[
                TextField(
                    key: const ValueKey('proposal-death-date'),
                    controller: _deathDate,
                    enabled: !_busy,
                    decoration: const InputDecoration(
                        labelText:
                            'मृत्यु मिति BS (Death date BS: YYYY-MM-DD)')),
                TextField(
                    key: const ValueKey('proposal-death-year'),
                    controller: _deathYear,
                    enabled: !_busy,
                    decoration: const InputDecoration(
                        labelText: 'मृत्यु वर्ष BS (Death year BS)')),
              ] else ...[
                TextField(
                    key: const ValueKey('proposal-birth'),
                    controller: _birth,
                    enabled: !_busy,
                    decoration: const InputDecoration(
                        labelText: 'जन्मस्थान (Birth place)')),
                TextField(
                    key: const ValueKey('proposal-occupation'),
                    controller: _occupation,
                    enabled: !_busy,
                    decoration:
                        const InputDecoration(labelText: 'पेशा (Occupation)')),
              ],
              TextField(
                  key: const ValueKey('proposal-reason'),
                  controller: _reason,
                  enabled: !_busy,
                  maxLines: 3,
                  decoration:
                      const InputDecoration(labelText: 'कारण (Reason)')),
              FilledButton(
                  key: const ValueKey('proposal-resubmit'),
                  onPressed: _busy ? null : _resubmit,
                  child: const Text('पुनः पेश गर्नुहोस् (Resubmit)')),
            ] else
              Text(row['reason']?.toString() ?? ''),
            if (!_correctableTypes.contains(row['type']) &&
                {'CORRECTION_REQUESTED', 'CONFLICT_DETECTED'}
                    .contains(row['status']))
              const Text(
                  'यो प्रस्ताव प्रकारको संशोधन प्रशासनिक पोर्टलमा समन्वय गर्नुहोस्। (Coordinate correction of this proposal type through the administration portal.)'),
          ],
        ]));
  }
}
