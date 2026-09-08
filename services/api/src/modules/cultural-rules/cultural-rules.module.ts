import { Module } from '@nestjs/common';
import { CulturalRulesController } from './cultural-rules.controller';
import { CulturalRulesService } from './cultural-rules.service';

@Module({
  controllers: [CulturalRulesController],
  providers: [CulturalRulesService],
  exports: [CulturalRulesService],
})
export class CulturalRulesModule {}
