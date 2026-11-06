import 'package:flutter_test/flutter_test.dart';
import 'package:kashyap_mobile/services/api_endpoint_config.dart';

void main() {
  test('development accepts the local emulator API, release refuses it', () {
    expect(isUsableApiEndpoint('http://10.0.2.2:3000', release: false), isTrue);
    expect(isUsableApiEndpoint('http://10.0.2.2:3000', release: true), isFalse);
  });

  test('release requires a configured HTTPS API without credentials or URL data', () {
    expect(isUsableApiEndpoint('https://api.kashyap.example.com', release: true), isTrue);
    final rejected = [
      'https://api.invalid', 'https://api.example', 'https://example.com',
      'http://api.kashyap.example.com', 'https://localhost:3000',
      'https://127.0.0.1', 'https://user:secret@api.kashyap.example.com',
      'https://api.kashyap.example.com/?token=secret',
      'https://api.kashyap.example.com#private',
      ' https://api.kashyap.example.com',
    ];
    for (var index = 0; index < rejected.length; index++) {
      expect(isUsableApiEndpoint(rejected[index], release: true), isFalse,
        reason: 'Rejected production endpoint case $index');
    }
  });
}
