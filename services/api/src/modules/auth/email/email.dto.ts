import { Transform, Type } from 'class-transformer';
import { IsEmail, IsIn, IsOptional, IsString, IsUUID, Matches, MaxLength, ValidateNested } from 'class-validator';

export class RequestEmailOtpDto {
  @Transform(({ value }) => typeof value === 'string' ? value.trim().toLowerCase() : value)
  @IsEmail()
  @MaxLength(254)
  email!: string;
}

class EmailDeviceInfoDto {
  @IsString()
  @MaxLength(128)
  deviceId!: string;

  @IsIn(['android', 'ios', 'web'])
  platform!: 'android' | 'ios' | 'web';

  @IsString()
  @MaxLength(64)
  appVersion!: string;
}

export class VerifyEmailOtpDto {
  @IsUUID('4')
  otpSessionId!: string;

  @IsString()
  @Matches(/^[0-9]{6}$/)
  code!: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => EmailDeviceInfoDto)
  deviceInfo?: EmailDeviceInfoDto;
}
