import 'dart:convert';
import 'package:http/http.dart' as http;
import '../models/person.dart';
import '../models/tree_node.dart';

class GenealogyApiService {
  final String baseUrl;
  String? _authToken;

  GenealogyApiService({this.baseUrl = 'http://10.0.2.2:3000'});

  void setAuthToken(String? token) {
    _authToken = token;
  }

  String? get authToken => _authToken;

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
    final response = await http.post(uri, headers: _headers, body: body);
    if (response.statusCode == 200 || response.statusCode == 201) {
      return json.decode(response.body);
    } else {
      throw Exception('OTP अनुरोध असफल भयो (${response.statusCode})');
    }
  }

  Future<String> verifyOtp(String phoneNumber, String otpCode) async {
    final uri = Uri.parse('$baseUrl/auth/otp/verify');
    final body = json.encode({'phoneNumber': phoneNumber, 'otpCode': otpCode});
    final response = await http.post(uri, headers: _headers, body: body);
    if (response.statusCode == 200 || response.statusCode == 201) {
      final data = json.decode(response.body);
      final token = data['accessToken'] as String?;
      if (token != null) {
        setAuthToken(token);
      }
      return token ?? '';
    } else {
      throw Exception('OTP प्रमाणीकरण असफल भयो (${response.statusCode})');
    }
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
    final response = await http.get(uri, headers: _headers);

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
    final response = await http.get(uri, headers: _headers);

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
    final response = await http.get(uri, headers: _headers);

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
    final response = await http.post(uri, headers: _headers, body: body);
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
    final response = await http.post(uri, headers: _headers, body: body);
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
    final uri = Uri.parse('$baseUrl/calendar').replace(queryParameters: params);
    final response = await http.get(uri, headers: _headers);
    if (response.statusCode == 200) {
      return json.decode(response.body) as List<dynamic>;
    } else {
      throw Exception('पात्रो कार्यक्रम लोड गर्न सकिएन');
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
    final response = await http.put(uri, headers: _headers, body: body);
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
  }) async {
    final uri = Uri.parse('$baseUrl/profile/profile');
    final body = json.encode({
      if (occupation != null) 'occupation': occupation,
      if (education != null) 'education': education,
      if (biography != null) 'biography': biography,
      if (currentAddress != null) 'currentAddress': currentAddress,
    });
    final response = await http.patch(uri, headers: _headers, body: body);
    if (response.statusCode == 200) {
      return json.decode(response.body);
    } else {
      throw Exception('प्रोफाइल विवरण अद्यावधिक गर्न सकिएन');
    }
  }
}
