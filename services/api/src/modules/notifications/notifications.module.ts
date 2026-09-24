import { Module, forwardRef } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { AuthModule } from '../auth/auth.module';
import { NotificationDispatcherService } from './notification-dispatcher.service';
import { NotificationInboxService } from './notification-inbox.service';
import { NotificationsController } from './notifications.controller';

@Module({
  imports: [DatabaseModule, forwardRef(() => AuthModule)],
  controllers: [NotificationsController],
  providers: [NotificationDispatcherService, NotificationInboxService],
  exports: [NotificationDispatcherService, NotificationInboxService],
})
export class NotificationsModule {}
