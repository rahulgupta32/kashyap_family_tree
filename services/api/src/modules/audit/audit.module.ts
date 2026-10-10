import { Module } from '@nestjs/common';
import { AuditController } from './audit.controller';
import { AuditService } from './audit.service';
import { AuditDeliveryService } from './audit-delivery.service';

@Module({
  controllers: [AuditController],
  providers: [AuditService,AuditDeliveryService],
  exports: [AuditService],
})
export class AuditModule {}
