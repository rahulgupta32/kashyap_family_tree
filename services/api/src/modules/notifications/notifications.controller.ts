import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedUser, CurrentUser } from '../auth/decorators/current-user.decorator';
import { NotificationInboxService } from './notification-inbox.service';
import { NotificationFollowsService } from './notification-follows.service';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly inbox:NotificationInboxService,private readonly follows:NotificationFollowsService){}
  @Get() list(@CurrentUser() user:AuthenticatedUser,@Query('limit') limit?:string,@Query('cursor') cursor?:string) {
    return this.inbox.list(user.id,limit,cursor);
  }
  @Get('preferences') preferences(@CurrentUser() user:AuthenticatedUser) {return this.inbox.preferences(user.id);}
  @Patch('preferences') update(@CurrentUser() user:AuthenticatedUser,@Body() body:Record<string,unknown>) {
    return this.inbox.updatePreferences(user.id,body);
  }
  @Get('follows') listFollows(@CurrentUser() user:AuthenticatedUser) {return this.follows.list(user);}
  @Post('follows') follow(@CurrentUser() user:AuthenticatedUser,@Body() body:unknown) {return this.follows.create(user,body);}
  @Delete('follows/:id') unfollow(@CurrentUser() user:AuthenticatedUser,@Param('id') id:string) {return this.follows.remove(user,id);}
  @Post('read-all') readAll(@CurrentUser() user:AuthenticatedUser) {return this.inbox.markAllRead(user.id);}
  @Post(':id/read') read(@CurrentUser() user:AuthenticatedUser,@Param('id') id:string) {
    return this.inbox.markRead(user.id,id);
  }
  @Post(':id/unread') unread(@CurrentUser() user:AuthenticatedUser,@Param('id') id:string) {
    return this.inbox.markUnread(user.id,id);
  }
}
