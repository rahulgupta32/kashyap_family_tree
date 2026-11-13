import { Controller, Get, Post, Body, Param, Query, UseGuards, Header } from '@nestjs/common';
import { CulturalContentService } from './cultural-content.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser, AuthenticatedUser } from '../auth/decorators/current-user.decorator';
@Controller('cultural/content')
@UseGuards(JwtAuthGuard)
export class CulturalContentController {
 constructor(private readonly service:CulturalContentService){}
 @Get('published') @Header('Cache-Control','no-store') published(@Query('q') q?:string){return this.service.published(q);}
 @Get('documents') @Header('Cache-Control','no-store') list(@CurrentUser() u:AuthenticatedUser){return this.service.list(u);}
 @Post('documents') create(@CurrentUser() u:AuthenticatedUser,@Body() b:any){return this.service.create(u,b);}
 @Post('documents/:id/revisions') revise(@Param('id') id:string,@CurrentUser() u:AuthenticatedUser,@Body() b:any){return this.service.revise(id,u,b);}
 @Post('documents/:id/approver') designate(@Param('id') id:string,@CurrentUser() u:AuthenticatedUser,@Body() b:any){return this.service.designate(id,u,b);}
 @Post('documents/:id/transition') transition(@Param('id') id:string,@CurrentUser() u:AuthenticatedUser,@Body() b:any){return this.service.transition(id,u,b);}
 @Get('documents/:id/history') @Header('Cache-Control','no-store') history(@Param('id') id:string,@CurrentUser() u:AuthenticatedUser,@Query('before') b?:string){return this.service.history(id,u,b);}
 @Get('documents/:id/events') @Header('Cache-Control','no-store') events(@Param('id') id:string,@CurrentUser() u:AuthenticatedUser,@Query('before') b?:string){return this.service.events(id,u,b);}
}
