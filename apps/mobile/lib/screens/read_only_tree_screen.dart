import 'package:flutter/material.dart';
import '../models/tree_node.dart';
import '../services/genealogy_api_service.dart';
import '../theme/app_theme.dart';
import 'person_detail_screen.dart';

class ReadOnlyTreeScreen extends StatefulWidget {
  final String rootPersonId;
  final GenealogyApiService apiService;

  const ReadOnlyTreeScreen({super.key, required this.rootPersonId, required this.apiService});

  @override
  State<ReadOnlyTreeScreen> createState() => _ReadOnlyTreeScreenState();
}

class _ReadOnlyTreeScreenState extends State<ReadOnlyTreeScreen> {
  TreeNode? _treeRoot;
  bool _isLoading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _loadTree();
  }

  Future<void> _loadTree() async {
    try {
      final root = await widget.apiService.getTree(widget.rootPersonId, ancestors: 2, descendants: 2);
      setState(() {
        _treeRoot = root;
        _isLoading = false;
      });
    } catch (e) {
      setState(() {
        _error = e.toString();
        _isLoading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('वंशावली रुख (Family Tree)', style: TextStyle(fontWeight: FontWeight.bold)),
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator(color: AppTheme.saffron))
          : _error != null
              ? Center(child: Text(_error!))
              : InteractiveViewer(
                  boundaryMargin: const EdgeInsets.all(200),
                  minScale: 0.5,
                  maxScale: 2.5,
                  child: Center(
                    child: SingleChildScrollView(
                      scrollDirection: Axis.horizontal,
                      child: Padding(
                        padding: const EdgeInsets.all(32),
                        child: _buildTreeHierarchy(_treeRoot!),
                      ),
                    ),
                  ),
                ),
    );
  }

  Widget _buildTreeHierarchy(TreeNode root) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        // Ancestor chain if available
        if (root.ancestors.isNotEmpty) ...[
          ...root.ancestors.map((ancestor) => Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  _buildNodeCard(ancestor, isAncestor: true),
                  Container(width: 2, height: 16, color: AppTheme.heritageBrown.withValues(alpha: 0.4)),
                ],
              )),
        ],

        // Focus node (and spouses if present)
        Row(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.center,
          children: [
            _buildNodeCard(root, isFocus: true),
            if (root.spouses.isNotEmpty) ...[
              const SizedBox(width: 8),
              const Icon(Icons.favorite, color: Colors.redAccent, size: 16),
              const SizedBox(width: 8),
              ...root.spouses.map((spouse) => Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: _buildNodeCard(spouse, isSpouse: true),
                  )),
            ],
          ],
        ),

        // Descendants / Children
        if (root.children.isNotEmpty) ...[
          Container(width: 2, height: 20, color: AppTheme.heritageBrown.withValues(alpha: 0.4)),
          Row(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: root.children
                .map((child) => Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 12),
                      child: _buildTreeNodeWidget(child),
                    ))
                .toList(),
          ),
        ],
      ],
    );
  }

  Widget _buildTreeNodeWidget(TreeNode node) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        _buildNodeCard(node),
        if (node.children.isNotEmpty) ...[
          Container(width: 2, height: 20, color: AppTheme.heritageBrown.withValues(alpha: 0.4)),
          Row(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: node.children
                .map((child) => Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 12),
                      child: _buildTreeNodeWidget(child),
                    ))
                .toList(),
          ),
        ],
      ],
    );
  }

  Widget _buildNodeCard(TreeNode node, {bool isFocus = false, bool isAncestor = false, bool isSpouse = false}) {
    final borderColor = isFocus
        ? AppTheme.saffron
        : isAncestor
            ? AppTheme.heritageBrown
            : isSpouse
                ? Colors.pinkAccent
                : const Color(0xFFD3C5B8);

    return GestureDetector(
      onTap: () {
        Navigator.push(
          context,
          MaterialPageRoute(
            builder: (_) => PersonDetailScreen(personId: node.id, apiService: widget.apiService),
          ),
        );
      },
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: borderColor, width: isFocus ? 2.5 : 1.5),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.06),
              blurRadius: 4,
              offset: const Offset(0, 2),
            ),
          ],
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              node.nameNepali.isNotEmpty ? node.nameNepali : 'अज्ञात',
              style: TextStyle(
                fontWeight: isFocus ? FontWeight.bold : FontWeight.w600,
                fontSize: isFocus ? 15 : 13,
                color: AppTheme.textDark,
              ),
            ),
            if (node.nameEnglish != null && node.nameEnglish!.isNotEmpty)
              Text(
                node.nameEnglish!,
                style: const TextStyle(fontSize: 10, color: AppTheme.textMuted),
              ),
            const SizedBox(height: 4),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
              decoration: BoxDecoration(
                color: AppTheme.saffron.withValues(alpha: 0.15),
                borderRadius: BorderRadius.circular(6),
              ),
              child: Text(
                node.generation != null ? 'G${node.generation}' : 'Gen ?',
                style: const TextStyle(fontSize: 9, fontWeight: FontWeight.bold, color: AppTheme.heritageBrown),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
