import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:kashyap_mobile/screens/person_search_screen.dart';
import 'package:kashyap_mobile/services/genealogy_api_service.dart';

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  group('Real Device & Running API Acceptance Flow', () {
    final realApi = GenealogyApiService(baseUrl: 'http://10.0.2.2:3000');

    testWidgets('Verify Search -> Person Details -> Relative Navigation -> Tree on real device & API', (WidgetTester tester) async {
      // 1. Direct Real API Verification
      debugPrint('[REAL_DEVICE_TEST] 1. Executing real search query to NestJS API (http://10.0.2.2:3000)...');
      final searchResults = await realApi.searchPersons(query: 'अधिकारी', limit: 10);
      expect(searchResults.isNotEmpty, isTrue, reason: 'Expected real seeded records from PostgreSQL database');
      debugPrint('[REAL_DEVICE_TEST] Found ${searchResults.length} real persons in search results.');

      final firstPerson = searchResults.first;
      debugPrint('[REAL_DEVICE_TEST] Target person: ${firstPerson.id} | Nepali: ${firstPerson.primaryNameNepali} | English: ${firstPerson.primaryNameEnglish} | Branch: ${firstPerson.branchName}');

      // 2. Direct Real Details Verification
      debugPrint('[REAL_DEVICE_TEST] 2. Fetching real person details for ${firstPerson.id}...');
      final personDetail = await realApi.getPerson(firstPerson.id);
      expect(personDetail.id, equals(firstPerson.id));
      debugPrint('[REAL_DEVICE_TEST] PersonDetail loaded. Parents: ${personDetail.parents.length}, Spouses: ${personDetail.spouses.length}, Children: ${personDetail.children.length}');
      for (final p in personDetail.parents) {
        debugPrint('[REAL_DEVICE_TEST] -> Parent link: ${p.id}, Target personId: ${p.targetPersonId}, Name: ${p.person?.primaryNameNepali}');
      }
      for (final c in personDetail.children) {
        debugPrint('[REAL_DEVICE_TEST] -> Child link: ${c.id}, Target personId: ${c.targetPersonId}, Name: ${c.person?.primaryNameNepali}');
      }

      // 3. Direct Real Tree Verification
      debugPrint('[REAL_DEVICE_TEST] 3. Fetching real tree for ${firstPerson.id}...');
      final treeNode = await realApi.getTree(firstPerson.id, ancestors: 2, descendants: 2);
      expect(treeNode.id, equals(firstPerson.id));
      debugPrint('[REAL_DEVICE_TEST] Tree loaded. Root: ${treeNode.nameNepali}, Ancestors: ${treeNode.ancestors.length}, Children: ${treeNode.children.length}');

      // 4. End-to-End Real UI Interaction on Emulator
      debugPrint('[REAL_DEVICE_TEST] 4. Rendering real UI on Android emulator...');
      await tester.pumpWidget(MaterialApp(
        home: PersonSearchScreen(apiService: realApi),
      ));
      await tester.pumpAndSettle(const Duration(seconds: 3));

      // Assert search screen rendered with real records
      expect(find.text('कश्यप अधिकारी वंशावली'), findsOneWidget);
      expect(find.text(firstPerson.primaryNameNepali), findsWidgets);

      // Tap on person card to open PersonDetailScreen
      debugPrint('[REAL_DEVICE_TEST] 5. Tapping person card to open PersonDetailScreen...');
      final personCardFinder = find.text(firstPerson.primaryNameNepali).first;
      await tester.tap(personCardFinder);
      await tester.pumpAndSettle(const Duration(seconds: 3));

      // Assert PersonDetailScreen loaded
      expect(find.text('अभिभावकहरू (Parents)'), findsOneWidget);
      expect(find.text('दम्पती (Spouses)'), findsOneWidget);
      debugPrint('[REAL_DEVICE_TEST] PersonDetailScreen rendered successfully with parents and spouses sections.');

      // If person has children, verify child relative navigation with targetPersonId
      if (personDetail.children.isNotEmpty) {
        final firstChild = personDetail.children.first;
        final childName = firstChild.person?.primaryNameNepali;
        if (childName != null) {
          debugPrint('[REAL_DEVICE_TEST] 6. Verifying relative navigation to child: $childName (Target ID: ${firstChild.targetPersonId})...');
          final childFinder = find.text(childName);
          if (childFinder.evaluate().isNotEmpty) {
            await tester.tap(childFinder.first);
            await tester.pumpAndSettle(const Duration(seconds: 3));
            expect(find.text('अभिभावकहरू (Parents)'), findsOneWidget);
            debugPrint('[REAL_DEVICE_TEST] Successfully navigated to relative profile: $childName');
            // Tap back
            await tester.pageBack();
            await tester.pumpAndSettle(const Duration(seconds: 2));
          }
        }
      }

      // Tap Tree icon to open ReadOnlyTreeScreen
      debugPrint('[REAL_DEVICE_TEST] 7. Tapping tree icon to open ReadOnlyTreeScreen...');
      final treeIconFinder = find.byIcon(Icons.account_tree);
      expect(treeIconFinder, findsOneWidget);
      await tester.tap(treeIconFinder);
      await tester.pumpAndSettle(const Duration(seconds: 3));

      // Assert ReadOnlyTreeScreen rendered
      expect(find.text('वंशावली रुख (Family Tree)'), findsOneWidget);
      expect(find.text(firstPerson.primaryNameNepali), findsWidgets);
      debugPrint('[REAL_DEVICE_TEST] ReadOnlyTreeScreen rendered successfully with root node: ${firstPerson.primaryNameNepali}.');

      debugPrint('[REAL_DEVICE_TEST] Real device and running API verification PASSED completely!');
    });
  });
}
