import { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { CommunityReelService, REEL_MAX_BYTES } from './community-reel.service';
import { CommunityMediaService } from './community-media.service';
import { Controller, Get, Post, Put, Delete, Body, Param, Query, Res, UseGuards, UseInterceptors, UploadedFile, Headers } from '@nestjs/common';
import { CommunityService } from './community.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser, AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { allowedFields } from './community-policy';

@Controller('community')
@UseGuards(JwtAuthGuard)
export class CommunityController {
  constructor(private readonly service: CommunityService,private readonly media:CommunityMediaService,
    private readonly reels:CommunityReelService) {}
  @Get('reels')
  listReels(@CurrentUser() user:AuthenticatedUser, @Query('page') page?:string) {
    return this.service.listPosts(user,{ reels:true, page:page === undefined ? 1 : Number(page) });
  }

  @Post('reels')
  @UseInterceptors(FileInterceptor('video', { limits:{ files:1, fields:4, parts:5, fieldSize:8192, fileSize:REEL_MAX_BYTES } }))
  uploadReel(@CurrentUser() user:AuthenticatedUser, @Body() body:unknown, @UploadedFile() file?:{ buffer:Buffer }) {
    return this.reels.upload(user,body,file);
  }

  @Get('reels/:id/video')
  async streamReel(@Param('id') id:string, @CurrentUser() user:AuthenticatedUser, @Headers('range') range:string|undefined, @Res() res:Response) {
    const buffer = await this.reels.playback(id,user);
    res.setHeader('Cache-Control','private, no-store');
    res.setHeader('Content-Type','video/mp4');
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Accept-Ranges','bytes');
    if (range === undefined) return res.send(buffer);
    const match = /^bytes=(\d{0,16})-(\d{0,16})$/.exec(range);
    const suffix = match && !match[1] ? Number(match[2]) : 0;
    const start = match?.[1] ? Number(match[1]) : Math.max(0, buffer.length - suffix);
    const end = match?.[1] && match[2] ? Math.min(Number(match[2]), buffer.length - 1) : buffer.length - 1;
    if (!match || (!match[1] && !suffix) || start > end || start >= buffer.length) {
      return res.status(416).set('Content-Range',`bytes */${buffer.length}`).end();
    }
    return res.status(206).set('Content-Range',`bytes ${start}-${end}/${buffer.length}`)
      .send(buffer.subarray(start,end + 1));
  }
  @Put('posts/:id/sharing') sharing(@Param('id') id:string,@CurrentUser() u:AuthenticatedUser,@Body() b:any){return this.service.updateSharing(id,u,b);}
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
  @Get('posts/:id/comments/browse')
  browseComments(@Param('id') id:string,@CurrentUser() user:AuthenticatedUser,@Query('before') before?:string) { return this.service.browseComments(id,user,before); }
  @Get('posts/:id/comments')
  comments(@Param('id') id:string,@CurrentUser() user:AuthenticatedUser) { return this.service.comments(id,user); }
  @Post('posts/:id/comments')
  comment(@Param('id') id:string,@CurrentUser() user:AuthenticatedUser,@Body() body:any) { return this.service.addComment(id,user,body); }
  @Delete('posts/:id/comments/:commentId')
  removeComment(@Param('id') id:string,@Param('commentId') commentId:string,@CurrentUser() user:AuthenticatedUser,@Body() body:any) { return this.service.removeComment(id,commentId,user,body); }
  @Post('posts/:id/comments/:commentId/restore')
  restoreComment(@Param('id') id:string,@Param('commentId') c:string,@CurrentUser() u:AuthenticatedUser,@Body() b:any){return this.service.restoreComment(id,c,u,b);}
  @Post('posts/:id/comments/:commentId/flag')
  reportComment(@Param('id') id:string,@Param('commentId') c:string,@CurrentUser() u:AuthenticatedUser,@Body() b:any){return this.service.reportComment(id,c,u,b);}
  @Get('posts/:id/comment-reports')
  commentReports(@Param('id') id:string,@CurrentUser() u:AuthenticatedUser,@Query('before') before?:string){return this.service.commentReports(id,u,before);}
  @Post('posts/:id/comment-reports/:sequence/review')
  reviewCommentReport(@Param('id') id:string,@Param('sequence') seq:string,@CurrentUser() u:AuthenticatedUser,@Body() b:any){return this.service.reviewCommentReport(id,seq,u,b);}
  @Post('posts/:id/flag')
  report(@Param('id') id:string,@CurrentUser() user:AuthenticatedUser,@Body() body:any) {
    allowedFields(body,['reason']);return this.service.report(id,user,body.reason);
  }
  @Get('posts/:id/reports')
  evidence(@Param('id') id:string,@CurrentUser() u:AuthenticatedUser,@Query('before') before?:string,@Query('beforeEscalation') beforeEscalation?:string){return this.service.reportEvidence(id,u,before,beforeEscalation);}
  @Post('posts/:id/escalate')
  escalate(@Param('id') id:string,@CurrentUser() u:AuthenticatedUser,@Body() b:any){return this.service.escalate(id,u,b);}
  @Post('posts/:id/appeal')
  appeal(@Param('id') id:string,@CurrentUser() user:AuthenticatedUser,@Body() body:any) { return this.service.appealPost(id,user,body); }
  @Post('posts/:id/moderate')
  moderate(@Param('id') id:string,@CurrentUser() user:AuthenticatedUser,@Body() body:any) { return this.service.moderate(id,user,body); }
  @Delete('posts/:id')
  remove(@Param('id') id:string,@CurrentUser() user:AuthenticatedUser) { return this.service.deletePost(id,user); }
}
