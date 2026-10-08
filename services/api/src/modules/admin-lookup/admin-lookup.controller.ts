import {Controller,Get,Query,UseGuards,Header,BadRequestException} from '@nestjs/common';
import {JwtAuthGuard} from '../auth/guards/jwt-auth.guard';
import {CurrentUser,AuthenticatedUser} from '../auth/decorators/current-user.decorator';
import {AdminLookupService} from './admin-lookup.service';
@Controller('admin/lookup')
@UseGuards(JwtAuthGuard)
export class AdminLookupController {
 constructor(private readonly service:AdminLookupService){}
 @Get() @Header('Cache-Control','no-store')
 lookup(@CurrentUser() u:AuthenticatedUser,@Query() q:Record<string,unknown>){
  if(Object.keys(q).some(k=>!['type','id'].includes(k))||typeof q.type!=='string'||typeof q.id!=='string')throw new BadRequestException('Exact type and ID are required');
  return this.service.lookup(u,q.type,q.id);
 }
}
