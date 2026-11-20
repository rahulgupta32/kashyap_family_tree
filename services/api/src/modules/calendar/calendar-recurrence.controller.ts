import { Body, Controller, Get, Header, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedUser, CurrentUser } from '../auth/decorators/current-user.decorator';
import { CalendarRecurrenceService } from './calendar-recurrence.service';
@Controller('calendar/recurrences')
@UseGuards(JwtAuthGuard, ThrottlerGuard)
export class CalendarRecurrenceController {
 constructor(private readonly service:CalendarRecurrenceService){}
 @Get() @Header('Cache-Control','private, no-store') list(@CurrentUser() u:AuthenticatedUser,@Query() q:any){return this.service.list(u.id,q);}
 @Post() @Header('Cache-Control','private, no-store') propose(@CurrentUser() u:AuthenticatedUser,@Body() b:any){return this.service.propose(u.id,b);}
 @Post(':id/decisions') @Header('Cache-Control','private, no-store') decide(@CurrentUser() u:AuthenticatedUser,@Param('id') id:string,@Body() b:any){return this.service.decide(u.id,id,b);}
 @Get(':id/preview') @Header('Cache-Control','private, no-store') preview(@CurrentUser() u:AuthenticatedUser,@Param('id') id:string,@Query() q:any){return this.service.preview(u.id,id,q);}
}
