import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  HttpCode,
  HttpStatus,
  Req,
  Res,
  UseGuards,
  UnauthorizedException,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import {
  RequestOtpDto,
  RequestOtpResponse,
  VerifyOtpDto,
  AuthSessionDto,
  RefreshTokenDto,
  LogoutDto,
  AssignRoleDto,
  RevokeRoleDto,
  UserRoleAssignmentDto,
  UserAccountDto,
  Role,
  ErrorCode,
} from '@kashyap/contracts';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { Roles } from './decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from './decorators/current-user.decorator';
import { Request, Response } from 'express';
import { normalizeNepaliPhone } from '../../common/utils/phone.util';
import { TestSmsProviderAdapter } from './sms/test-sms-provider.adapter';

function getRefreshTokenFromReq(req: Request, dto?: { refreshToken?: string }): string | undefined {
  if (dto?.refreshToken && dto.refreshToken.trim()) return dto.refreshToken.trim();
  if ((req as any).cookies?.refreshToken) return (req as any).cookies.refreshToken;
  const cookieHeader = req.headers.cookie;
  if (cookieHeader) {
    const match = cookieHeader.match(/(?:^|;\s*)refreshToken=([^;]+)/);
    if (match) {
      return decodeURIComponent(match[1]);
    }
  }
  return undefined;
}

function setRefreshTokenCookie(res: Response, token: string) {
  res.cookie('refreshToken', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  });
}

function clearRefreshTokenCookie(res: Response) {
  res.clearCookie('refreshToken', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
  });
}

@ApiTags('Authentication & Sessions')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('otp/request')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request OTP verification code for mobile number (AUTH-FR-001, AUTH-FR-002)' })
  @ApiResponse({ status: 200, description: 'OTP challenge initiated successfully' })
  async requestOtp(@Body() dto: RequestOtpDto, @Req() req: Request): Promise<RequestOtpResponse> {
    const ip = req.ip || req.socket.remoteAddress || '127.0.0.1';
    return this.authService.requestOtp(dto, ip);
  }

  @Post('otp/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify OTP code and retrieve access & refresh tokens (AUTH-FR-003, AUTH-FR-005)' })
  @ApiResponse({ status: 200, description: 'Authenticated successfully' })
  async verifyOtp(
    @Body() dto: VerifyOtpDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthSessionDto> {
    const ip = req.ip || req.socket.remoteAddress || '127.0.0.1';
    const userAgent = req.headers['user-agent'] || 'unknown';
    const session = await this.authService.verifyOtp(dto, ip, userAgent);

    // Set secure HttpOnly cookie for refresh token credentials
    setRefreshTokenCookie(res, session.refreshToken);

    return session;
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Renew session using refresh token with rotation & reuse detection (AUTH-FR-006, EC-0020)' })
  @ApiResponse({ status: 200, description: 'Token refreshed successfully' })
  async refreshToken(
    @Body() dto: RefreshTokenDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthSessionDto> {
    const ip = req.ip || req.socket.remoteAddress || '127.0.0.1';
    const userAgent = req.headers['user-agent'] || 'unknown';

    const rawRefreshToken = getRefreshTokenFromReq(req, dto);
    if (!rawRefreshToken) {
      throw new UnauthorizedException({
        errorCode: ErrorCode.UNAUTHORIZED,
        message: 'Refresh token is required',
      });
    }

    const session = await this.authService.refreshToken({ refreshToken: rawRefreshToken }, ip, userAgent);

    // Update HttpOnly cookie with rotated token
    setRefreshTokenCookie(res, session.refreshToken);

    return session;
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revoke current device session (AUTH-FR-007)' })
  @ApiResponse({ status: 200, description: 'Logged out successfully' })
  async logout(
    @Body() dto: LogoutDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ success: boolean }> {
    const ip = req.ip || req.socket.remoteAddress || '127.0.0.1';
    const userAgent = req.headers['user-agent'] || 'unknown';
    const rawRefreshToken = getRefreshTokenFromReq(req, dto);

    await this.authService.logout(
      { refreshToken: rawRefreshToken },
      (req as any).user?.id,
      (req as any).user?.sessionId,
      ip,
      userAgent,
    );

    clearRefreshTokenCookie(res);
    return { success: true };
  }

  @Post('logout-all')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Revoke all sessions across all devices for current user (AUTH-FR-008, EC-0021)' })
  @ApiResponse({ status: 200, description: 'All sessions revoked' })
  async logoutAll(
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ success: boolean; revokedCount: number }> {
    const ip = req.ip || req.socket.remoteAddress || '127.0.0.1';
    const userAgent = req.headers['user-agent'] || 'unknown';

    const result = await this.authService.logoutAll(user.id, ip, userAgent);
    clearRefreshTokenCookie(res);
    return result;
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Retrieve currently authenticated user profile and roles' })
  @ApiResponse({ status: 200, description: 'User profile retrieved successfully' })
  async getProfile(@CurrentUser() user: AuthenticatedUser): Promise<UserAccountDto> {
    return this.authService.getUserProfile(user.id);
  }

  @Post('roles/assign')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.BRANCH_ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Assign role to user with hierarchy and self-elevation check (BR-GOV-004, EC-0230)' })
  @ApiResponse({ status: 200, description: 'Role assigned successfully' })
  async assignRole(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: AssignRoleDto,
  ): Promise<UserRoleAssignmentDto> {
    return this.authService.assignUserRole(user.id, user.roles, dto.userId, dto.role, dto.branchId);
  }

  @Post('roles/revoke')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.BRANCH_ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Revoke user role assignment' })
  @ApiResponse({ status: 200, description: 'Role revoked successfully' })
  async revokeRole(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: RevokeRoleDto,
  ): Promise<{ success: boolean }> {
    return this.authService.revokeUserRole(user.id, user.roles, dto.userId, dto.role, dto.branchId);
  }

  @Get('test-otp')
  @ApiOperation({ summary: 'Retrieve simulated OTP for automated test harnesses (test-only)' })
  getTestOtp(@Query('phoneNumber') phoneNumber: string) {
    if (process.env.NODE_ENV !== 'test') {
      throw new NotFoundException();
    }
    if (!phoneNumber) {
      return { phoneNumber: null, otp: null };
    }
    const normalized = normalizeNepaliPhone(phoneNumber);
    return {
      phoneNumber: normalized,
      otp: TestSmsProviderAdapter.getLastOtpStatic(normalized),
    };
  }

  @Post('test-clear-cooldown')
  @ApiOperation({ summary: 'Clear OTP cooldown for phone in test environment' })
  async testClearCooldown(@Body() body: { phoneNumber: string }) {
    if (process.env.NODE_ENV !== 'test') {
      throw new NotFoundException();
    }
    const normalized = normalizeNepaliPhone(body.phoneNumber);
    await this.authService.clearCooldownForTest(normalized);
    return { success: true, phoneNumber: normalized };
  }
}
