import { Body, Controller, Get, Header, Param, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedUser, CurrentUser } from '../auth/decorators/current-user.decorator';
import { GenealogyImportService } from './genealogy-import.service';
@Controller('admin/genealogy-imports')
@UseGuards(JwtAuthGuard)
export class GenealogyImportController {
 constructor(private readonly service:GenealogyImportService){}
 @Get() @Header('Cache-Control','private, no-store') list(@CurrentUser() u:AuthenticatedUser,@Query() q:any){return this.service.list(u.id,q);}
 @Post() @Header('Cache-Control','private, no-store') stage(@CurrentUser() u:AuthenticatedUser,@Body() b:any){return this.service.stage(u.id,b);}
 @Get(':id') @Header('Cache-Control','private, no-store') detail(@CurrentUser() u:AuthenticatedUser,@Param('id') id:string){return this.service.detail(u.id,id);}
 @Get(':id/runs') @Header('Cache-Control','private, no-store') runs(@CurrentUser() u:AuthenticatedUser,@Param('id') id:string,@Query() q:any){return this.service.runs(u.id,id,q);}
 @Post(':id/dry-runs') @Header('Cache-Control','private, no-store') dryRun(@CurrentUser() u:AuthenticatedUser,@Param('id') id:string,@Body() b:any){return this.service.dryRun(u.id,id,b);}
 @Post(':id/erase-payload') @Header('Cache-Control','private, no-store') erase(@CurrentUser() u:AuthenticatedUser,@Param('id') id:string,@Body() b:any){return this.service.erase(u.id,id,b);}
}
