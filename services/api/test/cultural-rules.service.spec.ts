import { CulturalRulesService } from '../src/modules/cultural-rules/cultural-rules.service';
import { RuleSetStatus, RuleType } from '@kashyap/contracts';

describe('CulturalRulesService (Kinship Engine & Open Gate HG-002 Governance)', () => {
  let culturalRulesService: CulturalRulesService;
  let mockDb: any;
  let mockPersonRepo: any;

  beforeEach(() => {
    mockDb = {
      query: jest.fn(async (sql, params) => {
        if (sql.includes('FROM domain_rulesets')) {
          return {
            rows: [
              {
                id: 'ruleset-01',
                rule_type: params ? params[0] : 'NATA_SAINO',
                status: 'ACTIVE',
                version: '1.0',
                effective_from: new Date(Date.now() - 100000).toISOString(),
                signed_by_reviewer_id: 'u-rev-01',
                signed_by_authority_id: 'u-auth-01',
              },
            ],
          };
        }
        if (sql.includes('FROM parent_child_links WHERE parent_person_id = $1 AND child_person_id = $2')) {
          if (params[0] === 'p-301' && params[1] === 'p-401') {
            return { rows: [{ parent_person_id: 'p-301', child_person_id: 'p-401' }] };
          }
          return { rows: [] };
        }
        if (sql.includes('FROM parent_child_links p1')) {
          return { rows: [{ match: 1 }] };
        }
        return { rows: [] };
      }),
    };

    mockPersonRepo = {
      findById: jest.fn(async (id) => {
        if (id === 'p-401') return { id, gender: 'MALE', generation: 4, birth_year_bs: 2045 };
        if (id === 'p-301') return { id, gender: 'MALE', generation: 3, birth_year_bs: 2020 };
        if (id === 'p-201') return { id, gender: 'MALE', generation: 2, birth_year_bs: 1995 };
        if (id === 'p-402') return { id, gender: 'MALE', generation: 4, birth_year_bs: 2048 };
        return null;
      }),
    };

    culturalRulesService = new CulturalRulesService(mockDb, mockPersonRepo);
  });

  describe('Kinship Resolution & Terminology', () => {
    it('should compute kinship terminology for direct father path (F)', async () => {
      const res = await culturalRulesService.calculateKinship({
        fromPersonId: 'p-401',
        toPersonId: 'p-301',
      });

      expect(res.pathFound).toBe(true);
      expect(res.pathCode).toBe('F');
      expect(res.nataSainoNepali).toBe('बुबा');
      expect(res.nataSainoEnglish).toBe('Father');
      expect(res.isAuthorityApproved).toBe(true);
    });

    it('should compute kinship terminology for grandfather path (F.F)', async () => {
      const res = await culturalRulesService.calculateKinship({
        fromPersonId: 'p-401',
        toPersonId: 'p-201',
      });

      expect(res.pathFound).toBe(true);
      expect(res.pathCode).toBe('F.F');
      expect(res.nataSainoNepali).toContain('हजुरबुबा');
      expect(res.nataSainoEnglish).toBe('Paternal grandfather');
    });

    it('should compute kinship terminology for younger brother with alternative valid paths', async () => {
      const res = await culturalRulesService.calculateKinship({
        fromPersonId: 'p-401',
        toPersonId: 'p-402',
      });

      expect(res.pathFound).toBe(true);
      expect(res.pathCode).toBe('B.YOUNGER');
      expect(res.nataSainoNepali).toBe('भाइ');
      expect(res.nataSainoEnglish).toBe('Younger brother');
      expect(res.alternativePaths).toBeDefined();
      expect(res.alternativePaths?.length).toBeGreaterThan(0);
    });

    it('should handle self-kinship correctly', async () => {
      const res = await culturalRulesService.calculateKinship({
        fromPersonId: 'p-401',
        toPersonId: 'p-401',
      });

      expect(res.pathFound).toBe(true);
      expect(res.pathCode).toBe('Self');
      expect(res.nataSainoNepali).toBe('आफू');
    });
  });

  describe('Gotra Marriage Eligibility Guard', () => {
    it('should flag same-Gotra (Kashyap) marriages with warnings and elder consent requirements', async () => {
      const check = await culturalRulesService.checkMarriageEligibility('कश्यप', 'कश्यप');
      expect(check.status).toBe('AVAILABLE');
      expect(check.isEligible).toBe(false);
      expect(check.isSameGotra).toBe(true);
      expect(check.warningMessageNepali).toContain('सगोत्रीय');
      expect(check.overrideRequiresElderConsent).toBe(true);
    });

    it('should permit different Gotra marriages without warnings', async () => {
      const check = await culturalRulesService.checkMarriageEligibility('कश्यप', 'वशिष्ठ');
      expect(check.status).toBe('AVAILABLE');
      expect(check.isEligible).toBe(true);
      expect(check.isSameGotra).toBe(false);
      expect(check.warningMessageNepali).toBeUndefined();
    });
  });

  describe('2-Person Independent Review & Senior Final Approval Workflow', () => {
    it('should enforce 2-tier approval and separation of duties for cultural rules', async () => {
      const proposed = await culturalRulesService.proposeRule({
        ruleType: RuleType.NATA_SAINO,
        pathCode: 'E-B(o).S',
        nepaliTerm: 'भतिज (दाजुको छोरा)',
        englishTerm: 'Nephew (Elder Brother Son)',
        proposedByUserId: 'user-researcher-01',
        rationale: 'Canonical patrilineal nephew term validated against literature',
      });

      expect(proposed.status).toBe('PROPOSED');

      await expect(
        culturalRulesService.reviewRule({
          ruleId: proposed.id,
          reviewerUserId: 'user-researcher-01',
          reviewerNotes: 'Self endorsement',
          isEndorsed: true,
        }),
      ).rejects.toThrow('Separation of duties');

      const reviewed = await culturalRulesService.reviewRule({
        ruleId: proposed.id,
        reviewerUserId: 'user-reviewer-02',
        reviewerNotes: 'Genealogical textual evidence verified',
        isEndorsed: true,
      });

      expect(reviewed.status).toBe('REVIEWED');

      const approved = await culturalRulesService.approveRule({
        ruleId: proposed.id,
        seniorAuthorityUserId: 'user-senior-elder-03',
        authorityComments: 'Approved for clan canon',
        decision: 'APPROVED',
      });

      expect(approved.status).toBe('APPROVED');
    });
  });
});
