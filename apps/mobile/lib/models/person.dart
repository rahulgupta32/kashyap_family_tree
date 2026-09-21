enum Gender { male, female, other }
enum LivingStatus { living, deceased }

Gender parseGender(String? g) {
  if (g == null) return Gender.male;
  final upper = g.toUpperCase();
  if (upper == 'FEMALE') return Gender.female;
  if (upper == 'OTHER') return Gender.other;
  return Gender.male;
}

LivingStatus parseLivingStatus(String? s) {
  if (s == null) return LivingStatus.living;
  final upper = s.toUpperCase();
  if (upper == 'DECEASED') return LivingStatus.deceased;
  return LivingStatus.living;
}

class PersonName {
  final String language;
  final String firstName;
  final String? middleName;
  final String lastName;
  final String fullName;
  final bool isPrimary;

  PersonName({
    required this.language,
    required this.firstName,
    this.middleName,
    required this.lastName,
    required this.fullName,
    this.isPrimary = false,
  });

  factory PersonName.fromJson(Map<String, dynamic> json) {
    return PersonName(
      language: json['language'] ?? 'ne',
      firstName: json['firstName'] ?? '',
      middleName: json['middleName'],
      lastName: json['lastName'] ?? '',
      fullName: json['fullName'] ?? '',
      isPrimary: json['isPrimary'] == true,
    );
  }
}

class PersonPrivacy {
  final String phoneVisibility;
  final String addressVisibility;
  final String dobVisibility;

  PersonPrivacy({
    this.phoneVisibility = 'PRIVATE',
    this.addressVisibility = 'PRIVATE',
    this.dobVisibility = 'PRIVATE',
  });

  factory PersonPrivacy.fromJson(Map<String, dynamic>? json) {
    if (json == null) return PersonPrivacy();
    return PersonPrivacy(
      phoneVisibility: json['phoneVisibility'] ?? 'PRIVATE',
      addressVisibility: json['addressVisibility'] ?? 'PRIVATE',
      dobVisibility: json['dobVisibility'] ?? 'PRIVATE',
    );
  }
}

class PersonSummary {
  final String id;
  final String primaryNameNepali;
  final String? primaryNameEnglish;
  final Gender gender;
  final LivingStatus livingStatus;
  final int? generation;
  final String? branchId;
  final String? branchName;
  final int? birthYearBs;
  final int? birthYearAd;
  final int? deathYearBs;
  final String? avatarUrl;
  final bool isClaimed;
  final String? claimedByUserId;
  final bool isArchived;
  final int? version;
  final bool isMinorProtected;

  PersonSummary({
    required this.id,
    required this.primaryNameNepali,
    this.primaryNameEnglish,
    required this.gender,
    required this.livingStatus,
    this.generation,
    this.branchId,
    this.branchName,
    this.birthYearBs,
    this.birthYearAd,
    this.deathYearBs,
    this.avatarUrl,
    this.isClaimed = false,
    this.claimedByUserId,
    this.isArchived = false,
    this.version,
    this.isMinorProtected = false,
  });

  String get fullNameNepali => primaryNameNepali;
  String? get fullNameEnglish => primaryNameEnglish;
  String? get branchNameNepali => branchName;

  static Gender parseGender(String? g) {
    if (g == null) return Gender.male;
    final upper = g.toUpperCase();
    if (upper == 'FEMALE') return Gender.female;
    if (upper == 'OTHER') return Gender.other;
    return Gender.male;
  }

  static LivingStatus parseLivingStatus(String? s) {
    if (s == null) return LivingStatus.living;
    final upper = s.toUpperCase();
    if (upper == 'DECEASED') return LivingStatus.deceased;
    return LivingStatus.living;
  }

  factory PersonSummary.fromJson(Map<String, dynamic> json) {
    return PersonSummary(
      id: json['id'] ?? '',
      primaryNameNepali: json['primaryNameNepali'] ?? json['fullNameNepali'] ?? '',
      primaryNameEnglish: json['primaryNameEnglish'] ?? json['fullNameEnglish'],
      gender: parseGender(json['gender']),
      livingStatus: parseLivingStatus(json['livingStatus']),
      generation: json['generation'],
      branchId: json['branchId'],
      branchName: json['branchName'] ?? json['branchNameNepali'],
      birthYearBs: json['birthYearBs'],
      birthYearAd: json['birthYearAd'],
      deathYearBs: json['deathYearBs'],
      avatarUrl: json['avatarUrl'],
      isClaimed: json['isClaimed'] == true,
      claimedByUserId: json['claimedByUserId'],
      isArchived: json['isArchived'] == true,
      version: json['version'],
      isMinorProtected: json['isMinorProtected'] == true,
    );
  }
}

class PersonDetail extends PersonSummary {
  final List<PersonName> names;
  final String? birthDateBs;
  final String? birthDateAd;
  final String? birthPlace;
  final String? deathDateBs;
  final String? deathDateAd;
  final String? deathPlace;
  final String? gotra;
  final String? kuldevata;
  final String? moolGhar;
  final String? currentAddress;
  final String? biography;
  final String? occupation;
  final String? education;
  final PersonPrivacy? privacy;
  final List<ParentRelation> parents;
  final List<SpouseRelation> spouses;
  final List<ChildRelation> children;
  final String? canonicalPersonId;

  PersonDetail({
    required super.id,
    required super.primaryNameNepali,
    super.primaryNameEnglish,
    required super.gender,
    required super.livingStatus,
    super.generation,
    super.branchId,
    super.branchName,
    super.birthYearBs,
    super.birthYearAd,
    super.deathYearBs,
    super.avatarUrl,
    super.isClaimed,
    super.claimedByUserId,
    super.isArchived,
    super.version,
    super.isMinorProtected,
    this.names = const [],
    this.birthDateBs,
    this.birthDateAd,
    this.birthPlace,
    this.deathDateBs,
    this.deathDateAd,
    this.deathPlace,
    this.gotra,
    this.kuldevata,
    this.moolGhar,
    this.currentAddress,
    this.biography,
    this.occupation,
    this.education,
    this.privacy,
    this.parents = const [],
    this.spouses = const [],
    this.children = const [],
    this.canonicalPersonId,
  });

  factory PersonDetail.fromJson(Map<String, dynamic> json) {
    var namesList = (json['names'] as List? ?? [])
        .map((n) => PersonName.fromJson(n))
        .toList();
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
      primaryNameNepali: json['primaryNameNepali'] ?? json['fullNameNepali'] ?? '',
      primaryNameEnglish: json['primaryNameEnglish'] ?? json['fullNameEnglish'],
      gender: parseGender(json['gender']),
      livingStatus: parseLivingStatus(json['livingStatus']),
      generation: json['generation'],
      branchId: json['branchId'],
      branchName: json['branchName'] ?? json['branchNameNepali'],
      birthYearBs: json['birthYearBs'],
      birthYearAd: json['birthYearAd'],
      deathYearBs: json['deathYearBs'],
      avatarUrl: json['avatarUrl'],
      isClaimed: json['isClaimed'] == true,
      claimedByUserId: json['claimedByUserId'],
      isArchived: json['isArchived'] == true,
      version: json['version'],
      isMinorProtected: json['isMinorProtected'] == true,
      names: namesList,
      birthDateBs: json['birthDateBs'] ?? json['dateOfBirthBs'],
      birthDateAd: json['birthDateAd'],
      birthPlace: json['birthPlace'],
      deathDateBs: json['deathDateBs'] ?? json['dateOfDeathBs'],
      deathDateAd: json['deathDateAd'],
      deathPlace: json['deathPlace'],
      gotra: json['gotra'],
      kuldevata: json['kuldevata'],
      moolGhar: json['moolGhar'],
      currentAddress: json['currentAddress'],
      biography: json['biography'],
      occupation: json['occupation'],
      education: json['education'],
      privacy: PersonPrivacy.fromJson(json['privacy'] as Map<String, dynamic>?),
      parents: parentsList,
      spouses: spousesList,
      children: childrenList,
      canonicalPersonId: json['canonicalPersonId'],
    );
  }
}

class ParentRelation {
  final String id;
  final String personId;
  final String parentType;
  final PersonSummary? person;

  ParentRelation({
    required this.id,
    required this.personId,
    required this.parentType,
    this.person,
  });

  String get targetPersonId => personId;
  String get fullNameNepali => person?.primaryNameNepali ?? '';
  String? get fullNameEnglish => person?.primaryNameEnglish;
  Gender get gender => person?.gender ?? Gender.male;

  factory ParentRelation.fromJson(Map<String, dynamic> json) {
    final relPerson = json['person'] != null
        ? PersonSummary.fromJson(json['person'] as Map<String, dynamic>)
        : null;

    return ParentRelation(
      id: json['id'] ?? '',
      personId: json['personId'] ?? (relPerson?.id ?? json['id'] ?? ''),
      parentType: json['parentType'] ?? 'BIOLOGICAL',
      person: relPerson ??
          (json['fullNameNepali'] != null
              ? PersonSummary.fromJson(json)
              : null),
    );
  }
}

class SpouseRelation {
  final String id;
  final String spousePersonId;
  final String status;
  final String? marriageDateBs;
  final PersonSummary? person;

  SpouseRelation({
    required this.id,
    required this.spousePersonId,
    required this.status,
    this.marriageDateBs,
    this.person,
  });

  String get targetPersonId => spousePersonId;
  String get fullNameNepali => person?.primaryNameNepali ?? '';
  String? get fullNameEnglish => person?.primaryNameEnglish;
  Gender get gender => person?.gender ?? Gender.female;

  factory SpouseRelation.fromJson(Map<String, dynamic> json) {
    final relPerson = json['person'] != null
        ? PersonSummary.fromJson(json['person'] as Map<String, dynamic>)
        : null;

    return SpouseRelation(
      id: json['id'] ?? '',
      spousePersonId: json['spousePersonId'] ?? (relPerson?.id ?? json['id'] ?? ''),
      status: json['status'] ?? 'CURRENT',
      marriageDateBs: json['marriageDateBs'],
      person: relPerson ??
          (json['fullNameNepali'] != null
              ? PersonSummary.fromJson(json)
              : null),
    );
  }
}

class ChildRelation {
  final String id;
  final String personId;
  final String parentType;
  final PersonSummary? person;

  ChildRelation({
    required this.id,
    required this.personId,
    required this.parentType,
    this.person,
  });

  String get targetPersonId => personId;
  String get fullNameNepali => person?.primaryNameNepali ?? '';
  String? get fullNameEnglish => person?.primaryNameEnglish;
  Gender get gender => person?.gender ?? Gender.male;
  LivingStatus get livingStatus => person?.livingStatus ?? LivingStatus.living;

  factory ChildRelation.fromJson(Map<String, dynamic> json) {
    final relPerson = json['person'] != null
        ? PersonSummary.fromJson(json['person'] as Map<String, dynamic>)
        : null;

    return ChildRelation(
      id: json['id'] ?? '',
      personId: json['personId'] ?? (relPerson?.id ?? json['id'] ?? ''),
      parentType: json['parentType'] ?? 'BIOLOGICAL',
      person: relPerson ??
          (json['fullNameNepali'] != null
              ? PersonSummary.fromJson(json)
              : null),
    );
  }
}
