import { Controller, Get, Post, Body, Param } from '@nestjs/common';
import { ChatService } from './chat.service';

@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Get('conversations/:userId')
  async listUserConversations(@Param('userId') userId: string) {
    const data = await this.chatService.listUserConversations(userId);
    return { success: true, data };
  }

  @Post('conversations')
  async createConversation(
    @Body()
    body: {
      type: 'DIRECT' | 'FAMILY_BRANCH' | 'CLAN_ANNOUNCEMENT';
      title?: string;
      participantUserIds: string[];
      branchId?: string;
    },
  ) {
    const conv = await this.chatService.createConversation(body);
    return { success: true, data: conv };
  }

  @Get('conversations/:id/messages/:userId')
  async getMessages(@Param('id') conversationId: string, @Param('userId') userId: string) {
    const messages = await this.chatService.getMessages(conversationId, userId);
    return { success: true, data: messages };
  }

  @Post('conversations/:id/messages')
  async sendMessage(
    @Param('id') conversationId: string,
    @Body()
    body: {
      senderUserId: string;
      senderName: string;
      content: string;
      mediaUrl?: string;
    },
  ) {
    const msg = await this.chatService.sendMessage({
      conversationId,
      senderUserId: body.senderUserId,
      senderName: body.senderName,
      content: body.content,
      mediaUrl: body.mediaUrl,
    });
    return { success: true, data: msg };
  }

  @Post('conversations/:id/read')
  async markAsRead(@Param('id') conversationId: string, @Body('userId') userId: string) {
    await this.chatService.markAsRead(conversationId, userId);
    return { success: true, message: 'Marked as read' };
  }
}
