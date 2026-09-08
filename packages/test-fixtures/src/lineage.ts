import { Gender, LivingStatus, Role } from '@kashyap/contracts';

// ============================================================================
// SYNTHETIC TEST FIXTURES — STRICTLY FOR DEVELOPMENT AND TESTING ONLY
// DO NOT IMPORT OR SEED INTO PRODUCTION DATASETS
// ============================================================================

export const IS_SYNTHETIC_TEST_DATA = true;

export function ensureTestEnvironmentOnly(): void {
  if (process.env.NODE_ENV === 'production' && !process.env.ALLOW_SYNTHETIC_FIXTURES) {
    throw new Error('FATAL SECURITY ERROR: Synthetic test fixtures cannot be loaded in production environment.');
  }
}

export const mockBranches = [
  {
    id: 'b-001',
    nameNepali: 'कास्की शाखा',
    nameEnglish: 'Kaski Branch',
    description: 'मूल कास्की अधिकारी शाखा',
    moolGhar: 'कास्कीकोट',
    kuldevata: 'विन्ध्यवासिनी',
    isSynthetic: true
  },
  {
    id: 'b-002',
    nameNepali: 'लमजुङ शाखा',
    nameEnglish: 'Lamjung Branch',
    description: 'लमजुङ क्षेत्रका कश्यप अधिकारी',
    moolGhar: 'गाउँसहर',
    kuldevata: 'कालिका',
    isSynthetic: true
  }
];

export const mockPersons = [
  // Generation 1: Great-Grandfather
  {
    id: 'p-101',
    primaryNameNepali: 'रामचन्द्र अधिकारी (परीक्षण)',
    primaryNameEnglish: 'Ram Chandra Adhikari (Synthetic Test)',
    gender: Gender.MALE,
    livingStatus: LivingStatus.DECEASED,
    generation: 1,
    branchId: 'b-001',
    branchName: 'कास्की शाखा',
    birthYearBs: 1950,
    deathYearBs: 2025,
    isClaimed: false,
    isSynthetic: true
  },
  // Generation 2: Grandfather & Granduncle
  {
    id: 'p-201',
    primaryNameNepali: 'हरि प्रसाद अधिकारी (परीक्षण)',
    primaryNameEnglish: 'Hari Prasad Adhikari (Synthetic Test)',
    gender: Gender.MALE,
    livingStatus: LivingStatus.DECEASED,
    generation: 2,
    branchId: 'b-001',
    branchName: 'कास्की शाखा',
    birthYearBs: 1980,
    deathYearBs: 2055,
    isClaimed: false,
    isSynthetic: true
  },
  {
    id: 'p-202',
    primaryNameNepali: 'शिव प्रसाद अधिकारी (परीक्षण)',
    primaryNameEnglish: 'Shiva Prasad Adhikari (Synthetic Test)',
    gender: Gender.MALE,
    livingStatus: LivingStatus.DECEASED,
    generation: 2,
    branchId: 'b-001',
    branchName: 'कास्की शाखा',
    birthYearBs: 1985,
    deathYearBs: 2060,
    isClaimed: false,
    isSynthetic: true
  },
  // Generation 3: Father & Uncle
  {
    id: 'p-301',
    primaryNameNepali: 'कृष्ण बहादुर अधिकारी (परीक्षण)',
    primaryNameEnglish: 'Krishna Bahadur Adhikari (Synthetic Test)',
    gender: Gender.MALE,
    livingStatus: LivingStatus.LIVING,
    generation: 3,
    branchId: 'b-001',
    branchName: 'कास्की शाखा',
    birthYearBs: 2015,
    isClaimed: false,
    isSynthetic: true
  },
  {
    id: 'p-302',
    primaryNameNepali: 'गोविन्द अधिकारी (परीक्षण)',
    primaryNameEnglish: 'Govinda Adhikari (Synthetic Test)',
    gender: Gender.MALE,
    livingStatus: LivingStatus.LIVING,
    generation: 3,
    branchId: 'b-001',
    branchName: 'कास्की शाखा',
    birthYearBs: 2020,
    isClaimed: false,
    isSynthetic: true
  },
  // Generation 4: Current Generation (User & Cousins)
  {
    id: 'p-401',
    primaryNameNepali: 'दिनेश अधिकारी (परीक्षण)',
    primaryNameEnglish: 'Dinesh Adhikari (Synthetic Test)',
    gender: Gender.MALE,
    livingStatus: LivingStatus.LIVING,
    generation: 4,
    branchId: 'b-001',
    branchName: 'कास्की शाखा',
    birthYearBs: 2045,
    isClaimed: true,
    claimedByUserId: 'u-401',
    isSynthetic: true
  },
  {
    id: 'p-402',
    primaryNameNepali: 'सुरेश अधिकारी (परीक्षण)',
    primaryNameEnglish: 'Suresh Adhikari (Synthetic Test)',
    gender: Gender.MALE,
    livingStatus: LivingStatus.LIVING,
    generation: 4,
    branchId: 'b-001',
    branchName: 'कास्की शाखा',
    birthYearBs: 2048,
    isClaimed: false,
    isSynthetic: true
  }
];

export const mockUsers = [
  {
    id: 'u-401',
    phoneNumber: '9841000001',
    roles: [Role.VERIFIED_MEMBER],
    personId: 'p-401',
    isClaimed: true,
    isProfileComplete: true,
    isSynthetic: true
  },
  {
    id: 'u-admin',
    phoneNumber: '9841000099',
    roles: [Role.SUPER_ADMIN, Role.BRANCH_ADMIN],
    personId: null,
    isClaimed: false,
    isProfileComplete: true,
    isSynthetic: true
  }
];
