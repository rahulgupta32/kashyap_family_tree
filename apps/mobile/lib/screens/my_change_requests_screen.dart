import 'package:flutter/material.dart';
import '../services/genealogy_api_service.dart';

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
      _reason = TextEditingController();
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
        row['type'] != 'EDIT_PERSON' ||
        !{'CORRECTION_REQUESTED', 'CONFLICT_DETECTED'}.contains(row['status'])) {
      return;
    }
    if (_reason.text.trim().isEmpty) {
      setState(() => _error = 'कारण आवश्यक छ (Reason is required)');
      return;
    }
    final proposed = Map<String, dynamic>.from(row['proposedChanges'] as Map);
    // Preserve other original proposal fields; expose only the existing native edit fields.
    if (proposed.containsKey('birthPlace') || _birth.text.trim().isNotEmpty) {
      proposed['birthPlace'] = _birth.text.trim();
    }
    if (proposed.containsKey('occupation') ||
        _occupation.text.trim().isNotEmpty) {
      proposed['occupation'] = _occupation.text.trim();
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
        row['type'] == 'EDIT_PERSON' &&
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
            if (row['type'] != 'EDIT_PERSON' &&
                {'CORRECTION_REQUESTED', 'CONFLICT_DETECTED'}
                    .contains(row['status']))
              const Text(
                  'यो प्रस्ताव प्रकारको संशोधन प्रशासनिक पोर्टलमा समन्वय गर्नुहोस्। (Coordinate correction of this proposal type through the administration portal.)'),
          ],
        ]));
  }
}
