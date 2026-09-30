import { Module, forwardRef } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { AuthModule } from '../auth/auth.module';
import { NotificationDispatcherService } from './notification-dispatcher.service';
import { NotificationInboxService } from './notification-inbox.service';
import { NotificationsController } from './notifications.controller';
import { NotificationFollowsService } from './notification-follows.service';
import { GenealogyModule } from '../genealogy/genealogy.module';
import { NotificationBroadcastsService } from './notification-broadcasts.service';
import { NotificationBroadcastsController } from './notification-broadcasts.controller';

@Module({
  imports: [DatabaseModule, GenealogyModule, forwardRef(() => AuthModule)],
  controllers: [NotificationsController, NotificationBroadcastsController],
  providers: [NotificationDispatcherService, NotificationInboxService, NotificationFollowsService, NotificationBroadcastsService],
  exports: [NotificationDispatcherService, NotificationInboxService, NotificationFollowsService],
})
export class NotificationsModule {}
