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
    // In production, automatic bootstrap of fictional admin accounts is strictly skipped.
    if (process.env.NODE_ENV === 'production') {
      this.logger.log('Production mode: skipping automated fictional development bootstrap.');
      return;
    }

    try {
      await this.bootstrapDevelopmentData();
    } catch (err: any) {
      this.logger.warn(`Bootstrap initialization skipped or deferred: ${err.message}`);
    }
  }

  async bootstrapDevelopmentData(): Promise<void> {
    this.logger.log('Bootstrapping development branches and fictional admin accounts...');

    // 1. Seed Core Reference Branches
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

    // 2. Seed Fictional Development Accounts (Explicit named bootstrap accounts, AUTH-FR-012, BR-GOV-007)
    // Super Admin: +9779800000001
    const superAdmin = await this.userRepo.findOrCreateByPhone('+9779800000001');
    await this.userRepo.setPhoneVerified(superAdmin.id, true);
    await this.userRepo.assignRole(superAdmin.id, Role.SUPER_ADMIN, null, superAdmin.id);

    // Branch Admin (Kaski): +9779800000002
    const branchAdmin = await this.userRepo.findOrCreateByPhone('+9779800000002');
    await this.userRepo.setPhoneVerified(branchAdmin.id, true);
    await this.userRepo.assignRole(branchAdmin.id, Role.BRANCH_ADMIN, seededBranches['KASKI'], superAdmin.id);

    // Branch Verifier (Kaski): +9779800000003
    const verifier = await this.userRepo.findOrCreateByPhone('+9779800000003');
    await this.userRepo.setPhoneVerified(verifier.id, true);
    await this.userRepo.assignRole(verifier.id, Role.BRANCH_VERIFIER, seededBranches['KASKI'], branchAdmin.id);

    // Verified Member: +9779800000004
    const member = await this.userRepo.findOrCreateByPhone('+9779800000004');
    await this.userRepo.setPhoneVerified(member.id, true);
    await this.userRepo.assignRole(member.id, Role.VERIFIED_MEMBER, seededBranches['KASKI'], verifier.id);

    // Suspended Account (for testing AUTH-FR-010): +9779800000099
    const suspended = await this.userRepo.findOrCreateByPhone('+9779800000099');
    await this.userRepo.setPhoneVerified(suspended.id, true);
    await this.userRepo.setSuspension(suspended.id, true, 'Test suspension for policy violation');

    this.logger.log('Development bootstrap completed successfully.');
  }
}
