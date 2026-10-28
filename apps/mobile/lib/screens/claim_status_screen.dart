import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../localization/claim_labels.dart';
import '../services/genealogy_api_service.dart';

/// Every decision and correction form comes from a fresh authorized read.
class ClaimStatusScreen extends StatefulWidget {
  final String claimId;
  final GenealogyApiService api;
  const ClaimStatusScreen({super.key, required this.claimId, required this.api});
  @override
  State<ClaimStatusScreen> createState() => _ClaimStatusScreenState();
}

class _ClaimStatusScreenState extends State<ClaimStatusScreen> {
  late final GenealogyApiService _api;
  late final int _generation;
  static const _picker = MethodChannel('kashyap/chat_attachments');
  static const _evidenceNames = {
    'family_photo':'पारिवारिक फोटो (Family photo)',
    'event_invitation':'कार्यक्रम निमन्त्रणा (Event invitation)',
    'clan_record':'पारिवारिक अभिलेख (Family record)',
  };
  final _description = TextEditingController();
  final List<Map<String,dynamic>> _evidence = [];
  bool _uploading = false, _notice = false;
  String _evidenceType = 'family_photo';
  bool _expired = false, _loading = false, _saving = false, _truth = false;
  bool _claimant = false, _needsReload = false;
  int? _version;
  String? _status, _correction, _error;
  bool get _current => mounted && !_expired && identical(widget.api, _api) &&
      _api.authToken != null && _api.pushSessionGeneration == _generation;
  bool get _canCorrect => _current && _claimant && _status == 'CORRECTION_REQUESTED' &&
      _version != null && !_loading && !_saving && !_uploading && !_needsReload;
  @override
  void initState() {
    super.initState();
    _api = widget.api;
    _generation = _api.pushSessionGeneration;
    _api.sessionChanges.addListener(_sessionChanged);
    _load();
  }
  void _clear({bool preserveDraft = false}) {
    _status = _correction = _error = null;
    _version = null;
    _claimant = _truth = false;
    _notice = false;
    if (!preserveDraft) { _description.clear(); _evidence.clear(); }
  }
  void _sessionChanged() {
    if (!_current && mounted) {
      setState(() {
        _expired = true;
        _clear();
        _loading = _saving = _uploading = false;
      });
    }
  }
  @override
  void didUpdateWidget(covariant ClaimStatusScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.claimId != widget.claimId || !identical(oldWidget.api, widget.api)) {
      _expired = true;
      _sessionChanged();
    }
  }
  Future<void> _load() async {
    if (!_current || _loading || _saving || _uploading) return;
    setState(() { _loading = true; _clear(preserveDraft:_needsReload); });
    try {
      final result = await _api.requestJson('/claims/${Uri.encodeComponent(widget.claimId)}');
      if (!_current) return;
      if (result is! Map || result['id'] != widget.claimId ||
          result['status'] is! String || !claimStatusLabels.containsKey(result['status'])) {
        throw const FormatException('Unavailable claim status');
      }
      final notes = result['correctionRequestNotes'];
      if (notes != null && notes is! String) throw const FormatException('Unavailable correction');
      final version = result['version'];
      final owner = _api.chatAccountId;
      final claimant = owner != null && result['claimantUserId'] == owner;
      if (claimant && result['status'] == 'CORRECTION_REQUESTED' &&
          (version is! int || version < 1 || result['relationshipDescription'] is! String)) {
        throw const FormatException('Unavailable correction revision');
      }
      setState(() {
        _status = result['status'] as String;
        _correction = _status == 'CORRECTION_REQUESTED' ? notes as String? : null;
        _claimant = claimant;
        _version = version is int && version > 0 ? version : null;
        _description.text = claimant && _status == 'CORRECTION_REQUESTED'
            ? result['relationshipDescription'] as String : '';
        _needsReload = false;
        _evidence.clear();
        _notice = false;
      });
    } catch (_) {
      if (_current) setState(() => _error = claimLabels['statusUnavailable']);
    } finally {
      if (_current) setState(() => _loading = false);
    }
  }
  Future<void> _chooseEvidence() async {
    if (!_canCorrect || !_notice || _evidence.length >= 5) return;
    final selectedType = _evidenceType;
    setState(() { _uploading = true; _error = null; });
    try {
      final file = await _picker.invokeMapMethod<String,dynamic>('pickProfile');
      if (!_current || file == null) return;
      if (!['image/jpeg','image/png','image/webp'].contains(file['mimeType']) ||
          file['dataBase64'] is! String || (file['dataBase64'] as String).length > 13981016) {
        throw const FormatException('Unavailable evidence image');
      }
      final result = await _api.requestJson('/me/claim-evidence',method:'POST',data:{
        'mimeType':file['mimeType'],'dataBase64':file['dataBase64'],
        'documentType':selectedType,'evidenceNoticeAccepted':true,
      });
      if (!_current) return;
      if (result is! Map || result['mediaAssetId'] is! String ||
          !RegExp(r'^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[1-5][a-fA-F0-9]{3}-[89abAB][a-fA-F0-9]{3}-[a-fA-F0-9]{12}$').hasMatch(result['mediaAssetId'] as String) ||
          result['documentType'] != selectedType || result['quarantineStatus'] != 'CLEAN' ||
          _evidence.any((item) => item['mediaAssetId'] == result['mediaAssetId'])) {
        throw const FormatException('Unconfirmed private evidence');
      }
      setState(() => _evidence.add({'mediaAssetId':result['mediaAssetId'],'documentType':selectedType}));
    } catch (_) {
      if (_current) setState(() => _error = claimLabels['uploadFailed']);
    } finally {
      if (_current) setState(() => _uploading = false);
    }
  }
  Future<void> _resubmit() async {
    if (!_canCorrect) return;
    final description = _description.text.trim();
    if (!_truth || description.isEmpty || description.length > 2000) {
      setState(() => _error = claimLabels['required']);
      return;
    }
    final body = <String,dynamic>{'expectedVersion':_version,
      'relationshipDescription':description,'statementOfTruth':true,
      if (_evidence.isNotEmpty) 'evidenceAttachments':_evidence.map((item)=>Map<String,dynamic>.from(item)).toList()};
    setState(() { _saving = true; _error = null; });
    try {
      await _api.requestJson('/claims/${Uri.encodeComponent(widget.claimId)}/resubmit',
          method:'POST',data:body);
      // A mutation response is not authority to re-enable a correction form.
      // Reload the current server state after either a confirmed or unknown result.
    } catch (_) {
      if (_current) setState(() => _error = claimLabels['resubmitUnconfirmed']);
    } finally {
      if (_current) {
        setState(() {
          _saving = false;
          _needsReload = true;
          _status = _correction = null;
          _version = null;
          _truth = _claimant = false;
          if (_error == null) { _description.clear(); _evidence.clear(); }
        });
        if (_error == null) await _load();
      }
    }
  }
  @override
  void dispose() {
    _api.sessionChanges.removeListener(_sessionChanged);
    _description.dispose();
    _evidence.clear();
    super.dispose();
  }
  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: Text(claimLabels['statusTitle']!)),
    body: _expired || !_current
        ? Center(child: Text(claimLabels['session']!))
        : ListView(padding: const EdgeInsets.all(16), children: [
            if (_loading || _saving || _uploading) const Center(child: CircularProgressIndicator()),
            if (_error != null) Semantics(liveRegion: true, child: Text(_error!)),
            if (_needsReload) ...[
              Text(claimLabels['reloadBeforeCorrection']!),
              TextField(key:const ValueKey('claim-unconfirmed-correction'),controller:_description,
                enabled:false,maxLines:3,decoration:InputDecoration(labelText:claimLabels['description'])),
              if(_evidence.isNotEmpty)Text('${claimLabels['additionalEvidence']}: ${_evidence.length}'),
            ],
            if (_status != null) ...[
              Semantics(liveRegion: true, child: Text(claimStatusLabels[_status]!)),
              if (_status == 'CORRECTION_REQUESTED') ...[
                Text(claimLabels['correctionReview']!),
                if (_correction != null && _correction!.trim().isNotEmpty) Text(_correction!),
                if (_claimant) ...[
                  Text(claimLabels['evidenceRetained']!),
                  TextField(key:const ValueKey('claim-correction-description'),
                    controller:_description,enabled:_canCorrect,maxLines:3,maxLength:2000,
                    decoration:InputDecoration(labelText:claimLabels['description'])),
                  CheckboxListTile(key:const ValueKey('claim-correction-truth'),value:_truth,
                    onChanged:_canCorrect?(value){if(_canCorrect)setState(()=>_truth=value??false);}:null,
                    title:Text(claimLabels['truth']!)),
                  Text(claimLabels['notice']!),
                  CheckboxListTile(key:const ValueKey('claim-correction-evidence-notice'),value:_notice,
                    onChanged:_canCorrect?(value){if(_canCorrect)setState(()=>_notice=value??false);}:null,
                    title:Text(claimLabels['noticeCheck']!)),
                  DropdownButtonFormField<String>(initialValue:_evidenceType,
                    decoration:InputDecoration(labelText:claimLabels['evidenceCategory']),
                    items:const [
                      DropdownMenuItem(value:'family_photo',child:Text('पारिवारिक फोटो (Family photo)')),
                      DropdownMenuItem(value:'event_invitation',child:Text('कार्यक्रम निमन्त्रणा (Event invitation)')),
                      DropdownMenuItem(value:'clan_record',child:Text('पारिवारिक अभिलेख (Family record)')),
                    ],onChanged:_canCorrect?(value){if(_canCorrect&&value!=null)setState(()=>_evidenceType=value);}:null),
                  OutlinedButton(key:const ValueKey('claim-correction-evidence-upload'),
                    onPressed:_canCorrect&&_notice&&_evidence.length<5?_chooseEvidence:null,
                    child:Text(claimLabels['upload']!)),
                  for(final item in _evidence)ListTile(title:Text(_evidenceNames[item['documentType']]??claimLabels['additionalEvidence']!),
                    trailing:IconButton(tooltip:claimLabels['remove'],icon:const Icon(Icons.remove_circle_outline),
                      onPressed:_canCorrect?(){if(_canCorrect)setState(()=>_evidence.remove(item));}:null)),
                  ElevatedButton(onPressed:_canCorrect?_resubmit:null,
                    child:Text(claimLabels['resubmit']!)),
                ],
              ],
            ],
            OutlinedButton(onPressed: _loading || _saving || _uploading ? null : _load,
                child: Text(claimLabels['statusRefresh']!)),
          ]),
  );
}
