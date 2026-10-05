import 'dart:convert';
import 'dart:math';
import 'package:flutter/services.dart';
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

  Future<void> _edit(Map post) async {
    final result = await Navigator.push<Map<String, dynamic>>(context,
      MaterialPageRoute(builder: (_) => _PostEditor(post: post)));
    if (result == null || !mounted) { return; }
    await _action(() async {
      await widget.apiService.requestJson('/community/posts/${post['id']}', method: 'PUT', data: result);
      if (mounted) { setState(() => _notice = 'Changes submitted for independent moderation'); }
    });
  }

  static const _files = MethodChannel('kashyap/chat_attachments');
  Future<void> _image(Map post,{bool remove=false,bool retry=false,bool original=false}) async {
    final owner=widget.apiService.chatAccountId;if(owner==null){return;}
    try {
      if(remove){
        final result=await Navigator.push<Map<String,dynamic>>(context,MaterialPageRoute(builder:(_)=>_ReviewEditor(title:post['title'] as String,review:false,mediaChange:true)));
        if(result==null||!mounted){return;}
        await widget.apiService.communityMedia('/posts/${post['id']}/media',owner,method:'DELETE',data:{'version':post['version'],'reason':result['reason']});await _load();
      }else if(retry){await widget.apiService.communityMedia('/posts/${post['id']}/media/${post['media']['assetId']}/retry',owner,method:'POST');}
      else {
        final response=await widget.apiService.communityMedia('/posts/${post['id']}/media/${post['media']['assetId']}?variant=${original?'original':'display'}',owner);
        if(!mounted||widget.apiService.chatAccountId!=owner){return;}
        await _files.invokeMethod('save',{'dataBase64':base64Encode(response.bodyBytes),'mimeType':original?post['media']['mimeType']:'image/webp','fileName':original?post['media']['fileName']:'community-display.webp'});
      }
    }catch(e){if(mounted){setState(()=>_error=e.toString());}}
  }
  Future<void> _uploadImage(Map post) async {
    await Navigator.push(context,MaterialPageRoute(builder:(_)=>_CommunityImageEditor(api:widget.apiService,post:post)));
    if(mounted){await _load();}
  }

  Future<void> _sharing(Map post) async {
    final owner=widget.apiService.chatAccountId;if(owner==null){return;}
    final result=await Navigator.push<Map<String,dynamic>>(context,MaterialPageRoute(builder:(_)=>_CommunitySharingEditor(post:post)));
    if(result==null||!mounted){return;}
    await _action(() async {await widget.apiService.communityMedia('/posts/${post['id']}/sharing',owner,method:'PUT',data:result);});
  }

  Future<void> _reason(Map post, {bool review = false, bool appeal = false}) async {
    final result = await Navigator.push<Map<String, dynamic>>(context,
      MaterialPageRoute(builder: (_) => _ReviewEditor(title: post['title'] as String, review: review, appeal: appeal)));
    if (result == null || !mounted) { return; }
    await _action(() async {
      await widget.apiService.requestJson('/community/posts/${post['id']}/${review ? 'moderate' : appeal ? 'appeal' : 'flag'}',
        method: 'POST', data: review || appeal ? {...result, 'version': post['version']} : result);
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
            if (p['moderationOutcome'] != null) Text('Moderation: ${p['moderationOutcome']['decision']} · ${p['moderationOutcome']['notes']}'),
            if (p['locality'] != null) Text("स्थान (Approximate locality): ${p['locality']['district']} · ${p['locality']['municipality']}"),
            if (p['contactPhone'] != null) Text("सम्पर्क (Shared contact): ${p['contactPhone']}"),
            if (p['appealReason'] != null) Text('Appeal: ${p['appealReason']}'),
            Wrap(spacing: 8, children: [
              if (p['canAppeal'] == true) TextButton(onPressed: _busy ? null : () => _reason(p as Map, appeal: true), child: const Text('अपिल (Appeal)')),
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
              if (p['canEdit'] == true) TextButton(onPressed: _busy ? null : () => _edit(p as Map), child: const Text('सम्पादन (Edit)')),
              if (p['canViewRevisions'] == true) TextButton(onPressed: _busy ? null : () => Navigator.push(context, MaterialPageRoute(builder: (_) => _RevisionScreen(api: widget.apiService, post: p as Map))), child: const Text('Revision history')),
              if (p['canViewRevisions'] == true) TextButton(onPressed: _busy ? null : () => Navigator.push(context, MaterialPageRoute(builder: (_) => _ModerationHistoryScreen(api: widget.apiService, post: p as Map))), child: const Text('समीक्षा इतिहास (Moderation history)')),
              if (p['media'] != null) TextButton(onPressed: _busy ? null : () => _image(p as Map), child: const Text('तस्बिर (Download image)')),
              if (p['media'] != null && p['canViewRevisions'] == true) TextButton(onPressed: _busy ? null : () => _image(p as Map,original:true), child: const Text('Original image')),
              if (p['media'] != null && p['canEdit'] == true) ...[
                TextButton(onPressed: _busy ? null : () => _image(p as Map,remove:true), child: const Text('Remove image')),
                TextButton(onPressed: _busy ? null : () => _image(p as Map,retry:true), child: const Text('Retry image processing')),
              ],
              if (p['media'] == null && p['canEdit'] == true) TextButton(onPressed: _busy ? null : () => _uploadImage(p as Map), child: const Text('तस्बिर थप्नुहोस् (Add image)')),
              if (p['canEdit'] == true) TextButton(onPressed:_busy?null:()=>_sharing(p as Map),child:const Text('स्थान / सम्पर्क (Location/contact sharing)')),
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
  final Map? post;
  const _PostEditor({this.post});
  @override
  State<_PostEditor> createState() => _PostEditorState();
}
class _PostEditorState extends State<_PostEditor> {
  final _title = TextEditingController(), _content = TextEditingController(), _reason = TextEditingController();
  final _form = GlobalKey<FormState>();
  String _category = 'DISCUSSION';
  @override
  void initState() { super.initState(); if (widget.post != null) { _title.text = widget.post!['title'] as String; _content.text = widget.post!['content'] as String; _category = widget.post!['category'] as String; } }
  @override
  void dispose() { _title.dispose(); _content.dispose(); _reason.dispose(); super.dispose(); }
  @override
  Widget build(BuildContext context) => Scaffold(appBar: AppBar(title: Text(widget.post == null ? 'नयाँ पोस्ट (New post)' : 'सम्पादन (Edit post)')),
    body: Form(key: _form, child: ListView(padding: const EdgeInsets.all(16), children: [
      TextFormField(controller: _title, maxLength: 180, decoration: const InputDecoration(labelText: 'शीर्षक (Title)'), validator: (v) => v!.trim().isEmpty ? 'Required' : null),
      TextFormField(controller: _content, maxLength: 10000, minLines: 4, maxLines: 8, decoration: const InputDecoration(labelText: 'सन्देश (Message)'), validator: (v) => v!.trim().isEmpty ? 'Required' : null),
      if (widget.post != null) ...[const Text('Changes require independent review before publication.'), TextFormField(controller: _reason, maxLength: 1000, decoration: const InputDecoration(labelText: 'Edit reason'), validator: (v) => v!.trim().length < 5 ? 'At least 5 characters required' : null)],
      DropdownButtonFormField<String>(initialValue: _category, decoration: const InputDecoration(labelText: 'प्रकार (Category)'), items: [
        if (widget.post?['category'] == 'ANNOUNCEMENT') const DropdownMenuItem(value: 'ANNOUNCEMENT', child: Text('सूचना (Announcement)')),
        const DropdownMenuItem(value: 'DISCUSSION', child: Text('छलफल (Discussion)')),
        const DropdownMenuItem(value: 'RITUAL', child: Text('परम्परा (Tradition)')),
        const DropdownMenuItem(value: 'ACHIEVEMENT', child: Text('उपलब्धि (Achievement)')),
        const DropdownMenuItem(value: 'MISSING_PERSON', child: Text('हराएको व्यक्ति (Missing person)')),
        const DropdownMenuItem(value: 'PROPERTY_ROOM', child: Text('घर / कोठा उपलब्धता (Property / room)')),
        const DropdownMenuItem(value: 'ASSISTANCE', child: Text('सहयोग अनुरोध (Assistance)')),
        const DropdownMenuItem(value: 'COMMUNITY_PROGRAM', child: Text('सामुदायिक कार्यक्रम (Community program)')),
      ], onChanged: (v) => setState(() => _category = v!)),
      const SizedBox(height: 20), FilledButton(onPressed: () {
        if (_form.currentState!.validate()) { Navigator.pop(context, {'title': _title.text.trim(), 'content': _content.text.trim(), 'category': _category, if (widget.post != null) 'version': widget.post!['version'], if (widget.post != null) 'reason': _reason.text.trim()}); }
      }, child: const Text('समीक्षामा पठाउनुहोस् (Submit for review)')),
    ])));
}

class _ReviewEditor extends StatefulWidget {
  final String title;
  final bool review;
  final bool appeal;
  final bool mediaChange;
  const _ReviewEditor({required this.title, required this.review, this.appeal = false, this.mediaChange = false});
  @override
  State<_ReviewEditor> createState() => _ReviewEditorState();
}
class _ReviewEditorState extends State<_ReviewEditor> {
  final _notes = TextEditingController();
  @override
  void dispose() { _notes.dispose(); super.dispose(); }
  @override
  Widget build(BuildContext context) => Scaffold(appBar: AppBar(title: Text(widget.mediaChange ? 'तस्बिर हटाउनुहोस् (Remove image)' : widget.review ? 'समीक्षा (Review)' : widget.appeal ? 'अपिल (Appeal)' : 'रिपोर्ट (Report)')),
    body: ListView(padding: const EdgeInsets.all(16), children: [Text(widget.title),
      TextField(controller: _notes, minLines: 3, maxLines: 6, maxLength: 1000, onChanged: (_) => setState(() {}), decoration: const InputDecoration(labelText: 'कारण (Reason / notes)')),
      if (widget.review) Wrap(spacing: 12, children: ['PUBLISHED', 'REJECTED'].map((decision) => FilledButton(
        onPressed: _notes.text.trim().length < 5 ? null : () => Navigator.pop(context, {'decision': decision, 'notes': _notes.text.trim()}),
        child: Text(decision == 'PUBLISHED' ? 'Publish' : 'Reject'))).toList())
      else FilledButton(onPressed: _notes.text.trim().length < 5 ? null : () => Navigator.pop(context, {'reason': _notes.text.trim()}), child: Text(widget.mediaChange ? 'Remove image' : widget.appeal ? 'Submit appeal' : 'Submit report')),
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

class _RevisionScreen extends StatefulWidget {
  final GenealogyApiService api;
  final Map post;
  const _RevisionScreen({required this.api, required this.post});
  @override
  State<_RevisionScreen> createState() => _RevisionScreenState();
}
class _RevisionScreenState extends State<_RevisionScreen> {
  List<dynamic> _rows = [];
  String? _error;
  int _page = 1;
  bool _loading = true;
  @override
  void initState() { super.initState(); _load(1); }
  Future<void> _load(int page) async {
    setState(() => _loading = true);
    try {
      final rows = await widget.api.requestJson('/community/posts/${widget.post['id']}/revisions?page=$page');
      if (mounted) { setState(() { _rows = rows as List; _page = page; _error = null; }); }
    } catch (e) { if (mounted) { setState(() => _error = e.toString()); } }
    finally { if (mounted) { setState(() => _loading = false); } }
  }
  Future<void> _download(Map media) async {
    final owner=widget.api.chatAccountId;if(owner==null){return;}
    try{
      final response=await widget.api.communityMedia('/posts/${widget.post['id']}/media/${media['assetId']}?variant=display',owner);
      if(!mounted||widget.api.chatAccountId!=owner){return;}
      await (const MethodChannel('kashyap/chat_attachments')).invokeMethod('save',{'dataBase64':base64Encode(response.bodyBytes),'mimeType':'image/webp','fileName':'community-revision.webp'});
    }catch(e){if(mounted){setState(()=>_error=e.toString());}}
  }
  @override
  Widget build(BuildContext context) => Scaffold(appBar: AppBar(title: const Text('Revision history')),
    body: ListView(padding: const EdgeInsets.all(16), children: [
      const Text('Content versions are retained for review. Older edits before history was enabled are unavailable.'),
      if (_error != null) Text(_error!, style: const TextStyle(color: Colors.red)),
      if (_loading) const Center(child: CircularProgressIndicator())
      else ..._rows.map((r) => Card(child: Padding(padding: const EdgeInsets.all(12), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text('Version ${r['version']} · ${r['title']}'), Text(r['content'] as String), Text(r['category'] as String), Text('Reason: ${r['reason']}'), Text(r['createdAt'].toString()),
        if(r['locality']!=null)Text("Locality: ${r['locality']['district']} · ${r['locality']['municipality']} · ${r['localityVisibility']}"),
        if(r['contactVisibility']!=null)Text("Contact sharing: ${r['contactVisibility']}"),
        ...((r['media'] as List?) ?? []).map((m)=>TextButton(onPressed:()=>_download(m as Map),child:const Text('Revision image'))),
      ])))),
      Wrap(spacing: 8, children: [
        TextButton(onPressed: _loading || _page == 1 ? null : () => _load(_page - 1), child: const Text('Newer versions')),
        TextButton(onPressed: _loading || _rows.length < 50 ? null : () => _load(_page + 1), child: const Text('Older versions')),
        if (_error != null) TextButton(onPressed: _loading ? null : () => _load(_page), child: const Text('Retry')),
      ]),
    ]));
}

class _ModerationHistoryScreen extends StatefulWidget {
  final GenealogyApiService api;
  final Map post;
  const _ModerationHistoryScreen({required this.api, required this.post});
  @override
  State<_ModerationHistoryScreen> createState() => _ModerationHistoryScreenState();
}
class _ModerationHistoryScreenState extends State<_ModerationHistoryScreen> {
  List<dynamic> _items = [];
  int? _next, _cursor;
  bool _loading = true;
  String? _error;
  @override
  void initState() { super.initState(); _load(null); }
  Future<void> _load(int? cursor) async {
    setState(() { _loading = true; _error = null; _cursor = cursor; });
    try {
      final result = await widget.api.requestJson('/community/posts/${widget.post['id']}/moderation-history${cursor == null ? '' : '?beforeVersion=$cursor'}') as Map;
      if (mounted) { setState(() { _items = result['items'] as List; _next = result['nextBeforeVersion'] as int?; _loading = false; }); }
    } catch (e) { if (mounted) { setState(() { _error = e.toString(); _items = []; _loading = false; }); } }
  }
  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('समीक्षा इतिहास (Moderation history)')),
    body: _loading ? const Center(child: CircularProgressIndicator()) : ListView(padding: const EdgeInsets.all(16), children: [
      if (_error != null) ...[Text(_error!), TextButton(onPressed: () => _load(_cursor), child: const Text('Retry'))]
      else ...[
        if (_items.isEmpty) const Text('No recorded decisions.'),
        ..._items.map((d) => Card(child: Padding(padding: const EdgeInsets.all(12), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text("Version ${d['version']} · ${d['decision']}"), Text(d['notes'] as String), Text(d['createdAt'] as String),
          if (d['appeal'] != null) ...[Text("Appeal: ${d['appeal']['status']}"), Text(d['appeal']['reason'] as String), Text(d['appeal']['createdAt'] as String), if (d['appeal']['resolvedAt'] != null) Text(d['appeal']['resolvedAt'] as String)],
        ])))),
        TextButton(onPressed: () => _load(null), child: const Text('Latest decisions')),
        TextButton(onPressed: _next == null ? null : () => _load(_next), child: const Text('Older decisions')),
      ],
    ]),
  );
}

class _CommunityImageEditor extends StatefulWidget {
 final GenealogyApiService api;
 final Map post;
 const _CommunityImageEditor({required this.api,required this.post});
 @override
 State<_CommunityImageEditor> createState()=>_CommunityImageEditorState();
}
class _CommunityImageEditorState extends State<_CommunityImageEditor> {
 final _reason=TextEditingController();
 Map<String,String>? _file;
 Map<String,dynamic>? _body;
 String? _error,_owner;
 bool _busy=false;
 static const _files=MethodChannel('kashyap/chat_attachments');
 @override
 void initState(){super.initState();_owner=widget.api.chatAccountId;}
 @override
 void dispose(){_reason.dispose();super.dispose();}
 Future<void> _pick() async {
  try{final file=await _files.invokeMapMethod<String,String>('pick');if(file==null){return;}
   if(!['image/png','image/jpeg','image/webp'].contains(file['mimeType'])||(file['dataBase64']?.length??0)>6990508){throw Exception('Choose PNG, JPEG or WebP up to 5 MB');}
   if(mounted){setState(()=>_file=Map<String,String>.from(file));}
  }catch(e){if(mounted){setState(()=>_error=e.toString());}}
 }
 Future<void> _submit() async {
  setState(()=>_busy=true);
  try{
   if(_owner==null){throw StateError('Sign in to upload an image');}
   if(_body==null){
    final random=Random.secure(),bytes=List<int>.generate(16,(_)=>0);for(var i=0;i<16;i++){bytes[i]=random.nextInt(256);}bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
    final h=bytes.map((b)=>b.toRadixString(16).padLeft(2,'0')).join();
    final id='${h.substring(0,8)}-${h.substring(8,12)}-${h.substring(12,16)}-${h.substring(16,20)}-${h.substring(20)}';
    _body={..._file!,'version':widget.post['version'],'reason':_reason.text.trim(),'clientUploadId':id};
   }
   await widget.api.communityMedia('/posts/${widget.post['id']}/media',_owner!,method:'POST',data:_body);
   if(mounted){Navigator.pop(context);}
  }catch(e){if(mounted){setState(()=>_error=e.toString());}}
  finally{if(mounted){setState(()=>_busy=false);}}
 }
 @override
 Widget build(BuildContext context)=>Scaffold(appBar:AppBar(title:const Text('तस्बिर थप्नुहोस् (Add image)')),
  body:ListView(padding:const EdgeInsets.all(16),children:[
   const Text('PNG, JPEG or WebP up to 5 MB. Image changes require independent review. Feed downloads remove image metadata.'),
   if(_error!=null)Text(_error!),
   TextButton(onPressed:_busy||_body!=null?null:_pick,child:Text(_file==null?'Choose image':'Image selected')),
   TextField(controller:_reason,enabled:!_busy&&_body==null,maxLength:1000,onChanged:(_)=>setState((){}),decoration:const InputDecoration(labelText:'Image change reason')),
   FilledButton(onPressed:_busy||(_body==null&&(_file==null||_reason.text.trim().length<5))?null:_submit,child:Text(_body==null?'Submit image for review':'Retry image upload')),
  ]));
}

class _CommunitySharingEditor extends StatefulWidget {
 final Map post;
 const _CommunitySharingEditor({required this.post});
 @override
 State<_CommunitySharingEditor> createState()=>_CommunitySharingEditorState();
}
class _CommunitySharingEditorState extends State<_CommunitySharingEditor> {
 final _district=TextEditingController(),_municipality=TextEditingController(),_reason=TextEditingController();
 bool _shareLocality=false,_shareContact=false;
 @override
 void initState(){super.initState();_district.text=widget.post['locality']?['district'] as String? ?? '';_municipality.text=widget.post['locality']?['municipality'] as String? ?? '';_shareLocality=widget.post['sharing']?['localityVisibility']=='VERIFIED_COMMUNITY';_shareContact=widget.post['sharing']?['contactConsent']==true;}
 @override
 void dispose(){_district.dispose();_municipality.dispose();_reason.dispose();super.dispose();}
 @override
 Widget build(BuildContext context)=>Scaffold(appBar:AppBar(title:const Text('स्थान / सम्पर्क (Location/contact sharing)')),
  body:ListView(padding:const EdgeInsets.all(16),children:[
   const Text('District and municipality names only; no street address, house numbers or coordinates. Private locality is visible to you and scoped moderators.'),
   TextField(controller:_district,maxLength:80,decoration:const InputDecoration(labelText:'जिल्ला (District)')),
   TextField(controller:_municipality,maxLength:80,decoration:const InputDecoration(labelText:'नगरपालिका (Municipality)')),
   SwitchListTile(title:const Text('Share approximate locality with verified post readers'),value:_shareLocality,onChanged:(v)=>setState(()=>_shareLocality=v)),
   SwitchListTile(title:const Text('I consent to share my verified phone with verified post readers'),value:_shareContact,onChanged:(v)=>setState(()=>_shareContact=v)),
   const Text('Location/contact sharing follows current profile address/contact privacy and adult-profile protection. Changes require independent review. Phone numbers are not copied into revision history.'),
   TextField(controller:_reason,maxLength:1000,onChanged:(_)=>setState((){}),decoration:const InputDecoration(labelText:'कारण (Sharing change reason)')),
   FilledButton(onPressed:_reason.text.trim().length<5?null:()=>Navigator.pop(context,{'version':widget.post['version'],'reason':_reason.text.trim(),'locality':_district.text.trim().isEmpty&&_municipality.text.trim().isEmpty?null:{'district':_district.text.trim(),'municipality':_municipality.text.trim()},'localityVisibility':_shareLocality?'VERIFIED_COMMUNITY':'PRIVATE','contactVisibility':_shareContact?'VERIFIED_COMMUNITY':'PRIVATE','contactConsent':_shareContact}),child:const Text('Save sharing for review')),
  ]));
}
