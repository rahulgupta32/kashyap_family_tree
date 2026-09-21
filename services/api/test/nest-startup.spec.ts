import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { GenealogyService } from '../src/modules/genealogy/genealogy.service';
import { PersonRepository } from '../src/database/repositories/person.repository';
import { GenealogyLinkRepository } from '../src/database/repositories/genealogy-link.repository';
import { DatabaseService } from '../src/database/database.service';

describe('Nest Application Dependency Graph & Startup Regression', () => {
  let moduleRef: TestingModule;

  beforeAll(async () => {
    // Set USE_PG_MEM=true so the Nest DI graph can initialize without requiring a live PG instance in unit tests
    process.env.USE_PG_MEM = 'true';
    delete process.env.DATABASE_URL;

    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
  });

  afterAll(async () => {
    delete process.env.USE_PG_MEM;
    if (moduleRef) {
      await moduleRef.close();
    }
  });

  it('should compile the complete AppModule dependency graph without DI errors', () => {
    expect(moduleRef).toBeDefined();
  });

  it('should successfully resolve GenealogyService with all required dependencies injected', () => {
    const genealogyService = moduleRef.get<GenealogyService>(GenealogyService);
    expect(genealogyService).toBeDefined();

    const personRepo = moduleRef.get<PersonRepository>(PersonRepository);
    expect(personRepo).toBeDefined();

    const linkRepo = moduleRef.get<GenealogyLinkRepository>(GenealogyLinkRepository);
    expect(linkRepo).toBeDefined();

    const dbService = moduleRef.get<DatabaseService>(DatabaseService);
    expect(dbService).toBeDefined();

    // Verify it is NOT in fixture mode
    expect((genealogyService as any).isTestFixtureMode).toBe(false);
  });
});
