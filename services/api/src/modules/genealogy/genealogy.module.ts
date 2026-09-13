import { Module } from '@nestjs/common';
import { GenealogyController } from './genealogy.controller';
import { GenealogyService, GENEALOGY_TEST_FIXTURE_MODE } from './genealogy.service';
import { SearchService } from './search.service';
import { DuplicateService } from './duplicate.service';
import { PrivacyEngineService } from './privacy/privacy-engine.service';

@Module({
  controllers: [GenealogyController],
  providers: [
    GenealogyService,
    SearchService,
    DuplicateService,
    PrivacyEngineService,
    {
      provide: GENEALOGY_TEST_FIXTURE_MODE,
      useValue: false,
    },
  ],
  exports: [GenealogyService, SearchService, DuplicateService, PrivacyEngineService],
})
export class GenealogyModule {}
