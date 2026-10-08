import { Body, Controller, Get, Header, Post, UseGuards } from '@nestjs/common';
import { CurrentUser, AuthenticatedUser } from './decorators/current-user.decorator';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { SessionRepository } from '../../database/repositories/session.repository';
import { MfaService } from './mfa.service';

@Controller('auth/mfa')
@UseGuards(JwtAuthGuard)
export class MfaController {
  constructor(private readonly mfa: MfaService, private readonly sessions: SessionRepository) {}
  @Get('status')
  @Header('Cache-Control', 'no-store')
  async status(@CurrentUser() user: AuthenticatedUser) { return this.mfa.status(user.id, await this.sessions.findById(user.sessionId), user.roles); }
  @Post('enroll')
  @Header('Cache-Control', 'no-store')
  enroll(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) { return this.mfa.execute(user, 'enroll', body); }
  @Post('confirm')
  @Header('Cache-Control', 'no-store')
  confirm(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) { return this.mfa.execute(user, 'confirm', body); }
  @Post('verify')
  @Header('Cache-Control', 'no-store')
  verify(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) { return this.mfa.execute(user, 'verify', body); }
  @Post('recover')
  @Header('Cache-Control', 'no-store')
  recover(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) { return this.mfa.execute(user, 'recover', body); }
  @Post('replace/start')
  @Header('Cache-Control', 'no-store')
  replaceStart(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) { return this.mfa.execute(user, 'replace-start', body); }
  @Post('replace/confirm')
  @Header('Cache-Control', 'no-store')
  replaceConfirm(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) { return this.mfa.execute(user, 'replace-confirm', body); }
  @Post('recovery-codes/renew')
  @Header('Cache-Control', 'no-store')
  renewCodes(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) { return this.mfa.execute(user, 'renew-codes', body); }

}
