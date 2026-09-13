import 'package:flutter_test/flutter_test.dart';
import 'package:kashyap_mobile/main.dart';

void main() {
  testWidgets('KashyapApp smoke test', (WidgetTester tester) async {
    await tester.pumpWidget(const KashyapApp());
    expect(find.text('कश्यप अधिकारी वंशावली'), findsOneWidget);
  });
}
