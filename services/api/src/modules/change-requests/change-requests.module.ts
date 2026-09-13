import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { ChangeRequestsService } from './change-requests.service';
import { ChangeRequestsController } from './change-requests.controller';
import { DiffService } from './diff.service';

@Module({
  imports: [DatabaseModule],
  controllers: [ChangeRequestsController],
  providers: [ChangeRequestsService, DiffService],
  exports: [ChangeRequestsService, DiffService],
})
export class ChangeRequestsModule {}
