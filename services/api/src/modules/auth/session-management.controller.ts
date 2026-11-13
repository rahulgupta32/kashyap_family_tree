import { Controller, Get, Post, Param, Query, UseGuards, Res, Req, ParseUUIDPipe, HttpCode } from '@nestjs/common';
import { Request, Response } from 'express';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser, AuthenticatedUser } from './decorators/current-user.decorator';
import { SessionManagementService } from './session-management.service';
@Controller('auth/sessions')
@UseGuards(JwtAuthGuard)
export class SessionManagementController {
  constructor(private readonly sessions:SessionManagementService) {}
  @Get()
  list(@CurrentUser() user:AuthenticatedUser,@Query('cursor',new ParseUUIDPipe({optional:true})) cursor:string|undefined,@Res({passthrough:true}) res:Response) {
    res.setHeader('Cache-Control','no-store');return this.sessions.list(user.id,user.sessionId,cursor);
  }
  @Post(':id/revoke')
  @HttpCode(200)
  revoke(@CurrentUser() user:AuthenticatedUser,@Param('id',new ParseUUIDPipe()) id:string,@Req() req:Request,@Res({passthrough:true}) res:Response) {
    res.setHeader('Cache-Control','no-store');return this.sessions.revoke(user.id,user.sessionId,id,req.ip||'127.0.0.1',req.headers['user-agent']||'unknown');
  }
}
