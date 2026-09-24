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
import 'community_screen.dart';
import 'chat_screen.dart';
import 'household_map_screen.dart';
import 'notification_inbox_screen.dart';

class PersonSearchScreen extends StatefulWidget {
  final GenealogyApiService apiService;
  final VoidCallback? onSignIn;
  final Future<void> Function()? onSignOut;

  const PersonSearchScreen({super.key, required this.apiService, this.onSignIn, this.onSignOut});

  @override
  State<PersonSearchScreen> createState() => _PersonSearchScreenState();
}

class _PersonSearchScreenState extends State<PersonSearchScreen> {
  final TextEditingController _searchController = TextEditingController();
  List<PersonSummary> _results = [];
  PersonSummary? _selectedPerson;
  bool _isLoading = false;
  String? _error;
  int _searchVersion = 0;

  @override
  void initState() {
    super.initState();
    _performSearch('');
  }

  Future<void> _performSearch(String query) async {
    final version = ++_searchVersion;
    setState(() {
      _isLoading = true;
      _error = null;
    });

    try {
      final items = await widget.apiService.searchPersons(query: query);
      if (!mounted || version != _searchVersion) { return; }
      setState(() {
        _results = items;
        if (!_results.any((p) => p.id == _selectedPerson?.id)) { _selectedPerson = null; }
      });
    } catch (e) {
      if (!mounted || version != _searchVersion) { return; }
      setState(() {
        _error = e.toString();
      });
    } finally {
      if (mounted && version == _searchVersion) { setState(() {
        _isLoading = false;
      }); }
    }
  }

  @override
  void dispose() { _searchController.dispose(); super.dispose(); }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('कश्यप अधिकारी वंशावली', style: TextStyle(fontWeight: FontWeight.bold)),
        actions: [
          if (widget.apiService.authToken == null && widget.onSignIn != null)
            IconButton(tooltip: 'Sign in', onPressed: widget.onSignIn, icon: const Icon(Icons.login)),
          if (widget.apiService.authToken != null && widget.onSignOut != null)
            IconButton(tooltip: 'Sign out', icon: const Icon(Icons.logout), onPressed: () async {
              try { await widget.onSignOut!(); }
              catch (_) { if (context.mounted) { ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(content: Text('Local session cleared; server logout could not be confirmed.'))); } }
            }),
        ],
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
                final targetId = _selectedPerson?.id;
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
                final targetPerson = _selectedPerson;
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
                final targetPerson = _selectedPerson;
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
              leading: const Icon(Icons.forum),
              title: const Text('समुदाय (Community)'),
              onTap: () {
                Navigator.pop(context);
                Navigator.push(context, MaterialPageRoute(
                  builder: (_) => CommunityScreen(apiService: widget.apiService)));
              },
            ),
            ListTile(leading: const Icon(Icons.map), title: const Text('परिवारको स्थान (Localities)'), onTap: () { Navigator.pop(context); Navigator.push(context, MaterialPageRoute(builder: (_) => HouseholdMapScreen(apiService: widget.apiService))); }),
            ListTile(leading: const Icon(Icons.chat), title: const Text('सन्देश (Messages)'), onTap: () { Navigator.pop(context); Navigator.push(context, MaterialPageRoute(builder: (_) => ChatScreen(apiService: widget.apiService))); }),
            if (widget.apiService.authToken != null)
              ListTile(leading: const Icon(Icons.notifications), title: const Text('सूचनाहरू (Notifications)'), onTap: () {
                Navigator.pop(context); Navigator.push(context, MaterialPageRoute(builder: (_) => NotificationInboxScreen(apiService: widget.apiService)));
              }),
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
                              final isSelected = _selectedPerson?.id == person.id;
                              return Card(
                                margin: const EdgeInsets.only(bottom: 8),
                                color: isSelected ? AppTheme.saffron.withValues(alpha: 0.1) : null,
                                child: ListTile(
                                  onTap: () {
                                    setState(() {
                                      _selectedPerson = person;
                                    });
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
