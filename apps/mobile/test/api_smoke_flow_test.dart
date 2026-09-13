import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kashyap_mobile/models/person.dart';
import 'package:kashyap_mobile/models/tree_node.dart';
import 'package:kashyap_mobile/screens/person_search_screen.dart';
import 'package:kashyap_mobile/services/genealogy_api_service.dart';

class FakeGenealogyApiService extends GenealogyApiService {
  @override
  Future<List<PersonSummary>> searchPersons({
    String? query,
    String? branchId,
    int? generation,
    int page = 1,
    int limit = 20,
  }) async {
    return [
      PersonSummary(
        id: 'p-301',
        primaryNameNepali: 'कृष्ण बहादुर अधिकारी (परीक्षण)',
        primaryNameEnglish: 'Krishna Bahadur Adhikari (Synthetic Test)',
        gender: Gender.male,
        livingStatus: LivingStatus.living,
        generation: 3,
        branchId: 'b-001',
        branchName: 'कास्की शाखा',
        birthYearBs: 2015,
      ),
      PersonSummary(
        id: 'p-201',
        primaryNameNepali: 'हरि प्रसाद अधिकारी (परीक्षण)',
        primaryNameEnglish: 'Hari Prasad Adhikari (Synthetic Test)',
        gender: Gender.male,
        livingStatus: LivingStatus.deceased,
        generation: 2,
        branchId: 'b-001',
        branchName: 'कास्की शाखा',
        birthYearBs: 1980,
        deathYearBs: 2055,
      ),
    ];
  }

  @override
  Future<PersonDetail> getPerson(String id) async {
    return PersonDetail(
      id: id,
      primaryNameNepali: 'कृष्ण बहादुर अधिकारी (परीक्षण)',
      primaryNameEnglish: 'Krishna Bahadur Adhikari (Synthetic Test)',
      gender: Gender.male,
      livingStatus: LivingStatus.living,
      generation: 3,
      branchId: 'b-001',
      branchName: 'कास्की शाखा',
      birthYearBs: 2015,
      birthDateBs: '2015-05-15',
      birthPlace: 'कास्कीकोट',
      moolGhar: 'कास्कीकोट',
      gotra: 'कश्यप',
      kuldevata: 'विन्ध्यवासिनी',
      parents: [
        ParentRelation(
          id: 'link-parent-01',
          personId: 'p-201',
          parentType: 'BIOLOGICAL',
          person: PersonSummary(
            id: 'p-201',
            primaryNameNepali: 'हरि प्रसाद अधिकारी (परीक्षण)',
            gender: Gender.male,
            livingStatus: LivingStatus.deceased,
            generation: 2,
            branchName: 'कास्की शाखा',
          ),
        ),
      ],
      spouses: [
        SpouseRelation(
          id: 'link-spouse-01',
          spousePersonId: 'p-spouse-01',
          status: 'CURRENT',
          marriageDateBs: '2040-02-10',
          person: PersonSummary(
            id: 'p-spouse-01',
            primaryNameNepali: 'सरिता अधिकारी (परीक्षण)',
            gender: Gender.female,
            livingStatus: LivingStatus.living,
            generation: 3,
          ),
        ),
      ],
      children: [
        ChildRelation(
          id: 'link-child-01',
          personId: 'p-401',
          parentType: 'BIOLOGICAL',
          person: PersonSummary(
            id: 'p-401',
            primaryNameNepali: 'सन्तोष अधिकारी (परीक्षण)',
            gender: Gender.male,
            livingStatus: LivingStatus.living,
            generation: 4,
          ),
        ),
      ],
    );
  }

  @override
  Future<TreeNode> getTree(String id, {int ancestors = 2, int descendants = 2}) async {
    return TreeNode(
      id: id,
      nameNepali: 'कृष्ण बहादुर अधिकारी (परीक्षण)',
      nameEnglish: 'Krishna Bahadur Adhikari (Synthetic Test)',
      gender: Gender.male,
      livingStatus: LivingStatus.living,
      generation: 3,
      ancestors: [
        TreeNode(
          id: 'p-201',
          nameNepali: 'हरि प्रसाद अधिकारी (परीक्षण)',
          nameEnglish: 'Hari Prasad Adhikari (Synthetic Test)',
          gender: Gender.male,
          livingStatus: LivingStatus.deceased,
          generation: 2,
        ),
      ],
      spouses: [
        TreeNode(
          id: 'p-spouse-01',
          nameNepali: 'सरिता अधिकारी (परीक्षण)',
          gender: Gender.female,
          livingStatus: LivingStatus.living,
          generation: 3,
        ),
      ],
      children: [
        TreeNode(
          id: 'p-401',
          nameNepali: 'सन्तोष अधिकारी (परीक्षण)',
          nameEnglish: 'Santosh Adhikari (Synthetic Test)',
          gender: Gender.male,
          livingStatus: LivingStatus.living,
          generation: 4,
        ),
      ],
    );
  }
}

void main() {
  group('Mobile End-to-End Navigation Smoke Flow', () {
    testWidgets('Search -> Person Details -> Tree Canvas Navigation Flow', (WidgetTester tester) async {
      final fakeApi = FakeGenealogyApiService();

      // 1. Launch Search Screen
      await tester.pumpWidget(MaterialApp(
        home: PersonSearchScreen(apiService: fakeApi),
      ));
      await tester.pumpAndSettle();

      // Verify search results rendered
      expect(find.text('कश्यप अधिकारी वंशावली'), findsOneWidget);
      expect(find.text('कृष्ण बहादुर अधिकारी (परीक्षण)'), findsOneWidget);
      expect(find.text('हरि प्रसाद अधिकारी (परीक्षण)'), findsOneWidget);

      // 2. Tap on Person Result -> Navigate to PersonDetailScreen
      await tester.tap(find.text('कृष्ण बहादुर अधिकारी (परीक्षण)'));
      await tester.pumpAndSettle();

      // Verify PersonDetailScreen loaded with relative sections
      expect(find.text('अभिभावकहरू (Parents)'), findsOneWidget);
      expect(find.text('दम्पती (Spouses)'), findsOneWidget);
      expect(find.text('सन्तानहरू (Children) (1)'), findsOneWidget);
      expect(find.text('सरिता अधिकारी (परीक्षण)'), findsOneWidget);
      expect(find.text('सन्तोष अधिकारी (परीक्षण)'), findsOneWidget);

      // 3. Tap Tree Action -> Navigate to ReadOnlyTreeScreen
      await tester.tap(find.byIcon(Icons.account_tree));
      await tester.pumpAndSettle();

      // Verify ReadOnlyTreeScreen renders ancestor, focus, and child nodes
      expect(find.text('वंशावली रुख (Family Tree)'), findsOneWidget);
      expect(find.text('हरि प्रसाद अधिकारी (परीक्षण)'), findsOneWidget);
      expect(find.text('सन्तोष अधिकारी (परीक्षण)'), findsOneWidget);
    });
  });
}
