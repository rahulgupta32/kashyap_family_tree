import { GenealogyModule } from '../genealogy/genealogy.module';
import { MemberDisputesService } from './member-disputes.service';
import { MemberDisputesController } from './member-disputes.controller';
import { Module } from '@nestjs/common';
import { ClaimsController } from './claims.controller';
import { ClaimsService } from './claims.service';

@Module({
  imports: [GenealogyModule],
  controllers: [ClaimsController, MemberDisputesController],
  providers: [ClaimsService, MemberDisputesService],
  exports: [ClaimsService],
})
export class ClaimsModule {}
