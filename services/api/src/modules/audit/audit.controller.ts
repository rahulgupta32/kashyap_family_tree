import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AuditService } from './audit.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser, AuthenticatedUser } from '../auth/decorators/current-user.decorator';
@ApiTags('Audit Logs') @ApiBearerAuth() @Controller('audit') @UseGuards(JwtAuthGuard)
export class AuditController {
 constructor(private readonly audit:AuditService){}
 @Get() list(@CurrentUser() user:AuthenticatedUser,@Query() q:any){return this.audit.listAuditLogs(user,q);}
 @Get('dashboard') dashboard(@CurrentUser() user:AuthenticatedUser){return this.audit.dashboard(user);}
}
