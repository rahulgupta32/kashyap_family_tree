import 'package:flutter/foundation.dart';

const mobileApiBaseUrl = String.fromEnvironment(
  'API_BASE_URL',
  defaultValue: 'http://10.0.2.2:3000',
);

/// Development may use a local HTTP server. A release must have an explicit,
/// usable HTTPS endpoint before it can create an authenticated API client.
bool isUsableApiEndpoint(String value, {bool release = kReleaseMode}) {
  if (value.isEmpty || value.trim() != value) return false;
  final uri = Uri.tryParse(value);
  if (uri == null || !uri.hasAuthority || uri.host.isEmpty ||
      !['http', 'https'].contains(uri.scheme) || uri.userInfo.isNotEmpty ||
      uri.hasQuery || uri.hasFragment || uri.path.endsWith('/')) {
    return false;
  }
  if (!release) return true;
  final host = uri.host.toLowerCase();
  if (uri.scheme != 'https' || host == 'localhost' || host == '::1' ||
      host == '10.0.2.2' || host.startsWith('127.') ||
      ['example.com', 'example.net', 'example.org'].contains(host) ||
      ['.localhost', '.invalid', '.test', '.example'].any(host.endsWith)) {
    return false;
  }
  return true;
}
