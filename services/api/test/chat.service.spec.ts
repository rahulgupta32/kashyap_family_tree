import { ChatService } from '../src/modules/chat/chat.service';

describe('ChatService (Conversations, Messages & Read Receipts)', () => {
  let chatService: ChatService;

  beforeEach(() => {
    chatService = new ChatService();
  });

  it('should list conversations for a user', async () => {
    const convs = await chatService.listUserConversations('u-401');
    expect(convs.length).toBeGreaterThan(0);
    expect(convs[0].type).toBe('FAMILY_BRANCH');
    expect(convs[0].title).toContain('धादिङ शाखा');
  });

  it('should allow conversation participants to send and retrieve messages', async () => {
    const msg = await chatService.sendMessage({
      conversationId: 'conv_branch_dhading',
      senderUserId: 'u-402',
      senderName: 'Hari Adhikari',
      content: 'नमस्ते दाजु, के छ खबर?',
    });

    expect(msg.id).toBeDefined();
    expect(msg.content).toBe('नमस्ते दाजु, के छ खबर?');

    const messages = await chatService.getMessages('conv_branch_dhading', 'u-401');
    expect(messages.some((m) => m.id === msg.id)).toBe(true);
  });

  it('should reject messages from non-participants', async () => {
    await expect(
      chatService.sendMessage({
        conversationId: 'conv_branch_dhading',
        senderUserId: 'u-outsider',
        senderName: 'Outsider',
        content: 'Unauthorized message',
      }),
    ).rejects.toThrow('User is not a participant');
  });

  it('should mark messages as read', async () => {
    await chatService.markAsRead('conv_branch_dhading', 'u-402');
    const messages = await chatService.getMessages('conv_branch_dhading', 'u-402');
    expect(messages.every((m) => m.readByUserIds.includes('u-402'))).toBe(true);
  });
});
