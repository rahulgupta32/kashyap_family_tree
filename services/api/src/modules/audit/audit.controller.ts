import { Controller, Get, Post, Body, Param, Header, Query, UseGuards, ServiceUnavailableException } from '@nestjs/common';
import { AuditRecoveryService } from './audit-recovery.service';
import { AuditDeliveryService } from './audit-delivery.service';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AuditService } from './audit.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role, ErrorCode } from '@kashyap/contracts';
import { AuditRepository } from '../../database/repositories/audit.repository';
import { CurrentUser, AuthenticatedUser } from '../auth/decorators/current-user.decorator';
@ApiTags('Audit Logs') @ApiBearerAuth() @Controller('audit') @UseGuards(JwtAuthGuard, RolesGuard)
export class AuditController {
 constructor(private readonly audit:AuditService, private readonly records:AuditRepository,private readonly delivery:AuditDeliveryService,private readonly recovery:AuditRecoveryService){}
 @Get('delivery/recovery') @Roles(Role.SUPER_ADMIN) @Header('Cache-Control','no-store')
 recoveryList(@CurrentUser() user:AuthenticatedUser){return this.recovery.list(user);}
 @Post('delivery/:id/recovery') @Roles(Role.SUPER_ADMIN) @Header('Cache-Control','no-store')
 proposeRecovery(@CurrentUser() user:AuthenticatedUser,@Param('id') id:string,@Body() body:unknown){return this.recovery.propose(user,id,body);}
 @Post('delivery/recovery/:id/approve') @Roles(Role.SUPER_ADMIN) @Header('Cache-Control','no-store')
 approveRecovery(@CurrentUser() user:AuthenticatedUser,@Param('id') id:string){return this.recovery.approve(user,id);}
 @Get('delivery') @Roles(Role.SUPER_ADMIN, Role.CENTRAL_ADMIN) @Header('Cache-Control','no-store')
 async deliveryStatus(){
  try{return await this.delivery.deliveryStatus();}
  catch{throw new ServiceUnavailableException({message:'Audit delivery status is unavailable',messageNepali:'अडिट वितरण अवस्था हाल अनुपलब्ध छ।',errorCode:ErrorCode.SERVICE_UNAVAILABLE});}
 }
 @Get() @Roles(Role.SUPER_ADMIN, Role.CENTRAL_ADMIN)
 list(@CurrentUser() user:AuthenticatedUser,@Query() q:any){return this.audit.listAuditLogs(user,q);}
 @Get('dashboard') @Roles(Role.SUPER_ADMIN, Role.CENTRAL_ADMIN, Role.BRANCH_ADMIN)
 dashboard(@CurrentUser() user:AuthenticatedUser){return this.audit.dashboard(user);}
 @Get('integrity') @Roles(Role.SUPER_ADMIN, Role.CENTRAL_ADMIN)
 integrity(){return this.records.verifyIntegrity();}
}
