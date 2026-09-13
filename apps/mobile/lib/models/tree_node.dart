import 'person.dart';

class TreeNode {
  final String id;
  final String nameNepali;
  final String? nameEnglish;
  final Gender gender;
  final LivingStatus livingStatus;
  final int? generation;
  final bool isClaimed;
  final String? avatarUrl;
  final List<TreeNode> spouses;
  final List<TreeNode> children;
  final List<TreeNode> ancestors;
  final bool hasMoreAncestors;
  final bool hasMoreDescendants;

  TreeNode({
    required this.id,
    required this.nameNepali,
    this.nameEnglish,
    required this.gender,
    required this.livingStatus,
    this.generation,
    this.isClaimed = false,
    this.avatarUrl,
    this.spouses = const [],
    this.children = const [],
    this.ancestors = const [],
    this.hasMoreAncestors = false,
    this.hasMoreDescendants = false,
  });

  String get fullNameNepali => nameNepali;
  String? get fullNameEnglish => nameEnglish;

  factory TreeNode.fromJson(Map<String, dynamic> json) {
    var spousesList = (json['spouses'] as List? ?? [])
        .map((s) => TreeNode.fromJson(s as Map<String, dynamic>))
        .toList();
    var childrenList = (json['children'] as List? ?? [])
        .map((c) => TreeNode.fromJson(c as Map<String, dynamic>))
        .toList();
    var ancestorsList = (json['ancestors'] as List? ?? [])
        .map((a) => TreeNode.fromJson(a as Map<String, dynamic>))
        .toList();

    return TreeNode(
      id: json['id'] ?? '',
      nameNepali: json['nameNepali'] ?? json['fullNameNepali'] ?? '',
      nameEnglish: json['nameEnglish'] ?? json['fullNameEnglish'],
      gender: parseGender(json['gender']),
      livingStatus: parseLivingStatus(json['livingStatus']),
      generation: json['generation'],
      isClaimed: json['isClaimed'] == true,
      avatarUrl: json['avatarUrl'],
      spouses: spousesList,
      children: childrenList,
      ancestors: ancestorsList,
      hasMoreAncestors: json['hasMoreAncestors'] == true,
      hasMoreDescendants: json['hasMoreDescendants'] == true,
    );
  }
}
