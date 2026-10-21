import 'package:flutter/material.dart';
import '../localization/claim_labels.dart';
import '../services/genealogy_api_service.dart';

/// A fresh authorized read of one claim. No evidence URLs or reviewer identity
/// are retained, and a failed refresh never leaves an old decision on screen.
class ClaimStatusScreen extends StatefulWidget {
  final String claimId;
  final GenealogyApiService api;
  const ClaimStatusScreen({super.key, required this.claimId, required this.api});

  @override
  State<ClaimStatusScreen> createState() => _ClaimStatusScreenState();
}

class _ClaimStatusScreenState extends State<ClaimStatusScreen> {
  late final GenealogyApiService _api;
  late final int _generation;
  bool _expired = false, _loading = false;
  String? _status, _correction, _error;

  bool get _current => mounted && !_expired && identical(widget.api, _api) &&
      _api.authToken != null && _api.pushSessionGeneration == _generation;

  @override
  void initState() {
    super.initState();
    _api = widget.api;
    _generation = _api.pushSessionGeneration;
    _api.sessionChanges.addListener(_sessionChanged);
    _load();
  }

  void _sessionChanged() {
    if (!_current && mounted) {
      setState(() {
        _expired = true;
        _status = _correction = _error = null;
        _loading = false;
      });
    }
  }

  @override
  void didUpdateWidget(covariant ClaimStatusScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.claimId != widget.claimId || !identical(oldWidget.api, widget.api)) {
      _expired = true;
      _sessionChanged();
    }
  }

  Future<void> _load() async {
    if (!_current || _loading) return;
    setState(() {
      _loading = true;
      _status = _correction = _error = null;
    });
    try {
      final result = await _api.requestJson('/claims/${Uri.encodeComponent(widget.claimId)}');
      if (!_current) return;
      if (result is! Map || result['id'] != widget.claimId ||
          result['status'] is! String || !claimStatusLabels.containsKey(result['status'])) {
        throw const FormatException('Unavailable claim status');
      }
      final notes = result['correctionRequestNotes'];
      if (notes != null && notes is! String) {
        throw const FormatException('Unavailable correction');
      }
      setState(() {
        _status = result['status'] as String;
        _correction = _status == 'CORRECTION_REQUESTED' ? notes as String? : null;
      });
    } catch (_) {
      if (_current) setState(() => _error = claimLabels['statusUnavailable']);
    } finally {
      if (_current) setState(() => _loading = false);
    }
  }

  @override
  void dispose() {
    _api.sessionChanges.removeListener(_sessionChanged);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: Text(claimLabels['statusTitle']!)),
    body: _expired || !_current
        ? Center(child: Text(claimLabels['session']!))
        : ListView(padding: const EdgeInsets.all(16), children: [
            if (_loading) const Center(child: CircularProgressIndicator()),
            if (_error != null) Semantics(liveRegion: true, child: Text(_error!)),
            if (_status != null) ...[
              Semantics(liveRegion: true, child: Text(claimStatusLabels[_status]!)),
              if (_status == 'CORRECTION_REQUESTED') ...[
                Text(claimLabels['correctionReview']!),
                if (_correction != null && _correction!.trim().isNotEmpty) Text(_correction!),
              ],
            ],
            OutlinedButton(onPressed: _loading ? null : _load,
                child: Text(claimLabels['statusRefresh']!)),
          ]),
  );
}
