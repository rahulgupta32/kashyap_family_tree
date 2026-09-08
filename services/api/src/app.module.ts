import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from './modules/auth/auth.module';
import { GenealogyModule } from './modules/genealogy/genealogy.module';
import { ClaimsModule } from './modules/claims/claims.module';
import { ChangeRequestsModule } from './modules/change-requests/change-requests.module';
import { CulturalRulesModule } from './modules/cultural-rules/cultural-rules.module';
import { AuditModule } from './modules/audit/audit.module';

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
    AuthModule,
    GenealogyModule,
    ClaimsModule,
    ChangeRequestsModule,
    CulturalRulesModule,
    AuditModule,
  ],
})
export class AppModule {}
