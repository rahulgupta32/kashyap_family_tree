import 'dart:io';
import 'package:integration_test/integration_test_driver_extended.dart';
import 'screenshot_bytes.dart';

Future<void> main() async {
  const expected = {
    'preview-login',
    'preview-dashboard',
    'preview-tree',
    'preview-profile',
    'preview-calendar',
    'preview-community',
    'preview-chat',
    'preview-notifications',
    'preview-administration',
    'preview-settings'
  };
  final captures = <String>{};
  final directory = Directory('../../test-results/dev-preview-device');
  await directory.create(recursive: true);
  await integrationDriver(
    onScreenshot: (name, bytes, [args]) async {
      if (!expected.contains(name) || !isPngScreenshot(bytes)) return false;
      await File('${directory.path}/$name.png')
          .writeAsBytes(bytes, flush: true);
      captures.add(name);
      return true;
    },
    responseDataCallback: (_) async {
      if (!captures.containsAll(expected)) {
        throw StateError(
            'Missing offline preview screenshots: ${expected.difference(captures)}');
      }
      // ignore: avoid_print
      print(
          '[OFFLINE PREVIEW SCREENSHOTS] All10 native synthetic screen captures verified');
    },
  );
}
