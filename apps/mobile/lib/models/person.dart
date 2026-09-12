enum Gender { male, female, other }
enum LivingStatus { living, deceased }

class PersonSummary {
  final String id;
  final String fullNameNepali;
  final String? fullNameEnglish;
  final String? branchNameNepali;
  final int? generation;
  final Gender gender;
  final LivingStatus livingStatus;
  final String? dateOfBirthBs;
  final String? dateOfDeathBs;
  final String? fatherNameNepali;
  final String? motherNameNepali;

  PersonSummary({
    required this.id,
    required this.fullNameNepali,
    this.fullNameEnglish,
    this.branchNameNepali,
    this.generation,
    required this.gender,
    required this.livingStatus,
    this.dateOfBirthBs,
    this.dateOfDeathBs,
    this.fatherNameNepali,
    this.motherNameNepali,
  });

  factory PersonSummary.fromJson(Map<String, dynamic> json) {
    return PersonSummary(
      id: json['id'] ?? '',
      fullNameNepali: json['fullNameNepali'] ?? '',
      fullNameEnglish: json['fullNameEnglish'],
      branchNameNepali: json['branchNameNepali'],
      generation: json['generation'],
      gender: _parseGender(json['gender']),
      livingStatus: json['livingStatus'] == 'DECEASED' ? LivingStatus.deceased : LivingStatus.living,
      dateOfBirthBs: json['dateOfBirthBs'],
      dateOfDeathBs: json['dateOfDeathBs'],
      fatherNameNepali: json['fatherNameNepali'],
      motherNameNepali: json['motherNameNepali'],
    );
  }

  static Gender _parseGender(String? g) {
    if (g == 'FEMALE') return Gender.female;
    if (g == 'OTHER') return Gender.other;
    return Gender.male;
  }
}

class PersonDetail extends PersonSummary {
  final String branchId;
  final String? birthPlace;
  final String? moolGhar;
  final String privacyVisibility;
  final int version;
  final List<ParentRelation> parents;
  final List<SpouseRelation> spouses;
  final List<ChildRelation> children;

  PersonDetail({
    required super.id,
    required super.fullNameNepali,
    super.fullNameEnglish,
    super.branchNameNepali,
    super.generation,
    required super.gender,
    required super.livingStatus,
    super.dateOfBirthBs,
    super.dateOfDeathBs,
    required this.branchId,
    this.birthPlace,
    this.moolGhar,
    required this.privacyVisibility,
    required this.version,
    required this.parents,
    required this.spouses,
    required this.children,
  });

  factory PersonDetail.fromJson(Map<String, dynamic> json) {
    var parentsList = (json['parents'] as List? ?? [])
        .map((p) => ParentRelation.fromJson(p))
        .toList();
    var spousesList = (json['spouses'] as List? ?? [])
        .map((s) => SpouseRelation.fromJson(s))
        .toList();
    var childrenList = (json['children'] as List? ?? [])
        .map((c) => ChildRelation.fromJson(c))
        .toList();

    return PersonDetail(
      id: json['id'] ?? '',
      fullNameNepali: json['fullNameNepali'] ?? '',
      fullNameEnglish: json['fullNameEnglish'],
      branchNameNepali: json['branchNameNepali'],
      generation: json['generation'],
      gender: PersonSummary._parseGender(json['gender']),
      livingStatus: json['livingStatus'] == 'DECEASED' ? LivingStatus.deceased : LivingStatus.living,
      dateOfBirthBs: json['dateOfBirthBs'],
      dateOfDeathBs: json['dateOfDeathBs'],
      branchId: json['branchId'] ?? '',
      birthPlace: json['birthPlace'],
      moolGhar: json['moolGhar'],
      privacyVisibility: json['privacyVisibility'] ?? 'PUBLIC',
      version: json['version'] ?? 1,
      parents: parentsList,
      spouses: spousesList,
      children: childrenList,
    );
  }
}

class ParentRelation {
  final String id;
  final String fullNameNepali;
  final String? fullNameEnglish;
  final String parentType;
  final Gender gender;

  ParentRelation({
    required this.id,
    required this.fullNameNepali,
    this.fullNameEnglish,
    required this.parentType,
    required this.gender,
  });

  factory ParentRelation.fromJson(Map<String, dynamic> json) {
    return ParentRelation(
      id: json['id'] ?? '',
      fullNameNepali: json['fullNameNepali'] ?? '',
      fullNameEnglish: json['fullNameEnglish'],
      parentType: json['parentType'] ?? 'BIOLOGICAL',
      gender: PersonSummary._parseGender(json['gender']),
    );
  }
}

class SpouseRelation {
  final String id;
  final String fullNameNepali;
  final String? fullNameEnglish;
  final String? marriageDateBs;
  final String status;

  SpouseRelation({
    required this.id,
    required this.fullNameNepali,
    this.fullNameEnglish,
    this.marriageDateBs,
    required this.status,
  });

  factory SpouseRelation.fromJson(Map<String, dynamic> json) {
    return SpouseRelation(
      id: json['id'] ?? '',
      fullNameNepali: json['fullNameNepali'] ?? '',
      fullNameEnglish: json['fullNameEnglish'],
      marriageDateBs: json['marriageDateBs'],
      status: json['status'] ?? 'CURRENT',
    );
  }
}

class ChildRelation {
  final String id;
  final String fullNameNepali;
  final String? fullNameEnglish;
  final Gender gender;
  final LivingStatus livingStatus;

  ChildRelation({
    required this.id,
    required this.fullNameNepali,
    this.fullNameEnglish,
    required this.gender,
    required this.livingStatus,
  });

  factory ChildRelation.fromJson(Map<String, dynamic> json) {
    return ChildRelation(
      id: json['id'] ?? '',
      fullNameNepali: json['fullNameNepali'] ?? '',
      fullNameEnglish: json['fullNameEnglish'],
      gender: PersonSummary._parseGender(json['gender']),
      livingStatus: json['livingStatus'] == 'DECEASED' ? LivingStatus.deceased : LivingStatus.living,
    );
  }
}
