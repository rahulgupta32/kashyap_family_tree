import 'package:flutter/material.dart';
import '../localization/claim_labels.dart';
import '../localization/my_claim_labels.dart';
import '../services/genealogy_api_service.dart';
import 'claim_status_screen.dart';

class MyClaimsScreen extends StatefulWidget {
  final GenealogyApiService api;
  const MyClaimsScreen({super.key, required this.api});

  @override
  State<MyClaimsScreen> createState() => _MyClaimsScreenState();
}

class _ClaimSummary {
  final String id, status;
  const _ClaimSummary(this.id, this.status);
}

class _MyClaimsScreenState extends State<MyClaimsScreen> {
  late final GenealogyApiService _api;
  late final int _generation;
  bool _expired = false, _loading = false, _opening = false, _recovering = false;
  String? _error;
  List<_ClaimSummary> _claims = [];

  bool get _current => mounted && !_expired && identical(widget.api, _api) &&
      _api.authToken != null && _api.pushSessionGeneration == _generation;

  @override
  void initState() {
    super.initState();
    _api = widget.api;
    _generation = _api.pushSessionGeneration;
    _api.sessionChanges.addListener(_sessionChanged);
    _reload();
  }

  void _sessionChanged() {
    if (!_current && mounted) {
      setState(() {
        _expired = true;
        _claims = [];
        _error = null;
        _loading = false;
      });
    }
  }

  @override
  void didUpdateWidget(covariant MyClaimsScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (!identical(oldWidget.api, widget.api)) {
      _expired = true;
      _sessionChanged();
    }
  }

  Future<void> _reload() async {
    if (!_current || _loading || _opening || _recovering) return;
    setState(() {
      _loading = true;
      _claims = [];
      _error = null;
    });
    try {
      // Ownership is enforced by this dedicated endpoint, including for accounts
      // with reviewer roles. Never use the reviewer collection as "my claims".
      final result = await _api.requestJson('/claims/mine');
      if (!_current) return;
      if (result is! List || result.length > 100) {
        throw const FormatException('Unavailable claim collection');
      }
      final ids = <String>{};
      final summaries = <_ClaimSummary>[];
      for (final claim in result) {
        if (claim is! Map || claim['id'] is! String ||
            (claim['id'] as String).isEmpty || !ids.add(claim['id'] as String) ||
            claim['status'] is! String || !claimStatusLabels.containsKey(claim['status'])) {
          throw const FormatException('Unavailable claim');
        }
        summaries.add(_ClaimSummary(claim['id'] as String, claim['status'] as String));
      }
      // Retain only the fields needed for discovery, never evidence or phones.
      setState(() => _claims = summaries);
    } catch (_) {
      if (_current) setState(() => _error = myClaimLabels['unavailable']);
    } finally {
      if (_current) setState(() => _loading = false);
    }
  }

  Future<void> _open(_ClaimSummary claim) async {
    if (!_current || _opening || _loading || _recovering || !_claims.contains(claim)) return;
    setState(() => _opening = true);
    try {
      await Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) =>
          ClaimStatusScreen(claimId: claim.id, api: _api)));
    } finally {
      if (_current) {
        setState(() => _opening = false);
        await _reload();
      }
    }
  }

  Future<void> _recover() async {
    if (!_current || _loading || _opening || _recovering || !_api.hasPendingProfileClaim) return;
    setState(() { _recovering = true; _error = null; });
    var confirmed = false;
    try {
      // Only this explicit action retries the original durable identity/body.
      final result = await _api.retryPendingProfileClaim();
      if (!_current) return;
      final id = result['id'];
      if (id is! String || id.isEmpty) throw const FormatException('Unavailable claim confirmation');
      confirmed = true;
      await Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) =>
          ClaimStatusScreen(claimId: id, api: _api)));
    } catch (_) {
      if (_current) setState(() => _error = myClaimLabels['recoveryUnconfirmed']);
    } finally {
      if (_current) {
        setState(() => _recovering = false);
        if (confirmed) await _reload();
      }
    }
  }

  @override
  void dispose() {
    _api.sessionChanges.removeListener(_sessionChanged);
    _claims = [];
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: Text(myClaimLabels['title']!)),
    body: !_current
        ? Center(child: Text(myClaimLabels['session']!))
        : ListView(padding: const EdgeInsets.all(16), children: [
            if (_loading || _recovering) const Center(child: CircularProgressIndicator()),
            if (_error != null) Semantics(liveRegion: true, child: Text(_error!)),
            if (_api.hasPendingProfileClaim) ...[
              Text(myClaimLabels['pending']!),
              ElevatedButton(key: const ValueKey('recover-pending-claim'),
                onPressed: _loading || _opening || _recovering ? null : _recover,
                child: Text(myClaimLabels['recover']!)),
            ],
            if (!_loading && !_recovering && _error == null && _claims.isEmpty)
              Text(myClaimLabels['empty']!),
            if (_claims.isNotEmpty) Text(myClaimLabels['limit']!),
            for (final claim in _claims)
              ListTile(key: ValueKey('my-claim-${claim.id}'), title: Text('${myClaimLabels['reference']} ${claim.id}'),
                  subtitle: Text(claimStatusLabels[claim.status]!),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: _opening || _recovering ? null : () => _open(claim)),
            OutlinedButton(onPressed: _loading || _opening || _recovering ? null : _reload,
                child: Text(myClaimLabels['reload']!)),
          ]),
  );
}
