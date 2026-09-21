import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { ErrorCode } from '@kashyap/contracts';

export interface ChatMessage {
  id: string;
  conversationId: string;
  senderUserId: string;
  senderName: string;
  content: string;
  mediaUrl?: string;
  readByUserIds: Set<string>;
  createdAt: string;
  isDeleted: boolean;
}

export interface ChatConversation {
  id: string;
  type: 'DIRECT' | 'FAMILY_BRANCH' | 'CLAN_ANNOUNCEMENT';
  title?: string;
  participantUserIds: Set<string>;
  branchId?: string;
  createdAt: string;
  updatedAt: string;
}

@Injectable()
export class ChatService {
  private conversations = new Map<string, ChatConversation>();
  private messages = new Map<string, ChatMessage[]>();

  constructor() {
    // Seed default branch conversation
    const conv: ChatConversation = {
      id: 'conv_branch_dhading',
      type: 'FAMILY_BRANCH',
      title: 'धादिङ शाखा परिवार समूह',
      participantUserIds: new Set(['u-401', 'u-402', 'u-admin']),
      branchId: 'branch_dhading',
      createdAt: '2026-09-08T00:00:00Z',
      updatedAt: '2026-09-08T00:00:00Z',
    };
    this.conversations.set(conv.id, conv);
    this.messages.set(conv.id, [
      {
        id: 'msg_001',
        conversationId: conv.id,
        senderUserId: 'u-401',
        senderName: 'Ram Adhikari',
        content: 'जय विन्ध्यवासिनी! सबै परिवारमा नमस्कार।',
        readByUserIds: new Set(['u-401', 'u-402']),
        createdAt: '2026-09-08T01:00:00Z',
        isDeleted: false,
      },
    ]);
  }

  async createConversation(data: {
    type: 'DIRECT' | 'FAMILY_BRANCH' | 'CLAN_ANNOUNCEMENT';
    title?: string;
    participantUserIds: string[];
    branchId?: string;
  }): Promise<ChatConversation> {
    const id = `conv_${Date.now()}`;
    const conversation: ChatConversation = {
      id,
      type: data.type,
      title: data.title,
      participantUserIds: new Set(data.participantUserIds),
      branchId: data.branchId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.conversations.set(id, conversation);
    this.messages.set(id, []);
    return conversation;
  }

  async listUserConversations(userId: string): Promise<any[]> {
    return Array.from(this.conversations.values())
      .filter((c) => c.participantUserIds.has(userId))
      .map((c) => ({
        ...c,
        participantUserIds: Array.from(c.participantUserIds),
        lastMessage: (this.messages.get(c.id) || []).slice(-1)[0] || null,
      }));
  }

  async sendMessage(data: {
    conversationId: string;
    senderUserId: string;
    senderName: string;
    content: string;
    mediaUrl?: string;
  }): Promise<ChatMessage> {
    const conv = this.conversations.get(data.conversationId);
    if (!conv) {
      throw new NotFoundException({
        errorCode: ErrorCode.CONVERSATION_NOT_FOUND,
        message: 'Conversation not found',
      });
    }

    if (!conv.participantUserIds.has(data.senderUserId)) {
      throw new BadRequestException({
        errorCode: ErrorCode.UNAUTHORIZED,
        message: 'User is not a participant of this conversation',
      });
    }

    const message: ChatMessage = {
      id: `msg_${Date.now()}`,
      conversationId: data.conversationId,
      senderUserId: data.senderUserId,
      senderName: data.senderName,
      content: data.content,
      mediaUrl: data.mediaUrl,
      readByUserIds: new Set([data.senderUserId]),
      createdAt: new Date().toISOString(),
      isDeleted: false,
    };

    const msgList = this.messages.get(data.conversationId) || [];
    msgList.push(message);
    this.messages.set(data.conversationId, msgList);

    conv.updatedAt = message.createdAt;
    return message;
  }

  async getMessages(conversationId: string, userId: string): Promise<any[]> {
    const conv = this.conversations.get(conversationId);
    if (!conv || !conv.participantUserIds.has(userId)) {
      throw new NotFoundException({
        errorCode: ErrorCode.CONVERSATION_NOT_FOUND,
        message: 'Conversation not found or access denied',
      });
    }

    return (this.messages.get(conversationId) || [])
      .filter((m) => !m.isDeleted)
      .map((m) => ({
        ...m,
        readByUserIds: Array.from(m.readByUserIds),
      }));
  }

  async markAsRead(conversationId: string, userId: string): Promise<void> {
    const msgs = this.messages.get(conversationId) || [];
    msgs.forEach((m) => m.readByUserIds.add(userId));
  }
}
