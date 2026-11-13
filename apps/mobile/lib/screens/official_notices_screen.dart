import 'dart:async';
import 'package:flutter/material.dart';
import '../services/genealogy_api_service.dart';

class OfficialNoticesScreen extends StatefulWidget {
  final GenealogyApiService apiService;
  final String? initialNoticeId;
  const OfficialNoticesScreen({super.key, required this.apiService, this.initialNoticeId});

  @override
  State<OfficialNoticesScreen> createState() => _OfficialNoticesScreenState();
}

class _OfficialNoticesScreenState extends State<OfficialNoticesScreen> {
  static const _signIn = 'सूचना हेर्न फेरि साइन इन गर्नुहोस्। (Sign in again to view notices.)';
  static const _unavailable = 'सूचनाहरू अहिले उपलब्ध छैनन्। फेरि प्रयास गर्नुहोस्। (Notices unavailable. Please retry.)';
  static const _noticeUnavailable = 'यो सूचना उपलब्ध छैन। (This notice is unavailable.)';
  late final GenealogyApiService _sessionApi;
  late final int _sessionGeneration;
  Timer? _sessionWatch;
  final _scroll = ScrollController();
  bool _expired = false;
  int _epoch = 0;
  bool _busy = true;
  String? _error;
  List<_Notice> _notices = [];
  _Notice? _selected;

  bool get _sameSession => !_expired && identical(widget.apiService, _sessionApi) && widget.apiService.authToken != null &&
      widget.apiService.pushSessionGeneration == _sessionGeneration;

  @override
  void initState() {
    super.initState();
    _sessionApi = widget.apiService;
    _sessionGeneration = widget.apiService.pushSessionGeneration;
    _sessionWatch = Timer.periodic(const Duration(milliseconds: 500), (_) {
      if (!_sameSession) { _expireSession(); }
    });
    _load();
  }

  @override
  void didUpdateWidget(covariant OfficialNoticesScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (!identical(oldWidget.apiService, widget.apiService)) { _expireSession(); }
    else if (oldWidget.initialNoticeId != widget.initialNoticeId && _sameSession) { _load(); }
  }

  @override
  void dispose() {
    _epoch++;
    _sessionWatch?.cancel();
    _scroll.dispose();
    super.dispose();
  }

  void _expireSession() {
    if (!mounted || _expired) { return; }
    _sessionWatch?.cancel();
    setState(() {
      _expired = true;
      _epoch++;
      _notices = [];
      _selected = null;
      _error = _signIn;
      _busy = false;
    });
  }

  bool _canPresent(int epoch) {
    if (!mounted || epoch != _epoch) { return false; }
    if (_sameSession) { return true; }
    _expireSession();
    return false;
  }

  Future<void> _load() async {
    final epoch = ++_epoch;
    setState(() { _busy = true; _error = null; _notices = []; _selected = null; });
    if (!_canPresent(epoch)) { return; }
    final initialId = widget.initialNoticeId;
    if (initialId != null && !_Notice.validId(initialId)) {
      setState(() { _error = _noticeUnavailable; _busy = false; });
      return;
    }
    try {
      // The server returns the latest 50 authorized summaries, not a paged feed.
      final data = await widget.apiService.requestJson('/notifications/broadcasts');
      if (!_canPresent(epoch)) { return; }
      if (data is! List || data.length > 50) { throw const FormatException(); }
      final notices = data.map((value) => _Notice.parse(value)).toList();
      setState(() { _notices = notices; });
    } catch (_) {
      if (_canPresent(epoch)) { setState(() { _error = _unavailable; }); }
    }
    if (!_canPresent(epoch)) { return; }
    // The exact notice can be older than the bounded list. Its ID is only a
    // locator: this fresh authenticated detail request establishes permission.
    if (initialId != null) { await _openId(initialId); }
    else { setState(() { _busy = false; }); }
  }

  Future<void> _openId(String id) async {
    final epoch = ++_epoch;
    setState(() { _busy = true; _error = null; _selected = null; });
    if (!_canPresent(epoch)) { return; }
    try {
      // Recheck current audience permission before revealing the notice body.
      final data = await widget.apiService.requestJson('/notifications/broadcasts/$id');
      if (!_canPresent(epoch)) { return; }
      final selected = _Notice.parse(data, detail: true);
      if (selected.id != id) { throw const FormatException(); }
      setState(() { _selected = selected; });
      if (_scroll.hasClients) { _scroll.jumpTo(0); }
    } catch (_) {
      if (_canPresent(epoch)) { setState(() { _error = _noticeUnavailable; }); }
    } finally {
      if (mounted && epoch == _epoch) { setState(() { _busy = false; }); }
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('प्रशासनिक सूचनाहरू (Official notices)'), actions: [
      IconButton(tooltip: 'सूचनाहरू पुनः लोड गर्नुहोस् (Refresh official notices)', onPressed: _busy || !_sameSession ? null : _load,
        icon: const Icon(Icons.refresh)),
    ]),
    body: !_sameSession ? const Center(child: Padding(padding: EdgeInsets.all(16), child: Text(_signIn)))
      : ListView(controller: _scroll, padding: const EdgeInsets.all(16), children: [
        if (_busy) const LinearProgressIndicator(),
        if (_error != null) Semantics(liveRegion: true, child: Text(_error!, style: const TextStyle(color: Colors.red))),
        if (_error != null) OutlinedButton(onPressed: _busy ? null : _load,
          child: const Text('फेरि प्रयास गर्नुहोस् (Retry)')),
        if (!_busy && _error == null && _notices.isEmpty && _selected == null)
          const Text('हाल कुनै प्रशासनिक सूचना उपलब्ध छैन। (No official notices available.)'),
        if (_notices.length == 50)
          const Text('पछिल्ला ५० सूचनाहरू (Latest 50 notices).'),
        if (_selected != null) Card(child: Padding(padding: const EdgeInsets.all(16),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Semantics(header: true, child: Text(_selected!.title, style: Theme.of(context).textTheme.titleLarge)),
            const SizedBox(height: 8),
            SelectableText(_selected!.body!),
            const SizedBox(height: 8),
            Text(_selected!.createdAt),
          ]))),
        ..._notices.map((notice) => Card(child: ListTile(
          title: Text(notice.title), subtitle: Text(notice.createdAt),
          trailing: const Icon(Icons.chevron_right),
          onTap: _busy ? null : () => _openId(notice.id),
        ))),
      ]),
  );
}

class _Notice {
  final String id, title, createdAt;
  final String? body;
  const _Notice(this.id, this.title, this.createdAt, this.body);
  static bool validId(String id) => RegExp(
    r'^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
    caseSensitive: false).hasMatch(id);

  factory _Notice.parse(dynamic value, {bool detail = false}) {
    if (value is! Map || value['id'] is! String || value['title'] is! String || value['createdAt'] is! String ||
        !validId(value['id'] as String) ||
        (value['title'] as String).trim().isEmpty || (value['title'] as String).length > 180 ||
        DateTime.tryParse(value['createdAt'] as String) == null ||
        (detail && (value['body'] is! String || (value['body'] as String).trim().isEmpty || (value['body'] as String).length > 4000))) {
      throw const FormatException();
    }
    // Summary bodies, provider data and extra response fields never drive UI.
    return _Notice(value['id'] as String, value['title'] as String, value['createdAt'] as String,
      detail ? value['body'] as String : null);
  }
}
