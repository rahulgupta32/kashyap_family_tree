import 'package:flutter/material.dart';
import '../services/genealogy_api_service.dart';

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
  final _birthPlaceController = TextEditingController();
  final _occupationController = TextEditingController();
  final _reasonController = TextEditingController();
  bool _submitting = false;
  String? _message;
  bool _isSuccess = false;

  @override
  void dispose() {
    _birthPlaceController.dispose();
    _occupationController.dispose();
    _reasonController.dispose();
    super.dispose();
  }

  Future<void> _submitChangeRequest() async {
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
      final proposedChanges = <String, dynamic>{
        if (_birthPlaceController.text.trim().isNotEmpty)
          'birthPlace': _birthPlaceController.text.trim(),
        if (_occupationController.text.trim().isNotEmpty)
          'occupation': _occupationController.text.trim(),
      };

      await widget.apiService.submitChangeRequest(
        targetPersonId: widget.personId,
        type: _changeType,
        proposedChanges: proposedChanges,
        reason: _reasonController.text.trim(),
      );

      setState(() {
        _isSuccess = true;
        _message = 'वंशवृक्ष संशोधन अनुरोध सफलतापूर्वक दर्ता भयो। शाखा प्रशासकले परीक्षण गर्नेछन्।';
      });
    } catch (e) {
      setState(() {
        _isSuccess = false;
        _message = e.toString().replaceAll('Exception: ', '');
      });
    } finally {
      setState(() {
        _submitting = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('वंशवृक्ष संशोधन अनुरोध (Change Request)'),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'लक्ष्य व्यक्ति: ${widget.personName}',
              style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
            ),
            const SizedBox(height: 16),

            if (_message != null) ...[
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: _isSuccess ? Colors.green.shade50 : Colors.red.shade50,
                  borderRadius: BorderRadius.circular(8),
                  border: BorderSide(
                    color: _isSuccess ? Colors.green.shade300 : Colors.red.shade300,
                  ),
                ),
                child: Text(
                  _message!,
                  style: TextStyle(
                    color: _isSuccess ? Colors.green.shade900 : Colors.red.shade900,
                    fontSize: 13,
                  ),
                ),
              ),
              const SizedBox(height: 16),
            ],

            const Text('अनुरोध प्रकार (Request Type):', style: TextStyle(fontWeight: FontWeight.bold)),
            const SizedBox(height: 6),
            DropdownButtonFormField<String>(
              value: _changeType,
              items: const [
                DropdownMenuItem(value: 'EDIT_PERSON', child: Text('विवरण संशोधन (Edit Details)')),
                DropdownMenuItem(value: 'RECORD_DEATH', child: Text('मृत्यु दर्ता (Record Death)')),
                DropdownMenuItem(value: 'ADD_CHILD', child: Text('सन्तान थप (Add Child)')),
              ],
              onChanged: (val) => setState(() => _changeType = val ?? 'EDIT_PERSON'),
              decoration: const InputDecoration(border: OutlineInputBorder()),
            ),
            const SizedBox(height: 16),

            const Text('जन्मस्थान (Birth Place):', style: TextStyle(fontWeight: FontWeight.bold)),
            const SizedBox(height: 6),
            TextField(
              controller: _birthPlaceController,
              decoration: const InputDecoration(
                hintText: 'उदा: कास्कीकोट, पोखरा',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 16),

            const Text('पेशा (Occupation):', style: TextStyle(fontWeight: FontWeight.bold)),
            const SizedBox(height: 6),
            TextField(
              controller: _occupationController,
              decoration: const InputDecoration(
                hintText: 'उदा: प्राध्यापक / इन्जिनियर',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 16),

            const Text('संशोधनको कारण (Mandatory Reason):', style: TextStyle(fontWeight: FontWeight.bold)),
            const SizedBox(height: 6),
            TextField(
              controller: _reasonController,
              maxLines: 3,
              decoration: const InputDecoration(
                hintText: 'संशोधन प्रस्ताव गर्नुको यथेष्ट प्रमाण तथा कारण उल्लेख गर्नुहोस्...',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 24),

            SizedBox(
              width: double.infinity,
              height: 48,
              child: ElevatedButton(
                onPressed: _submitting || _isSuccess ? null : _submitChangeRequest,
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.indigo.shade800,
                  foregroundColor: Colors.white,
                ),
                child: _submitting
                    ? const SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2),
                      )
                    : const Text('प्रस्ताव पेश गर्नुहोस् (Submit Proposal)'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
