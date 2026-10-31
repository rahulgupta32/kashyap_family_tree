import '../widgets/profile_photo_editor.dart';
import 'account_deletion_screen.dart';
import 'package:flutter/material.dart';
import '../services/genealogy_api_service.dart';

class ProfilePrivacyScreen extends StatefulWidget {
  final GenealogyApiService apiService;

  const ProfilePrivacyScreen({super.key, required this.apiService});

  @override
  State<ProfilePrivacyScreen> createState() => _ProfilePrivacyScreenState();
}

class _ProfilePrivacyScreenState extends State<ProfilePrivacyScreen> {
  late final GenealogyApiService _api;
  late final int _generation;
  bool _expired = false;
  bool get _current => mounted && !_expired && identical(widget.apiService, _api) &&
      _api.authToken != null && _api.pushSessionGeneration == _generation;
  bool get _editable => _current && _loaded && !_loading && !_saving;

  final _addressController = TextEditingController();
  final _occupationController = TextEditingController();
  final _educationController = TextEditingController();
  final _bioController = TextEditingController();

  String _profileVisibility = 'VERIFIED_COMMUNITY';
  String _contactVisibility = 'IMMEDIATE_FAMILY';
  String _addressVisibility = 'PRIVATE';

  bool _saving = false;
  bool _loading = false;
  bool _loaded = false;
  String? _message;
  String? _avatarAsset;

  @override
  void initState() {
    super.initState();
    _api = widget.apiService;
    _generation = _api.pushSessionGeneration;
    _api.sessionChanges.addListener(_sessionChanged);
    _loadProfile();
  }

  void _clearPrivateState() {
    _addressController.clear();
    _occupationController.clear();
    _educationController.clear();
    _bioController.clear();
    _avatarAsset = null;
    _message = null;
    _loaded = false;
    _profileVisibility = 'VERIFIED_COMMUNITY';
    _contactVisibility = 'IMMEDIATE_FAMILY';
    _addressVisibility = 'PRIVATE';
  }

  void _sessionChanged() {
    if (mounted && !_current) {
      setState(() {
        _expired = true;
        _clearPrivateState();
        _loading = _saving = false;
      });
    }
  }

  @override
  void didUpdateWidget(covariant ProfilePrivacyScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (!identical(oldWidget.apiService, widget.apiService)) {
      _expired = true;
      _sessionChanged();
    }
  }

  Future<void> _loadProfile() async {
    if (!_current || _loading || _saving) { return; }
    setState(() { _clearPrivateState(); _loading = true; });
    try {
      final profile = await _api.getMyProfile();
      if (!_current) { return; }
      _avatarAsset=profile['avatarAssetId'] as String?;
      final person = profile['person'] as Map<String, dynamic>? ?? {};
      final privacy = profile['privacy'] as Map<String, dynamic>? ?? {};
      _addressController.text = person['currentAddress'] as String? ?? '';
      _occupationController.text = person['occupation'] as String? ?? '';
      _educationController.text = person['education'] as String? ?? '';
      _bioController.text = person['biography'] as String? ?? '';
      _profileVisibility = privacy['profileVisibility'] as String? ?? 'VERIFIED_COMMUNITY';
      _contactVisibility = privacy['contactVisibility'] as String? ?? 'IMMEDIATE_FAMILY';
      _addressVisibility = privacy['addressVisibility'] as String? ?? 'IMMEDIATE_FAMILY';
      _loaded = true;
    } catch (_) {
      if (_current) {
        _clearPrivateState();
        _message = 'प्रोफाइल लोड भएन। पुनः प्रयास गर्नुहोस्। (Profile unavailable; retry.)';
      }
    } finally {
      if (_current) { setState(() => _loading = false); }
    }
  }

  @override
  void dispose() {
    _api.sessionChanges.removeListener(_sessionChanged);
    _addressController.dispose();
    _occupationController.dispose();
    _educationController.dispose();
    _bioController.dispose();
    super.dispose();
  }

  Future<void> _saveSettings() async {
    if (!_editable) { return; }
    setState(() {
      _saving = true;
      _message = null;
    });

    try {
      await _api.updateProfileDetails(
        currentAddress: _addressController.text.trim(),
        occupation: _occupationController.text.trim(),
        education: _educationController.text.trim(),
        biography: _bioController.text.trim(),
        privacy: {
          'profileVisibility': _profileVisibility,
          'contactVisibility': _contactVisibility,
          'addressVisibility': _addressVisibility,
        },
      );

      if (_current) { setState(() {
        _message = 'प्रोफाइल तथा गोपनीयता सेटिङ सफलतापूर्वक सुरक्षित गरियो।';
      }); }
    } catch (_) {
      if (_current) { setState(() {
        _message = 'सेटिङ सुरक्षित भएको पुष्टि भएन। पुनः प्रयास गर्नुहोस्। (Save unconfirmed; retry.)';
      }); }
    } finally {
      if (_current) { setState(() {
        _saving = false;
      }); }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('प्रोफाइल तथा गोपनीयता (Privacy)'),
        actions: [IconButton(key: const Key('account-deletion-open'), tooltip: 'Account deletion',
          icon: const Icon(Icons.person_remove_outlined), onPressed: !_current ? null : () {
            if (!_current) { return; }
            Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => AccountDeletionScreen(api: _api)));
          })],
      ),
      body: !_current ? const Center(child: Text('सत्र परिवर्तन भयो। फेरि साइन इन गरी प्रोफाइल खोल्नुहोस्। (Session changed; sign in and reopen profile.)'))
          : _loading ? const Center(child: CircularProgressIndicator())
          : !_loaded ? Center(child: Column(mainAxisSize: MainAxisSize.min, children: [
              Text(_message ?? 'Profile could not be loaded'),
              TextButton(onPressed: _loadProfile, child: const Text('पुनः प्रयास (Retry)')),
            ])) : SingleChildScrollView(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            ProfilePhotoEditor(api:_api,initialAsset:_avatarAsset),

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
              enabled: _editable,
              decoration: const InputDecoration(labelText: 'हालको ठेगाना (Address)', border: OutlineInputBorder()),
            ),
            const SizedBox(height: 12),

            TextField(
              controller: _occupationController,
              enabled: _editable,
              decoration: const InputDecoration(labelText: 'पेशा (Occupation)', border: OutlineInputBorder()),
            ),
            const SizedBox(height: 12),

            TextField(
              controller: _educationController,
              enabled: _editable,
              decoration: const InputDecoration(labelText: 'शिक्षा (Education)', border: OutlineInputBorder()),
            ),
            const SizedBox(height: 12),

            TextField(
              controller: _bioController,
              enabled: _editable,
              maxLines: 2,
              decoration: const InputDecoration(labelText: 'जीवनी (Biography)', border: OutlineInputBorder()),
            ),
            const SizedBox(height: 24),

            const Text('गोपनीयता दायरा (Privacy Scopes)', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
            const SizedBox(height: 12),

            DropdownButtonFormField<String>(
              isExpanded: true,
              initialValue: _profileVisibility,
              decoration: const InputDecoration(labelText: 'प्रोफाइल दृश्यता (Profile Visibility)', border: OutlineInputBorder()),
              items: const [
                DropdownMenuItem(value: 'PUBLIC', child: Text('सार्वजनिक (PUBLIC)')),
                DropdownMenuItem(value: 'VERIFIED_COMMUNITY', child: Text('प्रमाणीकृत समुदाय (VERIFIED_COMMUNITY)')),
                DropdownMenuItem(value: 'IMMEDIATE_FAMILY', child: Text('नजिकको परिवार (IMMEDIATE_FAMILY)')),
                DropdownMenuItem(value: 'PRIVATE', child: Text('गोप्य (PRIVATE)')),
              ],
              onChanged: !_editable ? null : (val) { if (_editable) { setState(() => _profileVisibility = val ?? 'VERIFIED_COMMUNITY'); } },
            ),
            const SizedBox(height: 12),

            DropdownButtonFormField<String>(
              isExpanded: true,
              initialValue: _contactVisibility,
              decoration: const InputDecoration(labelText: 'सम्पर्क दृश्यता (Contact Visibility)', border: OutlineInputBorder()),
              items: const [
                DropdownMenuItem(value: 'PUBLIC', child: Text('सार्वजनिक (PUBLIC)')),
                DropdownMenuItem(value: 'VERIFIED_COMMUNITY', child: Text('प्रमाणीकृत समुदाय (VERIFIED_COMMUNITY)')),
                DropdownMenuItem(value: 'IMMEDIATE_FAMILY', child: Text('नजिकको परिवार (IMMEDIATE_FAMILY)')),
                DropdownMenuItem(value: 'PRIVATE', child: Text('गोप्य (PRIVATE)')),
              ],
              onChanged: !_editable ? null : (val) { if (_editable) { setState(() => _contactVisibility = val ?? 'IMMEDIATE_FAMILY'); } },
            ),
            const SizedBox(height: 12),

            DropdownButtonFormField<String>(
              isExpanded: true,
              initialValue: _addressVisibility,
              decoration: const InputDecoration(labelText: 'ठेगाना दृश्यता (Address Visibility)', border: OutlineInputBorder()),
              items: const [
                DropdownMenuItem(value: 'PUBLIC', child: Text('सार्वजनिक (PUBLIC)')),
                DropdownMenuItem(value: 'VERIFIED_COMMUNITY', child: Text('प्रमाणीकृत समुदाय (VERIFIED_COMMUNITY)')),
                DropdownMenuItem(value: 'IMMEDIATE_FAMILY', child: Text('नजिकको परिवार (IMMEDIATE_FAMILY)')),
                DropdownMenuItem(value: 'PRIVATE', child: Text('गोप्य (PRIVATE)')),
              ],
              onChanged: !_editable ? null : (val) { if (_editable) { setState(() => _addressVisibility = val ?? 'PRIVATE'); } },
            ),
            const SizedBox(height: 24),

            SizedBox(
              width: double.infinity,
              height: 48,
              child: ElevatedButton(
                onPressed: _editable ? _saveSettings : null,
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
