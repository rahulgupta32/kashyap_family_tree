import { CalendarRecurrenceService } from './calendar-recurrence.service';
import { CalendarRecurrenceController } from './calendar-recurrence.controller';
import { ApplicationSettingsModule } from '../application-settings/application-settings.module';
import { CalendarAudienceService } from './calendar-audience.service';
import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { CalendarService } from './calendar.service';
import { CalendarDeliveryService } from './calendar-delivery.service';
import { CalendarController } from './calendar.controller';

@Module({
  imports: [DatabaseModule, ApplicationSettingsModule],
  controllers: [CalendarController, CalendarRecurrenceController],
  providers: [CalendarRecurrenceService, CalendarService, CalendarDeliveryService, CalendarAudienceService],
  exports: [CalendarService],
})
export class CalendarModule {}
