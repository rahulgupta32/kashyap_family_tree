import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { DatabaseService } from '../src/database/database.service';
import { CulturalRulesService } from '../src/modules/cultural-rules/cultural-rules.service';
import { RuleType, ErrorCode } from '@kashyap/contracts';

describe('Milestone 4: Cultural Rules, Observances & Open Gates Integration', () => {
  let moduleRef: TestingModule;
  let db: DatabaseService;
  let culturalRulesService: CulturalRulesService;

  beforeAll(async () => {
    process.env.USE_REAL_POSTGRES = 'true';
    delete process.env.USE_PG_MEM;
    process.env.DB_HOST = process.env.DB_HOST || '127.0.0.1';
    process.env.DB_PORT = process.env.DB_PORT || '5434';
    process.env.DB_USER = process.env.DB_USER || 'kashyap_user';
    process.env.DB_PASSWORD = process.env.DB_PASSWORD || 'kashyap_secure_dev_password';
    process.env.DB_NAME = process.env.DB_NAME || 'kashyap_db';

    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    const app = moduleRef.createNestApplication();
    await app.init();

    db = moduleRef.get<DatabaseService>(DatabaseService);
    culturalRulesService = moduleRef.get<CulturalRulesService>(CulturalRulesService);
  });

  afterAll(async () => {
    if (db) {
      await db.query("DELETE FROM cultural_articles WHERE slug IN ('kashyap-gotra-origin', 'kashyap-draft');");
    }
    if (moduleRef) {
      await moduleRef.close();
    }
  });

  describe('Open Gate HG-002: Nata/Saino Kinship & Marriage Guidance', () => {
    it('1. should return explicit UNAVAILABLE (RULE_6001) state when ruleset lacks authority signatures', async () => {
      // Ensure no active signed ruleset exists
      await db.query("DELETE FROM domain_rulesets WHERE rule_type = 'NATA_SAINO'");

      const result = await culturalRulesService.calculateKinship({
        fromPersonId: 'p-401',
        toPersonId: 'p-301',
      });

      expect(result.pathFound).toBe(false);
      expect(result.pathCode).toBe('UNAVAILABLE');
      expect(result.isAuthorityApproved).toBe(false);
      expect(result.statusNote).toContain('RULE_6001');
    });

    it('2. should return UNAVAILABLE for marriage guidance when unapproved, but never block tree links', async () => {
      await db.query("DELETE FROM domain_rulesets WHERE rule_type = 'MARRIAGE_ELIGIBILITY'");

      const marriageCheck = await culturalRulesService.checkMarriageEligibility('कश्यप', 'कश्यप');
      expect(marriageCheck.status).toBe('UNAVAILABLE');
      expect(marriageCheck.errorCode).toBe(ErrorCode.RULESET_NOT_APPROVED);
    });
  });

  describe('Open Gate HG-003: Jutho Observance Calculator', () => {
    it('3. should return explicit UNAVAILABLE (RULE_6001) without disclaimer bypass when ruleset is unapproved', async () => {
      await db.query("DELETE FROM domain_rulesets WHERE rule_type = 'JUTHO_SUTOK'");

      const juthoResult = await culturalRulesService.calculateJutho({
        deceasedPersonId: 'p-101',
        observerPersonId: 'p-401',
      });

      expect(juthoResult.status).toBe('UNAVAILABLE');
      expect(juthoResult.errorCode).toBe(ErrorCode.RULESET_NOT_APPROVED);
    });
  });

  describe('Open Gate HG-004: Tithi & Shraddha Calculator', () => {
    it('4. should return explicit UNAVAILABLE (SYS_9005) without solar-anniversary fallback when unconfigured', async () => {
      const tithiResult = await culturalRulesService.calculateTithi({
        yearBs: 2083,
        monthBs: 6,
        tithiNumber: 15,
        paksha: 'KRISHNA',
      });

      expect(tithiResult.status).toBe('UNAVAILABLE');
      expect(tithiResult.errorCode).toBe(ErrorCode.EXTERNAL_PROVIDER_ERROR);
    });
  });

  describe('Open Gate HG-005: Cultural Content Repository', () => {
    it('5. should expose published articles and filter out drafts', async () => {
      await db.query(
        "INSERT INTO cultural_articles (slug, title_nepali, title_english, content_nepali, content_english, category, lifecycle_state, published_at) VALUES ('kashyap-gotra-origin', 'कश्यप गोत्रको उत्पत्ति', 'Origin of Kashyap Gotra', '...', '...', 'RITUAL', 'PUBLISHED', NOW())",
      );
      await db.query(
        "INSERT INTO cultural_articles (slug, title_nepali, title_english, content_nepali, content_english, category, lifecycle_state) VALUES ('kashyap-draft', 'मस्यौदा लेख', 'Draft Article', '...', '...', 'HISTORY', 'DRAFT')",
      );

      const published = await culturalRulesService.listPublishedArticles();
      expect(published.length).toBeGreaterThan(0);
      expect(published.every((a: any) => a.lifecycle_state === 'PUBLISHED')).toBe(true);
    });
  });
});
