import 'dart:convert';
import 'dart:math';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import '../models/person.dart';
import '../models/tree_node.dart';
import 'session_store.dart';
import 'chat_connection.dart';
import 'chat_outbox.dart';
import 'api_endpoint_config.dart';

class GenealogyApiService {
  final String baseUrl;
  String? _authToken;
  String? _refreshToken;
  final http.Client _client;
  final SessionStore _sessionStore;
  final ChatOutboxStore _chatOutboxStore;
  ChatOutbox? _chatOutbox;
  Future<bool>? _refreshing;
  int _sessionGeneration = 0;
  final ValueNotifier<int> _sessionChanges = ValueNotifier<int>(0);
  bool _disposed = false;
  bool _pushRemovalPending = false;
  Map<String,dynamic>? _pendingCalendarCreate;
  bool _calendarCreateBusy = false;
  Map<String, dynamic>? _pendingProfileClaim;
  bool _profileClaimBusy = false;
  Map<String,dynamic>? _pendingDispute;
  bool _disputeBusy = false;
  Future<void> _sessionStorageWork = Future<void>.value();
  void Function()? onSessionExpired;
  void Function()? onMfaRequired;
  void Function()? onAccountDeleted;

  GenealogyApiService({
    this.baseUrl = mobileApiBaseUrl,
    http.Client? client,
    SessionStore? sessionStore,
    ChatOutboxStore? chatOutboxStore,
  }) : _client = client ?? http.Client(),
       _sessionStore = sessionStore ?? SecureSessionStore(),
       _chatOutboxStore = chatOutboxStore ?? SecureChatOutboxStore() {
    if (!isUsableApiEndpoint(baseUrl)) {
      throw const FormatException('Mobile API endpoint unavailable');
    }
  }

  int _advanceSessionGeneration() {
    _pendingCalendarCreate = null;
    _pendingProfileClaim = null;
    _pendingDispute = null;
    final generation = ++_sessionGeneration;
    if (!_disposed) { _sessionChanges.value = generation; }
    return generation;
  }

  void setAuthToken(String? token) {
    _advanceSessionGeneration();
    _chatOutbox?.stop();
    _authToken = token;
    _refreshToken = null;
    _pushRemovalPending = false;
  }

  String? get authToken => _authToken;
  int get pushSessionGeneration => _sessionGeneration;
  Listenable get sessionChanges => _sessionChanges;
  bool get pushRemovalPending => _pushRemovalPending;

  Map<String, dynamic> _storedSession(String access, String refresh, {required bool removalPending, bool includeCalendar = true, bool includeProfileClaim = true, bool includeDispute = true}) => {
    'accessToken': access, 'refreshToken': refresh,
    if (removalPending) 'pushRemovalPending': true,
    if (includeCalendar && _pendingCalendarCreate != null) 'pendingCalendarCreate': _pendingCalendarCreate,
    if (includeProfileClaim && _pendingProfileClaim != null) 'pendingProfileClaim': _pendingProfileClaim,
    if (includeDispute && _pendingDispute != null) 'pendingDispute': _pendingDispute,
  };

  /// The flag shares the secure credential record and its serialized writes.
  /// Rotation retains it; accepting a replacement native session clears it.
  Future<void> rememberPushRemoval(int generation) {
    if (generation != _sessionGeneration || _authToken == null) {
      throw StateError('Push session changed');
    }
    _pushRemovalPending = true; // Stop reconciliation even if storage fails.
    return _persistPushRemoval(true, generation);
  }

  Future<void> confirmPushRemoval(int generation) => _persistPushRemoval(false, generation);

  Future<void> _persistPushRemoval(bool pending, int generation) => _serializeSessionStorage(() async {
    if (generation != _sessionGeneration || _authToken == null) {
      throw StateError('Push session changed');
    }
    // Injected bearer-only sessions have no restorable credential record.
    // Do not overwrite secure storage with a non-restorable token pair.
    if (_refreshToken != null) {
      try {
        await _sessionStore.write(json.encode(_storedSession(_authToken!, _refreshToken!, removalPending: pending)));
      } catch (_) { throw StateError('Push preference storage unavailable'); }
    }
    if (generation != _sessionGeneration || _authToken == null) {
      throw StateError('Push session changed');
    }
    _pushRemovalPending = pending; // Clearing requires a confirmed durable write.
  });

  // This subject scopes encrypted local intent, not server authorization. Every
  // send still authenticates and checks current permissions in the API.
  String? get chatAccountId {
    try {
      final parts=_authToken?.split('.');
      if(parts==null||parts.length!=3){return null;}
      final value=json.decode(utf8.decode(base64Url.decode(base64Url.normalize(parts[1]))));
      return value is Map&&value['sub'] is String?value['sub'] as String:null;
    } catch(_){return null;}
  }
  ChatOutbox get chatOutbox => _chatOutbox ??= ChatOutbox(store:_chatOutboxStore,server:Uri.parse(baseUrl).toString(),
    currentOwner:()=>chatAccountId,send:(message,owner) async {
      final response=await _send('POST',Uri.parse('$baseUrl/chat/conversations/${message.conversationId}/${message.attachment==null?'messages':'attachments'}'),
        boundAccountId:owner,body:json.encode({'content':message.content,'clientMessageId':message.id,...?message.attachment}));
      if(response.statusCode<200||response.statusCode>=300){throw ChatSendFailure(response.statusCode);}
      final value=json.decode(response.body);
      if(value is! Map||value['id'] is! String){throw const FormatException('Invalid committed message response');}
    });

  Future<void> _acceptSession(Map<String, dynamic> data, {bool replacement = false}) async {
    final generation = _sessionGeneration;
    final access = data['accessToken'];
    final refresh = data['refreshToken'];
    if (access is! String || access.isEmpty || refresh is! String || refresh.isEmpty) {
      throw const FormatException('Invalid native authentication response');
    }
    await _serializeSessionStorage(() async {
      if (generation != _sessionGeneration) { throw StateError('Session changed before storage'); }
      await _sessionStore.write(json.encode(_storedSession(access, refresh,
        removalPending: !replacement && _pushRemovalPending, includeCalendar: !replacement, includeProfileClaim: !replacement, includeDispute: !replacement)));
      if (generation != _sessionGeneration) { throw StateError('Session changed during storage'); }
      // Requests may have begun with the prior access token while sign-in was
      // pending. Activation is a second boundary, separate from token rotation.
      if (replacement) { _advanceSessionGeneration(); _pushRemovalPending = false; }
      _authToken = access;
      _refreshToken = refresh;
    });
  }

  Future<void> _serializeSessionStorage(Future<void> Function() work) {
    final pending = _sessionStorageWork.then((_) => work());
    // Keep the queue usable after a failed write; the caller still sees failure.
    _sessionStorageWork = pending.then<void>((_) {}, onError: (Object _, StackTrace __) {});
    return pending;
  }

  Future<bool> restoreSession() async {
    final generation = _advanceSessionGeneration();
    await _sessionStorageWork;
    final saved = await _sessionStore.read();
    if (generation != _sessionGeneration) { throw StateError('Session changed during restore'); }
    if (saved == null) { return false; }
    try {
      final data = json.decode(saved);
      if (data is! Map<String, dynamic> || data['accessToken'] is! String || data['refreshToken'] is! String || (data['refreshToken'] as String).isEmpty ||
          (data.containsKey('pushRemovalPending') && data['pushRemovalPending'] is! bool)) {
        throw const FormatException('Invalid saved session');
      }
      // Fence work begun during the asynchronous persisted-session read.
      _advanceSessionGeneration();
      _authToken = data['accessToken'] as String;
      _refreshToken = data['refreshToken'] as String;
      _pushRemovalPending = data['pushRemovalPending'] == true;
      final pending = data['pendingCalendarCreate'];
      if (pending != null) {
        if (pending is! Map<String,dynamic> || pending['server'] != baseUrl ||
            pending['owner'] != chatAccountId || pending['body'] is! Map<String,dynamic> ||
            pending['key'] is! String || !RegExp(r'^[a-f0-9-]{36}$').hasMatch(pending['key'] as String)) {
          throw const FormatException('Invalid pending calendar creation');
        }
        _pendingCalendarCreate = pending;
      }
      if (data.containsKey('pendingProfileClaim')) {
        final claim = data['pendingProfileClaim'];
        if (claim is! Map<String, dynamic> ||
            claim.length != 4 ||
            !claim.keys.toSet().containsAll({'key', 'owner', 'server', 'body'}) ||
            claim['server'] != baseUrl ||
            claim['owner'] is! String || (claim['owner'] as String).isEmpty ||
            claim['owner'] != chatAccountId ||
            claim['key'] is! String || !_claimCreationKey.hasMatch(claim['key'] as String) ||
            claim['body'] is! Map<String, dynamic>) {
          throw const FormatException('Invalid pending profile claim');
        }
        _validateProfileClaimBody(claim['body'] as Map<String, dynamic>);
        _pendingProfileClaim = claim;
      }
      if (data.containsKey('pendingDispute')) {
        final pending = data['pendingDispute'];
        if (pending is! Map<String,dynamic> || pending.length != 4 ||
            !pending.keys.toSet().containsAll({'key','owner','server','body'}) ||
            pending['owner'] is! String || (pending['owner'] as String).isEmpty ||
            pending['owner'] != chatAccountId || pending['server'] != baseUrl ||
            pending['key'] is! String || !_claimCreationKey.hasMatch(pending['key'] as String) ||
            pending['body'] is! Map<String,dynamic>) throw const FormatException('Unavailable pending dispute');
        _validateDisputeBody(pending['body'] as Map<String,dynamic>);
        _pendingDispute = pending;
      }
      return await _refreshSession();
    } on FormatException {
      await _clearSession();
      return false;
    }
  }

  Future<void> _clearSession() async {
    final generation = _advanceSessionGeneration();
    _authToken = null;
    _refreshToken = null;
    _pushRemovalPending = false;
    try { await _serializeSessionStorage(() => _sessionStore.clear()); }
    finally {
      if (generation == _sessionGeneration) {
        try { await chatOutbox.clear(); }
        finally { if (generation == _sessionGeneration) { onSessionExpired?.call(); } }
      }
    }
  }

  Future<bool> _refreshSession() async {
    if (_refreshing != null) { return _refreshing!; }
    final pending = _rotateSession();
    _refreshing = pending;
    try {
      return await pending;
    } finally {
      _refreshing = null;
    }
  }

  Future<bool> _rotateSession() async {
    final generation = _sessionGeneration;
    final response = await _client.post(Uri.parse('$baseUrl/auth/native/refresh'),
      headers: {'Content-Type': 'application/json'},
      body: json.encode({'refreshToken': _refreshToken}),
    ).timeout(const Duration(seconds: 20));
    if (generation != _sessionGeneration) { throw StateError('Session changed during refresh'); }
    if (response.statusCode == 401 || response.statusCode == 403) {
      await _clearSession();
      return false;
    }
    if (response.statusCode != 200) { throw Exception('Session refresh failed (${response.statusCode})'); }
    await _acceptSession(json.decode(response.body) as Map<String, dynamic>);
    return true;
  }

  Future<http.Response> _send(String method, Uri uri, {String? body, bool authenticated = true, String? boundAccountId, int? boundSessionGeneration}) async {
    // Rotation preserves this generation; replacement sign-in, restore and
    // clearing do not. Never replay an older user's request in a new session.
    final requestGeneration = boundSessionGeneration ?? (authenticated ? _sessionGeneration : null);
    void checkSession() {
      if (requestGeneration != null && _sessionGeneration != requestGeneration) {
        throw StateError('Session changed during request');
      }
    }
    Future<http.Response> send() async {
      checkSession();
      if(boundAccountId!=null&&chatAccountId!=boundAccountId){throw StateError('Message session changed');}
      final request = http.Request(method, uri);
      request.headers.addAll(authenticated ? _headers : {'Content-Type': 'application/json'});
      if (body != null) { request.body = body; }
      final result = await _client.send(request).timeout(const Duration(seconds: 20));
      return http.Response.fromStream(result).timeout(const Duration(seconds: 20));
    }
    final tokenUsed = _authToken;
    var response = await send();
    checkSession();
    if(boundAccountId!=null&&chatAccountId!=boundAccountId){throw StateError('Message session changed');}
    if (authenticated && response.statusCode == 401 && _refreshToken != null) {
      if (_authToken != tokenUsed || await _refreshSession()) { response = await send(); }
    }
    checkSession();
    if (authenticated && response.statusCode == 401 && _authToken != null) { await _clearSession(); }
    if (authenticated && response.statusCode == 403) {
      try {
        final value = json.decode(response.body);
        if (value is Map && value['errorCode'] == 'MFA_REQUIRED') { onMfaRequired?.call(); }
      } on FormatException { /* Non-JSON denials remain ordinary errors. */ }
    }
    return response;
  }

  /// Deletion is confirmed only by a valid response for this exact session.
  Future<void> deleteOwnAccount({required String challengeId, required String otp}) async {
    final generation = _sessionGeneration;
    final result = await requestJson('/me/delete', method: 'POST',
      data: {'challengeId': challengeId, 'otp': otp});
    if (generation != _sessionGeneration) { throw StateError('Session changed'); }
    if (result is! Map || result['success'] != true || result['genealogyPreserved'] != true ||
        result['deletedAt'] is! String || DateTime.tryParse(result['deletedAt'] as String) == null) {
      throw const FormatException('Deletion outcome unconfirmed');
    }
    await _clearSession();
    if (_sessionGeneration != generation + 1 || _authToken != null) {
      throw StateError('Session changed');
    }
    onAccountDeleted?.call();
  }

  Future<void> logout() async {
    final generation = _sessionGeneration;
    _chatOutbox?.stop();
    try {
      if (_refreshing != null) { await _refreshing; }
      if (generation != _sessionGeneration) { throw StateError('Session changed during logout'); }
      final response = await _send('POST', Uri.parse('$baseUrl/auth/logout'),
        authenticated: false, body: json.encode({'refreshToken': _refreshToken}));
      if (response.statusCode != 200) { throw Exception('Logout failed (${response.statusCode})'); }
    } finally {
      if (generation == _sessionGeneration) { await _clearSession(); }
    }
  }

  void dispose() {
    if (_disposed) { return; }
    _disposed = true;
    _advanceSessionGeneration(); // Fence requests without notifying unmounting widgets.
    _sessionChanges.dispose();
    _chatOutbox?.dispose();
    _client.close();
  }

  Map<String, String> get _headers {
    final headers = {'Content-Type': 'application/json'};
    if (_authToken != null) {
      headers['Authorization'] = 'Bearer $_authToken';
    }
    return headers;
  }

  Future<Map<String, dynamic>> requestOtp(String phoneNumber) async {
    final uri = Uri.parse('$baseUrl/auth/otp/request');
    final body = json.encode({'phoneNumber': phoneNumber});
    final response = await _send('POST', uri, body: body, authenticated: false);
    if (response.statusCode == 200 || response.statusCode == 201) {
      return json.decode(response.body);
    } else {
      throw Exception('OTP अनुरोध असफल भयो (${response.statusCode})');
    }
  }

  Future<String> verifyOtp(String otpSessionId, String code, {String? platform}) async {
    final generation = _advanceSessionGeneration();
    final uri = Uri.parse('$baseUrl/auth/native/verify');
    final body = json.encode({
      'otpSessionId': otpSessionId, 'code': code,
      'deviceInfo': {'deviceId': 'mobile-${DateTime.now().microsecondsSinceEpoch}',
        'platform': platform ?? (defaultTargetPlatform == TargetPlatform.iOS ? 'ios' : 'android'), 'appVersion': '1.0.0'},
    });
    final response = await _send('POST', uri, body: body, authenticated: false);
    if (generation != _sessionGeneration) { throw StateError('Session changed during sign-in'); }
    if (response.statusCode == 200 || response.statusCode == 201) {
      final data = json.decode(response.body);
      await _acceptSession(data as Map<String, dynamic>, replacement: true);
      return _authToken!;
    } else {
      throw Exception('OTP प्रमाणीकरण असफल भयो (${response.statusCode})');
    }
  }

  Future<dynamic> requestJson(String path, {String method = 'GET', Map<String, dynamic>? data, String? boundAccountId}) async {
    final response = await _send(method, Uri.parse('$baseUrl$path'),
      body: data == null ? null : json.encode(data), boundAccountId: boundAccountId);
    if(boundAccountId!=null&&chatAccountId!=boundAccountId){throw StateError('Request session changed');}
    final decoded = response.body.isEmpty ? null : json.decode(response.body);
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw Exception(decoded is Map ? decoded['message'] ?? 'Request failed' : 'Request failed (${response.statusCode})');
    }
    return decoded;
  }

  bool get hasPendingCalendarCreate => _pendingCalendarCreate != null;

  Future<void> _persistCalendarCreate(int generation) => _serializeSessionStorage(() async {
    if (generation != _sessionGeneration || _authToken == null) { throw StateError('Session changed'); }
    // Native sessions persist the intent beside their credentials, before HTTP.
    // Legacy access-token-only callers keep an in-memory identity only.
    if (_refreshToken != null) {
      await _sessionStore.write(json.encode(_storedSession(_authToken!, _refreshToken!, removalPending: _pushRemovalPending)));
      if (generation != _sessionGeneration) { throw StateError('Session changed'); }
    }
  });

  Future<dynamic> createCalendarEvent([Map<String,dynamic>? body]) async {
    if (_authToken == null || _calendarCreateBusy) { throw StateError('Calendar creation unavailable'); }
    final generation = _sessionGeneration;
    _calendarCreateBusy = true;
    try {
      if (_pendingCalendarCreate == null) {
        if (body == null) { throw StateError('No pending creation'); }
        final random = Random.secure();
        final bytes = List<int>.generate(16, (_) => random.nextInt(256));
        bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
        final hex = bytes.map((b) => b.toRadixString(16).padLeft(2, '0')).join();
        final key = '${hex.substring(0,8)}-${hex.substring(8,12)}-${hex.substring(12,16)}-${hex.substring(16,20)}-${hex.substring(20)}';
        _pendingCalendarCreate = {'key':key, 'owner':chatAccountId, 'server':baseUrl,
          'body':json.decode(json.encode(body))};
      }
      // An unresolved create is immutable. Resolve its outcome before another
      // draft, including after navigation, process restoration or token rotation.
      final pending = _pendingCalendarCreate!;
      await _persistCalendarCreate(generation);
      if (generation != _sessionGeneration) { throw StateError('Session changed'); }
      final result = await requestJson('/calendar/events', method:'POST', boundAccountId:pending['owner'] as String?, data:{
        ...(pending['body'] as Map<String,dynamic>), 'creationKey':pending['key'],
      });
      if (generation != _sessionGeneration) { throw StateError('Session changed'); }
      if (result is! Map || result['id'] is! String) { throw const FormatException('Invalid creation acknowledgement'); }
      await _confirmCalendarCreate(pending, generation);
      return result;
    } finally { _calendarCreateBusy = false; }
  }

  Future<void> _confirmCalendarCreate(Map<String,dynamic> pending, int generation) => _serializeSessionStorage(() async {
    if (generation != _sessionGeneration || _authToken == null || _pendingCalendarCreate?['key'] != pending['key']) {
      throw StateError('Session changed');
    }
    // Keep memory pending during the write: a queued/concurrent credential
    // refresh must not drop an intent whose durable cleanup is unconfirmed.
    if (_refreshToken != null) {
      await _sessionStore.write(json.encode(_storedSession(_authToken!, _refreshToken!, removalPending:_pushRemovalPending, includeCalendar:false)));
      if (generation != _sessionGeneration) { throw StateError('Session changed'); }
    }
    _pendingCalendarCreate = null;
  });

  Future<String> resolveCalendarCreate() async {
    if (_authToken == null || _calendarCreateBusy || _pendingCalendarCreate == null) { throw StateError('Calendar resolution unavailable'); }
    final generation = _sessionGeneration;
    final pending = _pendingCalendarCreate!;
    _calendarCreateBusy = true;
    try {
      await _persistCalendarCreate(generation);
      if (generation != _sessionGeneration) { throw StateError('Session changed'); }
      final result = await requestJson('/calendar/events/creation-resolution', method:'POST', boundAccountId:pending['owner'] as String?, data:{
        ...(pending['body'] as Map<String,dynamic>), 'creationKey':pending['key'],
      });
      if (generation != _sessionGeneration) { throw StateError('Session changed'); }
      if (result is! Map || !['CREATED','ABANDONED'].contains(result['outcome']) ||
          (result['outcome'] == 'CREATED' && result['eventId'] is! String)) {
        throw const FormatException('Invalid resolution acknowledgement');
      }
      await _confirmCalendarCreate(pending, generation);
      return result['outcome'] as String;
    } finally { _calendarCreateBusy = false; }
  }

  bool get hasPendingProfileClaim => _pendingProfileClaim != null;
  String? get pendingProfileClaimTargetId =>
      (_pendingProfileClaim?['body'] as Map<String, dynamic>?)?['targetPersonId'] as String?;

  static final _claimCreationKey = RegExp(
      r'^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$');

  // The secure record may contain only the initial claim contract. It cannot
  // restore routes, credentials, arbitrary metadata, or an editable retry body.
  static void _validateProfileClaimBody(Map<String, dynamic> body) {
    const fields = {'targetPersonId', 'relationshipDescription', 'statementOfTruth',
      'knownFamilyMembers', 'evidenceAttachments'};
    bool text(dynamic value, int maximum, {bool empty = false}) =>
        value is String && value.length <= maximum && (empty || value.trim().isNotEmpty);
    if (body.keys.any((key) => !fields.contains(key)) ||
        !text(body['targetPersonId'], 128) ||
        !text(body['relationshipDescription'], 2000) ||
        body['statementOfTruth'] != true) {
      throw const FormatException('Invalid profile claim body');
    }
    if (body.containsKey('knownFamilyMembers')) {
      final members = body['knownFamilyMembers'];
      if (members is! List || members.length > 100 || members.any((member) => !text(member, 200, empty: true))) {
        throw const FormatException('Invalid profile claim family references');
      }
    }
    if (body.containsKey('evidenceAttachments')) {
      final attachments = body['evidenceAttachments'];
      final seen = <String>{};
      const types = {'family_photo', 'event_invitation', 'elder_voucher',
        'address_receipt', 'clan_record', 'other'};
      if (attachments is! List || attachments.length > 5) {
        throw const FormatException('Invalid profile claim evidence');
      }
      for (final attachment in attachments) {
        if (attachment is! Map<String, dynamic> ||
            attachment.keys.any((key) => !{'mediaAssetId', 'documentType', 'description'}.contains(key)) ||
            !text(attachment['mediaAssetId'], 128) ||
            !types.contains(attachment['documentType']) ||
            !seen.add(attachment['mediaAssetId'] as String) ||
            (attachment.containsKey('description') && !text(attachment['description'], 1000, empty: true))) {
          throw const FormatException('Invalid profile claim evidence');
        }
      }
    }
    if (utf8.encode(json.encode(body)).length > 32768) {
      throw const FormatException('Profile claim intent exceeds limit');
    }
  }

  /// Persist an account/API-bound immutable identity before native HTTP. A
  /// pending creation must be retried explicitly, never replaced by a new draft.
  /// Bearer-only legacy/test sessions retain memory state until replacement.
  Future<Map<String, dynamic>> createProfileClaim(Map<String, dynamic> body) async {
    if (_authToken == null || _profileClaimBusy || _pendingProfileClaim != null) {
      throw StateError('Profile claim creation unavailable');
    }
    // JSON copy detaches nested lists/maps from the caller before any await.
    final copied = json.decode(json.encode(body)) as Map<String, dynamic>;
    _validateProfileClaimBody(copied);
    if (_refreshToken != null && (chatAccountId == null || chatAccountId!.isEmpty)) {
      throw StateError('Profile claim account unavailable');
    }
    final random = Random.secure();
    final bytes = List<int>.generate(16, (_) => random.nextInt(256));
    bytes[6] = (bytes[6] & 15) | 64;
    bytes[8] = (bytes[8] & 63) | 128;
    final hex = bytes.map((b) => b.toRadixString(16).padLeft(2, '0')).join();
    final key = '${hex.substring(0,8)}-${hex.substring(8,12)}-${hex.substring(12,16)}-${hex.substring(16,20)}-${hex.substring(20)}';
    _pendingProfileClaim = {'key': key, 'owner': chatAccountId, 'server': baseUrl, 'body': copied};
    return retryPendingProfileClaim();
  }

  Future<Map<String, dynamic>> retryPendingProfileClaim() => _sendPendingProfileClaim(resolving:false);

  /// Explicitly recover a recorded claim or permanently close its unused retry
  /// identity. This never cancels/deletes an already recorded claim.
  Future<Map<String, dynamic>> resolvePendingProfileClaim() => _sendPendingProfileClaim(resolving:true);

  Future<Map<String, dynamic>> _sendPendingProfileClaim({required bool resolving}) async {
    if (_authToken == null || _profileClaimBusy || _pendingProfileClaim == null) {
      throw StateError('Profile claim retry unavailable');
    }
    final generation = _sessionGeneration;
    final pending = _pendingProfileClaim!;
    if (pending['server'] != baseUrl || pending['owner'] != chatAccountId) {
      throw StateError('Profile claim session changed');
    }
    _profileClaimBusy = true;
    try {
      await _serializeSessionStorage(() async {
        if (generation != _sessionGeneration || _authToken == null) { throw StateError('Session changed'); }
        if (_refreshToken != null) {
          await _sessionStore.write(json.encode(_storedSession(_authToken!, _refreshToken!, removalPending: _pushRemovalPending)));
          if (generation != _sessionGeneration) { throw StateError('Session changed'); }
        }
      });
      if (generation != _sessionGeneration) { throw StateError('Session changed'); }
      final body = pending['body'] as Map<String, dynamic>;
      final result = await requestJson(resolving ? '/claims/creation-resolution' : '/claims',
          method: 'POST', boundAccountId: pending['owner'] as String?,
          data: {...body, 'creationKey': pending['key']});
      if (generation != _sessionGeneration) { throw StateError('Session changed'); }
      if (resolving) {
        if (result is! Map<String,dynamic>) {
          throw const FormatException('Invalid profile claim resolution');
        }
        final outcome = result['outcome'];
        final created = outcome == 'CREATED' && result.length == 2 &&
            result['claimId'] is String && (result['claimId'] as String).trim().isNotEmpty &&
            (result['claimId'] as String).length <= 128;
        final abandoned = outcome == 'ABANDONED' && result.length == 1;
        if (!created && !abandoned) {
          throw const FormatException('Invalid profile claim resolution');
        }
      } else if (result is! Map<String, dynamic> || result['id'] is! String || (result['id'] as String).isEmpty ||
          (result.containsKey('targetPersonId') && result['targetPersonId'] != body['targetPersonId'])) {
        throw const FormatException('Invalid profile claim acknowledgement');
      }
      await _serializeSessionStorage(() async {
        if (generation != _sessionGeneration || _authToken == null || _pendingProfileClaim?['key'] != pending['key']) {
          throw StateError('Session changed');
        }
        // Preserve memory until durable cleanup succeeds. Refresh/push/calendar
        // writes share this queue and cannot resurrect or discard this intent.
        if (_refreshToken != null) {
          await _sessionStore.write(json.encode(_storedSession(_authToken!, _refreshToken!,
              removalPending: _pushRemovalPending, includeProfileClaim: false)));
          if (generation != _sessionGeneration) { throw StateError('Session changed'); }
        }
        _pendingProfileClaim = null;
      });
      return result;
    } finally { _profileClaimBusy = false; }
  }

  static final _disputeId = RegExp(r'^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$',caseSensitive:false);
  bool get hasPendingDispute => _pendingDispute != null;
  String? get pendingDisputePersonId => (_pendingDispute?['body'] as Map<String,dynamic>?)?['targetPersonId'] as String?;

  static void _validateDisputeBody(Map<String,dynamic> body) {
    if (body.keys.any((key) => !{'targetPersonId','reason','evidenceAttachments'}.contains(key)) ||
        body['targetPersonId'] is! String || !_disputeId.hasMatch(body['targetPersonId'] as String) ||
        body['reason'] is! String || (body['reason'] as String).trim().isEmpty || (body['reason'] as String).length > 4000) {
      throw const FormatException('Unavailable dispute details');
    }
    final evidence = body['evidenceAttachments'];
    if (body.containsKey('evidenceAttachments')) {
      if (evidence is! List || evidence.length > 5) throw const FormatException('Unavailable dispute evidence');
      final ids = <String>{};
      for (final item in evidence) {
        if (item is! Map || item.length != 2 || item['mediaAssetId'] is! String ||
            !_disputeId.hasMatch(item['mediaAssetId'] as String) || !ids.add(item['mediaAssetId'] as String) ||
            !{'family_photo','event_invitation','clan_record'}.contains(item['documentType'])) {
          throw const FormatException('Unavailable dispute evidence');
        }
      }
    }
  }

  Future<Map<String,dynamic>> submitMemberDispute(Map<String,dynamic> body) async {
    if (_authToken == null || chatAccountId == null || _disputeBusy || _pendingDispute != null) throw StateError('Dispute unavailable');
    final copied = json.decode(json.encode(body)) as Map<String,dynamic>;
    _validateDisputeBody(copied);
    final random = Random.secure();
    final bytes = List<int>.generate(16, (_) => random.nextInt(256));
    bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
    final hex = bytes.map((b) => b.toRadixString(16).padLeft(2,'0')).join();
    final key = '${hex.substring(0,8)}-${hex.substring(8,12)}-${hex.substring(12,16)}-${hex.substring(16,20)}-${hex.substring(20)}';
    _pendingDispute = {'key':key,'owner':chatAccountId,'server':baseUrl,'body':copied};
    return retryMemberDispute();
  }

  Future<Map<String,dynamic>> retryMemberDispute() async {
    if (_authToken == null || _disputeBusy || _pendingDispute == null) throw StateError('Dispute retry unavailable');
    final generation = _sessionGeneration, pending = _pendingDispute!;
    if (pending['owner'] != chatAccountId || pending['server'] != baseUrl) throw StateError('Session changed');
    _disputeBusy = true;
    try {
      await _serializeSessionStorage(() async {
        if (generation != _sessionGeneration || _authToken == null) throw StateError('Session changed');
        if (_refreshToken != null) await _sessionStore.write(json.encode(_storedSession(_authToken!,_refreshToken!,removalPending:_pushRemovalPending)));
        if (generation != _sessionGeneration) throw StateError('Session changed');
      });
      final body = pending['body'] as Map<String,dynamic>;
      final result = await requestJson('/claims/people/${body['targetPersonId']}/dispute', method:'POST',
        boundAccountId:pending['owner'] as String, data:{'submissionKey':pending['key'],'reason':body['reason'],
          if (body.containsKey('evidenceAttachments')) 'evidenceAttachments':body['evidenceAttachments']});
      if (generation != _sessionGeneration) throw StateError('Session changed');
      if (result is! Map<String,dynamic> || result['id'] is! String || !_disputeId.hasMatch(result['id'] as String) ||
          result['targetPersonId'] != body['targetPersonId'] || !{'OPEN','UNDER_REVIEW','DISMISSED','RESOLVED'}.contains(result['status'])) {
        throw const FormatException('Unconfirmed dispute');
      }
      await _serializeSessionStorage(() async {
        if (generation != _sessionGeneration || _authToken == null || _pendingDispute?['key'] != pending['key']) throw StateError('Session changed');
        if (_refreshToken != null) await _sessionStore.write(json.encode(_storedSession(_authToken!,_refreshToken!,removalPending:_pushRemovalPending,includeDispute:false)));
        if (generation != _sessionGeneration) throw StateError('Session changed');
        _pendingDispute = null;
      });
      return result;
    } finally { _disputeBusy = false; }
  }

  // SDK permission and token acquisition are separate from this authenticated
  // transport. Never persist or include provider credentials in error messages.
  Future<dynamic> _pushRegistration(String method, {Map<String, String>? data}) async {
    if (_authToken == null || _authToken!.isEmpty) {
      throw StateError('Push registration requires a session');
    }
    final response = await _send(method, Uri.parse('$baseUrl/notifications/push-registration'),
      body: data == null ? null : json.encode(data), boundSessionGeneration: _sessionGeneration);
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw StateError('Push registration failed (${response.statusCode})');
    }
    try {
      return response.body.isEmpty ? null : json.decode(response.body);
    } on FormatException {
      throw const FormatException('Invalid push registration response');
    }
  }

  Future<dynamic> registerPushToken(String token, {String? platform}) {
    final resolved = platform ?? (defaultTargetPlatform == TargetPlatform.iOS ? 'IOS' : 'ANDROID');
    if (!RegExp(r'^[A-Za-z0-9_:.-]{16,500}$').hasMatch(token) || !['ANDROID', 'IOS'].contains(resolved)) {
      throw const FormatException('Invalid push registration');
    }
    return _pushRegistration('PUT', data: {'token': token, 'platform': resolved});
  }

  Future<dynamic> currentPushRegistration() => _pushRegistration('GET');

  Future<dynamic> removePushRegistration() => _pushRegistration('DELETE');

  Future<dynamic> communityMedia(String path,String owner,{String method='GET',Map<String,dynamic>? data}) async {
    final response=await _send(method,Uri.parse('$baseUrl/community$path'),body:data==null?null:json.encode(data),boundAccountId:owner);
    if(response.statusCode<200||response.statusCode>=300){throw Exception('Community image request failed (${response.statusCode})');}
    return method=='GET'?response:json.decode(response.body);
  }

  Future<http.Response> downloadChatAttachment(String conversationId,String messageId,String owner) async {
    final response=await _send('GET',Uri.parse('$baseUrl/chat/conversations/$conversationId/messages/$messageId/attachment'),boundAccountId:owner);
    if(response.statusCode!=200){throw Exception('Attachment unavailable (${response.statusCode})');}
    return response;
  }

  Future<ChatConnection> openChatConnection() async {
    // A real authenticated request rotates an expired native session before the socket opens.
    await getMyProfile();
    final token = _authToken;
    if (token == null) { throw StateError('Sign in for messaging'); }
    return NativeChatConnection.connect(baseUrl, token);
  }

  // Bilingual search
  Future<List<PersonSummary>> searchPersons({
    String? query,
    String? branchId,
    int? generation,
    int page = 1,
    int limit = 20,
  }) async {
    final params = {
      if (query != null && query.isNotEmpty) 'query': query,
      if (branchId != null && branchId.isNotEmpty) 'branchId': branchId,
      if (generation != null) 'generation': generation.toString(),
      'page': page.toString(),
      'limit': limit.toString(),
    };

    final uri = Uri.parse('$baseUrl/genealogy/search').replace(queryParameters: params);
    final response = await _send('GET', uri);

    if (response.statusCode == 200) {
      final data = json.decode(response.body);
      final items = (data['items'] as List)
          .map((item) => PersonSummary.fromJson(item))
          .toList();
      return items;
    } else {
      throw Exception('खोज गर्न असफल भयो (${response.statusCode})');
    }
  }

  // Get person profile details
  Future<PersonDetail> getPerson(String id) async {
    final uri = Uri.parse('$baseUrl/genealogy/people/$id');
    final response = await _send('GET', uri);

    if (response.statusCode == 200) {
      final data = json.decode(response.body);
      return PersonDetail.fromJson(data);
    } else {
      throw Exception('विवरण लोड गर्न सकिएन');
    }
  }

  // Get Interactive tree
  Future<TreeNode> getTree(String id, {int ancestors = 2, int descendants = 2}) async {
    final uri = Uri.parse(
        '$baseUrl/genealogy/people/$id/tree?ancestorGenerations=$ancestors&descendantGenerations=$descendants');
    final response = await _send('GET', uri);

    if (response.statusCode == 200) {
      final data = json.decode(response.body);
      return TreeNode.fromJson(data);
    } else {
      throw Exception('रुख लोड गर्न सकिएन');
    }
  }
  // Milestone 4: Profile Claims
  Future<Map<String, dynamic>> submitProfileClaim({
    required String targetPersonId,
    required String relationshipDescription,
    bool statementOfTruth = true,
    List<Map<String, dynamic>>? evidenceAttachments,
  }) async {
    final uri = Uri.parse('$baseUrl/claims');
    final body = json.encode({
      'targetPersonId': targetPersonId,
      'relationshipDescription': relationshipDescription,
      'statementOfTruth': statementOfTruth,
      if (evidenceAttachments != null) 'evidenceAttachments': evidenceAttachments,
    });
    final response = await _send('POST', uri, body: body);
    if (response.statusCode == 201 || response.statusCode == 200) {
      return json.decode(response.body);
    } else {
      final err = json.decode(response.body);
      throw Exception(err['message'] ?? 'दाबी दर्ता गर्न असफल भयो');
    }
  }

  // Milestone 4: Genealogy Change Requests
  Future<Map<String, dynamic>> submitChangeRequest({
    required String targetPersonId,
    required String type,
    required Map<String, dynamic> proposedChanges,
    required String reason,
  }) async {
    final uri = Uri.parse('$baseUrl/change-requests');
    final body = json.encode({
      'targetPersonId': targetPersonId,
      'type': type,
      'proposedChanges': proposedChanges,
      'reason': reason,
    });
    final response = await _send('POST', uri, body: body);
    if (response.statusCode == 201 || response.statusCode == 200) {
      return json.decode(response.body);
    } else {
      final err = json.decode(response.body);
      throw Exception(err['message'] ?? 'संशोधन अनुरोध दर्ता गर्न असफल भयो');
    }
  }

  // Milestone 4: Calendar Events
  Future<List<dynamic>> getCalendarEvents({int? yearBs, int? monthBs}) async {
    final params = {
      if (yearBs != null) 'yearBs': yearBs.toString(),
      if (monthBs != null) 'monthBs': monthBs.toString(),
    };
    final uri = Uri.parse('$baseUrl/calendar/events').replace(queryParameters: params);
    final response = await _send('GET', uri);
    if (response.statusCode == 200) {
      return json.decode(response.body) as List<dynamic>;
    } else {
      throw Exception('पात्रो कार्यक्रम लोड गर्न सकिएन');
    }
  }

  Future<Map<String, dynamic>> getMyProfile() async {
    final response = await _send('GET', Uri.parse('$baseUrl/profile/me'));
    if (response.statusCode != 200) { throw Exception('Profile load failed (${response.statusCode})'); }
    return json.decode(response.body) as Map<String, dynamic>;
  }

  Future<Map<String,dynamic>> profilePhotoRequest(String path,String owner,{String method='GET',Map<String,dynamic>? data}) async {
    final response=await _send(method,Uri.parse('$baseUrl/profile$path'),boundAccountId:owner,body:data==null?null:json.encode(data));
    final result=json.decode(response.body);
    if(response.statusCode<200||response.statusCode>=300){throw Exception(result is Map?result['message']??'Photo request failed':'Photo request failed');}
    return Map<String,dynamic>.from(result as Map);
  }
  Future<http.Response> downloadProfilePhoto(String assetId,String owner) async {
    final response=await _send('GET',Uri.parse('$baseUrl/profile/media/$assetId?variant=thumbnail'),boundAccountId:owner);
    if(response.statusCode!=200){throw Exception('Photo unavailable');}return response;
  }

  Future<void> rsvpEvent(String eventId, String response) async {
    final result = await _send('POST', Uri.parse('$baseUrl/calendar/events/$eventId/rsvp'),
      body: json.encode({'response': response}));
    if (result.statusCode != 200 && result.statusCode != 201) {
      throw Exception('RSVP failed (${result.statusCode})');
    }
  }

  // Milestone 4: Update Profile Details & Privacy
  Future<Map<String, dynamic>> updateProfilePrivacy({
    required String profileVisibility,
    required String contactVisibility,
    required String addressVisibility,
  }) async {
    final uri = Uri.parse('$baseUrl/profile/privacy');
    final body = json.encode({
      'profileVisibility': profileVisibility,
      'contactVisibility': contactVisibility,
      'addressVisibility': addressVisibility,
    });
    final response = await _send('PUT', uri, body: body);
    if (response.statusCode == 200) {
      return json.decode(response.body);
    } else {
      throw Exception('गोपनीयता सेटिङ अद्यावधिक गर्न सकिएन');
    }
  }

  Future<Map<String, dynamic>> updateProfileDetails({
    String? occupation,
    String? education,
    String? biography,
    String? currentAddress,
    Map<String, String>? privacy,
  }) async {
    final uri = Uri.parse('$baseUrl/profile/profile');
    final body = json.encode({
      if (occupation != null) 'occupation': occupation,
      if (education != null) 'education': education,
      if (biography != null) 'biography': biography,
      if (currentAddress != null) 'currentAddress': currentAddress,
      if (privacy != null) 'privacy': privacy,
    });
    final response = await _send('PATCH', uri, body: body);
    if (response.statusCode == 200) {
      return json.decode(response.body);
    } else {
      throw Exception('प्रोफाइल विवरण अद्यावधिक गर्न सकिएन');
    }
  }
}
