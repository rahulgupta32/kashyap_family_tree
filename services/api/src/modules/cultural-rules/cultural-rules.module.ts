import { CulturalContentService } from './cultural-content.service';
import { CulturalContentController } from './cultural-content.controller';
import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { CulturalRulesService } from './cultural-rules.service';
import { CulturalRulesController } from './cultural-rules.controller';

@Module({
  imports: [DatabaseModule],
  controllers: [CulturalRulesController,CulturalContentController],
  providers: [CulturalRulesService,CulturalContentService],
  exports: [CulturalRulesService],
})
export class CulturalRulesModule {}
