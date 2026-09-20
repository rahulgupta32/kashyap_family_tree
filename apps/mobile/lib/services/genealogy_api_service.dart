import 'dart:convert';
import 'package:http/http.dart' as http;
import '../models/person.dart';
import '../models/tree_node.dart';
import 'session_store.dart';

class GenealogyApiService {
  final String baseUrl;
  String? _authToken;
  String? _refreshToken;
  final http.Client _client;
  final SessionStore _sessionStore;
  Future<bool>? _refreshing;
  void Function()? onSessionExpired;

  GenealogyApiService({
    this.baseUrl = const String.fromEnvironment('API_BASE_URL', defaultValue: 'http://10.0.2.2:3000'),
    http.Client? client,
    SessionStore? sessionStore,
  }) : _client = client ?? http.Client(),
       _sessionStore = sessionStore ?? SecureSessionStore();

  void setAuthToken(String? token) {
    _authToken = token;
    _refreshToken = null;
  }

  String? get authToken => _authToken;

  Future<void> _acceptSession(Map<String, dynamic> data) async {
    final access = data['accessToken'];
    final refresh = data['refreshToken'];
    if (access is! String || access.isEmpty || refresh is! String || refresh.isEmpty) {
      throw const FormatException('Invalid native authentication response');
    }
    await _sessionStore.write(json.encode({'accessToken': access, 'refreshToken': refresh}));
    _authToken = access;
    _refreshToken = refresh;
  }

  Future<bool> restoreSession() async {
    final saved = await _sessionStore.read();
    if (saved == null) { return false; }
    try {
      final data = json.decode(saved);
      if (data is! Map<String, dynamic> || data['accessToken'] is! String || data['refreshToken'] is! String || (data['refreshToken'] as String).isEmpty) {
        throw const FormatException('Invalid saved session');
      }
      _authToken = data['accessToken'] as String;
      _refreshToken = data['refreshToken'] as String;
      return await _refreshSession();
    } on FormatException {
      await _clearSession();
      return false;
    }
  }

  Future<void> _clearSession() async {
    _authToken = null;
    _refreshToken = null;
    try { await _sessionStore.clear(); }
    finally { onSessionExpired?.call(); }
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
    final response = await _client.post(Uri.parse('$baseUrl/auth/native/refresh'),
      headers: {'Content-Type': 'application/json'},
      body: json.encode({'refreshToken': _refreshToken}),
    ).timeout(const Duration(seconds: 20));
    if (response.statusCode == 401 || response.statusCode == 403) {
      await _clearSession();
      return false;
    }
    if (response.statusCode != 200) { throw Exception('Session refresh failed (${response.statusCode})'); }
    await _acceptSession(json.decode(response.body) as Map<String, dynamic>);
    return true;
  }

  Future<http.Response> _send(String method, Uri uri, {String? body, bool authenticated = true}) async {
    Future<http.Response> send() async {
      final request = http.Request(method, uri);
      request.headers.addAll(authenticated ? _headers : {'Content-Type': 'application/json'});
      if (body != null) { request.body = body; }
      final result = await _client.send(request).timeout(const Duration(seconds: 20));
      return http.Response.fromStream(result).timeout(const Duration(seconds: 20));
    }
    final tokenUsed = _authToken;
    var response = await send();
    if (authenticated && response.statusCode == 401 && _refreshToken != null) {
      if (_authToken != tokenUsed || await _refreshSession()) { response = await send(); }
    }
    if (authenticated && response.statusCode == 401 && _authToken != null) { await _clearSession(); }
    return response;
  }

  Future<void> logout() async {
    try {
      if (_refreshing != null) { await _refreshing; }
      final response = await _send('POST', Uri.parse('$baseUrl/auth/logout'),
        authenticated: false, body: json.encode({'refreshToken': _refreshToken}));
      if (response.statusCode != 200) { throw Exception('Logout failed (${response.statusCode})'); }
    } finally {
      await _clearSession();
    }
  }

  void dispose() => _client.close();

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

  Future<String> verifyOtp(String otpSessionId, String code, {String platform = 'android'}) async {
    final uri = Uri.parse('$baseUrl/auth/native/verify');
    final body = json.encode({
      'otpSessionId': otpSessionId, 'code': code,
      'deviceInfo': {'deviceId': 'mobile-${DateTime.now().microsecondsSinceEpoch}',
        'platform': platform, 'appVersion': '1.0.0'},
    });
    final response = await _send('POST', uri, body: body, authenticated: false);
    if (response.statusCode == 200 || response.statusCode == 201) {
      final data = json.decode(response.body);
      await _acceptSession(data as Map<String, dynamic>);
      return _authToken!;
    } else {
      throw Exception('OTP प्रमाणीकरण असफल भयो (${response.statusCode})');
    }
  }

  Future<dynamic> requestJson(String path, {String method = 'GET', Map<String, dynamic>? data}) async {
    final response = await _send(method, Uri.parse('$baseUrl$path'),
      body: data == null ? null : json.encode(data));
    final decoded = response.body.isEmpty ? null : json.decode(response.body);
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw Exception(decoded is Map ? decoded['message'] ?? 'Request failed' : 'Request failed (${response.statusCode})');
    }
    return decoded;
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
