import { Module } from '@nestjs/common';
import { AuditController } from './audit.controller';
import { AuditService } from './audit.service';
import { AuditDeliveryService } from './audit-delivery.service';
import { AuditRecoveryService } from './audit-recovery.service';
import { PushInvestigationService } from './push-investigation.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [AuditController],
  providers: [AuditService,AuditDeliveryService,AuditRecoveryService,PushInvestigationService],
  exports: [AuditService],
})
export class AuditModule {}
