import {Controller,Get,Patch,Body,Param,Query,UseGuards,Header} from '@nestjs/common';
import {JwtAuthGuard} from '../auth/guards/jwt-auth.guard';
import {CurrentUser,AuthenticatedUser} from '../auth/decorators/current-user.decorator';
import {ApplicationSettingsService} from './application-settings.service';
@Controller('admin/settings')
@UseGuards(JwtAuthGuard)
export class ApplicationSettingsController {
 constructor(private readonly service:ApplicationSettingsService){}
 @Get() @Header('Cache-Control','private, no-store')
 list(@CurrentUser() u:AuthenticatedUser,@Query() query:any){return this.service.listWithQuery(u.id,query);}
 @Patch(':key') @Header('Cache-Control','private, no-store')
 update(@CurrentUser() u:AuthenticatedUser,@Param('key') key:string,@Body() body:any){return this.service.update(u.id,key,body);}
 @Get(':key/history') @Header('Cache-Control','private, no-store')
 history(@CurrentUser() u:AuthenticatedUser,@Param('key') key:string,@Query() query:any){return this.service.history(u.id,key,query);}
}
