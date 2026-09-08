import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './modules/auth/auth.module';
import { GenealogyModule } from './modules/genealogy/genealogy.module';
import { ClaimsModule } from './modules/claims/claims.module';
import { ChangeRequestsModule } from './modules/change-requests/change-requests.module';
import { CulturalRulesModule } from './modules/cultural-rules/cultural-rules.module';
import { AuditModule } from './modules/audit/audit.module';
import { CommunityModule } from './modules/community/community.module';
import { MapModule } from './modules/map/map.module';
import { ChatModule } from './modules/chat/chat.module';

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
    AuthModule,
    GenealogyModule,
    ClaimsModule,
    ChangeRequestsModule,
    CulturalRulesModule,
    AuditModule,
    CommunityModule,
    MapModule,
    ChatModule,
  ],
})
export class AppModule {}


