import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kashyap_mobile/screens/cultural_content_screen.dart';
import 'package:kashyap_mobile/services/genealogy_api_service.dart';
import 'native_session_test.dart' show MemorySessionStore;

class CulturalApi extends GenealogyApiService {
  CulturalApi() : super(sessionStore: MemorySessionStore());
  String path = '';
  bool fail = false;
  @override
  String? get authToken => 'fictional-widget-token';
  @override
  Future<dynamic> requestJson(String path, {String method = 'GET', Map<String,dynamic>? data}) async {
    this.path = path;
    if (fail) { throw Exception('Cultural service temporarily unavailable'); }
    return [{'id':'fixture','title_nepali':'परीक्षण इतिहास','title_english':'Fictional history','content_nepali':'परीक्षण सामग्री','version':2,'published_at':'2026-10-08','provenance':'Fictional approved source fixture'}];
  }
}
void main() {
  testWidgets('Published cultural revisions show provenance and search preserves Nepali input', (tester) async {
    final api = CulturalApi();
    await tester.pumpWidget(MaterialApp(home: CulturalContentScreen(apiService: api)));await tester.pumpAndSettle();
    expect(find.text('Fictional history'),findsOneWidget);expect(find.text('स्रोत (Source): Fictional approved source fixture'),findsOneWidget);
    await tester.enterText(find.byType(TextField),'नेपाली इतिहास');await tester.testTextInput.receiveAction(TextInputAction.done);await tester.pumpAndSettle();
    expect(Uri.parse(api.path).queryParameters['q'],'नेपाली इतिहास');expect(find.text('Fictional history'),findsOneWidget);
  });
  testWidgets('Failed searches clear stale articles and offer refresh recovery', (tester) async {
    final api = CulturalApi();
    await tester.pumpWidget(MaterialApp(home: CulturalContentScreen(apiService: api)));await tester.pumpAndSettle();
    api.fail = true;await tester.tap(find.byTooltip('Refresh cultural content'));await tester.pumpAndSettle();
    expect(find.text('Fictional history'),findsNothing);expect(find.text('Cultural service temporarily unavailable'),findsOneWidget);
    api.fail = false;await tester.tap(find.byTooltip('Refresh cultural content'));await tester.pumpAndSettle();expect(find.text('Fictional history'),findsOneWidget);
  });
}
