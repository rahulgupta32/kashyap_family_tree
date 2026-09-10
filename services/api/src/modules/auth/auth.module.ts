import { Module, Global } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './guards/jwt.strategy';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { BranchGuard } from './guards/branch.guard';
import { SMS_PROVIDER } from './sms/sms-provider.interface';
import { TestSmsProviderAdapter } from './sms/test-sms-provider.adapter';
import { SparrowSmsProviderAdapter } from './sms/sparrow-sms-provider.adapter';

import { JWT_SECRET } from './auth.constants';

@Global()
@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register({
      secret: JWT_SECRET,
      signOptions: { expiresIn: '15m' },
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    JwtAuthGuard,
    RolesGuard,
    BranchGuard,
    TestSmsProviderAdapter,
    SparrowSmsProviderAdapter,
    {
      provide: SMS_PROVIDER,
      useExisting:
        process.env.NODE_ENV === 'production'
          ? SparrowSmsProviderAdapter
          : TestSmsProviderAdapter,
    },
  ],
  exports: [
    AuthService,
    JwtModule,
    PassportModule,
    JwtAuthGuard,
    RolesGuard,
    BranchGuard,
    SMS_PROVIDER,
    TestSmsProviderAdapter,
  ],
})
export class AuthModule {}
