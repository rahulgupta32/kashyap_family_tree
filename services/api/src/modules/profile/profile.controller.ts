import {
  Controller,
  Get,
  Patch,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  Res,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { Response } from 'express';
import {
  UpdateProfileDto,
  PrivacySettingsDto,
  NotificationPreferencesDto,
  UserSessionDto,
  UserProfileDetailDto,
  DeleteAccountResponseDto,
  Role,
} from '@kashyap/contracts';
import { ProfileService } from './profile.service';
import { CurrentUser, AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller(['me', 'profile'])
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  @Get(['', 'me'])
  @UseGuards(JwtAuthGuard)
  async getMe(@CurrentUser() user: AuthenticatedUser): Promise<UserProfileDetailDto> {
    return this.profileService.getMe(user.id);
  }

  @Patch(['profile', ''])
  @UseGuards(JwtAuthGuard)
  async updateProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateProfileDto,
  ): Promise<UserProfileDetailDto> {
    return this.profileService.updateProfile(user.id, dto);
  }

  @Post('photo')
  @UseGuards(JwtAuthGuard)
  async uploadPhoto(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: { mimeType: string; dataBase64: string },
  ) {
    return this.profileService.uploadPhoto(user.id, body.mimeType, body.dataBase64);
  }

  @Get('privacy')
  @UseGuards(JwtAuthGuard)
  async getPrivacy(@CurrentUser() user: AuthenticatedUser): Promise<PrivacySettingsDto> {
    const profile = await this.profileService.getMe(user.id);
    return profile.privacy || {
      profileVisibility: 'VERIFIED_COMMUNITY',
      contactVisibility: 'IMMEDIATE_FAMILY',
      addressVisibility: 'IMMEDIATE_FAMILY',
    };
  }

  @Put('privacy')
  @UseGuards(JwtAuthGuard)
  async updatePrivacy(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: PrivacySettingsDto,
  ): Promise<PrivacySettingsDto> {
    return this.profileService.updatePrivacySettings(user.id, dto);
  }

  @Get('preferences')
  @UseGuards(JwtAuthGuard)
  async getPreferences(@CurrentUser() user: AuthenticatedUser): Promise<NotificationPreferencesDto> {
    const profile = await this.profileService.getMe(user.id);
    return profile.preferences || {
      pushEnabled: true,
      smsEnabled: true,
      emailEnabled: true,
      familyEventsEnabled: true,
      juthoAlertsEnabled: true,
      communityPostsEnabled: true,
    };
  }

  @Put('preferences')
  @UseGuards(JwtAuthGuard)
  async updatePreferences(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: NotificationPreferencesDto,
  ): Promise<NotificationPreferencesDto> {
    return this.profileService.updateNotificationPreferences(user.id, dto);
  }

  @Get('sessions')
  @UseGuards(JwtAuthGuard)
  async getSessions(@CurrentUser() user: AuthenticatedUser): Promise<UserSessionDto[]> {
    return this.profileService.getSessions(user.id);
  }

  @Delete('sessions/:id')
  @UseGuards(JwtAuthGuard)
  async revokeSession(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') sessionId: string,
  ): Promise<{ success: boolean }> {
    return this.profileService.revokeSession(user.id, sessionId);
  }

  @Post('delete-challenge')
  @UseGuards(JwtAuthGuard)
  async requestDeleteChallenge(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ challengeId: string; expiresAt: string; cooldownSeconds: number; otp?: string }> {
    return this.profileService.requestAccountDeletionChallenge(user.id);
  }

  @Post('delete')
  @UseGuards(JwtAuthGuard)
  async deleteAccount(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: { challengeId?: string; otp?: string; password?: string },
  ): Promise<DeleteAccountResponseDto> {
    return this.profileService.deleteAccount(user.id, body);
  }

  @Post('retention/review')
  @UseGuards(JwtAuthGuard)
  async reviewLegalHold(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: { holdId: string; decision: 'MAINTAIN' | 'RELEASE'; notes?: string },
  ) {
    if (!user.roles.includes(Role.SUPER_ADMIN)) {
      throw new ForbiddenException('Only Super Admin / DPO can review legal holds');
    }
    return this.profileService.reviewLegalHold(body.holdId, user.id, body.decision, body.notes);
  }

  @Get('media/:assetId')
  async streamMedia(
    @Param('assetId') assetId: string,
    @Query('user') queryUser?: string,
    @Query('u') queryU?: string,
    @Query('expires') queryExpires?: string,
    @Query('sig') querySig?: string,
    @Res() res?: any,
  ) {
    const effectiveUser = queryUser || queryU;
    const media = await this.profileService.getMediaAsset(assetId, undefined, effectiveUser, queryExpires, querySig);
    if (res && res.setHeader && res.sendFile) {
      res.setHeader('Content-Type', media.mimeType);
      res.sendFile(media.filePath);
      return;
    }
    return media;
  }
}

