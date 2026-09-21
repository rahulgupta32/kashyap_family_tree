import 'package:flutter_test/flutter_test.dart';
import 'package:kashyap_mobile/models/person.dart';
import 'package:kashyap_mobile/models/tree_node.dart';
import 'package:kashyap_mobile/main.dart';
import 'package:kashyap_mobile/services/genealogy_api_service.dart';
import 'package:kashyap_mobile/screens/sign_in_screen.dart';
import 'native_session_test.dart' show MemorySessionStore;

void main() {
  group('Genealogy Mobile Models Contract Test Suite', () {
    test('PersonSummary.fromJson correctly deserializes contracts/genealogy.ts payload', () {
      final json = {
        'id': 'p-101',
        'primaryNameNepali': 'रामचन्द्र अधिकारी (परीक्षण)',
        'primaryNameEnglish': 'Ram Chandra Adhikari (Synthetic Test)',
        'gender': 'MALE',
        'livingStatus': 'DECEASED',
        'generation': 1,
        'branchId': 'b-001',
        'branchName': 'कास्की शाखा',
        'birthYearBs': 1950,
        'deathYearBs': 2025,
        'isClaimed': false,
        'isMinorProtected': false,
        'version': 1,
      };

      final person = PersonSummary.fromJson(json);
      expect(person.id, 'p-101');
      expect(person.primaryNameNepali, 'रामचन्द्र अधिकारी (परीक्षण)');
      expect(person.primaryNameEnglish, 'Ram Chandra Adhikari (Synthetic Test)');
      expect(person.fullNameNepali, 'रामचन्द्र अधिकारी (परीक्षण)');
      expect(person.gender, Gender.male);
      expect(person.livingStatus, LivingStatus.deceased);
      expect(person.generation, 1);
      expect(person.branchId, 'b-001');
      expect(person.branchName, 'कास्की शाखा');
      expect(person.birthYearBs, 1950);
      expect(person.deathYearBs, 2025);
      expect(person.isClaimed, false);
      expect(person.isMinorProtected, false);
      expect(person.version, 1);
    });

    test('PersonDetail.fromJson parses relations with nested PersonSummary and correct targetPersonId', () {
      final json = {
        'id': 'p-301',
        'primaryNameNepali': 'कृष्ण बहादुर अधिकारी (परीक्षण)',
        'primaryNameEnglish': 'Krishna Bahadur Adhikari (Synthetic Test)',
        'gender': 'MALE',
        'livingStatus': 'LIVING',
        'generation': 3,
        'branchId': 'b-001',
        'branchName': 'कास्की शाखा',
        'birthYearBs': 2015,
        'birthDateBs': '2015-05-15',
        'birthPlace': 'कास्कीकोट',
        'gotra': 'कश्यप',
        'kuldevata': 'विन्ध्यवासिनी',
        'moolGhar': 'कास्कीकोट',
        'isClaimed': false,
        'names': [
          {
            'language': 'ne',
            'firstName': 'कृष्ण',
            'lastName': 'अधिकारी',
            'fullName': 'कृष्ण बहादुर अधिकारी (परीक्षण)',
            'isPrimary': true,
          },
          {
            'language': 'en',
            'firstName': 'Krishna',
            'lastName': 'Adhikari',
            'fullName': 'Krishna Bahadur Adhikari (Synthetic Test)',
            'isPrimary': false,
          }
        ],
        'parents': [
          {
            'id': 'link-parent-01',
            'personId': 'p-201',
            'parentType': 'BIOLOGICAL',
            'person': {
              'id': 'p-201',
              'primaryNameNepali': 'हरि प्रसाद अधिकारी (परीक्षण)',
              'primaryNameEnglish': 'Hari Prasad Adhikari (Synthetic Test)',
              'gender': 'MALE',
              'livingStatus': 'DECEASED',
              'generation': 2,
              'branchId': 'b-001',
              'branchName': 'कास्की शाखा',
            }
          }
        ],
        'spouses': [
          {
            'id': 'link-spouse-01',
            'spousePersonId': 'p-spouse-01',
            'status': 'CURRENT',
            'marriageDateBs': '2040-02-10',
            'person': {
              'id': 'p-spouse-01',
              'primaryNameNepali': 'सरिता अधिकारी (परीक्षण)',
              'gender': 'FEMALE',
              'livingStatus': 'LIVING',
              'generation': 3,
              'branchId': 'b-001',
              'branchName': 'कास्की शाखा',
            }
          }
        ],
        'children': [
          {
            'id': 'link-child-01',
            'personId': 'p-401',
            'parentType': 'BIOLOGICAL',
            'person': {
              'id': 'p-401',
              'primaryNameNepali': 'सन्तोष अधिकारी (परीक्षण)',
              'primaryNameEnglish': 'Santosh Adhikari (Synthetic Test)',
              'gender': 'MALE',
              'livingStatus': 'LIVING',
              'generation': 4,
              'branchId': 'b-001',
              'branchName': 'कास्की शाखा',
            }
          }
        ],
        'privacy': {
          'phoneVisibility': 'PRIVATE',
          'addressVisibility': 'PRIVATE',
          'dobVisibility': 'PRIVATE',
        },
      };

      final detail = PersonDetail.fromJson(json);
      expect(detail.id, 'p-301');
      expect(detail.primaryNameNepali, 'कृष्ण बहादुर अधिकारी (परीक्षण)');
      expect(detail.names.length, 2);
      expect(detail.names.first.isPrimary, true);
      expect(detail.gotra, 'कश्यप');

      // Assert Parents relation target Person ID (not link ID!)
      expect(detail.parents.length, 1);
      expect(detail.parents.first.id, 'link-parent-01');
      expect(detail.parents.first.personId, 'p-201');
      expect(detail.parents.first.targetPersonId, 'p-201');
      expect(detail.parents.first.fullNameNepali, 'हरि प्रसाद अधिकारी (परीक्षण)');
      expect(detail.parents.first.gender, Gender.male);

      // Assert Spouses relation target Person ID
      expect(detail.spouses.length, 1);
      expect(detail.spouses.first.id, 'link-spouse-01');
      expect(detail.spouses.first.spousePersonId, 'p-spouse-01');
      expect(detail.spouses.first.targetPersonId, 'p-spouse-01');
      expect(detail.spouses.first.fullNameNepali, 'सरिता अधिकारी (परीक्षण)');
      expect(detail.spouses.first.marriageDateBs, '2040-02-10');

      // Assert Children relation target Person ID
      expect(detail.children.length, 1);
      expect(detail.children.first.id, 'link-child-01');
      expect(detail.children.first.personId, 'p-401');
      expect(detail.children.first.targetPersonId, 'p-401');
      expect(detail.children.first.fullNameNepali, 'सन्तोष अधिकारी (परीक्षण)');
      expect(detail.children.first.gender, Gender.male);
    });

    test('TreeNode.fromJson correctly parses nested ancestors and descendants', () {
      final json = {
        'id': 'p-301',
        'nameNepali': 'कृष्ण बहादुर अधिकारी (परीक्षण)',
        'nameEnglish': 'Krishna Bahadur Adhikari (Synthetic Test)',
        'gender': 'MALE',
        'livingStatus': 'LIVING',
        'generation': 3,
        'isClaimed': false,
        'ancestors': [
          {
            'id': 'p-101',
            'nameNepali': 'रामचन्द्र अधिकारी (परीक्षण)',
            'nameEnglish': 'Ram Chandra Adhikari (Synthetic Test)',
            'gender': 'MALE',
            'livingStatus': 'DECEASED',
            'generation': 1,
            'isClaimed': false,
            'spouses': [],
            'children': [],
            'ancestors': [],
            'hasMoreAncestors': false,
            'hasMoreDescendants': false,
          },
          {
            'id': 'p-201',
            'nameNepali': 'हरि प्रसाद अधिकारी (परीक्षण)',
            'nameEnglish': 'Hari Prasad Adhikari (Synthetic Test)',
            'gender': 'MALE',
            'livingStatus': 'DECEASED',
            'generation': 2,
            'isClaimed': false,
            'spouses': [],
            'children': [],
            'ancestors': [],
            'hasMoreAncestors': false,
            'hasMoreDescendants': false,
          }
        ],
        'spouses': [
          {
            'id': 'p-spouse-01',
            'nameNepali': 'सरिता अधिकारी (परीक्षण)',
            'gender': 'FEMALE',
            'livingStatus': 'LIVING',
            'generation': 3,
            'isClaimed': false,
            'spouses': [],
            'children': [],
            'ancestors': [],
            'hasMoreAncestors': false,
            'hasMoreDescendants': false,
          }
        ],
        'children': [
          {
            'id': 'p-401',
            'nameNepali': 'सन्तोष अधिकारी (परीक्षण)',
            'nameEnglish': 'Santosh Adhikari (Synthetic Test)',
            'gender': 'MALE',
            'livingStatus': 'LIVING',
            'generation': 4,
            'isClaimed': false,
            'spouses': [],
            'children': [],
            'ancestors': [],
            'hasMoreAncestors': false,
            'hasMoreDescendants': false,
          }
        ],
        'hasMoreAncestors': false,
        'hasMoreDescendants': false,
      };

      final tree = TreeNode.fromJson(json);
      expect(tree.id, 'p-301');
      expect(tree.nameNepali, 'कृष्ण बहादुर अधिकारी (परीक्षण)');
      expect(tree.ancestors.length, 2);
      expect(tree.ancestors.first.nameNepali, 'रामचन्द्र अधिकारी (परीक्षण)');
      expect(tree.ancestors.last.nameNepali, 'हरि प्रसाद अधिकारी (परीक्षण)');
      expect(tree.spouses.length, 1);
      expect(tree.spouses.first.nameNepali, 'सरिता अधिकारी (परीक्षण)');
      expect(tree.children.length, 1);
      expect(tree.children.first.nameNepali, 'सन्तोष अधिकारी (परीक्षण)');
    });
  });

  group('KashyapApp Smoke Widget Test', () {
    testWidgets('KashyapApp restores empty session to sign-in screen', (WidgetTester tester) async {
      final service = GenealogyApiService(sessionStore: MemorySessionStore());
      addTearDown(service.dispose);
      await tester.pumpWidget(KashyapApp(apiService: service));
      await tester.pumpAndSettle();
      expect(find.byType(SignInScreen), findsOneWidget);
      expect(find.text('कश्यप अधिकारी वंशावली'), findsOneWidget);
    });
  });
}

