import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:kashyap_mobile/screens/person_detail_screen.dart';
import 'package:kashyap_mobile/screens/person_search_screen.dart';
import 'package:kashyap_mobile/services/genealogy_api_service.dart';

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  group('Real Device & Running API Deterministic Acceptance Flow', () {
    final realApi = GenealogyApiService(baseUrl: 'http://10.0.2.2:3000');

    testWidgets('Verify Deterministic 3-Gen Family: Search -> Person Details -> Relative Navigation -> Tree on real device & API', (WidgetTester tester) async {
      // 1. Direct Real API Verification on Deterministic Fixture
      debugPrint('[REAL_DEVICE_TEST] 1. Executing deterministic search query for जनक150249...');
      final searchResults = await realApi.searchPersons(query: 'जनक150249', limit: 10);
      expect(searchResults.isNotEmpty, isTrue, reason: 'Expected deterministic fixture person in PostgreSQL database');
      
      final personSummary = searchResults.firstWhere(
        (p) => p.primaryNameNepali.contains('जनक150249'),
        orElse: () => throw Exception('Required deterministic fixture person जनक150249 was not returned by search API'),
      );
      
      final targetPersonId = personSummary.id;
      final expectedPersonName = personSummary.primaryNameNepali;
      debugPrint('[REAL_DEVICE_TEST] Selected person: $targetPersonId | Name: $expectedPersonName | Gen: ${personSummary.generation}');

      // 2. Fetch Details and Assert Required 3-Generation Relationships
      debugPrint('[REAL_DEVICE_TEST] 2. Fetching real person details for $targetPersonId...');
      final personDetail = await realApi.getPerson(targetPersonId);
      expect(personDetail.id, equals(targetPersonId));
      expect(personDetail.primaryNameNepali, equals(expectedPersonName));
      
      // Strict requirement: must fail if required relationships are missing
      expect(personDetail.parents.isNotEmpty, isTrue, reason: 'Deterministic test requires at least 1 parent relationship');
      expect(personDetail.children.isNotEmpty, isTrue, reason: 'Deterministic test requires at least 1 child relationship');

      final parentRelation = personDetail.parents.first;
      final expectedParentPersonId = parentRelation.targetPersonId;
      final expectedParentLinkId = parentRelation.id;
      final expectedParentName = parentRelation.fullNameNepali;
      
      // Assert link ID and person ID are separate entities (not accidentally identical)
      expect(expectedParentPersonId.isNotEmpty, isTrue);
      expect(expectedParentLinkId.isNotEmpty, isTrue);
      expect(expectedParentPersonId, isNot(equals(expectedParentLinkId)), reason: 'Target person ID must differ from relationship row link ID');
      debugPrint('[REAL_DEVICE_TEST] Parent verified: $expectedParentName (PersonID: $expectedParentPersonId, LinkID: $expectedParentLinkId)');

      final childRelation = personDetail.children.first;
      final expectedChildPersonId = childRelation.targetPersonId;
      final expectedChildLinkId = childRelation.id;
      final expectedChildName = childRelation.fullNameNepali;
      
      expect(expectedChildPersonId.isNotEmpty, isTrue);
      expect(expectedChildLinkId.isNotEmpty, isTrue);
      expect(expectedChildPersonId, isNot(equals(expectedChildLinkId)), reason: 'Target person ID must differ from relationship row link ID');
      debugPrint('[REAL_DEVICE_TEST] Child verified: $expectedChildName (PersonID: $expectedChildPersonId, LinkID: $expectedChildLinkId)');

      // 3. Direct Tree API Hierarchy Verification
      debugPrint('[REAL_DEVICE_TEST] 3. Fetching real tree hierarchy for $targetPersonId...');
      final treeNode = await realApi.getTree(targetPersonId, ancestors: 2, descendants: 2);
      expect(treeNode.id, equals(targetPersonId));
      expect(treeNode.nameNepali, equals(expectedPersonName));
      
      // Assert ancestors contain expected parent
      expect(treeNode.ancestors.isNotEmpty, isTrue, reason: 'Tree must contain ancestors for generation 2 root');
      final ancestorMatch = treeNode.ancestors.firstWhere(
        (a) => a.id == expectedParentPersonId,
        orElse: () => throw Exception('Tree ancestors must contain expected parent $expectedParentPersonId ($expectedParentName)'),
      );
      expect(ancestorMatch.nameNepali, equals(expectedParentName));
      
      // Assert children contain expected child
      expect(treeNode.children.isNotEmpty, isTrue, reason: 'Tree must contain children for root');
      final childMatch = treeNode.children.firstWhere(
        (c) => c.id == expectedChildPersonId,
        orElse: () => throw Exception('Tree children must contain expected child $expectedChildPersonId ($expectedChildName)'),
      );
      expect(childMatch.nameNepali, equals(expectedChildName));
      debugPrint('[REAL_DEVICE_TEST] Tree API verified. Root: ${treeNode.nameNepali}, Ancestor: ${ancestorMatch.nameNepali}, Child: ${childMatch.nameNepali}');

      // 4. Real UI Rendering on Android Emulator
      debugPrint('[REAL_DEVICE_TEST] 4. Launching PersonSearchScreen on device...');
      await tester.pumpWidget(MaterialApp(
        home: PersonSearchScreen(apiService: realApi),
      ));
      await tester.pumpAndSettle(const Duration(seconds: 3));

      // Enter search query for deterministic fixture
      final searchField = find.byType(TextField);
      expect(searchField, findsOneWidget);
      await tester.enterText(searchField, 'जनक150249');
      await tester.testTextInput.receiveAction(TextInputAction.search);
      await tester.pumpAndSettle(const Duration(seconds: 3));

      // Assert search result appears
      final personCardFinder = find.text(expectedPersonName).first;
      expect(personCardFinder, findsOneWidget);

      // 5. Open PersonDetailScreen
      debugPrint('[REAL_DEVICE_TEST] 5. Opening PersonDetailScreen for $expectedPersonName...');
      await tester.tap(personCardFinder);
      await tester.pumpAndSettle(const Duration(seconds: 3));

      // Assert active PersonDetailScreen widget has target person ID
      final initialDetailScreen = tester.widget<PersonDetailScreen>(find.byType(PersonDetailScreen).last);
      expect(initialDetailScreen.personId, equals(targetPersonId), reason: 'Active PersonDetailScreen.personId must equal initial target person ID');

      // Assert PersonDetailScreen loaded with section headers
      expect(find.text('अभिभावकहरू (Parents)'), findsOneWidget);
      expect(find.text('दम्पती (Spouses)'), findsOneWidget);
      expect(find.text('सन्तानहरू (Children) (${personDetail.children.length})'), findsOneWidget);
      expect(find.text(expectedParentName), findsOneWidget);

      // 6. Unconditional Relative Navigation to Child (Asserting Person ID Destination)
      debugPrint('[REAL_DEVICE_TEST] 6. Scrolling to and navigating to child relative: $expectedChildName (Target Person ID: $expectedChildPersonId)...');
      final childWidgetFinder = find.text(expectedChildName).first;
      await tester.ensureVisible(childWidgetFinder);
      await tester.pumpAndSettle(const Duration(seconds: 1));
      
      await tester.tap(childWidgetFinder);
      await tester.pumpAndSettle(const Duration(seconds: 3));

      // Assert active PersonDetailScreen widget has destination child person ID and not link ID
      final destinationDetailScreen = tester.widget<PersonDetailScreen>(find.byType(PersonDetailScreen).last);
      expect(destinationDetailScreen.personId, equals(expectedChildPersonId), reason: 'Active PersonDetailScreen.personId must equal child person ID');
      expect(destinationDetailScreen.personId, isNot(equals(expectedChildLinkId)), reason: 'Active PersonDetailScreen.personId must differ from relationship row link ID');

      // Assert destination child profile is rendered with expected identity
      expect(find.text(expectedChildName), findsWidgets);
      expect(find.text('अभिभावकहरू (Parents)'), findsOneWidget);
      debugPrint('[REAL_DEVICE_TEST] Destination child profile successfully rendered for $expectedChildName (Person ID: ${destinationDetailScreen.personId})');

      // Navigate back to target person via Back button
      debugPrint('[REAL_DEVICE_TEST] Navigating back to parent profile ($expectedPersonName)...');
      final backButton = find.byType(BackButton);
      expect(backButton, findsOneWidget);
      await tester.tap(backButton);
      await tester.pumpAndSettle(const Duration(seconds: 2));
      
      // Assert active PersonDetailScreen widget has returned to original target person ID
      final returnedDetailScreen = tester.widget<PersonDetailScreen>(find.byType(PersonDetailScreen).last);
      expect(returnedDetailScreen.personId, equals(targetPersonId), reason: 'Active PersonDetailScreen.personId after back navigation must equal original target person ID');
      expect(find.text(expectedPersonName), findsWidgets);

      final treeIconFinder = find.byIcon(Icons.account_tree);
      expect(treeIconFinder, findsOneWidget);

      // 7. Tree Navigation and Rendered Ancestor/Descendant Assertions
      debugPrint('[REAL_DEVICE_TEST] 7. Opening ReadOnlyTreeScreen...');
      await tester.tap(treeIconFinder);
      await tester.pumpAndSettle(const Duration(seconds: 3));

      // Assert Tree Canvas renders title, ancestor, root, and child names on device
      expect(find.text('वंशावली रुख (Family Tree)'), findsOneWidget);
      expect(find.text(expectedParentName), findsWidgets, reason: 'Ancestor name must be rendered on tree screen');
      expect(find.text(expectedPersonName), findsWidgets, reason: 'Root focus name must be rendered on tree screen');
      expect(find.text(expectedChildName), findsWidgets, reason: 'Child descendant name must be rendered on tree screen');

      debugPrint('[REAL_DEVICE_TEST] Fully deterministic real device & live API verification PASSED completely!');
    });
  });
}
