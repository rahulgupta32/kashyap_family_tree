import { ApplicationSettingsModule } from './modules/application-settings/application-settings.module';
import { BranchAdministrationModule } from './modules/branch-administration/branch-administration.module';
import { AdminLookupModule } from './modules/admin-lookup/admin-lookup.module';
import { MediaStorageModule } from './media/media-storage.module';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { DatabaseModule } from './database/database.module';
import { RedisModule } from './redis/redis.module';
import { HealthModule } from './health/health.module';
import { AuthModule } from './modules/auth/auth.module';
import { GenealogyModule } from './modules/genealogy/genealogy.module';
import { ClaimsModule } from './modules/claims/claims.module';
import { ChangeRequestsModule } from './modules/change-requests/change-requests.module';
import { CulturalRulesModule } from './modules/cultural-rules/cultural-rules.module';
import { AuditModule } from './modules/audit/audit.module';
import { CommunityModule } from './modules/community/community.module';
import { MapModule } from './modules/map/map.module';
import { ChatModule } from './modules/chat/chat.module';
import { ProfileModule } from './modules/profile/profile.module';
import { CalendarModule } from './modules/calendar/calendar.module';
import { NotificationsModule } from './modules/notifications/notifications.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 100,
      },
    ]),
    DatabaseModule,
    MediaStorageModule,
    RedisModule,
    HealthModule,
    AuthModule,
    GenealogyModule,
    ClaimsModule,
    ChangeRequestsModule,
    CulturalRulesModule,
    AuditModule,
    CommunityModule,
    MapModule,
    ChatModule,
    ProfileModule,
    CalendarModule,
    NotificationsModule,
    AdminLookupModule,
    ApplicationSettingsModule,
    BranchAdministrationModule,
  ],
})
export class AppModule {}
