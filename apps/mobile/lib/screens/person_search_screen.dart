import 'package:flutter/material.dart';
import '../models/person.dart';
import '../services/genealogy_api_service.dart';
import '../theme/app_theme.dart';
import 'person_detail_screen.dart';
import 'read_only_tree_screen.dart';
import 'claim_profile_screen.dart';
import 'change_request_screen.dart';
import 'calendar_events_screen.dart';
import 'profile_privacy_screen.dart';

class PersonSearchScreen extends StatefulWidget {
  final GenealogyApiService apiService;

  const PersonSearchScreen({super.key, required this.apiService});

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
      drawer: Drawer(
        child: ListView(
          padding: EdgeInsets.zero,
          children: [
            const DrawerHeader(
              decoration: BoxDecoration(color: AppTheme.saffron),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Text(
                    'कश्यप अधिकारी वंशावली',
                    style: TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold),
                  ),
                  SizedBox(height: 4),
                  Text('नेभिगेसन मेनु (Navigation Menu)', style: TextStyle(color: Colors.white70, fontSize: 12)),
                ],
              ),
            ),
            ListTile(
              leading: const Icon(Icons.search, color: AppTheme.saffron),
              title: const Text('व्यक्ति खोजी (Person Search)'),
              onTap: () => Navigator.pop(context),
            ),
            ListTile(
              leading: const Icon(Icons.account_tree, color: AppTheme.heritageBrown),
              title: const Text('वंशावली रुख (Family Tree)'),
              onTap: () {
                final targetId = _results.isNotEmpty ? _results.first.id : null;
                if (targetId == null) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('कृपया पहिले व्यक्ति चयन गर्नुहोस् (Please select a person first)')),
                  );
                  return;
                }
                Navigator.pop(context);
                Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (_) => ReadOnlyTreeScreen(rootPersonId: targetId, apiService: widget.apiService),
                  ),
                );
              },
            ),
            ListTile(
              leading: const Icon(Icons.verified_user, color: Colors.blue),
              title: const Text('दाबी प्रमाणीकरण (Profile Claims)'),
              onTap: () {
                final targetPerson = _results.isNotEmpty ? _results.first : null;
                if (targetPerson == null) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('कृपया पहिले व्यक्ति चयन गर्नुहोस् (Please select a person first)')),
                  );
                  return;
                }
                Navigator.pop(context);
                Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (_) => ClaimProfileScreen(
                      personId: targetPerson.id,
                      personName: targetPerson.primaryNameNepali,
                      apiService: widget.apiService,
                    ),
                  ),
                );
              },
            ),
            ListTile(
              leading: const Icon(Icons.edit_document, color: Colors.amber),
              title: const Text('संशोधन अनुरोध (Change Requests)'),
              onTap: () {
                final targetPerson = _results.isNotEmpty ? _results.first : null;
                if (targetPerson == null) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('कृपया पहिले व्यक्ति चयन गर्नुहोस् (Please select a person first)')),
                  );
                  return;
                }
                Navigator.pop(context);
                Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (_) => ChangeRequestScreen(
                      personId: targetPerson.id,
                      personName: targetPerson.primaryNameNepali,
                      apiService: widget.apiService,
                    ),
                  ),
                );
              },
            ),
            ListTile(
              leading: const Icon(Icons.calendar_month, color: Colors.deepOrange),
              title: const Text('पात्रो तथा कार्यक्रम (Calendar)'),
              onTap: () {
                Navigator.pop(context);
                Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (_) => CalendarEventsScreen(apiService: widget.apiService),
                  ),
                );
              },
            ),
            ListTile(
              leading: const Icon(Icons.security, color: Colors.purple),
              title: const Text('प्रोफाइल तथा गोपनीयता (Profile Privacy)'),
              onTap: () {
                Navigator.pop(context);
                Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (_) => ProfilePrivacyScreen(apiService: widget.apiService),
                  ),
                );
              },
            ),
          ],
        ),
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
                                        ? AppTheme.livingGreen.withValues(alpha: 0.15)
                                        : AppTheme.deceasedSlate.withValues(alpha: 0.15),
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
                                    person.primaryNameNepali,
                                    style: const TextStyle(fontWeight: FontWeight.bold, color: AppTheme.textDark),
                                  ),
                                  subtitle: Text(
                                    '${person.branchName ?? "शाखा अज्ञात"} • ${person.livingStatus == LivingStatus.living ? "जीवित" : "दिवंगत"}',
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
