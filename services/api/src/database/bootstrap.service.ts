import { Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { DatabaseService } from './database.service';
import { UserRepository } from './repositories/user.repository';
import { BranchRepository } from './repositories/branch.repository';
import { MigrationService } from './migration.service';
import { Role } from '@kashyap/contracts';

@Injectable()
export class BootstrapService implements OnModuleInit {
  private readonly logger = new Logger(BootstrapService.name);

  constructor(
    private readonly userRepo: UserRepository,
    private readonly branchRepo: BranchRepository,
    @Optional() private readonly migrationService?: MigrationService,
    @Optional() private readonly db?: DatabaseService,
  ) {}

  private get dbClient(): DatabaseService {
    return this.db || (this.userRepo as any).db;
  }

  async onModuleInit() {
    // 0. Explicitly await coordinated database migrations before any seeding or repository operations
    if (this.migrationService) {
      try {
        await this.migrationService.runMigrations();
      } catch (err: any) {
        this.logger.error(`Database migration initialization failed: ${err.message}`, err.stack);
        throw err;
      }
    }

    // 1. Seed Core Reference Branches (needed for foreign keys and branch lookups)
    try {
      await this.seedReferenceBranches();
    } catch (err: any) {
      this.logger.error(`Reference branch seeding failed: ${err.message}`, err.stack);
      throw err;
    }

    // 2. Fictional Admin Seeding: must be an explicit opt-in command (SEED_ADMINS=true),
    // disabled by default and rejected in production.
    const isProduction = process.env.NODE_ENV === 'production';
    const seedAdmins = process.env.SEED_ADMINS === 'true';

    if (seedAdmins && isProduction) {
      const errMsg =
        'FATAL SECURITY VIOLATION: Fictional admin account seeding (SEED_ADMINS=true) is strictly prohibited in production mode.';
      this.logger.error(errMsg);
      throw new Error(errMsg);
    }

    if (!seedAdmins) {
      this.logger.log('Fictional admin account seeding is disabled by default (SEED_ADMINS != true).');
      return;
    }

    try {
      await this.bootstrapDevelopmentAccounts();
    } catch (err: any) {
      this.logger.error(`Admin bootstrap failed: ${err.message}`, err.stack);
      throw err;
    }
  }

  async seedReferenceBranches(): Promise<Record<string, string>> {
    const branches = [
      {
        code: 'KASKI',
        nameNepali: 'कास्की शाखा',
        nameEnglish: 'Kaski Branch',
        moolGhar: 'कास्की पोखरा, हेम्जा',
        kuldevata: 'कुलदेवता मन्दिर, कास्की',
        description: 'Kaski regional ancestral lineage branch',
      },
      {
        code: 'LAMJUNG',
        nameNepali: 'लमजुङ शाखा',
        nameEnglish: 'Lamjung Branch',
        moolGhar: 'लमजुङ राइनास',
        kuldevata: 'लमजुङ कुल मन्दिर',
        description: 'Lamjung regional ancestral lineage branch',
      },
      {
        code: 'TANAHUN',
        nameNepali: 'तनहुँ शाखा',
        nameEnglish: 'Tanahun Branch',
        moolGhar: 'तनहुँ बन्दीपुर',
        kuldevata: 'तनहुँ कुल मन्दिर',
        description: 'Tanahun regional ancestral lineage branch',
      },
      {
        code: 'SYANGJA',
        nameNepali: 'स्याङ्जा शाखा',
        nameEnglish: 'Syangja Branch',
        moolGhar: 'स्याङ्जा पुतलीबजार',
        kuldevata: 'स्याङ्जा कुल मन्दिर',
        description: 'Syangja regional ancestral lineage branch',
      },
      {
        code: 'KATHMANDU',
        nameNepali: 'काठमाडौँ उपत्यका सम्पर्क',
        nameEnglish: 'Kathmandu Valley Branch',
        moolGhar: 'काठमाडौँ',
        kuldevata: 'पशुपतिनाथ / कुलपीठ',
        description: 'Kathmandu Valley liaison and urban diaspora branch',
      },
    ];

    const seededBranches: Record<string, string> = {};

    for (const b of branches) {
      const existing = await this.branchRepo.findByCode(b.code);
      if (existing) {
        seededBranches[b.code] = existing.id;
      } else {
        const created = await this.branchRepo.create(b);
        seededBranches[b.code] = created.id;
        this.logger.log(`Seeded reference branch: ${b.nameEnglish} (${b.code})`);
      }
    }

    return seededBranches;
  }

  async bootstrapDevelopmentAccounts(): Promise<void> {
    this.logger.log('Bootstrapping development accounts (SEED_ADMINS=true)...');

    const kaskiBranch = await this.branchRepo.findByCode('KASKI');
    const branchId = kaskiBranch?.id || null;

    // 1. Super Admin Account
    const superAdminPhone = '+9779800000001';
    const superAdmin = await this.userRepo.findOrCreateByPhone(superAdminPhone, 'ne');
    await this.userRepo.setPhoneVerified(superAdmin.id, true);
    this.logger.log(`Ensured Super Admin account: ${superAdmin.id}`);

    const superAdminRoles = await this.userRepo.getUserRoles(superAdmin.id);
    if (!superAdminRoles.some((r) => r.role === Role.SUPER_ADMIN)) {
      await this.userRepo.assignRole(superAdmin.id, Role.SUPER_ADMIN, null, null);
      this.logger.log(`Assigned SUPER_ADMIN role to user ${superAdmin.id}`);
    }

    if (!superAdmin.person_id && branchId) {
      const pRes = await this.dbClient.query(
        `INSERT INTO persons (gender, living_status, generation, branch_id, current_address, is_claimed, claimed_user_id)
         VALUES ('MALE', 'LIVING', 4, $1, 'पोखरा, कास्की', TRUE, $2)
         RETURNING id`,
        [branchId, superAdmin.id],
      );
      const personId = pRes.rows[0].id;
      await this.dbClient.query(
        `INSERT INTO person_names (person_id, language, first_name, last_name, full_name, is_primary)
         VALUES ($1, 'ne', 'रामेश्वर', 'अधिकारी', 'रामेश्वर अधिकारी', TRUE)`,
        [personId],
      );
      await this.dbClient.query('UPDATE user_accounts SET person_id = $1 WHERE id = $2', [personId, superAdmin.id]);
    }

    // 2. Branch Admin Account
    const branchAdminPhone = '+9779800000002';
    const branchAdmin = await this.userRepo.findOrCreateByPhone(branchAdminPhone, 'ne');
    await this.userRepo.setPhoneVerified(branchAdmin.id, true);
    this.logger.log(`Ensured Branch Admin account: ${branchAdmin.id}`);

    const branchAdminRoles = await this.userRepo.getUserRoles(branchAdmin.id);
    if (!branchAdminRoles.some((r) => r.role === Role.BRANCH_ADMIN)) {
      await this.userRepo.assignRole(branchAdmin.id, Role.BRANCH_ADMIN, branchId, null);
      this.logger.log(`Assigned BRANCH_ADMIN role (branch: ${branchId}) to user ${branchAdmin.id}`);
    }

    this.logger.log('Development account bootstrap completed.');
  }
}
