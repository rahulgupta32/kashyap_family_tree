import 'package:flutter/material.dart';
import '../services/genealogy_api_service.dart';

class ProfilePrivacyScreen extends StatefulWidget {
  final GenealogyApiService apiService;

  const ProfilePrivacyScreen({super.key, required this.apiService});

  @override
  State<ProfilePrivacyScreen> createState() => _ProfilePrivacyScreenState();
}

class _ProfilePrivacyScreenState extends State<ProfilePrivacyScreen> {
  final _addressController = TextEditingController();
  final _occupationController = TextEditingController();
  final _educationController = TextEditingController();
  final _bioController = TextEditingController();

  String _profileVisibility = 'VERIFIED_COMMUNITY';
  String _contactVisibility = 'IMMEDIATE_FAMILY';
  String _addressVisibility = 'PRIVATE';

  bool _saving = false;
  String? _message;

  @override
  void dispose() {
    _addressController.dispose();
    _occupationController.dispose();
    _educationController.dispose();
    _bioController.dispose();
    super.dispose();
  }

  Future<void> _saveSettings() async {
    setState(() {
      _saving = true;
      _message = null;
    });

    try {
      await widget.apiService.updateProfilePrivacy(
        profileVisibility: _profileVisibility,
        contactVisibility: _contactVisibility,
        addressVisibility: _addressVisibility,
      );

      await widget.apiService.updateProfileDetails(
        currentAddress: _addressController.text.trim(),
        occupation: _occupationController.text.trim(),
        education: _educationController.text.trim(),
        biography: _bioController.text.trim(),
      );

      setState(() {
        _message = 'प्रोफाइल तथा गोपनीयता सेटिङ सफलतापूर्वक सुरक्षित गरियो।';
      });
    } catch (e) {
      setState(() {
        _message = e.toString().replaceAll('Exception: ', '');
      });
    } finally {
      setState(() {
        _saving = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('प्रोफाइल तथा गोपनीयता (Privacy)'),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (_message != null) ...[
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Colors.indigo.shade50,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text(_message!, style: TextStyle(color: Colors.indigo.shade900)),
              ),
              const SizedBox(height: 16),
            ],

            const Text('व्यक्तिगत विवरण (Personal Details)', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
            const SizedBox(height: 12),

            TextField(
              controller: _addressController,
              decoration: const InputDecoration(labelText: 'हालको ठेगाना (Address)', border: OutlineInputBorder()),
            ),
            const SizedBox(height: 12),

            TextField(
              controller: _occupationController,
              decoration: const InputDecoration(labelText: 'पेशा (Occupation)', border: OutlineInputBorder()),
            ),
            const SizedBox(height: 12),

            TextField(
              controller: _educationController,
              decoration: const InputDecoration(labelText: 'शिक्षा (Education)', border: OutlineInputBorder()),
            ),
            const SizedBox(height: 12),

            TextField(
              controller: _bioController,
              maxLines: 2,
              decoration: const InputDecoration(labelText: 'जीवनी (Biography)', border: OutlineInputBorder()),
            ),
            const SizedBox(height: 24),

            const Text('गोपनीयता दायरा (Privacy Scopes)', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
            const SizedBox(height: 12),

            DropdownButtonFormField<String>(
              initialValue: _profileVisibility,
              decoration: const InputDecoration(labelText: 'प्रोफाइल दृश्यता (Profile Visibility)', border: OutlineInputBorder()),
              items: const [
                DropdownMenuItem(value: 'PUBLIC', child: Text('सार्वजनिक (PUBLIC)')),
                DropdownMenuItem(value: 'VERIFIED_COMMUNITY', child: Text('प्रमाणीकृत समुदाय (VERIFIED_COMMUNITY)')),
                DropdownMenuItem(value: 'IMMEDIATE_FAMILY', child: Text('नजिकको परिवार (IMMEDIATE_FAMILY)')),
                DropdownMenuItem(value: 'PRIVATE', child: Text('गोप्य (PRIVATE)')),
              ],
              onChanged: (val) => setState(() => _profileVisibility = val ?? 'VERIFIED_COMMUNITY'),
            ),
            const SizedBox(height: 12),

            DropdownButtonFormField<String>(
              initialValue: _contactVisibility,
              decoration: const InputDecoration(labelText: 'सम्पर्क दृश्यता (Contact Visibility)', border: OutlineInputBorder()),
              items: const [
                DropdownMenuItem(value: 'PUBLIC', child: Text('सार्वजनिक (PUBLIC)')),
                DropdownMenuItem(value: 'VERIFIED_COMMUNITY', child: Text('प्रमाणीकृत समुदाय (VERIFIED_COMMUNITY)')),
                DropdownMenuItem(value: 'IMMEDIATE_FAMILY', child: Text('नजिकको परिवार (IMMEDIATE_FAMILY)')),
                DropdownMenuItem(value: 'PRIVATE', child: Text('गोप्य (PRIVATE)')),
              ],
              onChanged: (val) => setState(() => _contactVisibility = val ?? 'IMMEDIATE_FAMILY'),
            ),
            const SizedBox(height: 12),

            DropdownButtonFormField<String>(
              initialValue: _addressVisibility,
              decoration: const InputDecoration(labelText: 'ठेगाना दृश्यता (Address Visibility)', border: OutlineInputBorder()),
              items: const [
                DropdownMenuItem(value: 'PUBLIC', child: Text('सार्वजनिक (PUBLIC)')),
                DropdownMenuItem(value: 'VERIFIED_COMMUNITY', child: Text('प्रमाणीकृत समुदाय (VERIFIED_COMMUNITY)')),
                DropdownMenuItem(value: 'IMMEDIATE_FAMILY', child: Text('नजिकको परिवार (IMMEDIATE_FAMILY)')),
                DropdownMenuItem(value: 'PRIVATE', child: Text('गोप्य (PRIVATE)')),
              ],
              onChanged: (val) => setState(() => _addressVisibility = val ?? 'PRIVATE'),
            ),
            const SizedBox(height: 24),

            SizedBox(
              width: double.infinity,
              height: 48,
              child: ElevatedButton(
                onPressed: _saving ? null : _saveSettings,
                style: ElevatedButton.styleFrom(backgroundColor: Colors.indigo.shade800, foregroundColor: Colors.white),
                child: _saving
                    ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(color: Colors.white))
                    : const Text('सेटिङहरू सुरक्षित गर्नुहोस् (Save Settings)'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
