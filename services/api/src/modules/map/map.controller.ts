import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { MapService } from './map.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { CurrentUser, AuthenticatedUser } from '../auth/decorators/current-user.decorator';
@Controller('map')
export class MapController {
 constructor(private readonly map:MapService){}
 @Get('households') @UseGuards(OptionalJwtAuthGuard)
 async households(@Query() q:any,@CurrentUser() u?:AuthenticatedUser){return {success:true,data:await this.map.getHouseholds(q,u)};}
 @Get('clusters') async clusters(@Query() q:any){return {success:true,data:await this.map.getDistrictClusters(q)};}
 @Get('mine') @UseGuards(JwtAuthGuard) mine(@CurrentUser() u:AuthenticatedUser){return this.map.mine(u);}
 @Put('mine') @UseGuards(JwtAuthGuard) save(@CurrentUser() u:AuthenticatedUser,@Body() b:any){return this.map.save(u,b);}
 @Delete('mine') @UseGuards(JwtAuthGuard) withdraw(@CurrentUser() u:AuthenticatedUser){return this.map.withdraw(u);}
 @Get('review-queue') @UseGuards(JwtAuthGuard) queue(@CurrentUser() u:AuthenticatedUser){return this.map.queue(u);}
 @Post('households/:id/review') @UseGuards(JwtAuthGuard) review(@Param('id') id:string,@CurrentUser() u:AuthenticatedUser,@Body() b:any){return this.map.review(id,u,b);}
}
