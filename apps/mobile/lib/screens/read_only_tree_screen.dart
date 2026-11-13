import 'dart:async';
import 'dart:math' as math;
import '../widgets/heritage.dart';
import 'package:flutter/material.dart';
import '../models/person.dart';
import '../models/tree_node.dart';
import '../services/genealogy_api_service.dart';
import '../theme/app_theme.dart';
import 'person_detail_screen.dart';

class ReadOnlyTreeScreen extends StatefulWidget {
  final String rootPersonId;
  final GenealogyApiService apiService;

  const ReadOnlyTreeScreen(
      {super.key, required this.rootPersonId, required this.apiService});

  @override
  State<ReadOnlyTreeScreen> createState() => _ReadOnlyTreeScreenState();
}

class _ReadOnlyTreeScreenState extends State<ReadOnlyTreeScreen> {
  TreeNode? _treeRoot;
  bool _isLoading = true, _expired = false, _listView = false;
  String? _error;
  late String _focusId;
  late int _session;
  int _request = 0;
  String _direction = 'All';
  final List<String> _history = [];
  final _graphKey = GlobalKey();
  final _viewportKey = GlobalKey();
  Timer? _sessionWatch;
  final TransformationController _transform = TransformationController();

  @override
  void initState() {
    super.initState();
    _focusId = widget.rootPersonId;
    _session = widget.apiService.pushSessionGeneration;
    _sessionWatch =
        Timer.periodic(const Duration(milliseconds: 500), (_) => _current());
    _loadTree();
  }

  bool _current() {
    if (!mounted || _expired) return false;
    if (_session != widget.apiService.pushSessionGeneration) {
      setState(() {
        _expired = true;
        _request++;
        _treeRoot = null;
        _history.clear();
        _isLoading = false;
        _error =
            'सत्र बदलियो। रुख फेरि खोल्नुहोस् (Session changed; reopen the tree)';
      });
      return false;
    }
    return true;
  }

  Future<void> _loadTree({String? focus, bool back = false}) async {
    if (!_current()) return;
    final previous = _focusId;
    final target = focus ?? _focusId;
    final request = ++_request;
    setState(() {
      if (back && _history.isNotEmpty) {
        _history.removeLast();
      } else if (target != previous) {
        _history.add(previous);
        if (_history.length > 100) _history.removeAt(0);
      }
      _isLoading = true;
      _error = null;
      _treeRoot = null;
      _focusId = target;
    });
    try {
      // Refocus a bounded context rather than appending an ever-growing graph.
      // The API rechecks current record/field visibility on every expansion.
      final root =
          await widget.apiService.getTree(target, ancestors: 2, descendants: 2);
      if (!_current() || request != _request) return;
      setState(() {
        _treeRoot = root;
        _isLoading = false;
        _transform.value = Matrix4.identity();
      });
      WidgetsBinding.instance.addPostFrameCallback((_) => _fit());
    } catch (_) {
      if (!_current() || request != _request) return;
      setState(() {
        _error =
            'रुख उपलब्ध छैन वा हेर्न अनुमति छैन। फेरि प्रयास गर्नुहोस् (Tree unavailable or access denied; retry)';
        _isLoading = false;
      });
    }
  }

  @override
  void didUpdateWidget(covariant ReadOnlyTreeScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.rootPersonId != widget.rootPersonId ||
        oldWidget.apiService != widget.apiService) {
      _request++;
      _session = widget.apiService.pushSessionGeneration;
      _expired = false;
      _history.clear();
      _focusId = widget.rootPersonId;
      _loadTree();
    }
  }

  @override
  void dispose() {
    _request++;
    _sessionWatch?.cancel();
    _transform.dispose();
    super.dispose();
  }

  void _openPerson(TreeNode node) {
    if (!_current()) return;
    Navigator.push(
        context,
        MaterialPageRoute(
            builder: (_) => PersonDetailScreen(
                  personId: node.id,
                  apiService: widget.apiService,
                )));
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(
          title: const Text('वंशावली रुख (Family Tree)'),
          actions: [
            IconButton(
              tooltip: 'अघिल्लो केन्द्र (Previous focus)',
              onPressed: _isLoading || _expired || _history.isEmpty
                  ? null
                  : () => _loadTree(focus: _history.last, back: true),
              icon: const Icon(Icons.undo),
            ),
            IconButton(
              tooltip: _listView
                  ? 'रुख दृश्य (Tree view)'
                  : 'सूची दृश्य (List view)',
              onPressed: _expired
                  ? null
                  : () => setState(() => _listView = !_listView),
              icon: Icon(_listView ? Icons.account_tree : Icons.list),
            ),
            IconButton(
              tooltip: 'दृश्य केन्द्रमा ल्याउनुहोस् (Center view)',
              onPressed: _isLoading || _expired
                  ? null
                  : _fit,
              icon: const Icon(Icons.center_focus_strong),
            ),
          ],
        ),
        body: _isLoading
            ? const Center(
                child: CircularProgressIndicator(color: AppTheme.saffron))
            : _error != null
                ? Center(
                    child: Padding(
                        padding: const EdgeInsets.all(24),
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text(_error!, textAlign: TextAlign.center),
                            if (!_expired)
                              TextButton(
                                  onPressed: () => _loadTree(),
                                  child: const Text('फेरि प्रयास (Retry)')),
                          ],
                        )))
                : Column(children: [
                    Padding(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 16, vertical: 8),
                        child: SingleChildScrollView(
                            scrollDirection: Axis.horizontal,
                            child: Row(children: [
                              for (final direction in const [
                                'All',
                                'Ancestors',
                                'Descendants'
                              ])
                                Padding(
                                    padding: const EdgeInsets.only(right: 8),
                                    child: ChoiceChip(
                                        label: Text(direction),
                                        selected: _direction == direction,
                                        onSelected: (_) => setState(
                                            () => _direction = direction))),
                            ]))),
                    Expanded(
                        child: _listView
                            ? ListView(
                                padding: const EdgeInsets.all(16),
                                children:
                                    _listNodes(_treeRoot!, 'केन्द्र (Focus)'))
                            : Stack(key: _viewportKey, children: [
                                Positioned.fill(
                                    child: HeritagePaper(
                                        child: InteractiveViewer(
                                  transformationController: _transform,
                                  constrained: false,
                                  boundaryMargin: const EdgeInsets.all(240),
                                  minScale: 0.35,
                                  maxScale: 2.5,
                                  child: Padding(
                                      key: _graphKey,
                                      padding: const EdgeInsets.all(48),
                                      child: _buildTree(_treeRoot!)),
                                ))),
                                Positioned(
                                    top: 16,
                                    right: 16,
                                    child: Card(
                                        child: Column(
                                            mainAxisSize: MainAxisSize.min,
                                            children: [
                                          IconButton(
                                              tooltip: 'Zoom in',
                                              onPressed: () => _zoom(1.2),
                                              icon: const Icon(Icons.zoom_in)),
                                          IconButton(
                                              tooltip: 'Zoom out',
                                              onPressed: () => _zoom(1 / 1.2),
                                              icon: const Icon(Icons.zoom_out)),
                                          IconButton(
                                              tooltip: 'Center family tree',
                                              onPressed: _fit,
                                              icon: const Icon(
                                                  Icons.my_location_outlined)),
                                        ]))),
                                Positioned(
                                    bottom: 16,
                                    left: 16,
                                    child: Container(
                                        padding: const EdgeInsets.symmetric(
                                            horizontal: 12, vertical: 8),
                                        decoration: BoxDecoration(
                                            color: Colors.white,
                                            borderRadius:
                                                BorderRadius.circular(8),
                                            border: Border.all(
                                                color: AppTheme.outline)),
                                        child: const Row(children: [
                                          Icon(Icons.circle,
                                              color: AppTheme.saffronLight,
                                              size: 9),
                                          SizedBox(width: 8),
                                          Text(
                                              'केन्द्रमा चयन गरिएको व्यक्ति · Focus person',
                                              style: TextStyle(fontSize: 10))
                                        ]))),
                              ])),
                    const SizedBox(height: 40, child: SingleChildScrollView(child: Padding(
                        padding: EdgeInsets.fromLTRB(16, 8, 16, 12),
                        child: Text(
                            'थप नाता हेर्न व्यक्ति केन्द्रमा राख्नुहोस्। (Focus a person to explore more relatives.)',
                            textAlign: TextAlign.center,
                            style: TextStyle(
                                fontSize: 11, color: AppTheme.textMuted))))),
                  ]),
      );

  void _fit() {
    if (!mounted || _listView || _treeRoot == null) return;
    final graph = _graphKey.currentContext?.findRenderObject() as RenderBox?;
    final viewport = _viewportKey.currentContext?.findRenderObject() as RenderBox?;
    if (graph == null || viewport == null || !graph.hasSize || !viewport.hasSize) return;
    final scale = math.min((viewport.size.width - 32) / graph.size.width,
        (viewport.size.height - 40) / graph.size.height).clamp(.35, 1.0).toDouble();
    _transform.value = Matrix4.identity()
      ..translateByDouble((viewport.size.width - graph.size.width * scale) / 2,
          (viewport.size.height - graph.size.height * scale) / 2, 0, 1)
      ..scaleByDouble(scale, scale, 1, 1);
  }

  void _zoom(double factor) {
    final scale = _transform.value.getMaxScaleOnAxis();
    final next = scale * factor;
    if (next >= .35 && next <= 2.5) {
      _transform.value = _transform.value.clone()
        ..multiply(Matrix4.diagonal3Values(factor, factor, 1));
    }
  }

  Widget _buildTree(TreeNode node) =>
      Column(mainAxisSize: MainAxisSize.min, children: [
        if (_direction != 'Descendants' && node.ancestors.isNotEmpty) ...[
          Row(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.end,
              children: node.ancestors
                  .map((ancestor) => Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 12),
                      child: _buildTree(ancestor)))
                  .toList()),
          _connector(),
          const Text('अभिभावक (Parents)'),
        ],
        Row(mainAxisSize: MainAxisSize.min, children: [
          _nodeCard(node),
          ...node.spouses.map((spouse) => Padding(
              padding: const EdgeInsets.only(left: 12),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [const Text('दम्पती (Spouse)'), _nodeCard(spouse)],
              ))),
        ]),
        if (_direction != 'Ancestors' && node.children.isNotEmpty) ...[
          _connector(),
          const Text('सन्तान (Children)'),
          Row(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: node.children
                  .map((child) => Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 12),
                      child: _buildTree(child)))
                  .toList()),
        ],
      ]);

  Widget _connector() => Container(
      width: 1.5,
      height: 30,
      color: AppTheme.heritageBrown.withValues(alpha: 0.4));

  List<Widget> _listNodes(TreeNode node, String relation) => [
        Padding(padding: const EdgeInsets.only(top: 12), child: Text(relation)),
        _nodeCard(node, fullWidth: true),
        if (_direction != 'Descendants')
          ...node.ancestors.expand((ancestor) =>
              _listNodes(ancestor, 'पुर्खा (Ancestor) · ${node.nameNepali}')),
        ...node.spouses.expand((spouse) =>
            _listNodes(spouse, 'दम्पती (Spouse) · ${node.nameNepali}')),
        if (_direction != 'Ancestors')
          ...node.children.expand((child) =>
              _listNodes(child, 'सन्तान (Descendant) · ${node.nameNepali}')),
      ];

  Widget _nodeCard(TreeNode node, {bool fullWidth = false}) {
    final focus = node.id == _treeRoot?.id;
    return SizedBox(
        width: fullWidth ? null : 170,
        child: Card(
          shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(8),
              side: BorderSide(
                color: focus ? AppTheme.saffron : const Color(0xFFD3C5B8),
                width: focus ? 1.5 : .8,
              )),
          child: Padding(
              padding: const EdgeInsets.all(12),
              child: Column(mainAxisSize: MainAxisSize.min, children: [
                HeritageAvatar(
                    name: node.nameNepali,
                    size: fullWidth ? 52 : 44,
                    deceased: node.livingStatus == LivingStatus.deceased),
                const SizedBox(height: 10),
                Text(
                    node.nameNepali.isNotEmpty
                        ? node.nameNepali
                        : 'अज्ञात (Unknown)',
                    textAlign: TextAlign.center,
                    maxLines: fullWidth ? null : 2, overflow: TextOverflow.ellipsis,
                    style: AppTheme.editorial.copyWith(
                        fontSize: 17,
                        fontWeight: focus ? FontWeight.bold : FontWeight.w600)),
                if (node.nameEnglish?.isNotEmpty == true)
                  Text(node.nameEnglish!, textAlign: TextAlign.center),
                if (node.generation != null) Text('पुस्ता · G${node.generation}', style: const TextStyle(fontSize: 11)),
                Text(node.livingStatus == LivingStatus.deceased
                    ? 'दिवंगत (Deceased)'
                    : 'जीवित (Living)', style: const TextStyle(fontSize: 11)),
                if (!fullWidth) Wrap(alignment: WrapAlignment.center, children: [
                  IconButton(key: ValueKey('tree-detail-${node.id}'), tooltip:'विवरण (Details)', onPressed:()=>_openPerson(node),icon:const Icon(Icons.person_outline,size:18)),
                  if(!focus) IconButton(key: ValueKey('tree-focus-${node.id}'), tooltip:'केन्द्र (Focus)',onPressed:()=>_loadTree(focus:node.id),icon:const Icon(Icons.center_focus_strong,size:18)),
                  if(node.hasMoreAncestors) IconButton(key:ValueKey('tree-ancestors-${node.id}'),tooltip:'थप पुर्खा (More ancestors)',onPressed:()=>_loadTree(focus:node.id),icon:const Icon(Icons.expand_less,size:18)),
                  if(node.hasMoreDescendants) IconButton(key:ValueKey('tree-descendants-${node.id}'),tooltip:'थप सन्तान (More descendants)',onPressed:()=>_loadTree(focus:node.id),icon:const Icon(Icons.expand_more,size:18)),
                ]) else
                Wrap(alignment: WrapAlignment.center, children: [
                  TextButton(
                      key: ValueKey('tree-detail-${node.id}'),
                      onPressed: () => _openPerson(node),
                      style:
                          TextButton.styleFrom(minimumSize: const Size(48, 48)),
                      child: const Text('विवरण (Details)')),
                  if (!focus)
                    TextButton(
                        key: ValueKey('tree-focus-${node.id}'),
                        onPressed: () => _loadTree(focus: node.id),
                        style: TextButton.styleFrom(
                            minimumSize: const Size(48, 48)),
                        child: const Text('केन्द्र (Focus)')),
                  if (node.hasMoreAncestors)
                    TextButton(
                        key: ValueKey('tree-ancestors-${node.id}'),
                        onPressed: () => _loadTree(focus: node.id),
                        style: TextButton.styleFrom(
                            minimumSize: const Size(48, 48)),
                        child: const Text('थप पुर्खा (More ancestors)')),
                  if (node.hasMoreDescendants)
                    TextButton(
                        key: ValueKey('tree-descendants-${node.id}'),
                        onPressed: () => _loadTree(focus: node.id),
                        style: TextButton.styleFrom(
                            minimumSize: const Size(48, 48)),
                        child: const Text('थप सन्तान (More descendants)')),
                ]),
              ])),
        ));
  }
}
