import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { BranchAdministrationService } from './branch-administration.service';
import { BranchAdministrationController } from './branch-administration.controller';
@Module({ imports: [DatabaseModule], providers: [BranchAdministrationService], controllers: [BranchAdministrationController] })
export class BranchAdministrationModule {}
