import { ProfileModule } from '../profile/profile.module';
import { CommunityMediaService } from './community-media.service';
import { Module } from '@nestjs/common';
import { CommunityService } from './community.service';
import { CommunityController } from './community.controller';

@Module({
  imports:[ProfileModule],
  controllers: [CommunityController],
  providers: [CommunityService,CommunityMediaService],
  exports: [CommunityService],
})
export class CommunityModule {}
