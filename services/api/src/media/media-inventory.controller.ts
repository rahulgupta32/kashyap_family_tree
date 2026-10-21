import { LegacyMediaMigrationService } from './legacy-media-migration.service';
import { OrphanCleanupService } from './orphan-cleanup.service';
import { Controller, Get, Post, Param, Query, Body, UseGuards, Header } from '@nestjs/common';
import { JwtAuthGuard } from '../modules/auth/guards/jwt-auth.guard';
import { CurrentUser, AuthenticatedUser } from '../modules/auth/decorators/current-user.decorator';
import { allowedFields } from '../modules/community/community-policy';
import { MediaInventoryService } from './media-inventory.service';
@Controller('media-operations/inventories')
@UseGuards(JwtAuthGuard)
export class MediaInventoryController {
 constructor(private readonly inventory:MediaInventoryService,private readonly cleanup:OrphanCleanupService,private readonly migration:LegacyMediaMigrationService){}
 @Get() @Header('Cache-Control','no-store') list(@CurrentUser() user:AuthenticatedUser){return this.inventory.list(user);}
 @Post() start(@CurrentUser() user:AuthenticatedUser,@Body() body:any){allowedFields(body||{},[]);return this.inventory.start(user);}
 @Get(':id') @Header('Cache-Control','no-store') report(@CurrentUser() user:AuthenticatedUser,@Param('id') id:string,@Query('after') after?:string){return this.inventory.report(user,id,after);}
 @Post(':id/advance') advance(@CurrentUser() user:AuthenticatedUser,@Param('id') id:string,@Body() body:any){allowedFields(body||{},[]);return this.inventory.advance(user,id);}
 @Post(':id/cancel') cancel(@CurrentUser() user:AuthenticatedUser,@Param('id') id:string,@Body() body:any){allowedFields(body||{},[]);return this.inventory.cancel(user,id);}
 @Post(':id/legacy-migration') approveMigration(@CurrentUser() user:AuthenticatedUser,@Param('id') id:string,@Body() body:any){allowedFields(body,['itemIds','reason']);return this.migration.approve(user,id,body.itemIds,body.reason);}
 @Post(':id/orphan-cleanup') approveCleanup(@CurrentUser() user:AuthenticatedUser,@Param('id') id:string,@Body() body:any){allowedFields(body,['itemIds','reason']);return this.cleanup.approve(user,id,body.itemIds,body.reason);}
 @Post(':id/recover') recover(@CurrentUser() user:AuthenticatedUser,@Param('id') id:string,@Body() body:any){allowedFields(body,['itemIds']);return this.inventory.recover(user,id,body.itemIds);}
}
