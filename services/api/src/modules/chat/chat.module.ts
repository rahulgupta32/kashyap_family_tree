import { ChatMediaService } from './chat-media.service';
import { ChatCallsService } from './chat-calls.service';
import { ChatAttachmentsService } from './chat-attachments.service';
import { ProfileModule } from '../profile/profile.module';
import { Module } from '@nestjs/common';
import { GenealogyModule } from '../genealogy/genealogy.module';
import { ChatGateway } from './chat.gateway';
import { ChatService } from './chat.service';
import { ChatController } from './chat.controller';

@Module({
  imports: [GenealogyModule, ProfileModule],
  controllers: [ChatController],
  providers: [ChatService, ChatGateway, ChatAttachmentsService, ChatCallsService, ChatMediaService],
  exports: [ChatService],
})
export class ChatModule {}

