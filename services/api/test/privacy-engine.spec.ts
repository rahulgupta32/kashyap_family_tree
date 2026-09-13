import { PrivacyEngineService } from '../src/modules/genealogy/privacy/privacy-engine.service';
import { Role, PrivacyVisibility, LivingStatus, Gender } from '@kashyap/contracts';

describe('PrivacyEngineService (Direct Unit Tests & Edge Cases)', () => {
  let service: PrivacyEngineService;

  beforeEach(() => {
    service = new PrivacyEngineService();
  });

  describe('1. getCurrentBsDate and Out-of-Range Handling', () => {
    it('should return valid BS date for contemporary Date (2026 AD -> 2082/2083 BS)', () => {
      const now = new Date('2026-04-14T00:00:00.000Z');
      const bs = service.getCurrentBsDate(now);
      expect(bs).not.toBeNull();
      expect(bs?.year).toBe(2083);
      expect(bs?.month).toBe(1);
      expect(bs?.day).toBe(1);
    });

    it('should return null for dates prior to BS 2000 (e.g., 1900 AD)', () => {
      const oldDate = new Date('1900-01-01T00:00:00.000Z');
      const bs = service.getCurrentBsDate(oldDate);
      expect(bs).toBeNull();
    });

    it('should return null for dates after BS 2090 (e.g., 2050 AD)', () => {
      const futureDate = new Date('2050-01-01T00:00:00.000Z');
      const bs = service.getCurrentBsDate(futureDate);
      expect(bs).toBeNull();
    });

    it('should return null for Invalid Date without throwing', () => {
      const invalidDate = new Date('invalid-date-string');
      const bs = service.getCurrentBsDate(invalidDate);
      expect(bs).toBeNull();
    });
  });

  describe('2. isMinorOrUncertainAge & Safe Null Dereferencing', () => {
    it('should produce restrictive uncertain-age classification (true) when current date is out of range without throwing', () => {
      const outOfRangeNow = new Date('1900-01-01T00:00:00.000Z');
      const livingPerson = {
        birth_year_bs: 2060,
        living_status: LivingStatus.LIVING,
      };

      expect(() => {
        const result = service.isMinorOrUncertainAge(livingPerson, outOfRangeNow);
        expect(result).toBe(true);
      }).not.toThrow();
    });

    it('should produce restrictive uncertain-age classification (true) for Invalid Date without throwing', () => {
      const invalidNow = new Date('invalid');
      const livingPerson = {
        birth_date_bs: '2075-01-01',
        living_status: LivingStatus.LIVING,
      };

      expect(() => {
        const result = service.isMinorOrUncertainAge(livingPerson, invalidNow);
        expect(result).toBe(true);
      }).not.toThrow();
    });

    it('should return false for deceased person regardless of birth date or invalid current date', () => {
      const deceasedPerson = {
        birth_date_bs: '2078-01-01',
        living_status: LivingStatus.DECEASED,
      };
      expect(service.isMinorOrUncertainAge(deceasedPerson)).toBe(false);
      expect(service.isMinorOrUncertainAge(deceasedPerson, new Date('1900-01-01'))).toBe(false);
    });

    it('should return true for living person with exact age < 18 on contemporary date', () => {
      const now2083 = new Date('2026-04-14T00:00:00.000Z'); // 2083-01-01 BS
      const minorPerson = {
        birth_date_bs: '2070-01-01', // Age ~13
        living_status: LivingStatus.LIVING,
      };
      expect(service.isMinorOrUncertainAge(minorPerson, now2083)).toBe(true);
    });

    it('should return false for living person with exact age >= 18 on contemporary date', () => {
      const now2083 = new Date('2026-04-14T00:00:00.000Z'); // 2083-01-01 BS
      const adultPerson = {
        birth_date_bs: '2050-01-01', // Age ~33
        living_status: LivingStatus.LIVING,
      };
      expect(service.isMinorOrUncertainAge(adultPerson, now2083)).toBe(false);
    });

    it('should treat boundary yearDiff <= 18 restrictively as uncertain when exact day is unknown', () => {
      const now2083 = new Date('2026-04-14T00:00:00.000Z'); // 2083 BS
      const boundaryPerson = {
        birth_year_bs: 2065, // 2083 - 2065 = 18 (could be 17 depending on month/day)
        living_status: LivingStatus.LIVING,
      };
      expect(service.isMinorOrUncertainAge(boundaryPerson, now2083)).toBe(true);

      const adultPerson = {
        birth_year_bs: 2060, // 2083 - 2060 = 23 > 18
        living_status: LivingStatus.LIVING,
      };
      expect(service.isMinorOrUncertainAge(adultPerson, now2083)).toBe(false);
    });

    it('should treat unknown birth year as uncertain age (true) by default', () => {
      const unknownAgePerson = {
        living_status: LivingStatus.LIVING,
      };
      expect(service.isMinorOrUncertainAge(unknownAgePerson)).toBe(true);
    });
  });

  describe('3. isAuthorizedAdmin Scoping & Mixed Roles', () => {
    it('should authorize Super Admin globally regardless of branch', () => {
      const viewer = { roles: [Role.SUPER_ADMIN] };
      expect(service.isAuthorizedAdmin(viewer, 'branch-1')).toBe(true);
      expect(service.isAuthorizedAdmin(viewer, 'branch-2')).toBe(true);
      expect(service.isAuthorizedAdmin(viewer, undefined)).toBe(true);
    });

    it('should authorize Branch Admin strictly for assigned branch', () => {
      const viewer = {
        roles: [Role.BRANCH_ADMIN],
        branchIds: ['branch-1'],
      };
      expect(service.isAuthorizedAdmin(viewer, 'branch-1')).toBe(true);
      expect(service.isAuthorizedAdmin(viewer, 'branch-2')).toBe(false);
    });

    it('should respect roleAssignments and deny administrative authority on secondary branch with lower role', () => {
      const viewer = {
        roles: [Role.BRANCH_ADMIN, Role.REGISTERED_USER],
        roleAssignments: [
          { role: Role.BRANCH_ADMIN, branchId: 'branch-kaski' },
          { role: Role.REGISTERED_USER, branchId: 'branch-tanahun' },
        ],
      };
      expect(service.isAuthorizedAdmin(viewer, 'branch-kaski')).toBe(true);
      expect(service.isAuthorizedAdmin(viewer, 'branch-tanahun')).toBe(false);
    });

    it('should reject unauthenticated or guest viewers', () => {
      expect(service.isAuthorizedAdmin(undefined, 'branch-1')).toBe(false);
      expect(service.isAuthorizedAdmin({ roles: [] }, 'branch-1')).toBe(false);
    });
  });

  describe('4. filterPersonDetail & Zero Admin Bypass on PRIVATE Fields', () => {
    const baseMinor = {
      id: 'p-minor-1',
      primaryNameNepali: 'दिपेश अधिकारी',
      primaryNameEnglish: 'Dipesh Adhikari',
      gender: Gender.MALE,
      livingStatus: LivingStatus.LIVING,
      generation: 4,
      branchId: 'b-kaski',
      birthYearBs: 2075,
      birthDateBs: '2075-02-15',
      birthPlace: 'पोखरा',
      moolGhar: 'कास्की',
      currentAddress: 'गोप्य ठेगाना पोखरा',
      isClaimed: true,
      claimedByUserId: 'user-minor-self',
      isMinorProtected: true,
      privacy: {
        phoneVisibility: PrivacyVisibility.PRIVATE,
        addressVisibility: PrivacyVisibility.PRIVATE,
        dobVisibility: PrivacyVisibility.PRIVATE,
      },
    };

    it('should allow self viewer to see all unmasked private fields', () => {
      const selfViewer = {
        userId: 'user-minor-self',
        roles: [Role.REGISTERED_USER],
      };
      const filtered = service.filterPersonDetail(baseMinor as any, selfViewer);
      expect(filtered.currentAddress).toBe('गोप्य ठेगाना पोखरा');
      expect(filtered.birthDateBs).toBe('2075-02-15');
      expect(filtered.claimedByUserId).toBe('user-minor-self');
    });

    it('should mask PRIVATE address and exact DOB even when viewed by Super Admin', () => {
      const superAdminViewer = {
        userId: 'user-admin-1',
        roles: [Role.SUPER_ADMIN],
      };
      const filtered = service.filterPersonDetail(baseMinor as any, superAdminViewer);
      expect(filtered.currentAddress).toBeUndefined(); // PRIVATE address masked
      expect(filtered.birthDateBs).toBe('2075 B.S.'); // exact DOB masked to year string
      expect(filtered.birthPlace).toBe('पोखरा'); // Admin facts visible
    });

    it('should mask all sensitive facts when viewed by Guest', () => {
      const guestViewer = {
        roles: [],
      };
      const filtered = service.filterPersonDetail(baseMinor as any, guestViewer);
      expect(filtered.currentAddress).toBeUndefined();
      expect(filtered.birthPlace).toBeUndefined();
      expect(filtered.moolGhar).toBeUndefined();
      expect(filtered.birthDateBs).toBe('2075 B.S.');
      expect(filtered.claimedByUserId).toBeUndefined();
    });
  });
});
