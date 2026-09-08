import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { AuditService, AuditEntry } from './audit.service';

@ApiTags('Audit Logs')
@Controller('audit')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @ApiOperation({ summary: 'List append-only audit trail logs (Super Admin)' })
  async getAuditLogs(): Promise<AuditEntry[]> {
    return this.auditService.listAuditLogs();
  }
}
