import 'package:flutter/material.dart';
import '../services/genealogy_api_service.dart';

class ClaimProfileScreen extends StatefulWidget {
  final String personId;
  final String personName;
  final GenealogyApiService apiService;

  const ClaimProfileScreen({
    super.key,
    required this.personId,
    required this.personName,
    required this.apiService,
  });

  @override
  State<ClaimProfileScreen> createState() => _ClaimProfileScreenState();
}

class _ClaimProfileScreenState extends State<ClaimProfileScreen> {
  final _relDescController = TextEditingController();
  bool _statementOfTruth = false;
  bool _submitting = false;
  String? _message;
  bool _isSuccess = false;

  @override
  void dispose() {
    _relDescController.dispose();
    super.dispose();
  }

  Future<void> _submitClaim() async {
    if (!_statementOfTruth) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('सत्यताको घोषणा स्वीकार गर्न अनिवार्य छ।')),
      );
      return;
    }

    if (_relDescController.text.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('सम्बन्धको विवरण उल्लेख गर्नुहोस्।')),
      );
      return;
    }

    setState(() {
      _submitting = true;
      _message = null;
    });

    try {
      await widget.apiService.submitProfileClaim(
        targetPersonId: widget.personId,
        relationshipDescription: _relDescController.text.trim(),
        statementOfTruth: true,
      );
      setState(() {
        _isSuccess = true;
        _message = 'तपाईंको प्रोफाइल दाबी सफलतापूर्वक दर्ता भयो। समीक्षा पश्चात् सूचित गरिनेछ।';
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
        title: const Text('प्रोफाइल दाबी (Claim Profile)'),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Card(
              color: Colors.amber.shade50,
              elevation: 0,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12),
                side: BorderSide(color: Colors.amber.shade300),
              ),
              child: Padding(
                padding: const EdgeInsets.all(16.0),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'दाबी गरिने व्यक्ति:',
                      style: TextStyle(fontSize: 12, color: Colors.grey.shade700),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      widget.personName,
                      style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                    ),
                    const SizedBox(height: 8),
                    const Text(
                      'तपाईं आफू स्वयं यो व्यक्ति हुनुहुन्छ भनी दाबी दर्ता गर्न लाग्नुभएको छ। २-तहको प्रमाणीकरण पश्चात् मात्र प्रोफाइल खातासँग जोडिनेछ।',
                      style: TextStyle(fontSize: 12),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 20),

            if (_message != null) ...[
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: _isSuccess ? Colors.green.shade50 : Colors.red.shade50,
                  borderRadius: BorderRadius.circular(8),
                  border: Border.fromBorderSide(BorderSide(
                    color: _isSuccess ? Colors.green.shade300 : Colors.red.shade300,
                  )),
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

            const Text(
              'सम्बन्ध तथा चिनारी विवरण (Relationship Description):',
              style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13),
            ),
            const SizedBox(height: 6),
            TextField(
              controller: _relDescController,
              maxLines: 3,
              decoration: const InputDecoration(
                hintText: 'उदा: म कृष्णप्रसादको कान्छो छोरा हुँ। मेरो जन्म पोखरामा भएको हो...',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 16),

            CheckboxListTile(
              value: _statementOfTruth,
              onChanged: (val) => setState(() => _statementOfTruth = val ?? false),
              title: const Text(
                'सत्यताको घोषणा (Statement of Truth)',
                style: TextStyle(fontSize: 13, fontWeight: FontWeight.bold),
              ),
              subtitle: const Text(
                'म यो घोषणा गर्दछु कि माथि उल्लिखित सम्पूर्ण विवरण पूर्ण सत्य हो। झूटो दाबी गरेमा कानुनी दायित्व रहनेछ।',
                style: TextStyle(fontSize: 11),
              ),
              controlAffinity: ListTileControlAffinity.leading,
              contentPadding: EdgeInsets.zero,
            ),
            const SizedBox(height: 24),

            SizedBox(
              width: double.infinity,
              height: 48,
              child: ElevatedButton(
                onPressed: _submitting || _isSuccess ? null : _submitClaim,
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.amber.shade800,
                  foregroundColor: Colors.white,
                ),
                child: _submitting
                    ? const SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2),
                      )
                    : const Text('दाबी पेश गर्नुहोस् (Submit Claim)'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
