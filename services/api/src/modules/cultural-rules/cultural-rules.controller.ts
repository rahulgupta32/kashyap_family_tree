import { Controller, Post, Get, Body, Query } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { CulturalRulesService } from './cultural-rules.service';
import { KinshipLookupDto, KinshipResultDto, DomainRuleSetDto } from '@kashyap/contracts';

@ApiTags('Cultural & Kinship Rules')
@Controller('cultural')
export class CulturalRulesController {
  constructor(private readonly culturalRulesService: CulturalRulesService) {}

  @Post('kinship/lookup')
  @ApiOperation({ summary: 'Calculate Nata/Saino relationship term between two persons' })
  async calculateKinship(@Body() dto: KinshipLookupDto): Promise<KinshipResultDto> {
    return this.culturalRulesService.calculateKinship(dto);
  }

  @Get('marriage/eligibility')
  @ApiOperation({ summary: 'Check same-Gotra marriage eligibility guidance (HG-002)' })
  async checkMarriageEligibility(
    @Query('gotra1') gotra1: string,
    @Query('gotra2') gotra2: string,
  ) {
    return this.culturalRulesService.checkMarriageEligibility(gotra1, gotra2);
  }

  @Post('jutho/calculate')
  @ApiOperation({ summary: 'Calculate Jutho ritual impurity days (HG-003)' })
  async calculateJutho(@Body() dto: { deceasedPersonId: string; observerPersonId: string }) {
    return this.culturalRulesService.calculateJutho(dto);
  }

  @Post('tithi/calculate')
  @ApiOperation({ summary: 'Calculate Tithi and Shraddha date (HG-004)' })
  async calculateTithi(@Body() dto: { yearBs: number; monthBs: number; tithiNumber: number; paksha: string }) {
    return this.culturalRulesService.calculateTithi(dto);
  }

  @Get('rulesets')
  @ApiOperation({ summary: 'List all domain rulesets with status and authority signatures' })
  async listRuleSets(): Promise<DomainRuleSetDto[]> {
    return this.culturalRulesService.listRuleSets();
  }

  @Get('articles')
  @ApiOperation({ summary: 'List published cultural articles (HG-005)' })
  async listArticles() {
    return this.culturalRulesService.listPublishedArticles();
  }
}
