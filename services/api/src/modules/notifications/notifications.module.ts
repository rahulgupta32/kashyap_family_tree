import { Module, forwardRef } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { AuthModule } from '../auth/auth.module';
import { NotificationDispatcherService } from './notification-dispatcher.service';
import { NotificationInboxService } from './notification-inbox.service';
import { NotificationsController } from './notifications.controller';
import { NotificationFollowsService } from './notification-follows.service';
import { GenealogyModule } from '../genealogy/genealogy.module';

@Module({
  imports: [DatabaseModule, GenealogyModule, forwardRef(() => AuthModule)],
  controllers: [NotificationsController],
  providers: [NotificationDispatcherService, NotificationInboxService, NotificationFollowsService],
  exports: [NotificationDispatcherService, NotificationInboxService, NotificationFollowsService],
})
export class NotificationsModule {}
