import { PRIVILEGED_SESSION_MAX_AGE_MS } from '../auth/privileged-session.policy';
import { AuditOutboxRepository } from '../../database/repositories/audit-outbox.repository';
import { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { allowedFields, textField, uuid } from '../community/community-policy';
import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  UnauthorizedException,
  ConflictException,
  Optional,
} from '@nestjs/common';
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
import { DatabaseService } from '../../database/database.service';
import { PersonRepository } from '../../database/repositories/person.repository';
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

interface KinshipGraphNode {
  personId: string;
  path: string[];
  depth: number;
}

@Injectable()
export class CulturalRulesService {
  private readonly rulesMap = new Map<string, CanonicalKinshipRule>();

  constructor(
    private readonly db: DatabaseService,
    private readonly personRepo: PersonRepository,
    @Optional() private readonly audit: AuditOutboxRepository = new AuditOutboxRepository(db),
  ) {
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

  /**
   * Unified Rule Activation Predicate (Open Gates HG-002, HG-003, HG-004)
   * Strictly enforces dual independent council approval and validity window.
   */
  async getActiveRuleset(ruleType: RuleType) {
    const res = await this.db.query(
      `SELECT * FROM domain_rulesets 
       WHERE rule_type = $1 
         AND status = 'ACTIVE' 
         AND effective_from <= NOW() 
         AND (effective_until IS NULL OR effective_until >= NOW())
         AND signed_by_reviewer_id IS NOT NULL 
         AND signed_by_authority_id IS NOT NULL
         AND signed_by_reviewer_id != signed_by_authority_id
       ORDER BY version DESC 
       LIMIT 1`,
      [ruleType],
    );
    const rs = res.rows[0];
    if (rs && Array.isArray(rs.council_signatures) && rs.council_signatures.length > 0) {
      const distinctSigners = new Set(rs.council_signatures.map((s: any) => s.signerId || s.userId || s));
      if (distinctSigners.size < 2) {
        return null;
      }
    }
    return rs || null;
  }

  async isRulesetActive(ruleType: RuleType): Promise<boolean> {
    const rs = await this.getActiveRuleset(ruleType);
    return !!rs;
  }

  findRule(pathCode: string): CanonicalKinshipRule | undefined {
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
   * Evaluates Kinship (Nata/Saino) between two persons.
   * Enforces Open Gate HG-002: returns UNAVAILABLE (RULE_6001) if ruleset is unapproved.
   * Traverses actual parent and spouse graph links via verified BFS with generational resolution.
   */
  async calculateKinship(dto: KinshipLookupDto): Promise<KinshipResultDto> {
    const ruleset = await this.getActiveRuleset(RuleType.NATA_SAINO);

    if (!ruleset) {
      return {
        pathFound: false,
        pathCode: 'UNAVAILABLE',
        pathSteps: [],
        nataSainoNepali: 'नाता प्रमाणित हुन बाँकी',
        nataSainoEnglish: 'Relationship pending cultural verification',
        isAuthorityApproved: false,
        statusNote: 'Open Gate HG-002: Nata/Saino cultural ruleset requires dual senior authority activation (RULE_6001).',
        alternativePaths: [],
      };
    }

    if (dto.fromPersonId === dto.toPersonId) {
      const selfRule = this.findRule('Self') || this.findRule('E');
      return {
        pathFound: true,
        pathCode: 'Self',
        pathSteps: ['Self'],
        nataSainoNepali: selfRule ? selfRule.nepaliTerm : 'आफू',
        nataSainoEnglish: selfRule ? selfRule.englishLabel : 'Self',
        reciprocalNepali: selfRule ? selfRule.reciprocalTerm : 'आफू',
        reciprocalEnglish: 'Self',
        generationsDiff: 0,
        isAuthorityApproved: true,
        statusNote: 'Active Authority Rule',
        alternativePaths: [],
      };
    }

    const fromPerson = await this.personRepo.findById(dto.fromPersonId);
    const toPerson = await this.personRepo.findById(dto.toPersonId);

    // Real BFS path traversal across verified lineage graph (never generation arithmetic)
    const pathSteps = await this.findShortestPathBfs(dto.fromPersonId, dto.toPersonId);

    if (!pathSteps) {
      return {
        pathFound: false,
        pathCode: 'UNLINKED',
        pathSteps: [],
        nataSainoNepali: 'नाता सम्बन्ध भेटिएन',
        nataSainoEnglish: 'No kinship relationship path found in verified tree graph',
        isAuthorityApproved: true,
        generationsDiff: fromPerson && toPerson ? toPerson.generation - fromPerson.generation : undefined,
        statusNote: 'Unconnected graph component',
        alternativePaths: [],
      };
    }

    let primaryPathCode = pathSteps.join('.');
    let alternativeCodes: string[] = [];

    // Resolve brother/sister sibling branches from shared parent traversal
    if (
      pathSteps.length === 2 &&
      (pathSteps[0] === 'F' || pathSteps[0] === 'M') &&
      (pathSteps[1] === 'S' || pathSteps[1] === 'D')
    ) {
      const isOlder = Boolean(
        toPerson?.birth_year_bs && fromPerson?.birth_year_bs && toPerson.birth_year_bs < fromPerson.birth_year_bs,
      );
      if (toPerson?.gender === 'FEMALE') {
        primaryPathCode = isOlder ? 'Z.ELDER' : 'Z.YOUNGER';
        alternativeCodes = ['Z'];
      } else {
        primaryPathCode = isOlder ? 'B.ELDER' : 'B.YOUNGER';
        alternativeCodes = ['B'];
      }
    }

    const primaryRule = this.findRule(primaryPathCode);

    const primaryResult: KinshipResultDto = {
      pathFound: true,
      pathCode: primaryPathCode,
      pathSteps: primaryPathCode.split('.'),
      nataSainoNepali: primaryRule ? primaryRule.nepaliTerm : 'नाता प्रमाणित हुन बाँकी',
      nataSainoEnglish: primaryRule ? primaryRule.englishLabel : 'Relative (Verified)',
      reciprocalNepali: primaryRule ? primaryRule.reciprocalTerm : undefined,
      reciprocalEnglish: undefined,
      generationsDiff: fromPerson && toPerson ? toPerson.generation - fromPerson.generation : undefined,
      isAuthorityApproved: true,
      statusNote: 'Active Authority Rule',
      alternativePaths: [],
    };

    if (alternativeCodes.length > 0) {
      primaryResult.alternativePaths = alternativeCodes.map((altCode) => {
        const altRule = this.findRule(altCode);
        return {
          pathFound: true,
          pathCode: altCode,
          pathSteps: altCode.split('.'),
          nataSainoNepali: altRule ? altRule.nepaliTerm : 'सम्बन्धित',
          nataSainoEnglish: altRule ? altRule.englishLabel : 'Alternative Relation',
          isAuthorityApproved: true,
        };
      });
    }

    return primaryResult;
  }

  private async findShortestPathBfs(startPersonId: string, endPersonId: string): Promise<string[] | null> {
    const visited = new Set<string>([startPersonId]);
    const queue: KinshipGraphNode[] = [{ personId: startPersonId, path: [], depth: 0 }];
    const MAX_DEPTH = 10;
    const MAX_VISITED = 300;

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (current.depth >= MAX_DEPTH || visited.size > MAX_VISITED) break;

      // Find parents (upward edges)
      const parentRes = await this.db.query(
        `SELECT p.id, p.gender, pl.parent_type 
         FROM parent_links pl 
         JOIN persons p ON pl.parent_id = p.id 
         WHERE pl.child_id = $1 AND pl.confidence = 'VERIFIED'`,
        [current.personId],
      );

      for (const row of parentRes.rows) {
        const step = row.gender === 'FEMALE' ? 'M' : 'F';
        const newPath = [...current.path, step];
        if (row.id === endPersonId) return newPath;

        if (!visited.has(row.id)) {
          visited.add(row.id);
          queue.push({ personId: row.id, path: newPath, depth: current.depth + 1 });
        }
      }

      // Find children (downward edges)
      const childRes = await this.db.query(
        `SELECT p.id, p.gender 
         FROM parent_links pl 
         JOIN persons p ON pl.child_id = p.id 
         WHERE pl.parent_id = $1 AND pl.confidence = 'VERIFIED'`,
        [current.personId],
      );

      for (const row of childRes.rows) {
        const step = row.gender === 'FEMALE' ? 'D' : 'S';
        const newPath = [...current.path, step];
        if (row.id === endPersonId) return newPath;

        if (!visited.has(row.id)) {
          visited.add(row.id);
          queue.push({ personId: row.id, path: newPath, depth: current.depth + 1 });
        }
      }

      // Find spouses (horizontal edges with VERIFIED confidence)
      const spouseRes = await this.db.query(
        `SELECT p.id, p.gender 
         FROM spouse_links sl 
         JOIN persons p ON (sl.person_id = p.id OR sl.spouse_id = p.id)
         WHERE (sl.person_id = $1 OR sl.spouse_id = $1) AND p.id != $1 AND sl.status = 'CURRENT' AND sl.confidence = 'VERIFIED'`,
        [current.personId],
      );

      for (const row of spouseRes.rows) {
        const step = row.gender === 'FEMALE' ? 'W' : 'H';
        const newPath = [...current.path, step];
        if (row.id === endPersonId) return newPath;

        if (!visited.has(row.id)) {
          visited.add(row.id);
          queue.push({ personId: row.id, path: newPath, depth: current.depth + 1 });
        }
      }
    }

    return null;
  }

  /**
   * Gotra Marriage Eligibility Advisory Validator (Open Gate HG-002)
   */
  async checkMarriageEligibility(person1Gotra: string, person2Gotra: string) {
    const ruleset = await this.getActiveRuleset(RuleType.MARRIAGE_ELIGIBILITY);
    if (!ruleset) {
      return {
        status: 'UNAVAILABLE',
        errorCode: ErrorCode.RULESET_NOT_APPROVED,
        message: 'Marriage eligibility guidance requires active approved cultural ruleset (Open Gate HG-002).',
        isEligible: null,
      };
    }

    const isSameGotra = person1Gotra.trim().toLowerCase() === person2Gotra.trim().toLowerCase();
    return {
      status: 'AVAILABLE',
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
   * Jutho (Ritual Impurity) Observance Calculator (Open Gate HG-003)
   * Implements verified data-driven Sapinda Jutho degree calculation.
   */
  async calculateJutho(dto: { deceasedPersonId: string; observerPersonId: string }) {
    const ruleset = await this.getActiveRuleset(RuleType.JUTHO_SUTOK);
    if (!ruleset) {
      return {
        status: 'UNAVAILABLE',
        errorCode: ErrorCode.RULESET_NOT_APPROVED,
        message: 'Jutho observance engine requires active signed Dharma Shastra ruleset (Open Gate HG-003).',
      };
    }

    // Calculate degree of kinship via BFS path
    const path = await this.findShortestPathBfs(dto.observerPersonId, dto.deceasedPersonId);
    const rulesConfig = ruleset.rules_data || {};

    if (
      rulesConfig.sapindaMaxDegree === undefined ||
      rulesConfig.sapindaMaxDegree === null ||
      rulesConfig.samanodakaMaxDegree === undefined ||
      rulesConfig.samanodakaMaxDegree === null
    ) {
      return {
        status: 'UNAVAILABLE',
        errorCode: ErrorCode.RULESET_NOT_APPROVED,
        message: 'Active ruleset is missing required approved sapindaMaxDegree or samanodakaMaxDegree parameters (Open Gate HG-003).',
      };
    }

    let indicationClass: string;
    let ruleKey: string;

    if (path) {
      const isPurelyPatrilineal = path.every((s) => s === 'F' || s === 'S' || s === 'B');
      const degree = path.length;

      const sapindaMax = Number(rulesConfig.sapindaMaxDegree);
      const samanodakaMax = Number(rulesConfig.samanodakaMaxDegree);

      if (isPurelyPatrilineal) {
        if (degree <= sapindaMax) {
          ruleKey = rulesConfig.SAPINDA ? 'SAPINDA' : 'SAPINDA_7_GEN';
          indicationClass = rulesConfig[ruleKey]?.indicationClass;
        } else if (degree <= samanodakaMax) {
          ruleKey = rulesConfig.SAMANODAKA ? 'SAMANODAKA' : 'SAMANODAKA_10_GEN';
          indicationClass = rulesConfig[ruleKey]?.indicationClass;
        } else {
          ruleKey = 'REMOTE_PATRILINEAL';
          indicationClass = rulesConfig[ruleKey]?.indicationClass;
        }
      } else {
        ruleKey = 'AFFINE_RELATION';
        indicationClass = rulesConfig[ruleKey]?.indicationClass;
      }
    } else {
      ruleKey = 'NOT_APPLICABLE';
      indicationClass = 'NOT_APPLICABLE';
    }

    const matchedRule = rulesConfig[ruleKey];
    if (!matchedRule || matchedRule.days === undefined || matchedRule.days === null || (!indicationClass && ruleKey !== 'NOT_APPLICABLE')) {
      return {
        status: 'UNAVAILABLE',
        errorCode: ErrorCode.RULESET_NOT_APPROVED,
        message: `Missing approved rule configuration or indication class for ${ruleKey} (Open Gate HG-003).`,
      };
    }

    const effectiveIndicationClass = indicationClass || 'NOT_APPLICABLE';
    const classConfig = rulesConfig[effectiveIndicationClass] || matchedRule;
    if (!classConfig.observances || !classConfig.observancesNepali) {
      return {
        status: 'UNAVAILABLE',
        errorCode: ErrorCode.RULESET_NOT_APPROVED,
        message: `Missing approved observances for ${effectiveIndicationClass} (Open Gate HG-003).`,
      };
    }

    return {
      status: 'AVAILABLE',
      indicationClass: matchedRule.indicationClass || effectiveIndicationClass,
      daysOfImpurity: matchedRule.days,
      prescribedObservances: classConfig.observances,
      prescribedObservancesNepali: classConfig.observancesNepali,
    };
  }

  /**
   * Tithi & Shraddha Calculator (Open Gate HG-004)
   */
  async calculateTithi(dto: { yearBs: number; monthBs: number; tithiNumber: number; paksha: string }) {
    const ruleset = await this.getActiveRuleset(RuleType.TITHI_SHRADDHA);
    if (!ruleset) {
      return {
        status: 'UNAVAILABLE',
        errorCode: ErrorCode.EXTERNAL_PROVIDER_ERROR,
        message: 'External Nepal Panchanga Samiti ephemeris provider is not enabled (Open Gate HG-004). Solar-anniversary approximation fallback is strictly prohibited.',
      };
    }

    const ephemeris = ruleset.rules_data?.ephemeris_table || ruleset.rules_data?.ephemeris || {};
    const key = `${dto.yearBs}_${dto.monthBs}_${dto.paksha.toUpperCase()}_${dto.tithiNumber}`;
    const day = ephemeris[key];

    if (!day) {
      return {
        status: 'UNAVAILABLE',
        errorCode: ErrorCode.EXTERNAL_PROVIDER_ERROR,
        message: 'Tithi mapping not found in active ephemeris table for the requested BS period (solar fallback prohibited)',
      };
    }

    const dayStr = String(day).padStart(2, '0');
    return {
      status: 'AVAILABLE',
      dateBs: `${dto.yearBs}-${String(dto.monthBs).padStart(2, '0')}-${dayStr}`,
      tithi: `${dto.paksha}_${dto.tithiNumber}`,
    };
  }

  async listPublishedArticles() {
    const res = await this.db.query(
      "SELECT * FROM cultural_articles WHERE lifecycle_state = 'PUBLISHED' ORDER BY published_at DESC",
    );
    return res.rows;
  }

  async listRuleSets(): Promise<DomainRuleSetDto[]> {
    const res = await this.db.query('SELECT * FROM domain_rulesets ORDER BY created_at DESC');
    if (res.rows.length === 0) {
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
    return res.rows.map((r: any) => ({
      id: r.id,
      ruleType: r.rule_type,
      title: r.title || 'Domain Ruleset',
      description: r.description || '',
      rulesData: r.rules_data || {},
      version: r.version,
      status: r.status,
      effectiveFrom: r.effective_from || undefined,
      effectiveUntil: r.effective_until || undefined,
      signedByReviewerId: r.signed_by_reviewer_id || undefined,
      signedByAuthorityId: r.signed_by_authority_id || undefined,
      councilSignatures: r.council_signatures || undefined,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
  }

  private proposal(row: any): ProposedRuleRecord {
    const date = (value: any) => value instanceof Date ? value.toISOString() : value;
    return {
      id: row.id, ruleType: row.rule_type, pathCode: row.path_code, nepaliTerm: row.nepali_term,
      englishTerm: row.english_term, descriptionNepali: row.description_nepali ?? undefined,
      proposedByUserId: row.proposed_by_user_id, rationale: row.rationale, status: row.status,
      reviewerUserId: row.reviewer_user_id ?? undefined, reviewerNotes: row.reviewer_notes ?? undefined,
      seniorAuthorityUserId: row.senior_authority_user_id ?? undefined,
      authorityComments: row.authority_comments ?? undefined, createdAt: date(row.created_at),
      reviewedAt: date(row.reviewed_at) ?? undefined, approvedAt: date(row.approved_at) ?? undefined,
    };
  }

  private identity(actor: AuthenticatedUser | undefined, suppliedId?: string): string {
    if (!actor?.id) throw new UnauthorizedException('Authenticated actor required');
    uuid(actor.id, 'actor');
    if (suppliedId !== undefined && suppliedId !== actor.id) throw new ForbiddenException('Actor identity does not match authenticated account');
    return actor.id;
  }

  private async activeAccount(client: any, id: string) {
    const row = (await client.query(`SELECT id FROM user_accounts WHERE id=$1 AND is_active
      AND is_phone_verified AND NOT is_suspended AND deleted_at IS NULL FOR SHARE`, [id])).rows[0];
    if (!row) throw new ForbiddenException('Active verified account required');
  }

  private async authority(client: any, id: string, ruleType: RuleType, duty: string) {
    const row = (await client.query(`SELECT a.id FROM cultural_rule_authorities a JOIN user_accounts u ON u.id=a.user_id
      WHERE a.user_id=$1 AND a.rule_type=$2 AND a.duty=$3 AND a.revoked_at IS NULL
      AND u.is_active AND u.is_phone_verified AND NOT u.is_suspended AND u.deleted_at IS NULL
      FOR SHARE OF a,u`, [id, ruleType, duty])).rows[0];
    if (!row) throw new ForbiddenException('Current explicit cultural authority assignment required');
  }

  private async verifiedDecisionSession(client: any, actor: AuthenticatedUser) {
    if (!actor.sessionId) throw new ForbiddenException('Fresh authenticator-verified session required');
    await client.query("SELECT pg_advisory_xact_lock(hashtext('authenticator:' || $1::text))", [actor.id]);
    const session = (await client.query(`SELECT s.id FROM user_sessions s JOIN account_authenticators f ON f.user_id=s.user_id
      WHERE s.id=$1 AND s.user_id=$2 AND s.revoked_at IS NULL AND s.owner_revoked_at IS NULL
      AND s.expires_at>clock_timestamp() AND s.authenticated_at>clock_timestamp()-($3::bigint*INTERVAL '1 millisecond')
      AND s.authenticated_at<=clock_timestamp() AND f.enabled_at IS NOT NULL AND s.mfa_verified_at IS NOT NULL
      AND s.mfa_generation=f.generation FOR UPDATE OF s FOR SHARE OF f`, [uuid(actor.sessionId, 'session'),actor.id,PRIVILEGED_SESSION_MAX_AGE_MS])).rows[0];
    if (!session) throw new ForbiddenException('Fresh authenticator-verified session required');
  }

  private async proposalEvent(client: any, row: any, actorId: string, action: string, from: string | null, reason: string) {
    await client.query(`INSERT INTO cultural_rule_proposal_events(proposal_id,actor_id,action,from_status,to_status,reason)
      VALUES($1,$2,$3,$4,$5,$6)`, [row.id, actorId, action, from, row.status, reason]);
    await this.audit.recordAuditIntent({action: 'CULTURAL_RULE_PROPOSAL_' + action,
      entityType: 'CULTURAL_RULE_PROPOSAL', entityId: row.id, actorId,
      oldValue: from === null ? null : {status: from}, newValue: {status: row.status, ruleType: row.rule_type}}, client);
  }

  private async lockedProposal(client: any, id: string) {
    const row = (await client.query('SELECT * FROM cultural_rule_proposals WHERE id=$1 FOR UPDATE', [uuid(id, 'proposal')])).rows[0];
    if (!row) throw new NotFoundException('Proposed rule not found');
    return row;
  }

  async proposeRule(dto: ProposeRuleDto, actor?: AuthenticatedUser): Promise<ProposedRuleRecord> {
    const actorId = this.identity(actor, dto?.proposedByUserId);
    allowedFields(dto, ['ruleType','pathCode','nepaliTerm','englishTerm','descriptionNepali','proposedByUserId','rationale']);
    if (!Object.values(RuleType).includes(dto.ruleType)) throw new BadRequestException('Invalid rule type');
    const values = [dto.ruleType, textField(dto.pathCode, 'Path code', 200), textField(dto.nepaliTerm, 'Nepali term', 500),
      textField(dto.englishTerm, 'English term', 500), dto.descriptionNepali === undefined ? null : textField(dto.descriptionNepali, 'Description', 4000),
      actorId, textField(dto.rationale, 'Rationale', 4000)];
    return this.db.transaction(async client => {
      await this.activeAccount(client, actorId);
      const row = (await client.query(`INSERT INTO cultural_rule_proposals(rule_type,path_code,nepali_term,english_term,description_nepali,proposed_by_user_id,rationale)
        VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`, values)).rows[0];
      await this.proposalEvent(client, row, actorId, 'PROPOSED', null, dto.rationale);
      return this.proposal(row);
    });
  }

  async reviewRule(dto: ReviewRuleDto, actor?: AuthenticatedUser): Promise<ProposedRuleRecord> {
    const actorId = this.identity(actor, dto?.reviewerUserId);
    allowedFields(dto, ['ruleId','reviewerUserId','reviewerNotes','isEndorsed']);
    const notes = textField(dto.reviewerNotes, 'Review notes', 4000);
    if (typeof dto.isEndorsed !== 'boolean') throw new BadRequestException('Explicit review decision required');
    return this.db.transaction(async client => {
      await this.verifiedDecisionSession(client, actor!);
      const row = await this.lockedProposal(client, dto.ruleId);
      await this.authority(client, actorId, row.rule_type, 'REVIEWER');
      if (row.proposed_by_user_id === actorId) throw new ForbiddenException('Separation of duties: Author cannot review their own rule proposal');
      if (row.status !== 'PROPOSED') throw new ConflictException('Proposal is no longer awaiting review');
      const updated = (await client.query(`UPDATE cultural_rule_proposals SET status=$2,reviewer_user_id=$3,
        reviewer_notes=$4,reviewed_at=NOW() WHERE id=$1 RETURNING *`,
        [row.id, dto.isEndorsed ? 'REVIEWED' : 'REJECTED', actorId, notes])).rows[0];
      await this.proposalEvent(client, updated, actorId, 'REVIEWED', row.status, notes);
      return this.proposal(updated);
    });
  }

  async approveRule(dto: ApproveRuleDto, actor?: AuthenticatedUser): Promise<ProposedRuleRecord> {
    const actorId = this.identity(actor, dto?.seniorAuthorityUserId);
    allowedFields(dto, ['ruleId','seniorAuthorityUserId','authorityComments','decision']);
    const notes = textField(dto.authorityComments, 'Authority comments', 4000);
    if (!['APPROVED','REJECTED'].includes(dto.decision)) throw new BadRequestException('Explicit final decision required');
    return this.db.transaction(async client => {
      await this.verifiedDecisionSession(client, actor!);
      const row = await this.lockedProposal(client, dto.ruleId);
      await this.authority(client, actorId, row.rule_type, 'SENIOR_APPROVER');
      if ([row.proposed_by_user_id,row.reviewer_user_id].includes(actorId)) throw new ForbiddenException('Senior final approver must be independent from proposer and reviewer');
      if (row.status !== 'REVIEWED') throw new ConflictException('Rule must be reviewed before senior authority sign-off');
      await this.authority(client, row.reviewer_user_id, row.rule_type, 'REVIEWER');
      const updated = (await client.query(`UPDATE cultural_rule_proposals SET status=$2,senior_authority_user_id=$3,
        authority_comments=$4,approved_at=NOW() WHERE id=$1 RETURNING *`, [row.id,dto.decision,actorId,notes])).rows[0];
      await this.proposalEvent(client, updated, actorId, 'DECIDED', row.status, notes);
      // Approval records a proposal decision only. Active rulesets and HG gates are unchanged.
      return this.proposal(updated);
    });
  }

  private async readableProposal(client: any, row: any, actorId: string) {
    await this.activeAccount(client, actorId);
    if (row.proposed_by_user_id !== actorId) {
      const authority = (await client.query(`SELECT id FROM cultural_rule_authorities WHERE user_id=$1 AND rule_type=$2
        AND revoked_at IS NULL FOR SHARE`, [actorId,row.rule_type])).rows[0];
      if (!authority) throw new NotFoundException('Proposed rule not found');
    }
  }

  async listProposals(actor: AuthenticatedUser, before?: string) {
    const actorId = this.identity(actor);
    if (before !== undefined) uuid(before, 'proposal cursor');
    return this.db.transaction(async client => {
      await this.activeAccount(client, actorId);
      const rows = (await client.query(`SELECT p.* FROM cultural_rule_proposals p
        WHERE ($2::uuid IS NULL OR p.id<$2) AND (p.proposed_by_user_id=$1 OR EXISTS(
          SELECT 1 FROM cultural_rule_authorities a WHERE a.user_id=$1 AND a.rule_type=p.rule_type AND a.revoked_at IS NULL))
        ORDER BY p.id DESC LIMIT 51`, [actorId, before || null])).rows;
      const items = rows.slice(0,50).map(row => this.proposal(row));
      return {items, nextBefore: rows.length > 50 ? items[49].id : null};
    });
  }

  async getProposal(id: string, actor: AuthenticatedUser) {
    const actorId = this.identity(actor);
    return this.db.transaction(async client => {
      const row = await this.lockedProposal(client, id); await this.readableProposal(client, row, actorId);
      return this.proposal(row);
    });
  }

  async proposalHistory(id: string, actor: AuthenticatedUser) {
    const actorId = this.identity(actor);
    return this.db.transaction(async client => {
      const row = await this.lockedProposal(client, id); await this.readableProposal(client, row, actorId);
      return (await client.query(`SELECT sequence,action,actor_id AS "actorId",from_status AS "fromStatus",
        to_status AS "toStatus",reason,created_at AS "createdAt" FROM cultural_rule_proposal_events
        WHERE proposal_id=$1 ORDER BY sequence LIMIT 10`, [id])).rows;
    });
  }
}
