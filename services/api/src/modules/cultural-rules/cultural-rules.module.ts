import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { CulturalRulesService } from './cultural-rules.service';
import { CulturalRulesController } from './cultural-rules.controller';

@Module({
  imports: [DatabaseModule],
  controllers: [CulturalRulesController],
  providers: [CulturalRulesService],
  exports: [CulturalRulesService],
})
export class CulturalRulesModule {}
