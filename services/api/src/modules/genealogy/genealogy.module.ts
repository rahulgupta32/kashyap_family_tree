import { Module } from '@nestjs/common';
import { GenealogyController } from './genealogy.controller';
import { GenealogyService, GENEALOGY_TEST_FIXTURE_MODE } from './genealogy.service';

@Module({
  controllers: [GenealogyController],
  providers: [
    GenealogyService,
    {
      provide: GENEALOGY_TEST_FIXTURE_MODE,
      useValue: false,
    },
  ],
  exports: [GenealogyService],
})
export class GenealogyModule {}

