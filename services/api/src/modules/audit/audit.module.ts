import { Module } from '@nestjs/common';
import { AuditController } from './audit.controller';
import { AuditService } from './audit.service';
import { AuditDeliveryService } from './audit-delivery.service';
import { AuditRecoveryService } from './audit-recovery.service';

@Module({
  controllers: [AuditController],
  providers: [AuditService,AuditDeliveryService,AuditRecoveryService],
  exports: [AuditService],
})
export class AuditModule {}
