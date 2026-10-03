import 'package:flutter/material.dart';
import '../services/genealogy_api_service.dart';

class CommunityScreen extends StatefulWidget {
  final GenealogyApiService apiService;
  const CommunityScreen({super.key, required this.apiService});
  @override
  State<CommunityScreen> createState() => _CommunityScreenState();
}

class _CommunityScreenState extends State<CommunityScreen> {
  List<dynamic> _posts = [];
  bool _loading = true, _busy = false, _queue = false;
  String? _error, _notice;
  @override
  void initState() { super.initState(); _load(); }

  Future<void> _load() async {
    try {
      final rows = await widget.apiService.requestJson('/community/posts?queue=$_queue');
      if (mounted) { setState(() { _posts = rows as List; _error = null; _loading = false; }); }
    } catch (e) {
      if (mounted) { setState(() { _error = e.toString(); _loading = false; }); }
    }
  }

  Future<void> _action(Future<void> Function() work) async {
    setState(() { _busy = true; _error = null; });
    try { await work(); await _load(); }
    catch (e) { if (mounted) { setState(() => _error = e.toString()); } }
    finally { if (mounted) { setState(() => _busy = false); } }
  }

  Future<void> _compose() async {
    final result = await Navigator.push<Map<String, dynamic>>(context,
      MaterialPageRoute(builder: (_) => const _PostEditor()));
    if (result == null || !mounted) { return; }
    await _action(() async {
      await widget.apiService.requestJson('/community/posts', method: 'POST', data: result);
      if (mounted) { setState(() => _notice = 'समीक्षामा पठाइयो (Submitted for independent moderation)'); }
    });
  }

  Future<void> _reason(Map post, {bool review = false}) async {
    final result = await Navigator.push<Map<String, dynamic>>(context,
      MaterialPageRoute(builder: (_) => _ReviewEditor(title: post['title'] as String, review: review)));
    if (result == null || !mounted) { return; }
    await _action(() async {
      await widget.apiService.requestJson('/community/posts/${post['id']}/${review ? 'moderate' : 'flag'}',
        method: 'POST', data: review ? {...result, 'version': post['version']} : result);
    });
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('समुदाय (Community)'), actions: [
      IconButton(tooltip: 'Refresh', onPressed: _busy ? null : _load, icon: const Icon(Icons.refresh)),
    ]),
    floatingActionButton: FloatingActionButton(tooltip: 'Create post', onPressed: _busy ? null : _compose,
      child: const Icon(Icons.add)),
    body: _loading ? const Center(child: CircularProgressIndicator()) : RefreshIndicator(
      onRefresh: _load, child: ListView(padding: const EdgeInsets.fromLTRB(16, 12, 16, 90), children: [
        if (_error != null) Text(_error!, style: const TextStyle(color: Colors.red)),
        if (_notice != null) Text(_notice!, style: const TextStyle(color: Colors.green)),
        Wrap(spacing: 8, children: [
          ChoiceChip(label: const Text('समाचार (Feed)'), selected: !_queue, onSelected: _busy ? null : (_) { setState(() => _queue = false); _load(); }),
          ChoiceChip(label: const Text('समीक्षा (Moderation)'), selected: _queue, onSelected: _busy ? null : (_) { setState(() => _queue = true); _load(); }),
        ]),
        if (_posts.isEmpty) const Padding(padding: EdgeInsets.all(24), child: Text('कुनै पोस्ट छैन (No posts yet)')),
        ..._posts.map((p) => Card(child: Padding(padding: const EdgeInsets.all(16), child: Column(
          crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(p['title'] as String, style: Theme.of(context).textTheme.titleMedium),
            Text(p['moderationStatus'] as String, style: Theme.of(context).textTheme.labelSmall),
            const SizedBox(height: 8), Text(p['content'] as String),
            Wrap(spacing: 8, children: [
              if (p['moderationStatus'] == 'PUBLISHED') ...[
                TextButton(onPressed: _busy ? null : () => _action(() async {
                  await widget.apiService.requestJson('/community/posts/${p['id']}/like', method: 'PUT', data: {'liked': p['isLiked'] != true});
                }), child: Text('${p['isLiked'] == true ? '♥' : '♡'} ${p['likesCount']} · Like')),
                TextButton(onPressed: () async {
                  await Navigator.push(context, MaterialPageRoute(builder: (_) => _CommentsScreen(api: widget.apiService, post: p as Map)));
                  if (mounted) { await _load(); }
                }, child: Text('टिप्पणी (${p['commentsCount']})')),
                TextButton(onPressed: _busy ? null : () => _reason(p as Map), child: const Text('रिपोर्ट (Report)')),
              ],
              if (p['canModerate'] == true && p['moderationStatus'] == 'PENDING')
                TextButton(onPressed: _busy ? null : () => _reason(p as Map, review: true), child: const Text('Review')),
              if (p['canDelete'] == true) TextButton(onPressed: _busy ? null : () async {
                final confirmed = await showDialog<bool>(context: context, builder: (ctx) => AlertDialog(
                  title: const Text('पोस्ट हटाउने? (Remove post?)'), actions: [
                    TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
                    TextButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Remove')),
                  ]));
                if (confirmed == true && mounted) { await _action(() async {
                  await widget.apiService.requestJson('/community/posts/${p['id']}', method: 'DELETE');
                }); }
              }, child: const Text('हटाउनुहोस् (Remove)')),
            ]),
          ])))),
      ])),
  );
}

class _PostEditor extends StatefulWidget {
  const _PostEditor();
  @override
  State<_PostEditor> createState() => _PostEditorState();
}
class _PostEditorState extends State<_PostEditor> {
  final _title = TextEditingController(), _content = TextEditingController();
  final _form = GlobalKey<FormState>();
  String _category = 'DISCUSSION';
  @override
  void dispose() { _title.dispose(); _content.dispose(); super.dispose(); }
  @override
  Widget build(BuildContext context) => Scaffold(appBar: AppBar(title: const Text('नयाँ पोस्ट (New post)')),
    body: Form(key: _form, child: ListView(padding: const EdgeInsets.all(16), children: [
      TextFormField(controller: _title, maxLength: 180, decoration: const InputDecoration(labelText: 'शीर्षक (Title)'), validator: (v) => v!.trim().isEmpty ? 'Required' : null),
      TextFormField(controller: _content, maxLength: 10000, minLines: 4, maxLines: 8, decoration: const InputDecoration(labelText: 'सन्देश (Message)'), validator: (v) => v!.trim().isEmpty ? 'Required' : null),
      DropdownButtonFormField<String>(initialValue: _category, decoration: const InputDecoration(labelText: 'प्रकार (Category)'), items: const [
        DropdownMenuItem(value: 'DISCUSSION', child: Text('छलफल (Discussion)')),
        DropdownMenuItem(value: 'RITUAL', child: Text('परम्परा (Tradition)')),
        DropdownMenuItem(value: 'ACHIEVEMENT', child: Text('उपलब्धि (Achievement)')),
      ], onChanged: (v) => setState(() => _category = v!)),
      const SizedBox(height: 20), FilledButton(onPressed: () {
        if (_form.currentState!.validate()) { Navigator.pop(context, {'title': _title.text.trim(), 'content': _content.text.trim(), 'category': _category}); }
      }, child: const Text('समीक्षामा पठाउनुहोस् (Submit for review)')),
    ])));
}

class _ReviewEditor extends StatefulWidget {
  final String title;
  final bool review;
  const _ReviewEditor({required this.title, required this.review});
  @override
  State<_ReviewEditor> createState() => _ReviewEditorState();
}
class _ReviewEditorState extends State<_ReviewEditor> {
  final _notes = TextEditingController();
  @override
  void dispose() { _notes.dispose(); super.dispose(); }
  @override
  Widget build(BuildContext context) => Scaffold(appBar: AppBar(title: Text(widget.review ? 'समीक्षा (Review)' : 'रिपोर्ट (Report)')),
    body: ListView(padding: const EdgeInsets.all(16), children: [Text(widget.title),
      TextField(controller: _notes, minLines: 3, maxLines: 6, maxLength: 1000, onChanged: (_) => setState(() {}), decoration: const InputDecoration(labelText: 'कारण (Reason / notes)')),
      if (widget.review) Wrap(spacing: 12, children: ['PUBLISHED', 'REJECTED'].map((decision) => FilledButton(
        onPressed: _notes.text.trim().length < 5 ? null : () => Navigator.pop(context, {'decision': decision, 'notes': _notes.text.trim()}),
        child: Text(decision == 'PUBLISHED' ? 'Publish' : 'Reject'))).toList())
      else FilledButton(onPressed: _notes.text.trim().length < 5 ? null : () => Navigator.pop(context, {'reason': _notes.text.trim()}), child: const Text('Submit report')),
    ]));
}

class _CommentsScreen extends StatefulWidget {
  final GenealogyApiService api;
  final Map post;
  const _CommentsScreen({required this.api, required this.post});
  @override
  State<_CommentsScreen> createState() => _CommentsScreenState();
}
class _CommentsScreenState extends State<_CommentsScreen> {
  final _text = TextEditingController();
  List<dynamic> _comments = [];
  String? _error;
  bool _busy = false;
  @override
  void initState() { super.initState(); _load(); }
  @override
  void dispose() { _text.dispose(); super.dispose(); }
  Future<void> _load() async {
    try { final rows = await widget.api.requestJson('/community/posts/${widget.post['id']}/comments');
      if (mounted) { setState(() { _comments = rows as List; _error = null; }); }
    } catch (e) { if (mounted) { setState(() => _error = e.toString()); } }
  }
  Future<void> _send() async {
    setState(() => _busy = true);
    try {
      await widget.api.requestJson('/community/posts/${widget.post['id']}/comments', method: 'POST', data: {'content': _text.text.trim()});
      _text.clear(); await _load();
    } catch (e) { if (mounted) { setState(() => _error = e.toString()); } }
    finally { if (mounted) { setState(() => _busy = false); } }
  }
  @override
  Widget build(BuildContext context) => Scaffold(appBar: AppBar(title: const Text('टिप्पणी (Comments)')),
    body: ListView(padding: const EdgeInsets.all(16), children: [
      if (_error != null) Text(_error!, style: const TextStyle(color: Colors.red)),
      ..._comments.map((c) => ListTile(title: Text(c['content'] as String))),
      TextField(controller: _text, maxLength: 2000, onChanged: (_) => setState(() {}), decoration: const InputDecoration(labelText: 'Your comment')),
      FilledButton(onPressed: _busy || _text.text.trim().isEmpty ? null : _send, child: const Text('पठाउनुहोस् (Send comment)')),
    ]));
}
