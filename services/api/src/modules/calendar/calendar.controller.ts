import {
  Controller,
  Get,
  Post,
  Patch,
  BadRequestException,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  CreateCalendarEventDto,
  CalendarEventDetailDto,
  CalendarEventRsvpDto,
  EventAudienceScope,
} from '@kashyap/contracts';
import { CalendarService } from './calendar.service';
import { CurrentUser, AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('calendar')
@UseGuards(JwtAuthGuard)
export class CalendarController {
  constructor(private readonly calendarService: CalendarService) {}

  @Post(['', 'events'])
  async createEvent(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateCalendarEventDto,
  ): Promise<CalendarEventDetailDto> {
    return this.calendarService.createEvent(user.id, dto);
  }

  @Get('invitees')
  invitees(@CurrentUser() user: AuthenticatedUser, @Query() query: any) {
    return this.calendarService.availableInvitees(user.id, query);
  }

  @Post('events/preview')
  preview(@CurrentUser() user: AuthenticatedUser, @Body() body: any) {
    return this.calendarService.previewInvitations(user.id, body);
  }

  @Patch('events/:id')
  update(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser, @Body() body: any) {
    if (!Number.isInteger(body?.version)) throw new BadRequestException('Current event version required');
    return this.calendarService.updateEvent(id, user, body);
  }

  @Post('events/:id/cancel')
  cancel(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser, @Body() body: any) {
    return this.calendarService.cancelEvent(id, user, body);
  }

  @Get('events/:id/history')
  history(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.calendarService.history(id, user);
  }

  @Get(['', 'events'])
  async listEvents(
    @CurrentUser() user: AuthenticatedUser,
    @Query('yearBs') yearBs?: string,
    @Query('monthBs') monthBs?: string,
    @Query('branchId') branchId?: string,
    @Query('audienceScope') audienceScope?: EventAudienceScope,
  ): Promise<CalendarEventDetailDto[]> {
    return this.calendarService.listEvents(user, { branchId, audienceScope, yearBs: yearBs === undefined ? undefined : Number(yearBs), monthBs: monthBs === undefined ? undefined : Number(monthBs) });
  }

  @Get('browse')
  browse(@CurrentUser() user:AuthenticatedUser,@Query('yearBs') year?:string,@Query('monthBs') month?:string,@Query('before') before?:string,@Query('branchId') branchId?:string,@Query('audienceScope') audienceScope?:EventAudienceScope){
    return this.calendarService.browseEvents(user,{yearBs:year===undefined?undefined:Number(year),monthBs:month===undefined?undefined:Number(month),before,branchId,audienceScope});
  }

  @Get('events/:id')
  async getEvent(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<CalendarEventDetailDto> {
    return this.calendarService.getEventById(id, user);
  }

  @Post('events/:id/rsvp')
  async rsvpEvent(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CalendarEventRsvpDto,
  ): Promise<{ success: boolean; myRsvp: string }> {
    return this.calendarService.rsvpEvent(id, user.id, dto);
  }
}
