import {
  Controller,
  Get,
  Patch,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import {
  UpdateProfileDto,
  PrivacySettingsDto,
  NotificationPreferencesDto,
  UserSessionDto,
  UserProfileDetailDto,
  DeleteAccountResponseDto,
} from '@kashyap/contracts';
import { ProfileService } from './profile.service';
import { CurrentUser, AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('me')
@UseGuards(JwtAuthGuard)
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  @Get()
  async getMe(@CurrentUser() user: AuthenticatedUser): Promise<UserProfileDetailDto> {
    return this.profileService.getMe(user.id);
  }

  @Patch('profile')
  async updateProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateProfileDto,
  ): Promise<UserProfileDetailDto> {
    return this.profileService.updateProfile(user.id, dto);
  }

  @Post('photo')
  async uploadPhoto(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: { mimeType: string; dataBase64: string },
  ) {
    return this.profileService.uploadPhoto(user.id, body.mimeType, body.dataBase64);
  }

  @Get('privacy')
  async getPrivacy(@CurrentUser() user: AuthenticatedUser): Promise<PrivacySettingsDto> {
    const profile = await this.profileService.getMe(user.id);
    return profile.privacy || {
      profileVisibility: 'VERIFIED_COMMUNITY',
      contactVisibility: 'IMMEDIATE_FAMILY',
      addressVisibility: 'IMMEDIATE_FAMILY',
    };
  }

  @Put('privacy')
  async updatePrivacy(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: PrivacySettingsDto,
  ): Promise<PrivacySettingsDto> {
    return this.profileService.updatePrivacySettings(user.id, dto);
  }

  @Get('preferences')
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
  async updatePreferences(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: NotificationPreferencesDto,
  ): Promise<NotificationPreferencesDto> {
    return this.profileService.updatePreferences(user.id, dto);
  }

  @Get('sessions')
  async getSessions(@CurrentUser() user: AuthenticatedUser): Promise<UserSessionDto[]> {
    return this.profileService.getSessions(user.id);
  }

  @Delete('sessions/:id')
  async revokeSession(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') sessionId: string,
  ): Promise<{ success: boolean }> {
    return this.profileService.revokeSession(user.id, sessionId);
  }

  @Post('delete')
  async deleteAccount(@CurrentUser() user: AuthenticatedUser): Promise<DeleteAccountResponseDto> {
    return this.profileService.deleteAccount(user.id);
  }
}
