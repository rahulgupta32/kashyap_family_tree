import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { DatabaseService } from './database.service';
import { PersonRepository } from './repositories/person.repository';
import { GenealogyLinkRepository } from './repositories/genealogy-link.repository';
import { Logger } from '@nestjs/common';
import { Gender, LivingStatus, ParentType, SpouseStatus, Role } from '@kashyap/contracts';

/**
 * REPRODUCIBLE DEVELOPMENT SEED COMMAND
 * 
 * Creates an explicitly fictional, multi-generation Kashyap Adhikari family dataset
 * in PostgreSQL for local testing, frontend verification, and API evaluation.
 * 
 * GUARD: Strictly prohibited from running in production (NODE_ENV=production).
 * ALL NAMES ARE EXPLICITLY MARKED AS "(काल्पनिक/Fictional)".
 */
async function seedDevelopmentDatabase() {
  const logger = new Logger('SeedDevelopmentDatabase');

  if (process.env.NODE_ENV === 'production') {
    logger.error('FATAL SECURITY GUARD: Seeding cannot be executed in production environment!');
    process.exit(1);
  }

  logger.log('Bootstrapping application context for database seeding...');
  const app = await NestFactory.createApplicationContext(AppModule);

  const db = app.get(DatabaseService);
  const personRepo = app.get(PersonRepository);
  const linkRepo = app.get(GenealogyLinkRepository);

  try {
    logger.log('Verifying database readiness...');
    if (!db.isReady()) {
      throw new Error('Database is not ready or connected.');
    }

    // 1. Seed Branches
    logger.log('Seeding branches...');
    const branches = [
      {
        id: 'b0000000-0000-0000-0000-000000000001',
        name_nepali: 'कास्की शाखा (काल्पनिक)',
        name_english: 'Kaski Branch (Fictional)',
        code: 'KASKI-FICT-01',
        mool_ghar: 'कास्कीकोट',
        kuldevata: 'विन्ध्यवासिनी',
      },
      {
        id: 'b0000000-0000-0000-0000-000000000002',
        name_nepali: 'लमजुङ शाखा (काल्पनिक)',
        name_english: 'Lamjung Branch (Fictional)',
        code: 'LAMJUNG-FICT-02',
        mool_ghar: 'गाउँसहर',
        kuldevata: 'कालिका',
      },
      {
        id: 'b0000000-0000-0000-0000-000000000003',
        name_nepali: 'तनहुँ शाखा (काल्पनिक)',
        name_english: 'Tanahun Branch (Fictional)',
        code: 'TANAHUN-FICT-03',
        mool_ghar: 'बन्दीपुर',
        kuldevata: 'खड्गदेवी',
      },
    ];

    for (const b of branches) {
      await db.query(
        `INSERT INTO branches (id, name_nepali, name_english, code, mool_ghar, kuldevata)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (code) DO UPDATE SET
           name_nepali = EXCLUDED.name_nepali,
           name_english = EXCLUDED.name_english,
           mool_ghar = EXCLUDED.mool_ghar,
           kuldevata = EXCLUDED.kuldevata`,
        [b.id, b.name_nepali, b.name_english, b.code, b.mool_ghar, b.kuldevata],
      );
    }
    logger.log(`Seeded ${branches.length} branches.`);

    // 2. Check if persons already exist to be idempotent
    const countRes = await db.query('SELECT COUNT(*) as count FROM persons');
    const existingCount = parseInt(countRes.rows[0].count, 10);
    if (existingCount > 0) {
      logger.log(`Database already contains ${existingCount} persons. Re-seeding relations idempotently.`);
    }

    // 3. Define Fictional Persons (4 Generations)
    const fictionalPersons = [
      // Gen 1: Patriarch
      {
        id: 'a0000001-0000-0000-0000-000000000101',
        generation: 1,
        gender: Gender.MALE,
        living_status: LivingStatus.DECEASED,
        branch_id: branches[0].id,
        birth_year_bs: 1950,
        death_year_bs: 2025,
        gotra: 'कश्यप',
        kuldevata: 'विन्ध्यवासिनी',
        mool_ghar: 'कास्कीकोट',
        names: [
          { language: 'ne' as const, first_name: 'रामचन्द्र', last_name: 'अधिकारी (काल्पनिक)', full_name: 'रामचन्द्र अधिकारी (काल्पनिक)', is_primary: true },
          { language: 'en' as const, first_name: 'Ram Chandra', last_name: 'Adhikari (Fictional)', full_name: 'Ram Chandra Adhikari (Fictional)', is_primary: false },
        ],
      },
      // Gen 1: Matriarch (Spouse)
      {
        id: 'a0000001-0000-0000-0000-000000000102',
        generation: 1,
        gender: Gender.FEMALE,
        living_status: LivingStatus.DECEASED,
        branch_id: branches[0].id,
        birth_year_bs: 1955,
        death_year_bs: 2030,
        gotra: 'कश्यप',
        kuldevata: 'विन्ध्यवासिनी',
        mool_ghar: 'कास्कीकोट',
        names: [
          { language: 'ne' as const, first_name: 'लक्ष्मी', last_name: 'अधिकारी (काल्पनिक)', full_name: 'लक्ष्मी अधिकारी (काल्पनिक)', is_primary: true },
          { language: 'en' as const, first_name: 'Laxmi', last_name: 'Adhikari (Fictional)', full_name: 'Laxmi Adhikari (Fictional)', is_primary: false },
        ],
      },
      // Gen 2: Sons of Gen 1
      {
        id: 'a0000002-0000-0000-0000-000000000201',
        generation: 2,
        gender: Gender.MALE,
        living_status: LivingStatus.DECEASED,
        branch_id: branches[0].id,
        birth_year_bs: 1980,
        death_year_bs: 2055,
        gotra: 'कश्यप',
        kuldevata: 'विन्ध्यवासिनी',
        mool_ghar: 'कास्कीकोट',
        names: [
          { language: 'ne' as const, first_name: 'हरि प्रसाद', last_name: 'अधिकारी (काल्पनिक)', full_name: 'हरि प्रसाद अधिकारी (काल्पनिक)', is_primary: true },
          { language: 'en' as const, first_name: 'Hari Prasad', last_name: 'Adhikari (Fictional)', full_name: 'Hari Prasad Adhikari (Fictional)', is_primary: false },
        ],
      },
      {
        id: 'a0000002-0000-0000-0000-000000000202',
        generation: 2,
        gender: Gender.MALE,
        living_status: LivingStatus.DECEASED,
        branch_id: branches[0].id,
        birth_year_bs: 1985,
        death_year_bs: 2060,
        gotra: 'कश्यप',
        kuldevata: 'विन्ध्यवासिनी',
        mool_ghar: 'कास्कीकोट',
        names: [
          { language: 'ne' as const, first_name: 'शिव प्रसाद', last_name: 'अधिकारी (काल्पनिक)', full_name: 'शिव प्रसाद अधिकारी (काल्पनिक)', is_primary: true },
          { language: 'en' as const, first_name: 'Shiva Prasad', last_name: 'Adhikari (Fictional)', full_name: 'Shiva Prasad Adhikari (Fictional)', is_primary: false },
        ],
      },
      // Gen 3: Sons of Hari Prasad
      {
        id: 'a0000003-0000-0000-0000-000000000301',
        generation: 3,
        gender: Gender.MALE,
        living_status: LivingStatus.LIVING,
        branch_id: branches[0].id,
        birth_year_bs: 2015,
        gotra: 'कश्यप',
        kuldevata: 'विन्ध्यवासिनी',
        mool_ghar: 'कास्कीकोट',
        names: [
          { language: 'ne' as const, first_name: 'कृष्ण बहादुर', last_name: 'अधिकारी (काल्पनिक)', full_name: 'कृष्ण बहादुर अधिकारी (काल्पनिक)', is_primary: true },
          { language: 'en' as const, first_name: 'Krishna Bahadur', last_name: 'Adhikari (Fictional)', full_name: 'Krishna Bahadur Adhikari (Fictional)', is_primary: false },
        ],
      },
      {
        id: 'a0000003-0000-0000-0000-000000000302',
        generation: 3,
        gender: Gender.MALE,
        living_status: LivingStatus.LIVING,
        branch_id: branches[0].id,
        birth_year_bs: 2020,
        gotra: 'कश्यप',
        kuldevata: 'विन्ध्यवासिनी',
        mool_ghar: 'कास्कीकोट',
        names: [
          { language: 'ne' as const, first_name: 'गोविन्द', last_name: 'अधिकारी (काल्पनिक)', full_name: 'गोविन्द अधिकारी (काल्पनिक)', is_primary: true },
          { language: 'en' as const, first_name: 'Govinda', last_name: 'Adhikari (Fictional)', full_name: 'Govinda Adhikari (Fictional)', is_primary: false },
        ],
      },
      // Gen 4: Sons of Krishna Bahadur
      {
        id: 'a0000004-0000-0000-0000-000000000401',
        generation: 4,
        gender: Gender.MALE,
        living_status: LivingStatus.LIVING,
        branch_id: branches[0].id,
        birth_year_bs: 2045,
        gotra: 'कश्यप',
        kuldevata: 'विन्ध्यवासिनी',
        mool_ghar: 'कास्कीकोट',
        names: [
          { language: 'ne' as const, first_name: 'दिनेश', last_name: 'अधिकारी (काल्पनिक)', full_name: 'दिनेश अधिकारी (काल्पनिक)', is_primary: true },
          { language: 'en' as const, first_name: 'Dinesh', last_name: 'Adhikari (Fictional)', full_name: 'Dinesh Adhikari (Fictional)', is_primary: false },
        ],
      },
      {
        id: 'a0000004-0000-0000-0000-000000000402',
        generation: 4,
        gender: Gender.MALE,
        living_status: LivingStatus.LIVING,
        branch_id: branches[0].id,
        birth_year_bs: 2048,
        gotra: 'कश्यप',
        kuldevata: 'विन्ध्यवासिनी',
        mool_ghar: 'कास्कीकोट',
        names: [
          { language: 'ne' as const, first_name: 'सुरेश', last_name: 'अधिकारी (काल्पनिक)', full_name: 'सुरेश अधिकारी (काल्पनिक)', is_primary: true },
          { language: 'en' as const, first_name: 'Suresh', last_name: 'Adhikari (Fictional)', full_name: 'Suresh Adhikari (Fictional)', is_primary: false },
        ],
      },
    ];

    for (const p of fictionalPersons) {
      await db.query(
        `INSERT INTO persons (
           id, generation, gender, living_status, branch_id, birth_year_bs, death_year_bs, gotra, kuldevata, mool_ghar
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (id) DO UPDATE SET
           generation = EXCLUDED.generation,
           gender = EXCLUDED.gender,
           living_status = EXCLUDED.living_status,
           branch_id = EXCLUDED.branch_id,
           birth_year_bs = EXCLUDED.birth_year_bs,
           death_year_bs = EXCLUDED.death_year_bs`,
        [p.id, p.generation, p.gender, p.living_status, p.branch_id, p.birth_year_bs || null, p.death_year_bs || null, p.gotra, p.kuldevata, p.mool_ghar],
      );

      await db.query(`DELETE FROM person_names WHERE person_id = $1`, [p.id]);
      for (const n of p.names) {
        await db.query(
          `INSERT INTO person_names (person_id, language, first_name, last_name, full_name, is_primary)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [p.id, n.language, n.first_name, n.last_name, n.full_name, n.is_primary],
        );
      }
    }
    logger.log(`Seeded ${fictionalPersons.length} fictional persons across 4 generations.`);

    // 4. Seed Lineage Links
    logger.log('Seeding lineage links...');
    const parentLinks = [
      // Gen 1 -> Gen 2
      { parent: fictionalPersons[0].id, child: fictionalPersons[2].id }, // Ram Chandra -> Hari Prasad
      { parent: fictionalPersons[0].id, child: fictionalPersons[3].id }, // Ram Chandra -> Shiva Prasad
      // Gen 2 -> Gen 3
      { parent: fictionalPersons[2].id, child: fictionalPersons[4].id }, // Hari Prasad -> Krishna Bahadur
      { parent: fictionalPersons[2].id, child: fictionalPersons[5].id }, // Hari Prasad -> Govinda
      // Gen 3 -> Gen 4
      { parent: fictionalPersons[4].id, child: fictionalPersons[6].id }, // Krishna Bahadur -> Dinesh
      { parent: fictionalPersons[4].id, child: fictionalPersons[7].id }, // Krishna Bahadur -> Suresh
    ];

    for (const pl of parentLinks) {
      await linkRepo.addParentLink(pl.parent, pl.child, ParentType.BIOLOGICAL);
    }
    logger.log(`Seeded ${parentLinks.length} parent-child links.`);

    // 5. Seed Spouses
    await linkRepo.addSpouseLink(fictionalPersons[0].id, fictionalPersons[1].id, SpouseStatus.CURRENT);
    logger.log('Seeded spouse link between Gen 1 Ram Chandra and Laxmi.');

    logger.log('Development database seeded successfully with explicitly fictional data.');
  } finally {
    await app.close();
  }
}

seedDevelopmentDatabase().catch((err) => {
  console.error('Seeding failed:', err);
  process.exit(1);
});
