import 'package:integration_test/integration_test_driver.dart';

Future<void> main() => integrationDriver(
      timeout: const Duration(minutes: 3),
      responseDataCallback: (_) async {
        // Called only after the real integration binding reports allTestsPassed.
        // ignore: avoid_print
        print('IOS_DRIVER RESULT_VERIFIED');
      },
    );
