import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import '../theme/app_theme.dart';
import '../screens/sign_in_screen.dart';
import '../screens/person_search_screen.dart';
import '../screens/person_detail_screen.dart';
import '../screens/read_only_tree_screen.dart';
import '../screens/calendar_events_screen.dart';
import '../screens/calendar_period_screen.dart';
import '../screens/community_screen.dart';
import '../screens/chat_screen.dart';
import '../screens/notification_inbox_screen.dart';
import '../screens/official_notices_screen.dart';
import '../screens/member_account_screen.dart';
import '../screens/profile_privacy_screen.dart';
import '../screens/claim_profile_screen.dart';
import '../screens/my_claims_screen.dart';
import '../screens/change_request_screen.dart';
import '../screens/my_change_requests_screen.dart';
import '../screens/cultural_content_screen.dart';
import 'preview_repository.dart';

const devPreviewRequested = bool.fromEnvironment('ENABLE_DEV_PREVIEW');
bool allowDevPreview({required bool debug, required bool requested}) =>
    debug && requested;

/// Only main_dev_preview.dart imports this synthetic application.
class DevelopmentPreviewApp extends StatefulWidget {
  const DevelopmentPreviewApp({super.key});
  @override
  State<DevelopmentPreviewApp> createState() => _DevelopmentPreviewAppState();
}

class _DevelopmentPreviewAppState extends State<DevelopmentPreviewApp> {
  var navigator = GlobalKey<NavigatorState>();
  String persona = previewPersonas.first;
  late PreviewApiService api;
  bool entered = false;
  int revision = 0;
  @override
  void initState() {
    super.initState();
    api = PreviewApiService(PreviewRepository(persona));
  }

  void reset({String? selected, bool exit = false}) {
    navigator.currentState?.popUntil((r) => r.isFirst);
    final old = api;
    old.setAuthToken(null); // fence mounted screens before replacement/disposal
    setState(() {
      persona = selected ?? persona;
      api = PreviewApiService(PreviewRepository(persona));
      revision++;
      navigator = GlobalKey<NavigatorState>();
      if (exit) entered = false;
    });
    WidgetsBinding.instance.addPostFrameCallback((_) => old.dispose());
  }

  @override
  void dispose() {
    api.dispose();
    super.dispose();
  }

  void open(Widget screen) =>
      navigator.currentState!.push(MaterialPageRoute(builder: (_) => screen));
  Widget catalog() => Scaffold(
      appBar: AppBar(title: const Text('Preview screen catalog')),
      body: ListView(children: [
        const Padding(
            padding: EdgeInsets.all(16),
            child: Text(
                'Existing Flutter screens with synthetic fixtures. Unsupported security, upload, cultural, provider and administrative actions explain that full-stack testing is required. Nothing is saved to a server.')),
        for (final entry in <String, Widget>{
          'Dashboard': PersonSearchScreen(apiService: api),
          'Family tree': ReadOnlyTreeScreen(
              apiService: api, rootPersonId: 'preview-member'),
          'Member profile':
              PersonDetailScreen(apiService: api, personId: 'preview-member'),
          'Calendar': CalendarEventsScreen(apiService: api),
          'Calendar month/day/agenda': CalendarPeriodScreen(api: api),
          'Community': CommunityScreen(apiService: api),
          'Messaging': ChatScreen(apiService: api),
          'Notifications': NotificationInboxScreen(apiService: api),
          'Official notices': OfficialNoticesScreen(apiService: api),
          'Account and settings': MemberAccountScreen(api: api),
          'Privacy form': ProfilePrivacyScreen(apiService: api),
          'Claim form': ClaimProfileScreen(
              apiService: api,
              personId: 'preview-parent',
              personName: 'Synthetic Parent'),
          'My claims': MyClaimsScreen(api: api),
          'Change proposal form': ChangeRequestScreen(
              apiService: api,
              personId: 'preview-member',
              personName: 'Synthetic Member'),
          'My change requests': MyChangeRequestsScreen(api: api),
          'Approved cultural content': CulturalContentScreen(apiService: api),
        }.entries)
          ListTile(
              title: Text(entry.key),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => open(entry.value)),
        ListTile(
            title: const Text('Administration / role inspection'),
            onTap: () => open(Scaffold(
                appBar: AppBar(title: const Text('Synthetic role inspection')),
                body: Padding(
                    padding: const EdgeInsets.all(20),
                    child: Text(
                        'Selected persona: $persona\n\n${api.repository.profile['roles']}\n\nThis is an offline role illustration, not the Next.js administration portal. Actual approvals, branch permissions and audit records require the isolated full-stack backend and admin portal. No administrative decision can be made here.'))))),
        ListTile(
            title: const Text('Locations and maps'),
            onTap: () => open(Scaffold(
                appBar: AppBar(title: const Text('Location inspection')),
                body: const Padding(
                    padding: EdgeInsets.all(20),
                    child: Text(
                        'No GPS is collected in offline preview. Household location consent, map permissions and persistence require isolated full-stack acceptance.'))))),
      ]));
  @override
  Widget build(BuildContext context) {
    if (!allowDevPreview(debug: kDebugMode, requested: devPreviewRequested)) {
      return const MaterialApp(
          home: Scaffold(
              body: Center(
                  child: Text(
                      'Development preview is disabled. Debug build and explicit flag required.'))));
    }
    return MaterialApp(
      key: ValueKey(revision),
      navigatorKey: navigator,
      theme: AppTheme.theme,
      debugShowCheckedModeBanner: false,
      title: 'Nepali Bansawali — Offline Preview',
      builder: (context, child) => Column(children: [
        Material(
            color: AppTheme.warmCream,
            child: SafeArea(
                bottom: false,
                child: Padding(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                    child: Column(children: [
                      const Text('OFFLINE SYNTHETIC PREVIEW · नमूना मात्र',
                          style: TextStyle(
                              fontWeight: FontWeight.bold, fontSize: 12)),
                      const Text(
                          'Changes stay in memory and are erased on reset.',
                          style: TextStyle(fontSize: 11)),
                      Row(children: [
                        Expanded(
                            child: Text(persona,
                                style: const TextStyle(fontSize: 12))),
                        IconButton(
                            key: const Key('preview-switch-persona'),
                            icon: const Icon(Icons.switch_account,
                                semanticLabel: 'Switch preview persona'),
                            onPressed: () => reset(
                                selected: previewPersonas[
                                    (previewPersonas.indexOf(persona) + 1) %
                                        previewPersonas.length])),
                        IconButton(
                            key: const Key('preview-reset'),
                            icon: const Icon(Icons.restart_alt,
                                semanticLabel: 'Reset preview data'),
                            onPressed: () => reset()),
                        IconButton(
                            key: const Key('preview-exit'),
                            icon: const Icon(Icons.logout,
                                semanticLabel: 'Exit preview'),
                            onPressed: () => reset(exit: true)),
                        if (entered)
                          IconButton(
                              key: const Key('preview-catalog'),
                              icon: const Icon(Icons.apps,
                                  semanticLabel: 'All preview screens'),
                              onPressed: () => open(catalog())),
                      ]),
                    ])))),
        Expanded(child: child ?? const SizedBox.shrink()),
      ]),
      home: entered
          ? PersonSearchScreen(
              apiService: api, onSignOut: () async => reset(exit: true))
          : SignInScreen(
              apiService: api,
              onSignedIn: () {},
              onBrowsePublic: () => setState(() => entered = true),
              onDevelopmentPreview: () => setState(() => entered = true)),
    );
  }
}
