import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import '../test_driver/screenshot_bytes.dart';

void main() {
  test(
      'native screenshot admission rejects the observed adb error and truncated PNG',
      () {
    expect(
        isPngScreenshot(
            utf8.encode('run-as: unknown package: com.example.kashyap_mobile')),
        isFalse);
    expect(isPngScreenshot([137, 80, 78, 71, 13, 10, 26, 10]), isFalse);
  });
  test('native screenshot admission requires PNG IHDR and positive dimensions',
      () {
    final png = base64Decode(
        'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEUlEQVQImWMQCdYVCdZlgFAAD9oCUV/9UZEAAAAASUVORK5CYII=');
    expect(isPngScreenshot(png), isTrue);
    final zeroWidth = List<int>.from(png);
    zeroWidth.fillRange(16, 20, 0);
    expect(isPngScreenshot(zeroWidth), isFalse);
  });
}
