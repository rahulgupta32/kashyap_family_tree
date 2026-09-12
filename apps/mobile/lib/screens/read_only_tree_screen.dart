import 'package:flutter/material.dart';
import '../models/tree_node.dart';
import '../services/genealogy_api_service.dart';
import '../theme/app_theme.dart';
import 'person_detail_screen.dart';

class ReadOnlyTreeScreen extends StatefulWidget {
  final String rootPersonId;
  final GenealogyApiService apiService;

  const ReadOnlyTreeScreen({Key? key, required this.rootPersonId, required this.apiService})
      : super(key: key);

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
                        child: _buildTreeNodeWidget(_treeRoot!),
                      ),
                    ),
                  ),
                ),
    );
  }

  Widget _buildTreeNodeWidget(TreeNode node) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        // Node Box
        GestureDetector(
          onTap: () {
            Navigator.push(
              context,
              MaterialPageRoute(
                builder: (_) => PersonDetailScreen(personId: node.id, apiService: widget.apiService),
              ),
            );
          },
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: AppTheme.saffron, width: 2),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withOpacity(0.06),
                  blurRadius: 6,
                  offset: const Offset(0, 2),
                ),
              ],
            ),
            child: Column(
              children: [
                Text(
                  node.fullNameNepali,
                  style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14, color: AppTheme.textDark),
                ),
                if (node.fullNameEnglish != null)
                  Text(
                    node.fullNameEnglish!,
                    style: const TextStyle(fontSize: 10, color: AppTheme.textMuted),
                  ),
                const SizedBox(height: 4),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                  decoration: BoxDecoration(
                    color: AppTheme.saffron.withOpacity(0.15),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text(
                    node.generation != null ? 'G${node.generation}' : 'Gen ?',
                    style: const TextStyle(fontSize: 9, fontWeight: FontWeight.bold, color: AppTheme.heritageBrown),
                  ),
                ),
              ],
            ),
          ),
        ),

        // Connecting lines & Children
        if (node.children.isNotEmpty) ...[
          Container(width: 2, height: 20, color: AppTheme.heritageBrown.withOpacity(0.4)),
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
}
