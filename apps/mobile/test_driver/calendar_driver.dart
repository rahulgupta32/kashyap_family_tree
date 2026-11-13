import 'dart:io';
import 'package:integration_test/integration_test_driver_extended.dart';
import 'screenshot_bytes.dart';

Future<void> main() async {
  const expected = {'nepali-login', 'nepali-calendar-month', 'nepali-calendar'};
  final captured = <String>{};
  final output = Directory('../../test-results');
  await output.create(recursive: true);
  // Transfer binding-owned bytes before Flutter uninstalls the test package.
  await integrationDriver(
    onScreenshot: (name, bytes, [args]) async {
      if (!expected.contains(name) || !isPngScreenshot(bytes)) return false;
      await File('${output.path}/android-$name.png')
          .writeAsBytes(bytes, flush: true);
      captured.add(name);
      return true;
    },
    responseDataCallback: (_) async {
      if (!captured.containsAll(expected)) {
        throw StateError(
            'Missing required native screenshots: ${expected.difference(captured)}');
      }
      // ignore: avoid_print
      print('[CALENDAR SCREENSHOTS] All three native PNG captures verified');
    },
  );
}
