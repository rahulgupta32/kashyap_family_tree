import 'package:flutter/material.dart';
import '../services/genealogy_api_service.dart';

class CulturalContentScreen extends StatefulWidget {
  final GenealogyApiService apiService;
  const CulturalContentScreen({super.key, required this.apiService});
  @override
  State<CulturalContentScreen> createState() => _CulturalContentScreenState();
}

class _CulturalContentScreenState extends State<CulturalContentScreen> {
  final _query = TextEditingController();
  List<dynamic> _articles = [];
  bool _loading = false;
  String? _error;
  int _epoch = 0;
  @override
  void initState() { super.initState(); _load(); }
  @override
  void dispose() { _epoch++; _query.dispose(); super.dispose(); }
  Future<void> _load() async {
    final epoch = ++_epoch, token = widget.apiService.authToken;
    setState(() { _loading = true; _error = null; _articles = []; });
    try {
      if (token == null) { throw StateError('Sign in to read cultural content.'); }
      final query = _query.text.trim();
      final data = await widget.apiService.requestJson('/cultural/content/published${query.isEmpty ? '' : '?q=${Uri.encodeQueryComponent(query)}'}');
      if (!mounted || epoch != _epoch || widget.apiService.authToken != token) { return; }
      setState(() { _articles = data as List<dynamic>; });
    } catch (e) {
      if (mounted && epoch == _epoch && widget.apiService.authToken == token) {
        setState(() { _error = e.toString().replaceAll('Exception: ', ''); });
      }
    } finally {
      if (mounted && epoch == _epoch) { setState(() { _loading = false; }); }
    }
  }
  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('संस्कृति (Culture)'), actions: [IconButton(tooltip: 'Refresh cultural content', onPressed: _loading ? null : _load, icon: const Icon(Icons.refresh))]),
    body: ListView(padding: const EdgeInsets.all(16), children: [
      const Text('प्रकाशित संस्कृति तथा इतिहास (Published culture and history)'),
      TextField(controller: _query, maxLength: 120, decoration: const InputDecoration(labelText: 'खोज (Search published content)'), onSubmitted: (_) => _load()),
      FilledButton(onPressed: _loading ? null : _load, child: const Text('खोज्नुहोस् (Search)')),
      if (_loading) const Center(child: CircularProgressIndicator()),
      if (_error != null) Semantics(liveRegion: true, child: Text(_error!, style: const TextStyle(color: Colors.red))),
      if (!_loading && _error == null && _articles.isEmpty) const Text('कुनै प्रकाशित सामग्री भेटिएन (No published content found).'),
      if (_articles.length == 50) const Text('पहिलो ५० नतिजा (First 50 results). Refine your search.'),
      ..._articles.map((a) => Card(child: Padding(padding: const EdgeInsets.all(16), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Semantics(header: true, child: Text(a['title_nepali'] as String, style: Theme.of(context).textTheme.titleLarge)),
        if (a['title_english'] != null) Text(a['title_english'] as String),
        const SizedBox(height: 8), SelectableText(a['content_nepali'] as String),
        if (a['content_english'] != null) SelectableText(a['content_english'] as String),
        const SizedBox(height: 8), Text('संस्करण (Revision): ${a['version']} · ${a['published_at']}'),
        Text('स्रोत (Source): ${a['provenance']}'),
      ])))),
    ]),
  );
}
