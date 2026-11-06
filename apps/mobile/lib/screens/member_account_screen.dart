import 'package:flutter/material.dart';
import '../services/genealogy_api_service.dart';
import '../widgets/heritage.dart';
import '../widgets/profile_photo_editor.dart';
import 'profile_privacy_screen.dart';
import 'my_claims_screen.dart';
import 'follow_manager_screen.dart';
import 'device_sessions_screen.dart';
import 'policy_acknowledgements_screen.dart';
import 'sign_in_screen.dart';
import 'authenticator_screen.dart';
import 'read_only_tree_screen.dart';

class MemberAccountScreen extends StatefulWidget {
  final GenealogyApiService api;
  final VoidCallback? onSignIn;
  final Future<void> Function()? onSignOut;
  const MemberAccountScreen(
      {super.key, required this.api, this.onSignIn, this.onSignOut});
  @override
  State<MemberAccountScreen> createState() => _MemberAccountScreenState();
}

class _MemberAccountScreenState extends State<MemberAccountScreen> {
  late final int _session;
  Map<String, dynamic>? _profile;
  String? _error;
  bool get _current => mounted && widget.api.pushSessionGeneration == _session;
  @override
  void initState() {
    super.initState();
    _session = widget.api.pushSessionGeneration;
    widget.api.sessionChanges.addListener(_sessionChanged);
    if (widget.api.authToken != null) _load();
  }

  @override
  void dispose() {
    widget.api.sessionChanges.removeListener(_sessionChanged);
    super.dispose();
  }

  void _sessionChanged() {
    if (mounted && !_current) {
      setState(() {
        _profile = null;
        _error = null;
      });
    }
  }

  Future<void> _load() async {
    try {
      final profile = await widget.api.getMyProfile();
      if (_current) {
        setState(() {
          _profile = profile;
          _error = null;
        });
      }
    } catch (_) {
      if (_current) {
        setState(() => _error = 'प्रोफाइल उपलब्ध छैन। (Profile unavailable)');
      }
    }
  }

  Future<void> _open(Widget page) async {
    await Navigator.push(context, MaterialPageRoute(builder: (_) => page));
    if (_current && widget.api.authToken != null) _load();
  }

  Widget _link(IconData icon, String title, VoidCallback action) => ListTile(
      leading: Icon(icon, size: 21),
      title: Text(title, style: const TextStyle(fontSize: 13)),
      trailing: const Icon(Icons.chevron_right, size: 18),
      onTap: action);

  @override
  Widget build(BuildContext context) {
    if (!_current) {
      return const Scaffold(
          body: Center(child: Text('सत्र बदलियो (Session changed)')));
    }
    if (widget.api.authToken == null) {
      return Scaffold(
          appBar: AppBar(title: const Text('My Profile')),
          body: Padding(
              padding: const EdgeInsets.all(24),
              child: HeritageEmpty(
                  icon: Icons.person_outline,
                  message:
                      'आफ्नो प्रोफाइल हेर्न साइन इन गर्नुहोस्। (Sign in to view your profile.)',
                  action: TextButton(
                      onPressed: widget.onSignIn,
                      child: const Text('Sign in')))));
    }
    final person = _profile?['person'] as Map? ?? {};
    final name = person['primaryNameNepali']?.toString().isNotEmpty == true
        ? person['primaryNameNepali'].toString()
        : person['primaryNameEnglish']?.toString() ?? '';
    return Scaffold(
        appBar:
            AppBar(title: const Text('मेरो प्रोफाइल (My Profile)'), actions: [
          TextButton(
              onPressed: () =>
                  _open(ProfilePrivacyScreen(apiService: widget.api)),
              child: const Text('Edit')),
        ]),
        body: _error != null
            ? Center(
                child: Column(mainAxisSize: MainAxisSize.min, children: [
                Text(_error!),
                TextButton(onPressed: _load, child: const Text('Retry')),
              ]))
            : _profile == null
                ? const Center(child: CircularProgressIndicator())
                : ListView(
                    padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
                    children: [
                        Card(
                            child: HeritagePaper(
                                child: Padding(
                                    padding: const EdgeInsets.all(24),
                                    child: Column(children: [
                                      ProfilePhotoEditor(
                                          api: widget.api,
                                          initialAsset:
                                              _profile!['avatarAssetId']
                                                  as String?,
                                          readOnly: true),
                                      const SizedBox(height: 14),
                                      Text(
                                          name.isEmpty
                                              ? 'मेरो खाता (My account)'
                                              : name,
                                          textAlign: TextAlign.center,
                                          style: Theme.of(context)
                                              .textTheme
                                              .headlineSmall),
                                      const SizedBox(height: 8),
                                      Text(
                                          _profile!['personId'] == null
                                              ? 'प्रोफाइल दाबी बाँकी · Profile not linked'
                                              : 'वंशावलीसँग जोडिएको · Linked to genealogy',
                                          style: Theme.of(context)
                                              .textTheme
                                              .bodySmall),
                                      if (person['generation'] != null)
                                        Chip(
                                            label: Text(
                                                'पुस्ता · Generation ${person['generation']}')),
                                    ])))),
                        const HeritageHeading('खाता · Account'),
                        Card(
                            child: Column(children: [
                          _link(
                              Icons.assignment_ind_outlined,
                              'मेरा दाबीहरू (My claims)',
                              () => _open(MyClaimsScreen(api: widget.api))),
                          _link(
                              Icons.privacy_tip_outlined,
                              'प्रोफाइल तथा गोपनीयता (Profile Privacy)',
                              () => _open(ProfilePrivacyScreen(
                                  apiService: widget.api))),
                          _link(
                              Icons.mail_outline,
                              'इमेल जोड्नुहोस् (Link email)',
                              () => _open(SignInScreen(
                                  apiService: widget.api,
                                  linkEmail: true,
                                  onSignedIn: () => Navigator.pop(context),
                                  onBrowsePublic: () {}))),
                        ])),
                        const HeritageHeading(
                            'व्यक्तिगत विवरण · Personal information'),
                        Card(
                            child: Column(children: [
                          if (person['birthDateBs'] != null ||
                              person['birthYearBs'] != null)
                            _detail(Icons.cake_outlined, 'जन्म (Born)',
                                '${person['birthDateBs'] ?? person['birthYearBs']} BS'),
                          _detail(
                              Icons.location_on_outlined,
                              'ठेगाना (Address)',
                              person['currentAddress']?.toString()),
                          _detail(Icons.work_outline, 'पेशा (Occupation)',
                              person['occupation']?.toString()),
                          _detail(Icons.phone_outlined, 'मोबाइल (Mobile)',
                              _profile!['phoneNumber']?.toString()),
                        ])),
                        const HeritageHeading('वंशावली · Genealogy'),
                        Card(
                            child: Column(children: [
                          if (_profile!['personId'] is String)
                            _link(
                                Icons.account_tree_outlined,
                                'मेरो रुख (My tree)',
                                () => _open(ReadOnlyTreeScreen(
                                    rootPersonId: _profile!['personId'],
                                    apiService: widget.api))),
                          _link(
                              Icons.people_outline,
                              'पछ्याउने सूची (Following)',
                              () => _open(
                                  FollowManagerScreen(apiService: widget.api))),
                        ])),
                        const HeritageHeading('सेटिङ · Settings'),
                        Card(
                            child: Column(children: [
                          _link(
                              Icons.devices_outlined,
                              'मेरा उपकरणहरू (My devices)',
                              () => _open(DeviceSessionsScreen(
                                  apiService: widget.api))),
                          _link(
                              Icons.security_outlined,
                              'Security verification',
                              () => _open(AuthenticatorScreen(
                                  apiService: widget.api,
                                  enrollmentRequested: true,
                                  manageCredentials: true,
                                  child: () => const Scaffold(
                                      body: Center(
                                          child: Text(
                                              'Security verification complete.')))))),
                          _link(
                              Icons.policy_outlined,
                              'नीति र सहमति (Policies)',
                              () => _open(PolicyAcknowledgementsScreen(
                                  api: widget.api))),
                        ])),
                        const SizedBox(height: 20),
                        OutlinedButton.icon(
                            onPressed: widget.onSignOut == null
                                ? null
                                : () async {
                                    try {
                                      await widget.onSignOut!();
                                    } catch (_) {
                                      if (context.mounted) {
                                        ScaffoldMessenger.of(context)
                                            .showSnackBar(const SnackBar(
                                                content: Text(
                                                    'Server logout could not be confirmed.')));
                                      }
                                    }
                                  },
                            icon: const Icon(Icons.logout),
                            label: const Text('साइन आउट (Log out)')),
                      ]));
  }

  Widget _detail(IconData icon, String title, String? value) => ListTile(
      leading: Icon(icon, size: 18),
      title: Text(title, style: Theme.of(context).textTheme.bodySmall),
      subtitle: Text(
          value?.isNotEmpty == true ? value! : 'उपलब्ध छैन (Not provided)'));
}
