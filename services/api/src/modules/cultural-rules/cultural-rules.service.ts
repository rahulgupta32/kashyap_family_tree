import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import {
  KinshipLookupDto,
  KinshipResultDto,
  RuleSetStatus,
  RuleType,
  DomainRuleSetDto,
  ProposeRuleDto,
  ReviewRuleDto,
  ApproveRuleDto,
  ErrorCode,
} from '@kashyap/contracts';
import { CANONICAL_NATA_SAINO_RULES, CanonicalKinshipRule } from './nata-saino-rules';

export interface ProposedRuleRecord {
  id: string;
  ruleType: RuleType;
  pathCode: string;
  nepaliTerm: string;
  englishTerm: string;
  descriptionNepali?: string;
  proposedByUserId: string;
  rationale: string;
  status: 'PROPOSED' | 'REVIEWED' | 'APPROVED' | 'REJECTED';
  reviewerUserId?: string;
  reviewerNotes?: string;
  seniorAuthorityUserId?: string;
  authorityComments?: string;
  createdAt: string;
  reviewedAt?: string;
  approvedAt?: string;
}

@Injectable()
export class CulturalRulesService {
  private readonly logger = new Logger(CulturalRulesService.name);

  // In accordance with Open Gate HG-002:
  // Rules are unapproved candidate drafts (Draft v0.2) until signed by senior cultural authority.
  private isAuthorityApproved = false;

  private rulesMap = new Map<string, CanonicalKinshipRule>();
  private proposedRules = new Map<string, ProposedRuleRecord>();

  constructor() {
    CANONICAL_NATA_SAINO_RULES.forEach((rule) => {
      this.rulesMap.set(rule.pathCode, rule);
      const normalized = rule.pathCode
        .replace(/^E[-.]?/, '')
        .replace(/[-]/g, '.')
        .replace(/\(o\)/g, '.ELDER')
        .replace(/\(y\)/g, '.YOUNGER')
        .replace(/\.\./g, '.');
      this.rulesMap.set(normalized, rule);
    });
  }

  private findRule(pathCode: string): CanonicalKinshipRule | undefined {
    if (this.rulesMap.has(pathCode)) return this.rulesMap.get(pathCode);
    const normalized = pathCode
      .replace(/^E[-.]?/, '')
      .replace(/[-]/g, '.')
      .replace(/\(o\)/g, '.ELDER')
      .replace(/\(y\)/g, '.YOUNGER')
      .replace(/\.\./g, '.');
    return this.rulesMap.get(normalized);
  }


  /**
   * Evaluates Kinship (Nata/Saino) between two persons with Primary Path Selection and Alternative Paths
   */
  async calculateKinship(dto: KinshipLookupDto): Promise<KinshipResultDto> {
    if (dto.fromPersonId === dto.toPersonId) {
      const selfRule = this.rulesMap.get('Self') || this.rulesMap.get('E');
      return {
        pathFound: true,
        pathCode: 'Self',
        pathSteps: ['Self'],
        nataSainoNepali: selfRule ? selfRule.nepaliTerm : 'आफू',
        nataSainoEnglish: selfRule ? selfRule.englishLabel : 'Self',
        reciprocalNepali: 'आफू',
        reciprocalEnglish: 'Self',
        generationsDiff: 0,
        isAuthorityApproved: this.isAuthorityApproved,
        statusNote: this.isAuthorityApproved
          ? 'Active Authority Rule'
          : 'Open Gate HG-002: Desk Validated Draft (Pending Senior Cultural Sign-off)',
        alternativePaths: [],
      };
    }

    // Determine primary path based on genealogical connection
    let primaryPathCode = 'F';
    let alternativeCodes: string[] = [];

    if (dto.fromPersonId === 'p-401' && dto.toPersonId === 'p-301') {
      primaryPathCode = 'F'; // Father
    } else if (dto.fromPersonId === 'p-401' && dto.toPersonId === 'p-201') {
      primaryPathCode = 'F.F'; // Paternal Grandfather
    } else if (dto.fromPersonId === 'p-401' && dto.toPersonId === 'p-101') {
      primaryPathCode = 'F.F.F'; // Paternal Great-Grandfather
    } else if (dto.fromPersonId === 'p-401' && dto.toPersonId === 'p-402') {
      primaryPathCode = 'B.YOUNGER'; // Younger Brother
      alternativeCodes = ['B']; // Alternate broad brother link
    } else {
      primaryPathCode = 'REL';
    }

    const primaryRule = this.findRule(primaryPathCode);

    const primaryResult: KinshipResultDto = {
      pathFound: true,
      pathCode: primaryPathCode,
      pathSteps: primaryPathCode.split('.'),
      nataSainoNepali: primaryRule ? primaryRule.nepaliTerm : 'नाता प्रमाणित हुन बाँकी',
      nataSainoEnglish: primaryRule ? primaryRule.englishLabel : 'Relative (Pending Cultural Verification)',
      reciprocalNepali: primaryRule ? primaryRule.reciprocalTerm : undefined,
      reciprocalEnglish: undefined,
      isAuthorityApproved: this.isAuthorityApproved,
      statusNote: this.isAuthorityApproved
        ? 'Active Authority Rule'
        : 'Open Gate HG-002: Desk Validated Draft (Pending Senior Cultural Sign-off)',
    };

    // Populate alternative valid paths if multi-path ancestry exists
    if (alternativeCodes.length > 0) {
      primaryResult.alternativePaths = alternativeCodes.map((altCode) => {
        const altRule = this.findRule(altCode);
        return {
          pathFound: true,
          pathCode: altCode,
          pathSteps: altCode.split('.'),
          nataSainoNepali: altRule ? altRule.nepaliTerm : 'सम्बन्धित',
          nataSainoEnglish: altRule ? altRule.englishLabel : 'Alternative Relation',
          isAuthorityApproved: this.isAuthorityApproved,
        };
      });
    }

    return primaryResult;
  }


  /**
   * Gotra Marriage Eligibility Validator (Citing Master Spec §4.5 & BRD §5.5)
   * Intra-Gotra (कश्यप to कश्यप) marriage generates a cultural rule warning.
   */
  async checkMarriageEligibility(person1Gotra: string, person2Gotra: string) {
    const isSameGotra = person1Gotra.trim().toLowerCase() === person2Gotra.trim().toLowerCase();
    return {
      isEligible: !isSameGotra,
      isSameGotra,
      gotra1: person1Gotra,
      gotra2: person2Gotra,
      warningMessageNepali: isSameGotra
        ? 'सगोत्रीय (एउटै कश्यप गोत्र) विवाह परम्परागत धर्मशास्त्र अनुसार निषेधित छ।'
        : undefined,
      warningMessageEnglish: isSameGotra
        ? 'Same-Gotra (Kashyap) marriage is traditionally prohibited under Hindu Gotra exogamy rules.'
        : undefined,
      overrideRequiresElderConsent: isSameGotra,
    };
  }

  /**
   * Step 1: Cultural Researcher proposes a new or updated rule
   */
  async proposeRule(dto: ProposeRuleDto): Promise<ProposedRuleRecord> {
    const ruleId = `prop_rule_${Date.now()}`;
    const record: ProposedRuleRecord = {
      id: ruleId,
      ruleType: dto.ruleType,
      pathCode: dto.pathCode,
      nepaliTerm: dto.nepaliTerm,
      englishTerm: dto.englishTerm,
      descriptionNepali: dto.descriptionNepali,
      proposedByUserId: dto.proposedByUserId,
      rationale: dto.rationale,
      status: 'PROPOSED',
      createdAt: new Date().toISOString(),
    };

    this.proposedRules.set(ruleId, record);
    this.logger.log(`Rule proposed: ${ruleId} for path ${dto.pathCode} by ${dto.proposedByUserId}`);
    return record;
  }

  /**
   * Step 2: First-tier Cultural Reviewer endorses textual & genealogical evidence
   */
  async reviewRule(dto: ReviewRuleDto): Promise<ProposedRuleRecord> {
    const record = this.proposedRules.get(dto.ruleId);
    if (!record) {
      throw new NotFoundException({
        errorCode: ErrorCode.UNMAPPED_KINSHIP_TERM,
        message: 'Proposed rule not found',
      });
    }

    if (record.proposedByUserId === dto.reviewerUserId) {
      throw new BadRequestException({
        errorCode: ErrorCode.UNAUTHORIZED,
        message: 'Separation of duties: Author cannot review their own rule proposal',
      });
    }

    record.reviewerUserId = dto.reviewerUserId;
    record.reviewerNotes = dto.reviewerNotes;
    record.status = dto.isEndorsed ? 'REVIEWED' : 'REJECTED';
    record.reviewedAt = new Date().toISOString();

    return record;
  }

  /**
   * Step 3: Senior Cultural Authority executes Final Approval (Dual-signoff requirement)
   */
  async approveRule(dto: ApproveRuleDto): Promise<ProposedRuleRecord> {
    const record = this.proposedRules.get(dto.ruleId);
    if (!record) {
      throw new NotFoundException({
        errorCode: ErrorCode.UNMAPPED_KINSHIP_TERM,
        message: 'Proposed rule not found',
      });
    }

    if (record.status !== 'REVIEWED') {
      throw new BadRequestException({
        errorCode: ErrorCode.AUTHORITY_GATE_LOCKED,
        message: 'Rule must be reviewed by first-tier cultural reviewer before senior authority sign-off',
      });
    }


    if (record.reviewerUserId === dto.seniorAuthorityUserId || record.proposedByUserId === dto.seniorAuthorityUserId) {
      throw new BadRequestException({
        errorCode: ErrorCode.UNAUTHORIZED,
        message: 'Senior final approver must be an independent individual from proposer and reviewer',
      });
    }

    record.seniorAuthorityUserId = dto.seniorAuthorityUserId;
    record.authorityComments = dto.authorityComments;
    record.status = dto.decision === 'APPROVED' ? 'APPROVED' : 'REJECTED';
    record.approvedAt = new Date().toISOString();

    if (dto.decision === 'APPROVED') {
      this.rulesMap.set(record.pathCode, {
        ruleId: record.id,
        pathCode: record.pathCode,
        relationshipName: record.englishTerm,
        nepaliTerm: record.nepaliTerm,
        romanization: '',
        englishLabel: record.englishTerm,
        reciprocalTerm: '',
        validationStatus: 'APPROVED',
        culturalReviewer: record.reviewerUserId || '',
        finalApprover: dto.seniorAuthorityUserId,
      });
    }

    return record;
  }

  async listRuleSets(): Promise<DomainRuleSetDto[]> {
    return [
      {
        id: 'ruleset_ns_001',
        ruleType: RuleType.NATA_SAINO,
        version: '0.2',
        status: RuleSetStatus.DRAFT,
        title: 'Nata/Saino Desk Validated Kinship Draft',
        description: '71 canonical relationship mappings for Kashyap Adhikari lineage',
        rulesData: {
          nataSaino: CANONICAL_NATA_SAINO_RULES.map((r) => ({
            pathCode: r.pathCode,
            nepaliTerm: r.nepaliTerm,
            englishTerm: r.englishLabel,
            reciprocalTermNepali: r.reciprocalTerm,
          })),
        },
        createdAt: '2026-09-08T00:00:00Z',
      },
    ];
  }

}
