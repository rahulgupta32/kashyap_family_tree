import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AuditService } from './audit.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@kashyap/contracts';
import { CurrentUser, AuthenticatedUser } from '../auth/decorators/current-user.decorator';
@ApiTags('Audit Logs') @ApiBearerAuth() @Controller('audit') @UseGuards(JwtAuthGuard, RolesGuard)
export class AuditController {
 constructor(private readonly audit:AuditService){}
 @Get() @Roles(Role.SUPER_ADMIN, Role.CENTRAL_ADMIN)
 list(@CurrentUser() user:AuthenticatedUser,@Query() q:any){return this.audit.listAuditLogs(user,q);}
 @Get('dashboard') @Roles(Role.SUPER_ADMIN, Role.CENTRAL_ADMIN, Role.BRANCH_ADMIN)
 dashboard(@CurrentUser() user:AuthenticatedUser){return this.audit.dashboard(user);}
}
