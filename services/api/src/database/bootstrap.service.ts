import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { UserRepository } from './repositories/user.repository';
import { BranchRepository } from './repositories/branch.repository';
import { Role } from '@kashyap/contracts';

@Injectable()
export class BootstrapService implements OnModuleInit {
  private readonly logger = new Logger(BootstrapService.name);

  constructor(
    private readonly userRepo: UserRepository,
    private readonly branchRepo: BranchRepository,
  ) {}

  async onModuleInit() {
    // 1. Seed Core Reference Branches (needed for foreign keys and branch lookups)
    try {
      await this.seedReferenceBranches();
    } catch (err: any) {
      this.logger.warn(`Reference branch seeding skipped or deferred: ${err.message}`);
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
      this.logger.warn(`Admin bootstrap skipped or deferred: ${err.message}`);
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
      const created = await this.branchRepo.create(b);
      seededBranches[b.code] = created.id;
    }
    return seededBranches;
  }

  async bootstrapDevelopmentAccounts(): Promise<void> {
    this.logger.log('Bootstrapping fictional development admin accounts (SEED_ADMINS=true)...');

    const seededBranches = await this.seedReferenceBranches();

    // 1. Super Admin: +9779800000001
    const superAdmin = await this.userRepo.findOrCreateByPhone('+9779800000001');
    await this.userRepo.setPhoneVerified(superAdmin.id, true);
    await this.userRepo.assignRole(superAdmin.id, Role.SUPER_ADMIN, null, superAdmin.id);

    // 2. Branch Admin (Kaski): +9779800000002
    const branchAdmin = await this.userRepo.findOrCreateByPhone('+9779800000002');
    await this.userRepo.setPhoneVerified(branchAdmin.id, true);
    await this.userRepo.assignRole(branchAdmin.id, Role.BRANCH_ADMIN, seededBranches['KASKI'], superAdmin.id);

    // 3. Branch Verifier (Kaski): +9779800000003
    const verifier = await this.userRepo.findOrCreateByPhone('+9779800000003');
    await this.userRepo.setPhoneVerified(verifier.id, true);
    await this.userRepo.assignRole(verifier.id, Role.BRANCH_VERIFIER, seededBranches['KASKI'], branchAdmin.id);

    // 4. Verified Member: +9779800000004
    const member = await this.userRepo.findOrCreateByPhone('+9779800000004');
    await this.userRepo.setPhoneVerified(member.id, true);
    await this.userRepo.assignRole(member.id, Role.VERIFIED_MEMBER, seededBranches['KASKI'], verifier.id);

    // 5. Suspended Account (for testing AUTH-FR-010): +9779800000099
    const suspended = await this.userRepo.findOrCreateByPhone('+9779800000099');
    await this.userRepo.setPhoneVerified(suspended.id, true);
    await this.userRepo.setSuspension(suspended.id, true, 'Test suspension for policy violation');

    this.logger.log('Fictional development accounts seeded successfully.');
  }
}
