import 'package:flutter/material.dart';
import '../models/person.dart';
import '../services/genealogy_api_service.dart';
import '../theme/app_theme.dart';
import 'read_only_tree_screen.dart';

class PersonDetailScreen extends StatefulWidget {
  final String personId;
  final GenealogyApiService apiService;

  const PersonDetailScreen({Key? key, required this.personId, required this.apiService})
      : super(key: key);

  @override
  State<PersonDetailScreen> createState() => _PersonDetailScreenState();
}

class _PersonDetailScreenState extends State<PersonDetailScreen> {
  PersonDetail? _person;
  bool _isLoading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _fetchDetail();
  }

  Future<void> _fetchDetail() async {
    try {
      final data = await widget.apiService.getPerson(widget.personId);
      setState(() {
        _person = data;
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
    if (_isLoading) {
      return Scaffold(
        appBar: AppBar(title: const Text('विवरण लोड हुँदैछ...')),
        body: const Center(child: CircularProgressIndicator(color: AppTheme.saffron)),
      );
    }

    if (_error != null || _person == null) {
      return Scaffold(
        appBar: AppBar(title: const Text('त्रुटि')),
        body: Center(child: Text(_error ?? 'विवरण फेला परेन')),
      );
    }

    final p = _person!;

    return Scaffold(
      appBar: AppBar(
        title: Text(p.fullNameNepali, style: const TextStyle(fontWeight: FontWeight.bold)),
        actions: [
          IconButton(
            icon: const Icon(Icons.account_tree),
            tooltip: 'रुख हेर्नुहोस्',
            onPressed: () {
              Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (_) => ReadOnlyTreeScreen(
                    rootPersonId: p.id,
                    apiService: widget.apiService,
                  ),
                ),
              );
            },
          )
        ],
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Profile Card
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text(
                          p.fullNameNepali,
                          style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 20, color: AppTheme.textDark),
                        ),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                          decoration: BoxDecoration(
                            color: p.livingStatus == LivingStatus.living
                                ? AppTheme.livingGreen.withOpacity(0.15)
                                : AppTheme.deceasedSlate.withOpacity(0.15),
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: Text(
                            p.livingStatus == LivingStatus.living ? 'जीवित' : 'दिवंगत',
                            style: TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.bold,
                              color: p.livingStatus == LivingStatus.living
                                  ? AppTheme.livingGreen
                                  : AppTheme.deceasedSlate,
                            ),
                          ),
                        ),
                      ],
                    ),
                    if (p.fullNameEnglish != null)
                      Text(p.fullNameEnglish!, style: const TextStyle(color: AppTheme.textMuted)),
                    const Divider(height: 24),
                    _infoRow('शाखा (Branch)', p.branchNameNepali ?? '—'),
                    _infoRow('पुस्ता (Generation)', p.generation != null ? 'G${p.generation}' : 'अज्ञात'),
                    _infoRow('जन्म मिति (DOB)', p.dateOfBirthBs ?? '—'),
                    _infoRow('जन्मस्थान (Birth Place)', p.birthPlace ?? '—'),
                    _infoRow('मूलघर (Mool Ghar)', p.moolGhar ?? '—'),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 16),

            // Parents Section
            const Text('अभिभावकहरू (Parents)', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
            const SizedBox(height: 8),
            if (p.parents.isEmpty)
              const Text('कुनै अभिभावक जोडिएको छैन', style: TextStyle(color: AppTheme.textMuted, fontSize: 12))
            else
              ...p.parents.map((parent) => Card(
                    child: ListTile(
                      title: Text(parent.fullNameNepali, style: const TextStyle(fontWeight: FontWeight.bold)),
                      subtitle: Text(parent.gender == Gender.male ? 'पिता (Father)' : 'आमा (Mother)'),
                      trailing: const Icon(Icons.chevron_right, size: 16),
                      onTap: () {
                        Navigator.push(
                          context,
                          MaterialPageRoute(
                            builder: (_) => PersonDetailScreen(personId: parent.id, apiService: widget.apiService),
                          ),
                        );
                      },
                    ),
                  )),
            const SizedBox(height: 16),

            // Spouses Section
            const Text('दम्पती (Spouses)', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
            const SizedBox(height: 8),
            if (p.spouses.isEmpty)
              const Text('कुनै दम्पती जोडिएको छैन', style: TextStyle(color: AppTheme.textMuted, fontSize: 12))
            else
              ...p.spouses.map((spouse) => Card(
                    child: ListTile(
                      title: Text(spouse.fullNameNepali, style: const TextStyle(fontWeight: FontWeight.bold)),
                      subtitle: Text('विवाह: ${spouse.marriageDateBs ?? 'अज्ञात'}'),
                    ),
                  )),
            const SizedBox(height: 16),

            // Children Section
            Text('सन्तानहरू (Children) (${p.children.length})',
                style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
            const SizedBox(height: 8),
            if (p.children.isEmpty)
              const Text('कुनै सन्तान जोडिएको छैन', style: TextStyle(color: AppTheme.textMuted, fontSize: 12))
            else
              ...p.children.map((child) => Card(
                    child: ListTile(
                      title: Text(child.fullNameNepali, style: const TextStyle(fontWeight: FontWeight.bold)),
                      subtitle: Text(child.gender == Gender.male ? 'छोरा (Son)' : 'छोरी (Daughter)'),
                      trailing: const Icon(Icons.chevron_right, size: 16),
                      onTap: () {
                        Navigator.push(
                          context,
                          MaterialPageRoute(
                            builder: (_) => PersonDetailScreen(personId: child.id, apiService: widget.apiService),
                          ),
                        );
                      },
                    ),
                  )),
          ],
        ),
      ),
    );
  }

  Widget _infoRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: const TextStyle(color: AppTheme.textMuted, fontSize: 13)),
          Text(value, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13, color: AppTheme.textDark)),
        ],
      ),
    );
  }
}
