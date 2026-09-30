import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedUser, CurrentUser } from '../auth/decorators/current-user.decorator';
import { NotificationBroadcastsService } from './notification-broadcasts.service';

@Controller('notifications/broadcasts')
@UseGuards(JwtAuthGuard)
export class NotificationBroadcastsController {
  constructor(private readonly broadcasts: NotificationBroadcastsService) {}
  @Get() list(@CurrentUser() user: AuthenticatedUser) { return this.broadcasts.list(user); }
  @Get('eligible-members') eligibleMembers(@CurrentUser() user: AuthenticatedUser,
    @Query('query') query?: string, @Query('branchId') branchId?: string) {
    return this.broadcasts.eligibleMembers(user, query, branchId);
  }
  @Get(':id') detail(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.broadcasts.detail(user, id);
  }
  @Post('preview') preview(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.broadcasts.preview(user, body);
  }
  @Post() send(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.broadcasts.send(user, body);
  }
}
