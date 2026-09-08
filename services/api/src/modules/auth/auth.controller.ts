import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { RequestOtpDto, RequestOtpResponse, VerifyOtpDto, AuthSessionDto } from '@kashyap/contracts';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('otp/request')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request OTP verification code for mobile number' })
  @ApiResponse({ status: 200, description: 'OTP initiated successfully' })
  async requestOtp(@Body() dto: RequestOtpDto): Promise<RequestOtpResponse> {
    return this.authService.requestOtp(dto);
  }

  @Post('otp/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify OTP code and retrieve access & refresh tokens' })
  @ApiResponse({ status: 200, description: 'Authenticated successfully' })
  async verifyOtp(@Body() dto: VerifyOtpDto): Promise<AuthSessionDto> {
    return this.authService.verifyOtp(dto);
  }
}
