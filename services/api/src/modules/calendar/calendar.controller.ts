import {
  Controller,
  Get,
  Post,
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

  @Get(['', 'events'])
  async listEvents(
    @CurrentUser() user: AuthenticatedUser,
    @Query('branchId') branchId?: string,
    @Query('audienceScope') audienceScope?: EventAudienceScope,
  ): Promise<CalendarEventDetailDto[]> {
    return this.calendarService.listEvents(user, { branchId, audienceScope });
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
