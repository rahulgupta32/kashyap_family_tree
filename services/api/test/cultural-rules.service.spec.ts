import { CulturalRulesService } from '../src/modules/cultural-rules/cultural-rules.service';
import { RuleSetStatus } from '@kashyap/contracts';

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
      expect(res.nataSainoEnglish).toBe('Paternal Grandfather');
    });

    it('should compute kinship terminology for younger brother path (B.YOUNGER)', async () => {
      const res = await culturalRulesService.calculateKinship({
        fromPersonId: 'p-401',
        toPersonId: 'p-402',
      });

      expect(res.pathFound).toBe(true);
      expect(res.pathCode).toBe('B.YOUNGER');
      expect(res.nataSainoNepali).toBe('भाइ');
      expect(res.nataSainoEnglish).toBe('Younger Brother');
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

  describe('Ruleset Versioning & Authority Gates (HG-002, HG-003)', () => {
    it('should return rulesets with DRAFT status until human authority signs off', async () => {
      const rulesets = await culturalRulesService.listRuleSets();
      expect(rulesets.length).toBeGreaterThan(0);
      const nsRuleset = rulesets[0];
      expect(nsRuleset.version).toBe('0.2');
      expect(nsRuleset.status).toBe(RuleSetStatus.DRAFT);
      expect(nsRuleset.rulesData.nataSaino?.length).toBeGreaterThan(15);
    });
  });
});
