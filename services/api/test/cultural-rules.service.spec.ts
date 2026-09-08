import { CulturalRulesService } from '../src/modules/cultural-rules/cultural-rules.service';
import { RuleSetStatus, RuleType } from '@kashyap/contracts';

describe('CulturalRulesService (Kinship Engine & Open Gate HG-002 Governance)', () => {
  let culturalRulesService: CulturalRulesService;

  beforeEach(() => {
    culturalRulesService = new CulturalRulesService();
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
      expect(res.isAuthorityApproved).toBe(false); // Open Gate HG-002: safety disabled by default
      expect(res.statusNote).toContain('Open Gate HG-002');
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

    it('should provide neutral fallback terminology when path is unmapped or distant', async () => {
      const res = await culturalRulesService.calculateKinship({
        fromPersonId: 'p-401',
        toPersonId: 'p-unknown',
      });

      expect(res.pathFound).toBe(true);
      expect(res.nataSainoNepali).toBeDefined();
      expect(res.nataSainoEnglish).toBeDefined();
    });
  });

  describe('Gotra Marriage Eligibility Guard', () => {
    it('should flag same-Gotra (Kashyap) marriages with warnings and elder consent requirements', async () => {
      const check = await culturalRulesService.checkMarriageEligibility('कश्यप', 'कश्यप');
      expect(check.isEligible).toBe(false);
      expect(check.isSameGotra).toBe(true);
      expect(check.warningMessageNepali).toContain('सगोत्रीय');
      expect(check.overrideRequiresElderConsent).toBe(true);
    });

    it('should permit different Gotra marriages without warnings', async () => {
      const check = await culturalRulesService.checkMarriageEligibility('कश्यप', 'वशिष्ठ');
      expect(check.isEligible).toBe(true);
      expect(check.isSameGotra).toBe(false);
      expect(check.warningMessageNepali).toBeUndefined();
    });
  });

  describe('2-Person Independent Review & Senior Final Approval Workflow', () => {
    it('should enforce 2-tier approval and separation of duties for cultural rules', async () => {
      // 1. Propose rule
      const proposed = await culturalRulesService.proposeRule({
        ruleType: RuleType.NATA_SAINO,
        pathCode: 'E-B(o).S',
        nepaliTerm: 'भतिज (दाजुको छोरा)',
        englishTerm: 'Nephew (Elder Brother Son)',
        proposedByUserId: 'user-researcher-01',
        rationale: 'Canonical patrilineal nephew term validated against literature',
      });

      expect(proposed.status).toBe('PROPOSED');

      // 2. Proposer cannot review own rule
      await expect(
        culturalRulesService.reviewRule({
          ruleId: proposed.id,
          reviewerUserId: 'user-researcher-01',
          reviewerNotes: 'Self endorsement',
          isEndorsed: true,
        }),
      ).rejects.toThrow('Separation of duties');

      // 3. First-tier Cultural Reviewer endorses
      const reviewed = await culturalRulesService.reviewRule({
        ruleId: proposed.id,
        reviewerUserId: 'user-reviewer-02',
        reviewerNotes: 'Genealogical textual evidence verified',
        isEndorsed: true,
      });

      expect(reviewed.status).toBe('REVIEWED');

      // 4. Senior Authority gives final approval
      const approved = await culturalRulesService.approveRule({
        ruleId: proposed.id,
        seniorAuthorityUserId: 'user-senior-elder-03',
        authorityComments: 'Approved for clan canon',
        decision: 'APPROVED',
      });

      expect(approved.status).toBe('APPROVED');
    });
  });

  describe('Ruleset Versioning & Authority Gates (HG-002, HG-003)', () => {
    it('should return 71 canonical rulesets with DRAFT status until human authority signs off', async () => {
      const rulesets = await culturalRulesService.listRuleSets();
      expect(rulesets.length).toBeGreaterThan(0);
      const nsRuleset = rulesets[0];
      expect(nsRuleset.version).toBe('0.2');
      expect(nsRuleset.status).toBe(RuleSetStatus.DRAFT);
      expect(nsRuleset.rulesData.nataSaino?.length).toBe(71);
    });
  });
});
