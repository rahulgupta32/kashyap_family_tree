import { Gender, LivingStatus, Role } from '@kashyap/contracts';

export const mockBranches = [
  {
    id: 'b-001',
    nameNepali: 'कास्की शाखा',
    nameEnglish: 'Kaski Branch',
    description: 'मूल कास्की अधिकारी शाखा',
    moolGhar: 'कास्कीकोट',
    kuldevata: 'विन्ध्यवासिनी'
  },
  {
    id: 'b-002',
    nameNepali: 'लमजुङ शाखा',
    nameEnglish: 'Lamjung Branch',
    description: 'लमजुङ क्षेत्रका कश्यप अधिकारी',
    moolGhar: 'गाउँसहर',
    kuldevata: 'कालिका'
  }
];

export const mockPersons = [
  // Generation 1: Great-Grandfather
  {
    id: 'p-101',
    primaryNameNepali: 'रामचन्द्र अधिकारी',
    primaryNameEnglish: 'Ram Chandra Adhikari',
    gender: Gender.MALE,
    livingStatus: LivingStatus.DECEASED,
    generation: 1,
    branchId: 'b-001',
    branchName: 'कास्की शाखा',
    birthYearBs: 1950,
    deathYearBs: 2025,
    isClaimed: false
  },
  // Generation 2: Grandfather & Granduncle
  {
    id: 'p-201',
    primaryNameNepali: 'हरि प्रसाद अधिकारी',
    primaryNameEnglish: 'Hari Prasad Adhikari',
    gender: Gender.MALE,
    livingStatus: LivingStatus.DECEASED,
    generation: 2,
    branchId: 'b-001',
    branchName: 'कास्की शाखा',
    birthYearBs: 1980,
    deathYearBs: 2055,
    isClaimed: false
  },
  {
    id: 'p-202',
    primaryNameNepali: 'शिव प्रसाद अधिकारी',
    primaryNameEnglish: 'Shiva Prasad Adhikari',
    gender: Gender.MALE,
    livingStatus: LivingStatus.DECEASED,
    generation: 2,
    branchId: 'b-001',
    branchName: 'कास्की शाखा',
    birthYearBs: 1985,
    deathYearBs: 2060,
    isClaimed: false
  },
  // Generation 3: Father & Uncle
  {
    id: 'p-301',
    primaryNameNepali: 'कृष्ण बहादुर अधिकारी',
    primaryNameEnglish: 'Krishna Bahadur Adhikari',
    gender: Gender.MALE,
    livingStatus: LivingStatus.LIVING,
    generation: 3,
    branchId: 'b-001',
    branchName: 'कास्की शाखा',
    birthYearBs: 2015,
    isClaimed: false
  },
  {
    id: 'p-302',
    primaryNameNepali: 'गोविन्द अधिकारी',
    primaryNameEnglish: 'Govinda Adhikari',
    gender: Gender.MALE,
    livingStatus: LivingStatus.LIVING,
    generation: 3,
    branchId: 'b-001',
    branchName: 'कास्की शाखा',
    birthYearBs: 2020,
    isClaimed: false
  },
  // Generation 4: Current Generation (User & Cousins)
  {
    id: 'p-401',
    primaryNameNepali: 'दिनेश अधिकारी',
    primaryNameEnglish: 'Dinesh Adhikari',
    gender: Gender.MALE,
    livingStatus: LivingStatus.LIVING,
    generation: 4,
    branchId: 'b-001',
    branchName: 'कास्की शाखा',
    birthYearBs: 2045,
    isClaimed: true,
    claimedByUserId: 'u-401'
  },
  {
    id: 'p-402',
    primaryNameNepali: 'सुरेश अधिकारी',
    primaryNameEnglish: 'Suresh Adhikari',
    gender: Gender.MALE,
    livingStatus: LivingStatus.LIVING,
    generation: 4,
    branchId: 'b-001',
    branchName: 'कास्की शाखा',
    birthYearBs: 2048,
    isClaimed: false
  }
];

export const mockUsers = [
  {
    id: 'u-401',
    phoneNumber: '9841000001',
    roles: [Role.VERIFIED_MEMBER],
    personId: 'p-401',
    isClaimed: true,
    isProfileComplete: true
  },
  {
    id: 'u-admin',
    phoneNumber: '9841000099',
    roles: [Role.SUPER_ADMIN, Role.BRANCH_ADMIN],
    personId: null,
    isClaimed: false,
    isProfileComplete: true
  }
];
