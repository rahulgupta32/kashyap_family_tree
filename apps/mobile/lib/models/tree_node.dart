import 'person.dart';

class TreeNode {
  final String id;
  final String fullNameNepali;
  final String? fullNameEnglish;
  final Gender gender;
  final LivingStatus livingStatus;
  final int? generation;
  final String? dateOfBirthBs;
  final List<SpouseRelation> spouses;
  final List<TreeNode> parents;
  final List<TreeNode> children;

  TreeNode({
    required this.id,
    required this.fullNameNepali,
    this.fullNameEnglish,
    required this.gender,
    required this.livingStatus,
    this.generation,
    this.dateOfBirthBs,
    this.spouses = const [],
    this.parents = const [],
    this.children = const [],
  });

  factory TreeNode.fromJson(Map<String, dynamic> json) {
    var spousesList = (json['spouses'] as List? ?? [])
        .map((s) => SpouseRelation.fromJson(s))
        .toList();
    var parentsList = (json['parents'] as List? ?? [])
        .map((p) => TreeNode.fromJson(p))
        .toList();
    var childrenList = (json['children'] as List? ?? [])
        .map((c) => TreeNode.fromJson(c))
        .toList();

    return TreeNode(
      id: json['id'] ?? '',
      fullNameNepali: json['fullNameNepali'] ?? '',
      fullNameEnglish: json['fullNameEnglish'],
      gender: PersonSummary._parseGender(json['gender']),
      livingStatus: json['livingStatus'] == 'DECEASED' ? LivingStatus.deceased : LivingStatus.living,
      generation: json['generation'],
      dateOfBirthBs: json['dateOfBirthBs'],
      spouses: spousesList,
      parents: parentsList,
      children: childrenList,
    );
  }
}
