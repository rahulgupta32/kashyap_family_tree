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
import {
  getJwtSecret,
  JWT_ACCESS_EXPIRY,
  JWT_ISSUER,
  JWT_AUDIENCE,
  JWT_ALGORITHM,
} from './auth.constants';

const isProd = process.env.NODE_ENV === 'production';

@Global()
@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      useFactory: () => ({
        secret: getJwtSecret(),
        signOptions: {
          expiresIn: JWT_ACCESS_EXPIRY,
          issuer: JWT_ISSUER,
          audience: JWT_AUDIENCE,
          algorithm: JWT_ALGORITHM,
        },
        verifyOptions: {
          issuer: JWT_ISSUER,
          audience: JWT_AUDIENCE,
          algorithms: [JWT_ALGORITHM],
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    JwtAuthGuard,
    RolesGuard,
    BranchGuard,
    SparrowSmsProviderAdapter,
    ...(isProd ? [] : [TestSmsProviderAdapter]),
    {
      provide: SMS_PROVIDER,
      useExisting: isProd ? SparrowSmsProviderAdapter : TestSmsProviderAdapter,
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
    ...(isProd ? [] : [TestSmsProviderAdapter]),
  ],
})
export class AuthModule {}
