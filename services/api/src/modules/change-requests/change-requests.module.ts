import { Module, forwardRef } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { GenealogyModule } from '../genealogy/genealogy.module';
import { ChangeRequestsService } from './change-requests.service';
import { ChangeRequestsController } from './change-requests.controller';
import { DiffService } from './diff.service';
import { MediaStorageModule } from '../../media/media-storage.module';

@Module({
  imports: [DatabaseModule, MediaStorageModule, forwardRef(() => GenealogyModule)],
  controllers: [ChangeRequestsController],
  providers: [ChangeRequestsService, DiffService],
  exports: [ChangeRequestsService, DiffService],
})
export class ChangeRequestsModule {}
