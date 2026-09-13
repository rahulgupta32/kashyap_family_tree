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

  Map<String, String> get _headers {
    final headers = {'Content-Type': 'application/json'};
    if (_authToken != null) {
      headers['Authorization'] = 'Bearer $_authToken';
    }
    return headers;
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
}
