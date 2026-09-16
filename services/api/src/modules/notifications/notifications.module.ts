import { Module, forwardRef } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { AuthModule } from '../auth/auth.module';
import { NotificationDispatcherService } from './notification-dispatcher.service';

@Module({
  imports: [DatabaseModule, forwardRef(() => AuthModule)],
  providers: [NotificationDispatcherService],
  exports: [NotificationDispatcherService],
})
export class NotificationsModule {}
