import { Response } from 'express';
import { CommunityMediaService } from './community-media.service';
import { Controller, Get, Post, Put, Delete, Body, Param, Query, Res, UseGuards } from '@nestjs/common';
import { CommunityService } from './community.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser, AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { allowedFields } from './community-policy';

@Controller('community')
@UseGuards(JwtAuthGuard)
export class CommunityController {
  constructor(private readonly service: CommunityService,private readonly media:CommunityMediaService) {}
  @Post('posts/:id/media') upload(@Param('id') id:string,@CurrentUser() u:AuthenticatedUser,@Body() b:any){return this.media.upload(id,u,b);}
  @Delete('posts/:id/media') removeMedia(@Param('id') id:string,@CurrentUser() u:AuthenticatedUser,@Body() b:any){return this.media.remove(id,u,b);}
  @Post('posts/:id/media/:assetId/retry') retryMedia(@Param('id') id:string,@Param('assetId') asset:string,@CurrentUser() u:AuthenticatedUser){return this.media.retry(id,asset,u);}
  @Get('posts/:id/media/:assetId') async download(@Param('id') id:string,@Param('assetId') asset:string,@CurrentUser() u:AuthenticatedUser,@Query('variant') variant:string,@Res() res:Response){
    const file=await this.media.download(id,asset,u,variant);res.setHeader('Content-Type',file.mimeType);res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Content-Disposition',`attachment; filename="${file.fileName}"`);res.send(file.buffer);
  }
  @Get('posts')
  list(@CurrentUser() user: AuthenticatedUser, @Query('branchId') branchId?: string, @Query('queue') queue?: string, @Query('page') page?: string) {
    return this.service.listPosts(user,{branchId,queue:queue==='true',page:page===undefined?1:Number(page)});
  }
  @Post('posts')
  create(@CurrentUser() user: AuthenticatedUser,@Body() body:any) { return this.service.createPost(user,body); }
  @Put('posts/:id')
  edit(@Param('id') id:string,@CurrentUser() user:AuthenticatedUser,@Body() body:any) { return this.service.editPost(id,user,body); }
  @Get('posts/:id/revisions')
  revisions(@Param('id') id:string,@CurrentUser() user:AuthenticatedUser,@Query('page') page?:string) {
    return this.service.revisions(id,user,page===undefined?1:Number(page));
  }
  @Get('posts/:id/moderation-history')
  moderationHistory(@Param('id') id:string,@CurrentUser() user:AuthenticatedUser,@Query('beforeVersion') before?:string) {
    return this.service.moderationHistory(id,user,before===undefined?undefined:Number(before));
  }
  @Put('posts/:id/like')
  like(@Param('id') id:string,@CurrentUser() user:AuthenticatedUser,@Body() body:any) {
    allowedFields(body,['liked']); return this.service.react(id,user,body.liked);
  }
  @Get('posts/:id/comments')
  comments(@Param('id') id:string,@CurrentUser() user:AuthenticatedUser) { return this.service.comments(id,user); }
  @Post('posts/:id/comments')
  comment(@Param('id') id:string,@CurrentUser() user:AuthenticatedUser,@Body() body:any) { return this.service.addComment(id,user,body); }
  @Post('posts/:id/flag')
  report(@Param('id') id:string,@CurrentUser() user:AuthenticatedUser,@Body() body:any) {
    allowedFields(body,['reason']);return this.service.report(id,user,body.reason);
  }
  @Post('posts/:id/appeal')
  appeal(@Param('id') id:string,@CurrentUser() user:AuthenticatedUser,@Body() body:any) { return this.service.appealPost(id,user,body); }
  @Post('posts/:id/moderate')
  moderate(@Param('id') id:string,@CurrentUser() user:AuthenticatedUser,@Body() body:any) { return this.service.moderate(id,user,body); }
  @Delete('posts/:id')
  remove(@Param('id') id:string,@CurrentUser() user:AuthenticatedUser) { return this.service.deletePost(id,user); }
}
