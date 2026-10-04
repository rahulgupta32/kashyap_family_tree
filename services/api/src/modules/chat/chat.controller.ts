import { Response } from 'express';
import { ChatAttachmentsService } from './chat-attachments.service';
import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Res, UseGuards } from '@nestjs/common';
import { ChatService } from './chat.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser, AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { allowedFields } from '../community/community-policy';
@Controller('chat')
@UseGuards(JwtAuthGuard)
export class ChatController {
 constructor(private readonly chat:ChatService,private readonly attachments:ChatAttachmentsService){}
 @Post('conversations/:id/attachments') attachment(@Param('id') id:string,@CurrentUser() u:AuthenticatedUser,@Body() b:any){return this.attachments.send(id,u,b);}
 @Get('conversations/:id/messages/:messageId/attachment') async download(@Param('id') id:string,@Param('messageId') msg:string,@CurrentUser() u:AuthenticatedUser,@Res() res:Response){const file=await this.attachments.download(id,msg,u);res.setHeader('Content-Type',file.mimeType);res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Content-Disposition',`attachment; filename="${file.fileName}"`);res.send(file.buffer);}
 @Get('reports/:reportId/attachment') async reportedFile(@Param('reportId') id:string,@CurrentUser() u:AuthenticatedUser,@Res() res:Response){const file=await this.attachments.downloadReported(id,u);res.setHeader('Content-Type',file.mimeType);res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Content-Disposition',`attachment; filename="${file.fileName}"`);res.send(file.buffer);}
 @Get('reports') reports(@CurrentUser() u:AuthenticatedUser){return this.chat.reviewReports(u);}
 @Post('reports/:reportId/resolve') resolve(@Param('reportId') id:string,@CurrentUser() u:AuthenticatedUser,@Body() b:any){return this.chat.resolveReport(id,u,b);}
 @Post('conversations/:id/messages/:messageId/report') report(@Param('id') id:string,@Param('messageId') msg:string,@CurrentUser() u:AuthenticatedUser,@Body() b:any){return this.chat.reportMessage(id,msg,u,b);}
 @Get('conversations') list(@CurrentUser() u:AuthenticatedUser){return this.chat.list(u);}
 @Post('conversations') create(@CurrentUser() u:AuthenticatedUser,@Body() b:any){return this.chat.create(u,b);}
 @Post('conversations/:id/join') join(@Param('id') id:string,@CurrentUser() u:AuthenticatedUser){return this.chat.join(id,u);}
 @Get('conversations/:id/messages') messages(@Param('id') id:string,@CurrentUser() u:AuthenticatedUser,@Query('after') after?:string,@Query('before') before?:string){return this.chat.messages(id,u,after===undefined?0:Number(after),before===undefined?0:Number(before));}
 @Post('conversations/:id/messages') send(@Param('id') id:string,@CurrentUser() u:AuthenticatedUser,@Body() b:any){return this.chat.send(id,u,b);}
 @Post('conversations/:id/delivered') delivered(@Param('id') id:string,@CurrentUser() u:AuthenticatedUser,@Body() b:any){return this.chat.delivered(id,u,b);}
 @Post('conversations/:id/read') read(@Param('id') id:string,@CurrentUser() u:AuthenticatedUser,@Body() b:any){allowedFields(b,['sequence']);return this.chat.read(id,u,b.sequence);}
 @Delete('conversations/:id/messages/:messageId') remove(@Param('id') id:string,@Param('messageId') msg:string,@CurrentUser() u:AuthenticatedUser){return this.chat.removeMessage(id,msg,u);}
 @Post('conversations/:id/leave') leave(@Param('id') id:string,@CurrentUser() u:AuthenticatedUser){return this.chat.leave(id,u);}
 @Post('conversations/:id/block') block(@Param('id') id:string,@CurrentUser() u:AuthenticatedUser){return this.chat.block(id,u);}
 @Get('conversations/:id') info(@Param('id') id:string,@CurrentUser() u:AuthenticatedUser){return this.chat.info(id,u);}
 @Patch('conversations/:id') settings(@Param('id') id:string,@CurrentUser() u:AuthenticatedUser,@Body() b:any){return this.chat.updateGroup(id,u,b);}
 @Post('conversations/:id/members') add(@Param('id') id:string,@CurrentUser() u:AuthenticatedUser,@Body() b:any){return this.chat.addMember(id,u,b);}
 @Delete('conversations/:id/members/:userId') removeMember(@Param('id') id:string,@Param('userId') target:string,@CurrentUser() u:AuthenticatedUser,@Body() b:any){return this.chat.removeMember(id,target,u,b);}
 @Patch('conversations/:id/members/:userId') role(@Param('id') id:string,@Param('userId') target:string,@CurrentUser() u:AuthenticatedUser,@Body() b:any){return this.chat.setMemberRole(id,target,u,b);}
 @Post('conversations/:id/owner') owner(@Param('id') id:string,@CurrentUser() u:AuthenticatedUser,@Body() b:any){return this.chat.transferOwner(id,u,b);}
}
