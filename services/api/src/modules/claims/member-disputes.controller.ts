import { Body, Controller, Get, Header, Param, Post, Query, UseGuards } from '@nestjs/common';
import { SubmitMemberDisputeDto } from '@kashyap/contracts';
import { CurrentUser, AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MemberDisputesService } from './member-disputes.service';

@Controller('claims')
@UseGuards(JwtAuthGuard)
export class MemberDisputesController {
  constructor(private readonly disputes: MemberDisputesService) {}
  @Get('disputes/mine')
  @Header('Cache-Control', 'private, no-store')
  list(@CurrentUser() actor: AuthenticatedUser, @Query('cursor') cursor?: unknown) { return this.disputes.list(actor,cursor); }
  @Post('people/:personId/dispute')
  @Header('Cache-Control', 'private, no-store')
  submit(@Param('personId') personId: string, @CurrentUser() actor: AuthenticatedUser,
    @Body() body: SubmitMemberDisputeDto) { return this.disputes.submit(personId,actor,body); }
}
