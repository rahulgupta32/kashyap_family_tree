import 'package:flutter_test/flutter_test.dart';
import 'package:kashyap_mobile/models/person.dart';
import 'package:kashyap_mobile/models/tree_node.dart';
import 'package:kashyap_mobile/main.dart';

void main() {
  group('Genealogy Mobile Models Test Suite', () {
    test('PersonSummary.fromJson correctly deserializes properties and gender', () {
      final json = {
        'id': 'p-test-01',
        'fullNameNepali': 'राम कश्यप',
        'fullNameEnglish': 'Ram Kashyap',
        'branchNameNepali': 'सिन्धुपाल्चोक शाखा',
        'generation': 12,
        'gender': 'MALE',
        'livingStatus': 'LIVING',
        'dateOfBirthBs': '2050-01-01',
      };

      final person = PersonSummary.fromJson(json);
      expect(person.id, 'p-test-01');
      expect(person.fullNameNepali, 'राम कश्यप');
      expect(person.fullNameEnglish, 'Ram Kashyap');
      expect(person.branchNameNepali, 'सिन्धुपाल्चोक शाखा');
      expect(person.generation, 12);
      expect(person.gender, Gender.male);
      expect(person.livingStatus, LivingStatus.living);
      expect(person.dateOfBirthBs, '2050-01-01');
    });

    test('TreeNode.fromJson correctly parses nested hierarchy', () {
      final json = {
        'id': 'p-root',
        'fullNameNepali': 'मूल पुरुष',
        'fullNameEnglish': 'Root Ancestor',
        'gender': 'MALE',
        'livingStatus': 'DECEASED',
        'generation': 1,
        'children': [
          {
            'id': 'p-child-01',
            'fullNameNepali': 'जेठा छोरा',
            'fullNameEnglish': 'First Son',
            'gender': 'MALE',
            'livingStatus': 'LIVING',
            'generation': 2,
            'children': [],
            'spouses': [],
            'parents': []
          }
        ],
        'spouses': [],
        'parents': []
      };

      final tree = TreeNode.fromJson(json);
      expect(tree.id, 'p-root');
      expect(tree.fullNameNepali, 'मूल पुरुष');
      expect(tree.livingStatus, LivingStatus.deceased);
      expect(tree.children.length, 1);
      expect(tree.children.first.fullNameNepali, 'जेठा छोरा');
      expect(tree.children.first.livingStatus, LivingStatus.living);
    });

    test('PersonDetail parses extended fields and relationships', () {
      final json = {
        'id': 'p-detail-01',
        'fullNameNepali': 'हरि कश्यप',
        'gender': 'MALE',
        'livingStatus': 'LIVING',
        'branchId': 'b-01',
        'birthPlace': 'काठमाडौँ',
        'moolGhar': 'सिन्धुपाल्चोक',
        'privacyVisibility': 'PUBLIC',
        'version': 2,
        'parents': [
          {
            'id': 'p-dad',
            'fullNameNepali': 'बुवा कश्यप',
            'parentType': 'BIOLOGICAL',
            'gender': 'MALE'
          }
        ],
        'spouses': [
          {
            'id': 'p-spouse',
            'fullNameNepali': 'सीता कश्यप',
            'status': 'CURRENT',
            'marriageDateBs': '2070-02-15'
          }
        ],
        'children': [
          {
            'id': 'p-kid',
            'fullNameNepali': 'छोरा कश्यप',
            'gender': 'MALE',
            'livingStatus': 'LIVING'
          }
        ]
      };

      final detail = PersonDetail.fromJson(json);
      expect(detail.id, 'p-detail-01');
      expect(detail.birthPlace, 'काठमाडौँ');
      expect(detail.parents.length, 1);
      expect(detail.spouses.length, 1);
      expect(detail.children.length, 1);
    });
  });

  group('KashyapApp Widget Test', () {
    testWidgets('KashyapApp renders initial search screen', (WidgetTester tester) async {
      await tester.pumpWidget(const KashyapApp());
      expect(find.text('कश्यप अधिकारी वंशावली'), findsOneWidget);
    });
  });
}
