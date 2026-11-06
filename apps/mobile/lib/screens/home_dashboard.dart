import 'package:flutter/material.dart';
import '../models/person.dart';
import '../services/genealogy_api_service.dart';
import '../services/calendar_time.dart';
import '../theme/app_theme.dart';
import '../widgets/heritage.dart';

class HomeDashboard extends StatefulWidget {
  final GenealogyApiService api;
  final List<PersonSummary> directory;
  final ValueChanged<PersonSummary> onPerson;
  final ValueChanged<String?> onTree;
  final VoidCallback onCalendar, onNotices, onCulture, onProfile, onMessages;
  const HomeDashboard(
      {super.key,
      required this.api,
      required this.directory,
      required this.onPerson,
      required this.onTree,
      required this.onCalendar,
      required this.onNotices,
      required this.onCulture,
      required this.onProfile,
      required this.onMessages});
  @override
  State<HomeDashboard> createState() => _HomeDashboardState();
}

class _HomeDashboardState extends State<HomeDashboard> {
  late final int _session;
  Map<String, dynamic>? _profile;
  List<dynamic>? _events, _notices;
  List<PersonSummary> _family = [];
  bool _profileFailed = false, _eventsFailed = false, _noticesFailed = false;
  bool get _current => mounted && widget.api.pushSessionGeneration == _session;
  @override
  void initState() {
    super.initState();
    _session = widget.api.pushSessionGeneration;
    widget.api.sessionChanges.addListener(_sessionChanged);
    if (widget.api.authToken != null) {
      _loadProfile();
      _loadEvents();
      _loadNotices();
    }
  }

  void _sessionChanged() {
    if (mounted && !_current) {
      setState(() {
        _profile = null;
        _events = null;
        _notices = null;
        _family = [];
      });
    }
  }

  @override
  void dispose() {
    widget.api.sessionChanges.removeListener(_sessionChanged);
    super.dispose();
  }

  Future<void> _loadProfile() async {
    try {
      final profile = await widget.api.getMyProfile();
      if (!_current) return;
      setState(() => _profile = profile);
      final id = profile['personId'];
      if (id is String) {
        final person = await widget.api.getPerson(id);
        if (!_current) return;
        final family = <PersonSummary>[
          ...person.parents.map((p) => p.person).whereType<PersonSummary>(),
          ...person.spouses.map((p) => p.person).whereType<PersonSummary>(),
          ...person.children.map((p) => p.person).whereType<PersonSummary>(),
        ];
        final unique = <String, PersonSummary>{for (final p in family) p.id: p};
        setState(() => _family = unique.values.toList());
      }
    } catch (_) {
      if (_current) setState(() => _profileFailed = true);
    }
  }

  Future<void> _loadEvents() async {
    try {
      final events = await widget.api.getCalendarEvents();
      if (_current) {
        setState(() => _events = events
            .where((e) => e is Map && e['lifecycleState'] != 'CANCELLED')
            .take(3)
            .toList());
      }
    } catch (_) {
      if (_current) setState(() => _eventsFailed = true);
    }
  }

  Future<void> _loadNotices() async {
    try {
      final notices = await widget.api.requestJson('/notifications/broadcasts');
      if (notices is! List) throw const FormatException();
      if (_current) setState(() => _notices = notices.take(1).toList());
    } catch (_) {
      if (_current) setState(() => _noticesFailed = true);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (!_current) return const SizedBox.shrink();
    final authenticated = widget.api.authToken != null;
    final person = _profile?['person'];
    final name = person is Map
        ? (person['primaryNameNepali'] ?? person['primaryNameEnglish'] ?? '')
            .toString()
        : '';
    final people = authenticated && _profile?['personId'] != null
        ? _family
        : widget.directory.take(8).toList();
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Container(
          padding: const EdgeInsets.all(22),
          decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(10),
              gradient: const LinearGradient(
                  colors: [AppTheme.saffron, Color(0xFFBC6D00)]),
              boxShadow: [
                BoxShadow(
                    color: AppTheme.saffron.withValues(alpha: .14),
                    blurRadius: 14,
                    offset: const Offset(0, 5))
              ]),
          child: HeritagePaper(
              child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                const Text('हाम्रो इतिहास, हाम्रो परिवार',
                    style: TextStyle(color: Color(0xFFFFE9CE), fontSize: 11)),
                const SizedBox(height: 8),
                Text(name.isEmpty ? 'नमस्ते! Namaste.' : 'नमस्ते, $name',
                    style: AppTheme.editorial
                        .copyWith(color: Colors.white, fontSize: 27)),
                const SizedBox(height: 8),
                Text(
                    authenticated
                        ? (_profile?['personId'] != null
                            ? 'आफ्नो वंश र नाता सँगै अन्वेषण गरौँ।'
                            : 'आफ्नो परिवारसँग जोडिन प्रोफाइल दाबी गर्नुहोस्।')
                        : 'Preserving our history, connecting our community.',
                    style: const TextStyle(
                        color: Color(0xFFFFE9CE), fontSize: 12, height: 1.6)),
                if (_profileFailed)
                  const Padding(
                      padding: EdgeInsets.only(top: 8),
                      child: Text(
                          'प्रोफाइल अहिले उपलब्ध छैन (Profile unavailable)',
                          style: TextStyle(color: Colors.white, fontSize: 11))),
              ]))),
      if (authenticated) ...[
        HeritageHeading('पारिवारिक पात्रो · Family calendar',
            icon: Icons.calendar_today_outlined,
            action: TextButton(
                onPressed: widget.onCalendar, child: const Text('View all'))),
        if (_events == null && !_eventsFailed) const LinearProgressIndicator(),
        if (_eventsFailed)
          HeritageEmpty(
              icon: Icons.event_busy,
              message: 'पात्रो अहिले उपलब्ध छैन। (Calendar unavailable)',
              action: TextButton(
                  onPressed: () {
                    setState(() => _eventsFailed = false);
                    _loadEvents();
                  },
                  child: const Text('Retry'))),
        if (_events?.isEmpty == true)
          const HeritageEmpty(
              icon: Icons.event_outlined,
              message:
                  'अहिलेसम्म देखाउन मिल्ने कार्यक्रम छैन। (No accessible events yet.)'),
        if (_events?.isNotEmpty == true)
          SizedBox(
              height: 155,
              child: ListView.separated(
                  scrollDirection: Axis.horizontal,
                  itemCount: _events!.length,
                  separatorBuilder: (_, __) => const SizedBox(width: 12),
                  itemBuilder: (context, i) {
                    final event = _events![i] as Map;
                    return SizedBox(
                        width: 240,
                        child: Card(
                            child: InkWell(
                                onTap: widget.onCalendar,
                                borderRadius: BorderRadius.circular(8),
                                child: Padding(
                                    padding: const EdgeInsets.all(16),
                                    child: Column(
                                        crossAxisAlignment:
                                            CrossAxisAlignment.start,
                                        children: [
                                          const Icon(Icons.event_outlined,
                                              size: 20,
                                              color: AppTheme.saffron),
                                          const SizedBox(height: 8),
                                          Text(
                                              event['title']?.toString() ??
                                                  'Family event',
                                              maxLines: 2,
                                              overflow: TextOverflow.ellipsis,
                                              style: Theme.of(context)
                                                  .textTheme
                                                  .titleMedium),
                                          const Spacer(),
                                          Text(
                                              event['startsAt'] is String
                                                  ? formatNepalInstant(
                                                      event['startsAt'])
                                                  : event['solarDate']
                                                          ?.toString() ??
                                                      'तिथि आधारित (Tithi)',
                                              maxLines: 2,
                                              overflow: TextOverflow.ellipsis,
                                              style: Theme.of(context)
                                                  .textTheme
                                                  .bodySmall),
                                        ])))));
                  })),
      ],
      HeritageHeading(
          authenticated && _profile?['personId'] != null
              ? 'मेरो परिवार · My family'
              : 'वंशजहरू · Explore the lineage',
          icon: Icons.groups_outlined,
          action: TextButton(
              onPressed: () => widget.onTree(_profile?['personId'] as String?),
              child: const Text('View tree'))),
      if (people.isEmpty)
        HeritageEmpty(
            icon: Icons.account_tree_outlined,
            message:
                'प्रमाणित पारिवारिक सम्बन्ध यहाँ देखिनेछन्। (Verified family connections appear here.)',
            action: authenticated
                ? TextButton(
                    onPressed: widget.onProfile,
                    child: const Text('My profile'))
                : null),
      if (people.isNotEmpty)
        SizedBox(
            height: 142,
            child: ListView.separated(
                scrollDirection: Axis.horizontal,
                itemCount: people.length,
                separatorBuilder: (_, __) => const SizedBox(width: 16),
                itemBuilder: (context, index) {
                  final p = people[index];
                  return SizedBox(
                      width: 84,
                      child: InkWell(
                          onTap: () => widget.onPerson(p),
                          borderRadius: BorderRadius.circular(8),
                          child: Column(children: [
                            HeritageAvatar(
                                name: p.primaryNameNepali,
                                size: 68,
                                deceased:
                                    p.livingStatus == LivingStatus.deceased),
                            const SizedBox(height: 8),
                            Text(p.primaryNameNepali,
                                maxLines: 2,
                                textAlign: TextAlign.center,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(
                                    fontSize: 12, fontWeight: FontWeight.w600)),
                            if (p.generation != null)
                              Text('पुस्ता ${p.generation}',
                                  style: Theme.of(context).textTheme.bodySmall),
                          ])));
                })),
      if (authenticated) ...[
        if (_noticesFailed)
          const HeritageEmpty(
              icon: Icons.campaign_outlined,
              message:
                  'आधिकारिक सूचना अहिले उपलब्ध छैन। (Notices unavailable)'),
        if (_notices?.isNotEmpty == true)
          Card(
              child: InkWell(
                  onTap: widget.onNotices,
                  child: Container(
                      padding: const EdgeInsets.all(18),
                      decoration: const BoxDecoration(
                          border: Border(
                              left: BorderSide(
                                  color: AppTheme.saffronLight, width: 3))),
                      child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Row(children: [
                              Icon(Icons.push_pin_outlined, size: 16),
                              SizedBox(width: 8),
                              Text('आधिकारिक सूचना · OFFICIAL NOTICE',
                                  style: TextStyle(
                                      fontSize: 10, color: AppTheme.saffron))
                            ]),
                            const SizedBox(height: 10),
                            Text(
                                (_notices!.first as Map)['title']?.toString() ??
                                    '',
                                style: Theme.of(context).textTheme.titleMedium),
                            const SizedBox(height: 10),
                            const Text(
                                'पूरा सूचना पढ्नुहोस् · Read announcement →',
                                style: TextStyle(
                                    fontSize: 12, color: AppTheme.saffron)),
                          ])))),
      ],
      const SizedBox(height: 18),
      Card(
          clipBehavior: Clip.antiAlias,
          child: InkWell(
              onTap: widget.onCulture,
              child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Image.asset('assets/heritage/temple.jpg',
                        height: 140,
                        width: double.infinity,
                        fit: BoxFit.cover,
                        errorBuilder: (_, __, ___) => const SizedBox(
                            height: 100,
                            child: Center(
                                child: Icon(Icons.auto_stories, size: 44)))),
                    Padding(
                        padding: const EdgeInsets.all(18),
                        child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Text('CULTURAL HUB',
                                  style: TextStyle(
                                      fontSize: 10,
                                      letterSpacing: 1.6,
                                      color: AppTheme.saffron)),
                              const SizedBox(height: 8),
                              Text('हाम्रो संस्कृति, हाम्रो सम्पदा',
                                  style:
                                      Theme.of(context).textTheme.titleLarge),
                              const SizedBox(height: 8),
                              const Text(
                                  'Explore the stories and traditions shared by our community.',
                                  style: TextStyle(
                                      fontSize: 12, color: AppTheme.textMuted)),
                            ])),
                  ]))),
      if (authenticated)
        Padding(
            padding: const EdgeInsets.only(top: 12),
            child: OutlinedButton.icon(
                onPressed: widget.onMessages,
                icon: const Icon(Icons.chat_bubble_outline),
                label: const Text('परिवारसँग सन्देश (Messages)'))),
      const SizedBox(height: 24),
    ]);
  }
}
