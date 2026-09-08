import { CulturalRulesService } from '../src/modules/cultural-rules/cultural-rules.service';

describe('CulturalRulesService (Unit Tests & Open Gate Safety)', () => {
  let culturalRulesService: CulturalRulesService;

  beforeEach(() => {
    culturalRulesService = new CulturalRulesService();
  });

  it('should compute kinship terminology and flag unapproved rules with Open Gate notice', async () => {
    const res = await culturalRulesService.calculateKinship({
      fromPersonId: 'p-401',
      toPersonId: 'p-301',
    });

    expect(res.pathFound).toBe(true);
    expect(res.pathCode).toBe('F');
    expect(res.nataSainoNepali).toBe('बुबा');
    expect(res.nataSainoEnglish).toBe('Father');
    expect(res.isAuthorityApproved).toBe(false); // Safety Gate HG-002
    expect(res.statusNote).toContain('Open Gate HG-002');
  });

  it('should list rulesets with DRAFT status', async () => {
    const rulesets = await culturalRulesService.listRuleSets();
    expect(rulesets.length).toBeGreaterThan(0);
    expect(rulesets[0].status).toBe('DRAFT');
  });
});
