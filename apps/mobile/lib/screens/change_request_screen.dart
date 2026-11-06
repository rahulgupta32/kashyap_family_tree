import 'package:flutter/material.dart';
import '../services/genealogy_api_service.dart';
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

class _ChangeRequestScreenState extends State<ChangeRequestScreen> {
  String _changeType = 'EDIT_PERSON';
  late final int _session;
  bool _expired = false;
  final _nepaliName = TextEditingController(),
      _englishName = TextEditingController(),
      _deathDate = TextEditingController(),
      _deathYear = TextEditingController();
  String _gender = 'OTHER';
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
          _deathYear
        ]) {
          c.clear();
        }
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
    for (final c in [_nepaliName, _englishName, _deathDate, _deathYear]) {
      c.dispose();
    }
    _birthPlaceController.dispose();
    _occupationController.dispose();
    _reasonController.dispose();
    super.dispose();
  }

  Future<void> _submitChangeRequest() async {
    if (_expired ||
        _submitting ||
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
              'बच्चाको नेपाली नाम आवश्यक छ (Child name required)');
        }
        proposedChanges = {
          'primaryNameNepali': _nepaliName.text.trim(),
          if (_englishName.text.trim().isNotEmpty)
            'primaryNameEnglish': _englishName.text.trim(),
          'gender': _gender,
          'livingStatus': 'LIVING'
        };
      } else if (_changeType == 'RECORD_DEATH') {
        final date = _deathDate.text.trim(), year = _deathYear.text.trim();
        if (date.isNotEmpty &&
                !RegExp(r'^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[0-2])$')
                    .hasMatch(date) ||
            year.isNotEmpty && !RegExp(r'^\d{4}$').hasMatch(year)) {
          throw const FormatException(
              'BS मिति YYYY-MM-DD वा चार अङ्कको वर्ष दिनुहोस् (Enter a stored BS date/year; no conversion)');
        }
        proposedChanges = {
          if (date.isNotEmpty) 'deathDateBs': date,
          if (year.isNotEmpty) 'deathYearBs': int.parse(year)
        };
      } else {
        proposedChanges = {
          if (_birthPlaceController.text.trim().isNotEmpty)
            'birthPlace': _birthPlaceController.text.trim(),
          if (_occupationController.text.trim().isNotEmpty)
            'occupation': _occupationController.text.trim()
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
                        fontWeight: FontWeight.bold, fontSize: 16),
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
                        border: Border.fromBorderSide(BorderSide(
                          color: _isSuccess
                              ? Colors.green.shade300
                              : Colors.red.shade300,
                        )),
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
                              builder: (_) => MyChangeRequestsScreen(
                                  api: widget.apiService))),
                      child: const Text('मेरा संशोधनहरू (My change requests)')),
                  const Text('अनुरोध प्रकार (Request Type):',
                      style: TextStyle(fontWeight: FontWeight.bold)),
                  const SizedBox(height: 6),
                  DropdownButtonFormField<String>(
                    initialValue: _changeType,
                    items: const [
                      DropdownMenuItem(
                          value: 'EDIT_PERSON',
                          child: Text('विवरण संशोधन (Edit Details)')),
                      DropdownMenuItem(
                          value: 'RECORD_DEATH',
                          child: Text('मृत्यु दर्ता (Record Death)')),
                      DropdownMenuItem(
                          value: 'ADD_CHILD',
                          child: Text('सन्तान थप (Add Child)')),
                    ],
                    onChanged: _submitting || _isSuccess
                        ? null
                        : (val) =>
                            setState(() => _changeType = val ?? 'EDIT_PERSON'),
                    decoration:
                        const InputDecoration(border: OutlineInputBorder()),
                  ),
                  const SizedBox(height: 16),
                  if (_changeType == 'EDIT_PERSON') ...[
                    TextField(
                        controller: _birthPlaceController,
                        enabled: !_submitting,
                        decoration: const InputDecoration(
                            labelText: 'जन्मस्थान (Birth Place)')),
                    const SizedBox(height: 16),
                    TextField(
                        controller: _occupationController,
                        enabled: !_submitting,
                        decoration: const InputDecoration(
                            labelText: 'पेशा (Occupation)')),
                  ],
                  if (_changeType == 'ADD_CHILD') ...[
                    TextField(
                        key: const ValueKey('child-nepali-name'),
                        controller: _nepaliName,
                        enabled: !_submitting,
                        decoration: const InputDecoration(
                            labelText:
                                'बच्चाको नेपाली नाम (Child Nepali name)')),
                    TextField(
                        controller: _englishName,
                        enabled: !_submitting,
                        decoration: const InputDecoration(
                            labelText: 'English name (optional)')),
                    DropdownButtonFormField<String>(
                        initialValue: _gender,
                        items: const [
                          DropdownMenuItem(
                              value: 'MALE', child: Text('पुरुष (Male)')),
                          DropdownMenuItem(
                              value: 'FEMALE', child: Text('महिला (Female)')),
                          DropdownMenuItem(
                              value: 'OTHER', child: Text('अन्य (Other)'))
                        ],
                        onChanged: _submitting
                            ? null
                            : (value) => setState(() => _gender = value!),
                        decoration:
                            const InputDecoration(labelText: 'लिङ्ग (Gender)')),
                  ],
                  if (_changeType == 'RECORD_DEATH') ...[
                    const Text(
                        'मिति अज्ञात भए खाली राख्नुहोस्। तिथि वा AD रूपान्तरण हुँदैन। (Leave unknown dates blank; no Tithi/AD conversion.)'),
                    TextField(
                        key: const ValueKey('death-date-bs'),
                        controller: _deathDate,
                        enabled: !_submitting,
                        decoration: const InputDecoration(
                            labelText: 'मृत्यु मिति BS (YYYY-MM-DD)')),
                    TextField(
                        key: const ValueKey('death-year-bs'),
                        controller: _deathYear,
                        enabled: !_submitting,
                        keyboardType: TextInputType.number,
                        decoration: const InputDecoration(
                            labelText: 'मृत्यु वर्ष BS (optional)')),
                  ],
                  const SizedBox(height: 16),
                  const Text('संशोधनको कारण (Mandatory Reason):',
                      style: TextStyle(fontWeight: FontWeight.bold)),
                  const SizedBox(height: 6),
                  TextField(
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
                                  color: Colors.white, strokeWidth: 2),
                            )
                          : const Text(
                              'प्रस्ताव पेश गर्नुहोस् (Submit Proposal)'),
                    ),
                  ),
                ],
              ),
            ),
    );
  }
}
