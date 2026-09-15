import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { NotificationDispatcherService } from './notification-dispatcher.service';

@Module({
  imports: [DatabaseModule],
  providers: [NotificationDispatcherService],
  exports: [NotificationDispatcherService],
})
export class NotificationsModule {}
