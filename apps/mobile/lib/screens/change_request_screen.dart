import 'package:flutter/material.dart';

import '../services/genealogy_api_service.dart';
import '../models/person.dart';
import 'my_change_requests_screen.dart';

class ChangeRequestScreen extends StatefulWidget {
  final String personId;
  final String personName;
  final GenealogyApiService apiService;

  const ChangeRequestScreen({
    super.key,
    required this.personId,
    required this.personName,
    required this.apiService,
  });

  @override
  State<ChangeRequestScreen> createState() => _ChangeRequestScreenState();
}

class _RelativeSelectionDraft {
  final query = TextEditingController();
  bool existing = false, searching = false;
  int revision = 0;
  PersonSummary? selected;
  List<PersonSummary> results = [];
  String? message;

  void invalidateSearch() {
    revision++;
    searching = false;
    results = [];
    message = null;
  }

  void clear() {
    invalidateSearch();
    query.clear();
    selected = null;
    existing = false;
  }
}

class _ChangeRequestScreenState extends State<ChangeRequestScreen> {
  String _changeType = 'EDIT_PERSON';
  late final int _session;
  bool _expired = false;
  final _nepaliName = TextEditingController(),
      _englishName = TextEditingController(),
      _deathDate = TextEditingController(),
      _deathYear = TextEditingController(),
      _spouseNepaliName = TextEditingController(),
      _spouseEnglishName = TextEditingController(),
      _parentNepaliName = TextEditingController(),
      _parentEnglishName = TextEditingController();
  String _gender = 'OTHER';
  String? _spouseGender,
      _spouseLivingStatus,
      _parentGender,
      _parentLivingStatus;
  final _parentSelection = _RelativeSelectionDraft();
  final _spouseSelection = _RelativeSelectionDraft();
  _RelativeSelectionDraft get _relativeSelection =>
      _addingParent ? _parentSelection : _spouseSelection;
  bool get _addingParent => _changeType == 'ADD_PARENT';
  String get _relativeKey => _addingParent ? 'parent' : 'spouse';
  TextEditingController get _relativeNepaliName =>
      _addingParent ? _parentNepaliName : _spouseNepaliName;
  TextEditingController get _relativeEnglishName =>
      _addingParent ? _parentEnglishName : _spouseEnglishName;
  String? get _relativeGender => _addingParent ? _parentGender : _spouseGender;
  String? get _relativeLivingStatus =>
      _addingParent ? _parentLivingStatus : _spouseLivingStatus;
  @override
  void initState() {
    super.initState();
    _session = widget.apiService.pushSessionGeneration;
    widget.apiService.sessionChanges.addListener(_sessionChanged);
  }

  void _sessionChanged() {
    if (mounted && widget.apiService.pushSessionGeneration != _session) {
      setState(() {
        _expired = true;
        for (final c in [
          _birthPlaceController,
          _occupationController,
          _reasonController,
          _nepaliName,
          _englishName,
          _deathDate,
          _deathYear,
          _spouseNepaliName,
          _spouseEnglishName,
          _parentNepaliName,
          _parentEnglishName,
        ]) {
          c.clear();
        }
        _parentSelection.clear();
        _spouseSelection.clear();
        _spouseGender = null;
        _spouseLivingStatus = null;
        _parentGender = null;
        _parentLivingStatus = null;
        _message = null;
      });
    }
  }

  final _birthPlaceController = TextEditingController();
  final _occupationController = TextEditingController();
  final _reasonController = TextEditingController();
  bool _submitting = false;
  String? _message;
  bool _isSuccess = false;

  @override
  void dispose() {
    widget.apiService.sessionChanges.removeListener(_sessionChanged);
    for (final c in [
      _nepaliName,
      _englishName,
      _deathDate,
      _deathYear,
      _spouseNepaliName,
      _spouseEnglishName,
      _parentNepaliName,
      _parentEnglishName,
    ]) {
      c.dispose();
    }
    _parentSelection.query.dispose();
    _spouseSelection.query.dispose();
    _birthPlaceController.dispose();
    _occupationController.dispose();
    _reasonController.dispose();
    super.dispose();
  }

  Future<void> _submitChangeRequest() async {
    if (_expired ||
        _submitting ||
        _isSuccess ||
        widget.apiService.pushSessionGeneration != _session) {
      return;
    }
    if (_reasonController.text.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('संशोधनको कारण खुलाउन अनिवार्य छ।')),
      );
      return;
    }

    setState(() {
      _submitting = true;
      _message = null;
    });

    try {
      Map<String, dynamic> proposedChanges;
      if (_changeType == 'ADD_CHILD') {
        if (_nepaliName.text.trim().isEmpty) {
          throw const FormatException(
            'बच्चाको नेपाली नाम आवश्यक छ (Child name required)',
          );
        }
        proposedChanges = {
          'primaryNameNepali': _nepaliName.text.trim(),
          if (_englishName.text.trim().isNotEmpty)
            'primaryNameEnglish': _englishName.text.trim(),
          'gender': _gender,
          'livingStatus': 'LIVING',
        };
      } else if ((_changeType == 'ADD_SPOUSE' || _addingParent) &&
          _relativeSelection.existing) {
        final selected = _relativeSelection.selected;
        if (selected == null ||
            selected.id.isEmpty ||
            selected.id == widget.personId) {
          throw const FormatException(
            'खोजीबाट सम्बन्धित व्यक्ति छान्नुहोस् (Select an existing person from search)',
          );
        }
        proposedChanges = {
          _addingParent ? 'parentPersonId' : 'spousePersonId': selected.id,
        };
      } else if (_changeType == 'ADD_SPOUSE' || _addingParent) {
        if (_relativeNepaliName.text.trim().isEmpty ||
            !{'MALE', 'FEMALE', 'OTHER', 'UNKNOWN'}.contains(_relativeGender) ||
            !{
              'LIVING',
              'DECEASED',
              'UNKNOWN',
            }.contains(_relativeLivingStatus)) {
          throw FormatException(
            _addingParent
                ? 'अभिभावकको नाम, लिङ्ग र जीवित अवस्था छान्नुहोस् (Enter parent name and explicitly choose gender and living status)'
                : 'जीवनसाथीको नाम, लिङ्ग र जीवित अवस्था छान्नुहोस् (Enter spouse name and explicitly choose gender and living status)',
          );
        }
        proposedChanges = {
          'primaryNameNepali': _relativeNepaliName.text.trim(),
          if (_relativeEnglishName.text.trim().isNotEmpty)
            'primaryNameEnglish': _relativeEnglishName.text.trim(),
          'gender': _relativeGender,
          'livingStatus': _relativeLivingStatus,
        };
      } else if (_changeType == 'RECORD_DEATH') {
        final date = _deathDate.text.trim(), year = _deathYear.text.trim();
        if (date.isNotEmpty &&
                !RegExp(r'^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[0-2])$')
                    .hasMatch(date) ||
            year.isNotEmpty && !RegExp(r'^\d{4}$').hasMatch(year)) {
          throw const FormatException(
            'BS मिति YYYY-MM-DD वा चार अङ्कको वर्ष दिनुहोस् (Enter a stored BS date/year; no conversion)',
          );
        }
        proposedChanges = {
          if (date.isNotEmpty) 'deathDateBs': date,
          if (year.isNotEmpty) 'deathYearBs': int.parse(year),
        };
      } else {
        proposedChanges = {
          if (_birthPlaceController.text.trim().isNotEmpty)
            'birthPlace': _birthPlaceController.text.trim(),
          if (_occupationController.text.trim().isNotEmpty)
            'occupation': _occupationController.text.trim(),
        };
      }

      await widget.apiService.submitChangeRequest(
        targetPersonId: widget.personId,
        type: _changeType,
        proposedChanges: proposedChanges,
        reason: _reasonController.text.trim(),
      );

      if (!mounted ||
          _expired ||
          widget.apiService.pushSessionGeneration != _session) {
        return;
      }
      setState(() {
        _isSuccess = true;
        _message =
            'वंशवृक्ष संशोधन अनुरोध सफलतापूर्वक दर्ता भयो। शाखा प्रशासकले परीक्षण गर्नेछन्।';
      });
    } catch (e) {
      if (!mounted ||
          _expired ||
          widget.apiService.pushSessionGeneration != _session) {
        return;
      }
      setState(() {
        _isSuccess = false;
        _message = e.toString().replaceAll('Exception: ', '');
      });
    } finally {
      if (mounted) {
        setState(() {
          _submitting = false;
        });
      }
    }
  }

  bool _canUseSelection(_RelativeSelectionDraft draft, int revision) =>
      mounted &&
      !_expired &&
      !_submitting &&
      !_isSuccess &&
      widget.apiService.pushSessionGeneration == _session &&
      (_changeType == 'ADD_PARENT' || _changeType == 'ADD_SPOUSE') &&
      identical(draft, _relativeSelection) &&
      draft.existing &&
      draft.revision == revision;

  Future<void> _searchRelative(
      _RelativeSelectionDraft draft, int revision) async {
    if (!_canUseSelection(draft, revision) || draft.searching) return;
    final query = draft.query.text.trim();
    if (query.isEmpty) {
      setState(
        () => draft.message =
            'खोजीका लागि नाम लेख्नुहोस् (Enter a name to search)',
      );
      return;
    }
    setState(() {
      draft.searching = true;
      draft.selected = null;
      draft.results = [];
      draft.message = null;
    });
    try {
      final results = await widget.apiService.searchPersons(query: query);
      if (!_canUseSelection(draft, revision)) return;
      setState(() {
        draft.results = results
            .where(
              (person) =>
                  person.id.isNotEmpty &&
                  person.id != widget.personId &&
                  !person.isArchived,
            )
            .toList();
        if (draft.results.isEmpty) {
          draft.message =
              'व्यक्ति भेटिएन; नाम मिलाएर फेरि खोज्नुहोस् (No matching person; refine the name and search again)';
        }
      });
    } catch (_) {
      if (!_canUseSelection(draft, revision)) return;
      setState(
        () => draft.message =
            'खोजी असफल भयो; फेरि प्रयास गर्नुहोस् (Search failed; try again)',
      );
    } finally {
      if (_canUseSelection(draft, revision)) {
        setState(() => draft.searching = false);
      }
    }
  }

  String _relativeDescription(PersonSummary person) => [
        if (person.primaryNameEnglish?.isNotEmpty == true)
          person.primaryNameEnglish!,
        if (person.branchName?.isNotEmpty == true) person.branchName!,
        if (person.generation != null)
          'पुस्ता (Generation): ${person.generation}',
      ].join(' · ');

  List<Widget> _existingRelativeFields() {
    final draft = _relativeSelection;
    final revision = draft.revision;
    final enabled = !_submitting && !_isSuccess;
    return [
      Text(
        _addingParent
            ? 'पहिलेको व्यक्तिलाई जैविक अभिभावकको रूपमा प्रस्ताव गर्नुहोस्। सम्बन्ध स्वीकृतिपछि मात्र कायम हुन्छ। (Propose an existing person as a biological parent; added only after approval.)'
            : 'पहिलेको व्यक्तिलाई जीवनसाथीको रूपमा प्रस्ताव गर्नुहोस्। सम्बन्ध स्वीकृतिपछि मात्र कायम हुन्छ। (Propose an existing person as a spouse; added only after approval.)',
      ),
      TextField(
        key: ValueKey('$_relativeKey-person-query'),
        controller: draft.query,
        enabled: enabled,
        maxLength: 100,
        decoration: const InputDecoration(
          labelText: 'व्यक्तिको नाम खोज्नुहोस् (Search person name)',
        ),
        onChanged: (_) {
          if (!_canUseSelection(draft, revision)) return;
          setState(() {
            draft.invalidateSearch();
            draft.selected = null;
          });
        },
      ),
      TextButton.icon(
        key: ValueKey('$_relativeKey-person-search'),
        onPressed: !enabled || draft.searching
            ? null
            : () => _searchRelative(draft, revision),
        icon: const Icon(Icons.search),
        label: Text(
          draft.searching ? 'खोज्दै... (Searching...)' : 'खोज्नुहोस् (Search)',
        ),
      ),
      if (draft.message != null)
        Semantics(liveRegion: true, child: Text(draft.message!)),
      if (draft.selected != null)
        ListTile(
          key: ValueKey('$_relativeKey-person-selected'),
          leading: const Icon(Icons.check_circle),
          title: Text(
            'छानिएको व्यक्ति (Selected): ${draft.selected!.primaryNameNepali}',
          ),
          subtitle: Text(_relativeDescription(draft.selected!)),
          trailing: IconButton(
            tooltip: 'छनोट हटाउनुहोस् (Clear selection)',
            onPressed: !enabled
                ? null
                : () {
                    if (!_canUseSelection(draft, revision)) return;
                    setState(() {
                      draft.invalidateSearch();
                      draft.selected = null;
                    });
                  },
            icon: const Icon(Icons.close),
          ),
        ),
      for (final person in draft.results)
        ListTile(
          key: ValueKey('$_relativeKey-person-result-${person.id}'),
          title: Text(person.primaryNameNepali),
          subtitle: Text(_relativeDescription(person)),
          trailing: const Icon(Icons.person_add_alt),
          onTap: !enabled
              ? null
              : () {
                  if (!_canUseSelection(draft, revision) ||
                      !draft.results.any((result) => result.id == person.id))
                    return;
                  setState(() {
                    draft.selected = person;
                    draft.invalidateSearch();
                  });
                },
        ),
    ];
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('वंशवृक्ष संशोधन अनुरोध (Change Request)'),
      ),
      body: _expired
          ? const Center(child: Text('सत्र बदलियो (Session changed)'))
          : SingleChildScrollView(
              padding: const EdgeInsets.all(16.0),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'लक्ष्य व्यक्ति: ${widget.personName}',
                    style: const TextStyle(
                      fontWeight: FontWeight.bold,
                      fontSize: 16,
                    ),
                  ),
                  const SizedBox(height: 16),
                  if (_message != null) ...[
                    Container(
                      width: double.infinity,
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: _isSuccess
                            ? Colors.green.shade50
                            : Colors.red.shade50,
                        borderRadius: BorderRadius.circular(8),
                        border: Border.fromBorderSide(
                          BorderSide(
                            color: _isSuccess
                                ? Colors.green.shade300
                                : Colors.red.shade300,
                          ),
                        ),
                      ),
                      child: Text(
                        _message!,
                        style: TextStyle(
                          color: _isSuccess
                              ? Colors.green.shade900
                              : Colors.red.shade900,
                          fontSize: 13,
                        ),
                      ),
                    ),
                    const SizedBox(height: 16),
                  ],
                  TextButton(
                    onPressed: () => Navigator.push(
                      context,
                      MaterialPageRoute(
                        builder: (_) =>
                            MyChangeRequestsScreen(api: widget.apiService),
                      ),
                    ),
                    child: const Text('मेरा संशोधनहरू (My change requests)'),
                  ),
                  const Text(
                    'अनुरोध प्रकार (Request Type):',
                    style: TextStyle(fontWeight: FontWeight.bold),
                  ),
                  const SizedBox(height: 6),
                  DropdownButtonFormField<String>(
                    isExpanded: true,
                    key: const ValueKey('proposal-request-type'),
                    initialValue: _changeType,
                    items: const [
                      DropdownMenuItem(
                        value: 'EDIT_PERSON',
                        child: Text(
                          'विवरण संशोधन (Edit Details)',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                      DropdownMenuItem(
                        value: 'RECORD_DEATH',
                        child: Text(
                          'मृत्यु दर्ता (Record Death)',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                      DropdownMenuItem(
                        value: 'ADD_CHILD',
                        child: Text(
                          'सन्तान थप (Add Child)',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                      DropdownMenuItem(
                        value: 'ADD_PARENT',
                        child: Text(
                          'जैविक अभिभावक थप (Add Biological Parent)',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                      DropdownMenuItem(
                        value: 'ADD_SPOUSE',
                        child: Text(
                          'जीवनसाथी थप (Add Spouse)',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                    ],
                    onChanged: _submitting || _isSuccess
                        ? null
                        : (val) => setState(() {
                              _parentSelection.invalidateSearch();
                              _spouseSelection.invalidateSearch();
                              _changeType = val ?? 'EDIT_PERSON';
                            }),
                    decoration: const InputDecoration(
                      border: OutlineInputBorder(),
                    ),
                  ),
                  const SizedBox(height: 16),
                  if (_changeType == 'EDIT_PERSON') ...[
                    TextField(
                      controller: _birthPlaceController,
                      enabled: !_submitting,
                      decoration: const InputDecoration(
                        labelText: 'जन्मस्थान (Birth Place)',
                      ),
                    ),
                    const SizedBox(height: 16),
                    TextField(
                      controller: _occupationController,
                      enabled: !_submitting,
                      decoration: const InputDecoration(
                        labelText: 'पेशा (Occupation)',
                      ),
                    ),
                  ],
                  if (_changeType == 'ADD_CHILD') ...[
                    TextField(
                      key: const ValueKey('child-nepali-name'),
                      controller: _nepaliName,
                      enabled: !_submitting,
                      decoration: const InputDecoration(
                        labelText: 'बच्चाको नेपाली नाम (Child Nepali name)',
                      ),
                    ),
                    TextField(
                      controller: _englishName,
                      enabled: !_submitting,
                      decoration: const InputDecoration(
                        labelText: 'English name (optional)',
                      ),
                    ),
                    DropdownButtonFormField<String>(
                      isExpanded: true,
                      initialValue: _gender,
                      items: const [
                        DropdownMenuItem(
                          value: 'MALE',
                          child: Text('पुरुष (Male)'),
                        ),
                        DropdownMenuItem(
                          value: 'FEMALE',
                          child: Text('महिला (Female)'),
                        ),
                        DropdownMenuItem(
                          value: 'OTHER',
                          child: Text('अन्य (Other)'),
                        ),
                      ],
                      onChanged: _submitting
                          ? null
                          : (value) => setState(() => _gender = value!),
                      decoration: const InputDecoration(
                        labelText: 'लिङ्ग (Gender)',
                      ),
                    ),
                  ],
                  if (_changeType == 'ADD_SPOUSE' || _addingParent) ...[
                    DropdownButtonFormField<bool>(
                      key: ValueKey('$_relativeKey-person-mode'),
                      initialValue: _relativeSelection.existing,
                      isExpanded: true,
                      decoration: const InputDecoration(
                        labelText: 'व्यक्ति छान्ने तरिका (Person selection)',
                      ),
                      items: const [
                        DropdownMenuItem(
                          value: false,
                          child: Text('नयाँ व्यक्ति (New person)'),
                        ),
                        DropdownMenuItem(
                          value: true,
                          child: Text('पहिलेको व्यक्ति (Existing person)'),
                        ),
                      ],
                      onChanged: _submitting || _isSuccess
                          ? null
                          : (value) {
                              setState(() {
                                _relativeSelection.invalidateSearch();
                                _relativeSelection.existing = value ?? false;
                              });
                            },
                    ),
                    const SizedBox(height: 12),
                    if (_relativeSelection.existing)
                      ..._existingRelativeFields(),
                    if (!_relativeSelection.existing) ...[
                      Text(
                        _addingParent
                            ? 'नयाँ व्यक्तिलाई जैविक अभिभावकको रूपमा प्रस्ताव गर्नुहोस्; सम्बन्ध स्वीकृतिपछि मात्र कायम हुन्छ। (Propose a new person as a biological parent; the relationship is added only after approval.)'
                            : 'नयाँ व्यक्ति प्रस्ताव गर्नुहोस्; सम्बन्ध स्वीकृतिपछि मात्र कायम हुन्छ। (Propose a new person; the relationship is added only after approval.)',
                      ),
                      TextField(
                        key: ValueKey('$_relativeKey-nepali-name'),
                        controller: _relativeNepaliName,
                        enabled: !_submitting && !_isSuccess,
                        decoration: InputDecoration(
                          labelText: _addingParent
                              ? 'अभिभावकको नेपाली नाम (Parent Nepali name)'
                              : 'जीवनसाथीको नेपाली नाम (Spouse Nepali name)',
                        ),
                      ),
                      TextField(
                        key: ValueKey('$_relativeKey-english-name'),
                        controller: _relativeEnglishName,
                        enabled: !_submitting && !_isSuccess,
                        decoration: InputDecoration(
                          labelText: _addingParent
                              ? 'अभिभावकको अंग्रेजी नाम (Parent English name · optional)'
                              : 'जीवनसाथीको अंग्रेजी नाम (Spouse English name · optional)',
                        ),
                      ),
                      DropdownButtonFormField<String>(
                        key: ValueKey('$_relativeKey-gender'),
                        isExpanded: true,
                        initialValue: _relativeGender,
                        items: const [
                          DropdownMenuItem(
                            value: 'MALE',
                            child: Text('पुरुष (Male)'),
                          ),
                          DropdownMenuItem(
                            value: 'FEMALE',
                            child: Text('महिला (Female)'),
                          ),
                          DropdownMenuItem(
                            value: 'OTHER',
                            child: Text('अन्य (Other)'),
                          ),
                          DropdownMenuItem(
                            value: 'UNKNOWN',
                            child: Text('अज्ञात (Unknown)'),
                          ),
                        ],
                        onChanged: _submitting || _isSuccess
                            ? null
                            : (value) => setState(() {
                                  if (_addingParent) {
                                    _parentGender = value;
                                  } else {
                                    _spouseGender = value;
                                  }
                                }),
                        decoration: const InputDecoration(
                          labelText: 'लिङ्ग छान्नुहोस् (Choose gender)',
                        ),
                      ),
                      DropdownButtonFormField<String>(
                        key: ValueKey('$_relativeKey-living-status'),
                        isExpanded: true,
                        initialValue: _relativeLivingStatus,
                        items: const [
                          DropdownMenuItem(
                            value: 'LIVING',
                            child: Text('जीवित (Living)'),
                          ),
                          DropdownMenuItem(
                            value: 'DECEASED',
                            child: Text('मृतक (Deceased)'),
                          ),
                          DropdownMenuItem(
                            value: 'UNKNOWN',
                            child: Text('अज्ञात (Unknown)'),
                          ),
                        ],
                        onChanged: _submitting || _isSuccess
                            ? null
                            : (value) => setState(() {
                                  if (_addingParent) {
                                    _parentLivingStatus = value;
                                  } else {
                                    _spouseLivingStatus = value;
                                  }
                                }),
                        decoration: const InputDecoration(
                          labelText:
                              'जीवित अवस्था छान्नुहोस् (Choose living status)',
                        ),
                      ),
                    ],
                  ],
                  if (_changeType == 'RECORD_DEATH') ...[
                    const Text(
                      'मिति अज्ञात भए खाली राख्नुहोस्। तिथि वा AD रूपान्तरण हुँदैन। (Leave unknown dates blank; no Tithi/AD conversion.)',
                    ),
                    TextField(
                      key: const ValueKey('death-date-bs'),
                      controller: _deathDate,
                      enabled: !_submitting,
                      decoration: const InputDecoration(
                        labelText: 'मृत्यु मिति BS (YYYY-MM-DD)',
                      ),
                    ),
                    TextField(
                      key: const ValueKey('death-year-bs'),
                      controller: _deathYear,
                      enabled: !_submitting,
                      keyboardType: TextInputType.number,
                      decoration: const InputDecoration(
                        labelText: 'मृत्यु वर्ष BS (optional)',
                      ),
                    ),
                  ],
                  const SizedBox(height: 16),
                  const Text(
                    'संशोधनको कारण (Mandatory Reason):',
                    style: TextStyle(fontWeight: FontWeight.bold),
                  ),
                  const SizedBox(height: 6),
                  TextField(
                    key: const ValueKey('new-proposal-reason'),
                    controller: _reasonController,
                    maxLines: 3,
                    decoration: const InputDecoration(
                      hintText:
                          'संशोधन प्रस्ताव गर्नुको यथेष्ट प्रमाण तथा कारण उल्लेख गर्नुहोस्...',
                      border: OutlineInputBorder(),
                    ),
                  ),
                  const SizedBox(height: 24),
                  SizedBox(
                    width: double.infinity,
                    height: 48,
                    child: ElevatedButton(
                      key: const ValueKey('new-proposal-submit'),
                      onPressed: _submitting || _isSuccess
                          ? null
                          : _submitChangeRequest,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Colors.indigo.shade800,
                        foregroundColor: Colors.white,
                      ),
                      child: _submitting
                          ? const SizedBox(
                              width: 20,
                              height: 20,
                              child: CircularProgressIndicator(
                                color: Colors.white,
                                strokeWidth: 2,
                              ),
                            )
                          : const Text(
                              'प्रस्ताव पेश गर्नुहोस् (Submit Proposal)',
                            ),
                    ),
                  ),
                ],
              ),
            ),
    );
  }
}
