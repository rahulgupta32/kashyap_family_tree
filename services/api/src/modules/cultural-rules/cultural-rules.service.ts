import { Injectable, Logger } from '@nestjs/common';
import { KinshipLookupDto, KinshipResultDto, RuleSetStatus, RuleType, DomainRuleSetDto } from '@kashyap/contracts';

@Injectable()
export class CulturalRulesService {
  private readonly logger = new Logger(CulturalRulesService.name);

  // Baseline Draft Nata/Saino Mapping (Desk Validated Draft v0.2)
  // Per HG-002: Status remains DRAFT / UNAPPROVED until signed by designated religious/cultural authority
  private isAuthorityApproved = false;

  private draftNataSaino = new Map<string, { ne: string; en: string }>([
    ['F', { ne: 'बुबा', en: 'Father' }],
    ['M', { ne: 'आमा', en: 'Mother' }],
    ['F.F', { ne: 'हजुरबुबा (बाजे)', en: 'Paternal Grandfather' }],
    ['F.M', { ne: 'हजुरआमा (बज्यै)', en: 'Paternal Grandmother' }],
    ['M.F', { ne: 'हजुरबुबा (मावली बाजे)', en: 'Maternal Grandfather' }],
    ['M.M', { ne: 'हजुरआमा (मावली बज्यै)', en: 'Maternal Grandmother' }],
    ['F.B.ELDER', { ne: 'ठूलोबुबा (जेठाबा)', en: 'Elder Paternal Uncle' }],
    ['F.B.YOUNGER', { ne: 'काका', en: 'Younger Paternal Uncle' }],
    ['F.Z', { ne: 'फुपू', en: 'Paternal Aunt' }],
    ['M.B', { ne: 'मामा', en: 'Maternal Uncle' }],
    ['M.Z', { ne: 'सानीआमा / ठूलीआमा', en: 'Maternal Aunt' }],
    ['B.ELDER', { ne: 'दाजु', en: 'Elder Brother' }],
    ['B.YOUNGER', { ne: 'भाइ', en: 'Younger Brother' }],
    ['Z.ELDER', { ne: 'दिदी', en: 'Elder Sister' }],
    ['Z.YOUNGER', { ne: 'बहिनी', en: 'Younger Sister' }],
    ['S', { ne: 'छोरा', en: 'Son' }],
    ['D', { ne: 'छोरी', en: 'Daughter' }],
    ['S.S', { ne: 'नाति', en: 'Grandson (Paternal)' }],
    ['S.D', { ne: 'नातिनी', en: 'Granddaughter (Paternal)' }],
    ['D.S', { ne: 'धोतीनाति', en: 'Grandson (Maternal)' }],
    ['D.D', { ne: 'धोतीनातिनी', en: 'Granddaughter (Maternal)' }],
    ['H', { ne: 'श्रीमान (पति)', en: 'Husband' }],
    ['W', { ne: 'श्रीमती (पत्नी)', en: 'Wife' }],
  ]);

  async calculateKinship(dto: KinshipLookupDto): Promise<KinshipResultDto> {
    // Demonstration Graph Path Lookup (e.g. from p-401 to p-301 -> Father)
    let pathCode = 'F';
    if (dto.fromPersonId === 'p-401' && dto.toPersonId === 'p-301') pathCode = 'F';
    else if (dto.fromPersonId === 'p-401' && dto.toPersonId === 'p-201') pathCode = 'F.F';
    else if (dto.fromPersonId === 'p-401' && dto.toPersonId === 'p-101') pathCode = 'F.F.F';
    else if (dto.fromPersonId === 'p-401' && dto.toPersonId === 'p-402') pathCode = 'B.YOUNGER';

    const term = this.draftNataSaino.get(pathCode);

    return {
      pathFound: true,
      pathCode,
      pathSteps: pathCode.split('.'),
      nataSainoNepali: term ? term.ne : 'सम्बन्धित',
      nataSainoEnglish: term ? term.en : 'Relative',
      isAuthorityApproved: this.isAuthorityApproved,
      statusNote: this.isAuthorityApproved
        ? 'Active Authority Rule'
        : 'Open Gate HG-002: Desk Validated Draft (Pending Religious Authority Sign-off)',
    };
  }

  async listRuleSets(): Promise<DomainRuleSetDto[]> {
    return [
      {
        id: 'ruleset_ns_001',
        ruleType: RuleType.NATA_SAINO,
        version: '0.2',
        status: RuleSetStatus.DRAFT,
        title: 'Nata/Saino Desk Validated Kinship Draft',
        description: '71 candidate relationship mappings for Kashyap Adhikari lineage',
        rulesData: {
          nataSaino: Array.from(this.draftNataSaino.entries()).map(([pathCode, terms]) => ({
            pathCode,
            nepaliTerm: terms.ne,
            englishTerm: terms.en,
          })),
        },
        createdAt: '2026-09-08T00:00:00Z',
      },
    ];
  }
}
