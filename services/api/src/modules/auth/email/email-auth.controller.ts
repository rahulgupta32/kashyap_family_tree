import { Body, Controller, ForbiddenException, Header, HttpCode, Post, Req, Res, UseGuards } from '@nestjs/common';
import { Request, Response } from 'express';
import { OtpIngressGuard } from '../guards/otp-ingress.guard';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { CurrentUser, AuthenticatedUser } from '../decorators/current-user.decorator';
import { EmailAuthService } from './email-auth.service';
import { RequestEmailOtpDto, VerifyEmailOtpDto } from './email.dto';

@Controller('auth/email')
@UseGuards(OtpIngressGuard)
export class EmailAuthController {
  constructor(private readonly email: EmailAuthService) {}

  @Post('request')
  @Header('Cache-Control', 'no-store')
  @HttpCode(200)
  request(@Body() body: RequestEmailOtpDto, @Req() req: Request) {
    return this.email.request(body.email, req.ip || req.socket.remoteAddress || 'unknown');
  }

  @Post('verify')
  @Header('Cache-Control', 'no-store')
  @HttpCode(200)
  async verify(@Body() body: VerifyEmailOtpDto, @Req() req: Request,
    @Res({ passthrough: true }) res: Response) {
    const session = await this.email.verify(body, req.ip || req.socket.remoteAddress || 'unknown',
      req.headers['user-agent'] || 'unknown');
    if (!('refreshToken' in session)) throw new ForbiddenException('Invalid login purpose');
    res.cookie('refreshToken', session.refreshToken, { httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
      path: '/', maxAge: 30 * 24 * 60 * 60 * 1000 });
    const { refreshToken, ...browserSession } = session;
    return browserSession;
  }

  @Post('native/verify')
  @Header('Cache-Control', 'no-store')
  @HttpCode(200)
  nativeVerify(@Body() body: VerifyEmailOtpDto, @Req() req: Request) {
    if (req.headers.origin || req.headers.referer) throw new ForbiddenException('Browser origin rejected');
    return this.email.verify(body, req.ip || req.socket.remoteAddress || 'unknown',
      req.headers['user-agent'] || 'unknown');
  }

  @Post('link/request')
  @UseGuards(JwtAuthGuard)
  @Header('Cache-Control', 'no-store')
  @HttpCode(200)
  linkRequest(@Body() body: RequestEmailOtpDto, @Req() req: Request,
    @CurrentUser() owner: AuthenticatedUser) {
    return this.email.request(body.email, req.ip || req.socket.remoteAddress || 'unknown', owner);
  }

  @Post('link/verify')
  @UseGuards(JwtAuthGuard)
  @Header('Cache-Control', 'no-store')
  @HttpCode(200)
  linkVerify(@Body() body: VerifyEmailOtpDto, @Req() req: Request,
    @CurrentUser() owner: AuthenticatedUser) {
    return this.email.verify(body, req.ip || req.socket.remoteAddress || 'unknown',
      req.headers['user-agent'] || 'unknown', owner);
  }
}
