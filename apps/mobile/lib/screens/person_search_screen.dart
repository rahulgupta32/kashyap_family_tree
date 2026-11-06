import '../widgets/heritage.dart';
import 'home_dashboard.dart';
import 'member_account_screen.dart';
import 'sign_in_screen.dart';
import '../localization/my_claim_labels.dart';
import 'my_claims_screen.dart';
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
import 'cultural_content_screen.dart';
import 'chat_screen.dart';
import 'household_map_screen.dart';
import 'notification_inbox_screen.dart';
import 'official_notices_screen.dart';
import 'follow_manager_screen.dart';
import 'authenticator_screen.dart';

class PersonSearchScreen extends StatefulWidget {
  final GenealogyApiService apiService;
  final VoidCallback? onSignIn;
  final Future<void> Function()? onSignOut;
  final Future<bool> Function()? onEnablePush;
  final Future<void> Function()? onDisablePush;

  const PersonSearchScreen(
      {super.key,
      required this.apiService,
      this.onSignIn,
      this.onSignOut,
      this.onEnablePush,
      this.onDisablePush});

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
  int _tab = 0;
  String? _treeId;

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
      if (!mounted || version != _searchVersion) {
        return;
      }
      setState(() {
        _results = items;
        if (!_results.any((p) => p.id == _selectedPerson?.id)) {
          _selectedPerson = null;
        }
      });
    } catch (e) {
      if (!mounted || version != _searchVersion) {
        return;
      }
      setState(() {
        _error = e.toString();
      });
    } finally {
      if (mounted && version == _searchVersion) {
        setState(() {
          _isLoading = false;
        });
      }
    }
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: _tab == 0 || (_tab == 1 && _treeId == null)
          ? AppBar(
              centerTitle: false,
              title: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Kashyap Adhikari',
                        style: AppTheme.editorial
                            .copyWith(color: AppTheme.saffron, fontSize: 19)),
                    const Text('वंशावली · LINEAGE & COMMUNITY',
                        style: TextStyle(
                            fontSize: 8,
                            letterSpacing: .8,
                            color: AppTheme.textMuted)),
                  ]),
              actions: [
                if (widget.apiService.authToken != null)
                  IconButton(
                      tooltip: 'सूचनाहरू (Notifications)',
                      icon: const Icon(Icons.notifications_none),
                      onPressed: () => Navigator.push(
                          context,
                          MaterialPageRoute(
                              builder: (_) => NotificationInboxScreen(
                                  apiService: widget.apiService,
                                  onEnablePush: widget.onEnablePush,
                                  onDisablePush: widget.onDisablePush)))),
                if (widget.apiService.authToken != null)
                  IconButton(
                      tooltip: 'Security verification',
                      icon: const Icon(Icons.security_outlined),
                      onPressed: () {
                        Navigator.of(context).push(MaterialPageRoute(
                            builder: (_) => AuthenticatorScreen(
                                apiService: widget.apiService,
                                enrollmentRequested: true,
                                manageCredentials: true,
                                child: () => Scaffold(
                                    appBar: AppBar(
                                        title: const Text(
                                            'Security verification')),
                                    body: const Padding(
                                        padding: EdgeInsets.all(20),
                                        child: Text(
                                            'Security verification is complete or is not required for your current account.'))))));
                      }),
                if (widget.apiService.authToken == null &&
                    widget.onSignIn != null)
                  IconButton(
                      tooltip: 'Sign in',
                      onPressed: widget.onSignIn,
                      icon: const Icon(Icons.login)),
                if (widget.apiService.authToken != null &&
                    widget.onSignOut != null)
                  IconButton(
                      tooltip: 'Sign out',
                      icon: const Icon(Icons.logout),
                      onPressed: () async {
                        try {
                          await widget.onSignOut!();
                        } catch (_) {
                          if (context.mounted) {
                            ScaffoldMessenger.of(context).showSnackBar(
                                const SnackBar(
                                    content: Text(
                                        'Local session cleared; server logout could not be confirmed.')));
                          }
                        }
                      }),
              ],
            )
          : null,
      bottomNavigationBar: HeritageNavigation(
          selected: _tab,
          onSelect: (index) => setState(() {
                _tab = index;
                if (index == 1) _treeId = _selectedPerson?.id;
              })),
      drawer: Drawer(
        child: ListView(
          padding: EdgeInsets.zero,
          children: [
            const DrawerHeader(
              decoration: BoxDecoration(color: AppTheme.warmCream),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Text(
                    'कश्यप अधिकारी वंशावली',
                    style: TextStyle(
                        color: AppTheme.heritageBrown,
                        fontSize: 18,
                        fontFamily: 'PlayfairDisplay',
                        fontWeight: FontWeight.bold),
                  ),
                  SizedBox(height: 4),
                  Text('नेभिगेसन मेनु (Navigation Menu)',
                      style:
                          TextStyle(color: AppTheme.textMuted, fontSize: 12)),
                ],
              ),
            ),
            ListTile(
              leading: const Icon(Icons.search, color: AppTheme.saffron),
              title: const Text('व्यक्ति खोजी (Person Search)'),
              onTap: () => Navigator.pop(context),
            ),
            ListTile(
              leading:
                  const Icon(Icons.account_tree, color: AppTheme.heritageBrown),
              title: const Text('वंशावली रुख (Family Tree)'),
              onTap: () {
                final targetId = _selectedPerson?.id;
                if (targetId == null) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(
                        content: Text(
                            'कृपया पहिले व्यक्ति चयन गर्नुहोस् (Please select a person first)')),
                  );
                  return;
                }
                Navigator.pop(context);
                Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (_) => ReadOnlyTreeScreen(
                        rootPersonId: targetId, apiService: widget.apiService),
                  ),
                );
              },
            ),
            if (widget.apiService.authToken != null)
              ListTile(
                  leading: const Icon(Icons.assignment_ind),
                  title: Text(myClaimLabels['title']!),
                  onTap: () {
                    if (widget.apiService.authToken == null) return;
                    Navigator.pop(context);
                    Navigator.push(
                        context,
                        MaterialPageRoute(
                            builder: (_) =>
                                MyClaimsScreen(api: widget.apiService)));
                  }),
            ListTile(
              leading: const Icon(Icons.verified_user, color: Colors.blue),
              title: const Text('दाबी प्रमाणीकरण (Profile Claims)'),
              onTap: () {
                final targetPerson = _selectedPerson;
                if (targetPerson == null) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(
                        content: Text(
                            'कृपया पहिले व्यक्ति चयन गर्नुहोस् (Please select a person first)')),
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
                    const SnackBar(
                        content: Text(
                            'कृपया पहिले व्यक्ति चयन गर्नुहोस् (Please select a person first)')),
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
                Navigator.push(
                    context,
                    MaterialPageRoute(
                        builder: (_) =>
                            CommunityScreen(apiService: widget.apiService)));
              },
            ),
            if (widget.apiService.authToken != null)
              ListTile(
                  leading: const Icon(Icons.menu_book),
                  title: const Text('संस्कृति (Culture)'),
                  onTap: () {
                    Navigator.pop(context);
                    Navigator.push(
                        context,
                        MaterialPageRoute(
                            builder: (_) => CulturalContentScreen(
                                apiService: widget.apiService)));
                  }),
            ListTile(
                leading: const Icon(Icons.map),
                title: const Text('परिवारको स्थान (Localities)'),
                onTap: () {
                  Navigator.pop(context);
                  Navigator.push(
                      context,
                      MaterialPageRoute(
                          builder: (_) => HouseholdMapScreen(
                              apiService: widget.apiService)));
                }),
            if (widget.apiService.chatAccountId != null)
              ListTile(
                  leading: const Icon(Icons.email),
                  title: const Text('इमेल जोड्नुहोस् (Link email)'),
                  onTap: () {
                    Navigator.pop(context);
                    Navigator.push(
                        context,
                        MaterialPageRoute(
                            builder: (screenContext) => SignInScreen(
                                apiService: widget.apiService,
                                linkEmail: true,
                                onSignedIn: () {
                                  Navigator.pop(screenContext);
                                },
                                onBrowsePublic: () {})));
                  }),
            ListTile(
                leading: const Icon(Icons.chat),
                title: const Text('सन्देश (Messages)'),
                onTap: () {
                  Navigator.pop(context);
                  Navigator.push(
                      context,
                      MaterialPageRoute(
                          builder: (_) =>
                              ChatScreen(apiService: widget.apiService)));
                }),
            if (widget.apiService.authToken != null)
              ListTile(
                  leading: const Icon(Icons.notifications),
                  title: const Text('सूचनाहरू (Notifications)'),
                  onTap: () {
                    Navigator.pop(context);
                    Navigator.push(
                        context,
                        MaterialPageRoute(
                            builder: (_) => NotificationInboxScreen(
                                apiService: widget.apiService,
                                onEnablePush: widget.onEnablePush,
                                onDisablePush: widget.onDisablePush)));
                  }),
            if (widget.apiService.authToken != null)
              ListTile(
                  leading: const Icon(Icons.person_add_alt_1),
                  title: const Text('अनुसरण (Following)'),
                  onTap: () {
                    Navigator.pop(context);
                    Navigator.push(
                        context,
                        MaterialPageRoute(
                            builder: (_) => FollowManagerScreen(
                                apiService: widget.apiService)));
                  }),
            if (widget.apiService.authToken != null)
              ListTile(
                  leading: const Icon(Icons.campaign),
                  title: const Text('प्रशासनिक सूचनाहरू (Official notices)'),
                  onTap: () {
                    Navigator.pop(context);
                    Navigator.push(
                        context,
                        MaterialPageRoute(
                            builder: (_) => OfficialNoticesScreen(
                                apiService: widget.apiService)));
                  }),
            ListTile(
              leading:
                  const Icon(Icons.calendar_month, color: Colors.deepOrange),
              title: const Text('पात्रो तथा कार्यक्रम (Calendar)'),
              onTap: () {
                Navigator.pop(context);
                Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (_) =>
                        CalendarEventsScreen(apiService: widget.apiService),
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
                    builder: (_) =>
                        ProfilePrivacyScreen(apiService: widget.apiService),
                  ),
                );
              },
            ),
          ],
        ),
      ),
      body: _tabBody(),
    );
  }

  void _openPerson(PersonSummary person) {
    setState(() => _selectedPerson = person);
    Navigator.push(
        context,
        MaterialPageRoute(
            builder: (_) => PersonDetailScreen(
                personId: person.id, apiService: widget.apiService)));
  }

  void _openTree(String? personId) {
    final id = personId ?? _selectedPerson?.id;
    if (id == null) {
      setState(() {
        _tab = 1;
        _treeId = null;
      });
    } else {
      Navigator.push(
          context,
          MaterialPageRoute(
              builder: (_) => ReadOnlyTreeScreen(
                  rootPersonId: id, apiService: widget.apiService)));
    }
  }

  Widget _tabBody() {
    if (_tab == 2) return CalendarEventsScreen(apiService: widget.apiService);
    if (_tab == 3) return CommunityScreen(apiService: widget.apiService);
    if (_tab == 4) {
      return MemberAccountScreen(
          api: widget.apiService,
          onSignIn: widget.onSignIn,
          onSignOut: widget.onSignOut);
    }
    if (_tab == 1 && _treeId != null) {
      return ReadOnlyTreeScreen(
          rootPersonId: _treeId!, apiService: widget.apiService);
    }
    final searching = _searchController.text.trim().isNotEmpty || _tab == 1;
    return ListView(
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 20),
        children: [
          if (_tab == 1)
            const HeritageHeading('Explore your family tree',
                subtitle:
                    'रुख सुरु गर्न व्यक्ति छान्नुहोस्। (Choose a person to start.)',
                icon: Icons.account_tree_outlined),
          TextField(
              controller: _searchController,
              onChanged: _performSearch,
              decoration: InputDecoration(
                  hintText: 'वंशज खोज्नुहोस् · Search family members…',
                  prefixIcon: const Icon(Icons.search, size: 21),
                  suffixIcon: _searchController.text.isEmpty
                      ? null
                      : IconButton(
                          tooltip: 'Clear search',
                          icon: const Icon(Icons.close, size: 20),
                          onPressed: () {
                            _searchController.clear();
                            _performSearch('');
                          }))),
          const SizedBox(height: 18),
          if (_isLoading)
            const Padding(
                padding: EdgeInsets.all(20),
                child: Center(child: CircularProgressIndicator())),
          if (_error != null)
            HeritageEmpty(
                icon: Icons.cloud_off_outlined,
                message: 'खोज अहिले उपलब्ध छैन। (Search unavailable)',
                action: TextButton(
                    onPressed: () => _performSearch(_searchController.text),
                    child: const Text('Retry'))),
          if (searching && !_isLoading && _error == null) ...[
            if (_results.isEmpty)
              const HeritageEmpty(
                  icon: Icons.person_search_outlined,
                  message: 'कुनै व्यक्ति फेला परेन (No persons found)'),
            ..._results.map((person) => Card(
                    child: ListTile(
                  selected: _selectedPerson?.id == person.id,
                  onTap: () {
                    if (_tab == 1) {
                      setState(() {
                        _selectedPerson = person;
                        _treeId = person.id;
                      });
                    } else {
                      _openPerson(person);
                    }
                  },
                  leading: HeritageAvatar(
                      name: person.primaryNameNepali,
                      deceased: person.livingStatus == LivingStatus.deceased),
                  title: Text(person.primaryNameNepali,
                      style: Theme.of(context).textTheme.titleMedium),
                  subtitle: Text(
                      [
                        if (person.primaryNameEnglish?.isNotEmpty == true)
                          person.primaryNameEnglish!,
                        person.branchName ?? 'शाखा अज्ञात',
                        person.livingStatus == LivingStatus.living
                            ? 'जीवित (Living)'
                            : 'दिवंगत (Deceased)'
                      ].join(' · '),
                      style: Theme.of(context).textTheme.bodySmall),
                  trailing: const Icon(Icons.chevron_right, size: 18),
                ))),
          ],
          if (!searching)
            HomeDashboard(
              key: const ValueKey('home-dashboard'),
                api: widget.apiService,
                directory: _results,
                onPerson: _openPerson,
                onTree: _openTree,
                onCalendar: () => setState(() => _tab = 2),
                onProfile: () => setState(() => _tab = 4),
                onNotices: () => Navigator.push(
                    context,
                    MaterialPageRoute(
                        builder: (_) => OfficialNoticesScreen(
                            apiService: widget.apiService))),
                onCulture: () => Navigator.push(
                    context,
                    MaterialPageRoute(
                        builder: (_) => CulturalContentScreen(
                            apiService: widget.apiService))),
                onMessages: () => Navigator.push(
                    context,
                    MaterialPageRoute(
                        builder: (_) =>
                            ChatScreen(apiService: widget.apiService)))),
        ]);
  }
}
