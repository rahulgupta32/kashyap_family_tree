import { Module } from '@nestjs/common';
import { GenealogyModule } from '../genealogy/genealogy.module';
import { ChatGateway } from './chat.gateway';
import { ChatService } from './chat.service';
import { ChatController } from './chat.controller';

@Module({
  imports: [GenealogyModule],
  controllers: [ChatController],
  providers: [ChatService, ChatGateway],
  exports: [ChatService],
})
export class ChatModule {}

