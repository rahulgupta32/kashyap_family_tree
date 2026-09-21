import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { CommunityService } from './community.service';

@Controller('community')
export class CommunityController {
  constructor(private readonly communityService: CommunityService) {}

  @Get('posts')
  async listPosts(@Query('branchId') branchId?: string) {
    const posts = await this.communityService.listPosts(branchId);
    return { success: true, data: posts };
  }

  @Post('posts')
  async createPost(
    @Body()
    body: {
      authorUserId: string;
      authorName: string;
      branchId?: string;
      title: string;
      content: string;
      category: 'ANNOUNCEMENT' | 'DISCUSSION' | 'RITUAL' | 'ACHIEVEMENT';
    },
  ) {
    const post = await this.communityService.createPost(body);
    return { success: true, data: post };
  }

  @Post('posts/:id/like')
  async toggleLike(@Param('id') postId: string, @Body('userId') userId: string) {
    const result = await this.communityService.toggleLike(postId, userId);
    return { success: true, data: result };
  }

  @Post('posts/:id/comments')
  async addComment(
    @Param('id') postId: string,
    @Body() body: { authorUserId: string; authorName: string; content: string },
  ) {
    const comment = await this.communityService.addComment(postId, body);
    return { success: true, data: comment };
  }

  @Post('posts/:id/flag')
  async flagPost(@Param('id') postId: string, @Body('reason') reason: string) {
    await this.communityService.flagPost(postId, reason);
    return { success: true, message: 'Post flagged for moderation review' };
  }

  @Get('events')
  async listEvents() {
    const events = await this.communityService.listEvents();
    return { success: true, data: events };
  }

  @Post('events/:id/rsvp')
  async rsvpEvent(
    @Param('id') eventId: string,
    @Body() body: { userId: string; response: 'GOING' | 'MAYBE' | 'DECLINED' },
  ) {
    await this.communityService.rsvpEvent(eventId, body.userId, body.response);
    return { success: true, message: 'RSVP recorded' };
  }
}
