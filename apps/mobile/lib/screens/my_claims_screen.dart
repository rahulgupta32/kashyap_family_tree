import 'package:flutter/material.dart';
import '../localization/claim_labels.dart';
import '../localization/my_claim_labels.dart';
import '../services/genealogy_api_service.dart';
import 'claim_status_screen.dart';
import 'member_disputes_screen.dart';

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
  String? _error, _nextCursor, _notice;
  bool _olderPage = false, _confirming = false;
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
        _nextCursor = null;
        _error = _notice = null;
        _loading = _confirming = false;
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

  Future<void> _reload() => _loadPage();

  Future<void> _loadOlder() async {
    if (!_current || _nextCursor == null) return;
    await _loadPage(_nextCursor);
  }

  Future<void> _loadPage([String? cursor]) async {
    if (!_current || _loading || _opening || _recovering) return;
    setState(() {
      _loading = true;
      _claims = [];
      _nextCursor = null;
      _olderPage = false;
      _error = _notice = null;
    });
    try {
      // Ownership is enforced by this dedicated endpoint, including for accounts
      // with reviewer roles. Never use the reviewer collection as "my claims".
      final path = Uri(path:'/claims/mine',queryParameters:{'paged':'true',
        if (cursor != null) 'cursor':cursor}).toString();
      final result = await _api.requestJson(path);
      if (!_current) return;
      if (result is! Map || result['items'] is! List || (result['items'] as List).length > 100) {
        throw const FormatException('Unavailable claim collection');
      }
      final items = result['items'] as List;
      final next = result['nextCursor'];
      if (!result.containsKey('nextCursor') ||
          (next != null && (next is! String || next.isEmpty || next.length > 1024 ||
            !RegExp(r'^[A-Za-z0-9_-]+$').hasMatch(next) || next == cursor || items.length != 100))) {
        throw const FormatException('Unavailable claim continuation');
      }
      final ids = <String>{};
      final summaries = <_ClaimSummary>[];
      for (final claim in items) {
        if (claim is! Map || claim['id'] is! String ||
            (claim['id'] as String).isEmpty || !ids.add(claim['id'] as String) ||
            claim['status'] is! String || !claimStatusLabels.containsKey(claim['status'])) {
          throw const FormatException('Unavailable claim');
        }
        summaries.add(_ClaimSummary(claim['id'] as String, claim['status'] as String));
      }
      // Retain only the fields needed for discovery, never evidence or phones.
      setState(() { _claims = summaries; _nextCursor = next as String?; _olderPage = cursor != null; });
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
      if (!mounted || !_current) return;
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

  Future<void> _resolve() async {
    if (!_current || _loading || _opening || _recovering || !_api.hasPendingProfileClaim) return;
    setState(() { _recovering = _confirming = true; _error = _notice = null; });
    var confirmed = false, abandoned = false, answered = false;
    void answer(BuildContext dialogContext,bool value) {
      if (answered || !dialogContext.mounted || ModalRoute.of(dialogContext)?.isCurrent != true) return;
      answered = true;
      Navigator.pop(dialogContext,value);
    }
    try {
      final accepted = await showDialog<bool>(context:context,builder:(dialogContext) => AlertDialog(
        title:Text(myClaimLabels['resolve']!),
        content:Text(myClaimLabels['resolveExplanation']!),
        actions:[
          TextButton(onPressed:() => answer(dialogContext,false),child:Text(myClaimLabels['resolveCancel']!)),
          TextButton(key:const ValueKey('confirm-claim-resolution'),
            onPressed:() => answer(dialogContext,true),child:Text(myClaimLabels['resolveConfirm']!)),
        ],
      ));
      if (!_current || accepted != true) return;
      setState(() => _confirming = false);
      final result = await _api.resolvePendingProfileClaim();
      if (!mounted || !_current) return;
      abandoned = result['outcome'] == 'ABANDONED';
      if (!abandoned) {
        final id = result['claimId'];
        if (result['outcome'] != 'CREATED' || id is! String || id.isEmpty) {
          throw const FormatException('Unavailable resolution');
        }
        confirmed = true;
        await Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) =>
            ClaimStatusScreen(claimId:id,api:_api)));
      } else {
        confirmed = true;
      }
    } catch (_) {
      if (_current) setState(() => _error = myClaimLabels['resolveUnconfirmed']);
    } finally {
      if (_current) {
        setState(() { _recovering = _confirming = false; });
        if (confirmed) {
          await _reload();
          if (_current && abandoned) setState(() => _notice = myClaimLabels['closed']);
        }
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
    appBar: AppBar(title: Text(myClaimLabels['title']!), actions:[IconButton(tooltip:'मेरा विवाद (My disputes)', icon:const Icon(Icons.flag_outlined), onPressed:_current?()=>Navigator.push(context,MaterialPageRoute(builder:(_)=>MemberDisputesScreen(api:_api))):null)]),
    body: !_current
        ? Center(child: Text(myClaimLabels['session']!))
        : ListView(padding: const EdgeInsets.all(16), children: [
            if (_loading || (_recovering && !_confirming)) const Center(child: CircularProgressIndicator()),
            if (_error != null) Semantics(liveRegion: true, child: Text(_error!)),
            if (_notice != null) Semantics(liveRegion:true,child:Text(_notice!)),
            if (_api.hasPendingProfileClaim) ...[
              Text(myClaimLabels['pending']!),
              ElevatedButton(key: const ValueKey('recover-pending-claim'),
                onPressed: _loading || _opening || _recovering ? null : _recover,
                child: Text(myClaimLabels['recover']!)),
              Text(myClaimLabels['resolveExplanation']!),
              OutlinedButton(key:const ValueKey('resolve-pending-claim'),
                onPressed:_loading || _opening || _recovering ? null : _resolve,
                child:Text(myClaimLabels['resolve']!)),
            ],
            if (!_loading && !_recovering && _error == null && _claims.isEmpty)
              Text(myClaimLabels['empty']!),
            if (_claims.isNotEmpty) Text(myClaimLabels[_olderPage ? 'olderPage' : 'limit']!),
            if (_nextCursor != null)
              OutlinedButton(key:const ValueKey('older-claims'),
                onPressed:_loading || _opening || _recovering ? null : _loadOlder,
                child:Text(myClaimLabels['older']!)),
            OutlinedButton(onPressed: _loading || _opening || _recovering ? null : _reload,
                child: Text(myClaimLabels['reload']!)),
            for (final claim in _claims)
              ListTile(key: ValueKey('my-claim-${claim.id}'), title: Text('${myClaimLabels['reference']} ${claim.id}'),
                  subtitle: Text(claimStatusLabels[claim.status]!),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: _opening || _recovering ? null : () => _open(claim)),
          ]),
  );
}
