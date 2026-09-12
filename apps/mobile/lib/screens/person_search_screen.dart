import 'package:flutter/material.dart';
import '../models/person.dart';
import '../services/genealogy_api_service.dart';
import '../theme/app_theme.dart';
import 'person_detail_screen.dart';

class PersonSearchScreen extends StatefulWidget {
  final GenealogyApiService apiService;

  const PersonSearchScreen({Key? key, required this.apiService}) : super(key: key);

  @override
  State<PersonSearchScreen> createState() => _PersonSearchScreenState();
}

class _PersonSearchScreenState extends State<PersonSearchScreen> {
  final TextEditingController _searchController = TextEditingController();
  List<PersonSummary> _results = [];
  bool _isLoading = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _performSearch('');
  }

  Future<void> _performSearch(String query) async {
    setState(() {
      _isLoading = true;
      _error = null;
    });

    try {
      final items = await widget.apiService.searchPersons(query: query);
      setState(() {
        _results = items;
      });
    } catch (e) {
      setState(() {
        _error = e.toString();
      });
    } finally {
      setState(() {
        _isLoading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('कश्यप अधिकारी वंशावली', style: TextStyle(fontWeight: FontWeight.bold)),
      ),
      body: Column(
        children: [
          // Search Header Box
          Container(
            padding: const EdgeInsets.all(16),
            color: Colors.white,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'वंशज तथा पुर्खा खोजी (Search Lineage)',
                  style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16, color: AppTheme.textDark),
                ),
                const SizedBox(height: 8),
                TextField(
                  controller: _searchController,
                  onChanged: (val) {
                    _performSearch(val);
                  },
                  decoration: InputDecoration(
                    hintText: 'नाम वा स्थान (Nepali / English)...',
                    prefixIcon: const Icon(Icons.search, color: AppTheme.saffron),
                    suffixIcon: _searchController.text.isNotEmpty
                        ? IconButton(
                            icon: const Icon(Icons.clear),
                            onPressed: () {
                              _searchController.clear();
                              _performSearch('');
                            },
                          )
                        : null,
                  ),
                ),
              ],
            ),
          ),

          // Search Results
          Expanded(
            child: _isLoading
                ? const Center(child: CircularProgressIndicator(color: AppTheme.saffron))
                : _error != null
                    ? Center(
                        child: Text(_error!, style: const TextStyle(color: Colors.red)),
                      )
                    : _results.isEmpty
                        ? const Center(
                            child: Text(
                              'कुनै व्यक्ति फेला परेन (No persons found)',
                              style: TextStyle(color: AppTheme.textMuted),
                            ),
                          )
                        : ListView.builder(
                            padding: const EdgeInsets.all(12),
                            itemCount: _results.length,
                            itemBuilder: (context, index) {
                              final person = _results[index];
                              return Card(
                                margin: const EdgeInsets.only(bottom: 8),
                                child: ListTile(
                                  onTap: () {
                                    Navigator.push(
                                      context,
                                      MaterialPageRoute(
                                        builder: (_) => PersonDetailScreen(
                                          personId: person.id,
                                          apiService: widget.apiService,
                                        ),
                                      ),
                                    );
                                  },
                                  leading: CircleAvatar(
                                    backgroundColor: person.livingStatus == LivingStatus.living
                                        ? AppTheme.livingGreen.withOpacity(0.15)
                                        : AppTheme.deceasedSlate.withOpacity(0.15),
                                    child: Text(
                                      person.generation != null ? 'G${person.generation}' : '?',
                                      style: TextStyle(
                                        fontWeight: FontWeight.bold,
                                        fontSize: 12,
                                        color: person.livingStatus == LivingStatus.living
                                            ? AppTheme.livingGreen
                                            : AppTheme.deceasedSlate,
                                      ),
                                    ),
                                  ),
                                  title: Text(
                                    person.fullNameNepali,
                                    style: const TextStyle(fontWeight: FontWeight.bold, color: AppTheme.textDark),
                                  ),
                                  subtitle: Text(
                                    '${person.branchNameNepali ?? 'शाखा अज्ञात'} • ${person.livingStatus == LivingStatus.living ? 'जीवित' : 'दिवंगत'}',
                                    style: const TextStyle(fontSize: 12, color: AppTheme.textMuted),
                                  ),
                                  trailing: const Icon(Icons.chevron_right, color: AppTheme.saffron),
                                ),
                              );
                            },
                          ),
          ),
        ],
      ),
    );
  }
}
