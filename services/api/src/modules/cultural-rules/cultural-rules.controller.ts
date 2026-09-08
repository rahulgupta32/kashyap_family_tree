import { Controller, Post, Get, Body } from '@nestjs/common';
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

  @Get('rulesets')
  @ApiOperation({ summary: 'List all domain rulesets with status and authority signatures' })
  async listRuleSets(): Promise<DomainRuleSetDto[]> {
    return this.culturalRulesService.listRuleSets();
  }
}
