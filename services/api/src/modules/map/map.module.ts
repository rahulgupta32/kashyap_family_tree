import { Module } from '@nestjs/common';
import { GenealogyModule } from '../genealogy/genealogy.module';
import { MapService } from './map.service';
import { MapController } from './map.controller';

@Module({
  imports:[GenealogyModule],
  controllers: [MapController],
  providers: [MapService],
  exports: [MapService],
})
export class MapModule {}

