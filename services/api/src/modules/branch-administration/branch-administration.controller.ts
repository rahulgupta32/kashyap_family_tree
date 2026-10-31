import { Body, Controller, Get, Header, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedUser, CurrentUser } from '../auth/decorators/current-user.decorator';
import { BranchAdministrationService } from './branch-administration.service';
@Controller('admin/branches')
@UseGuards(JwtAuthGuard)
export class BranchAdministrationController {
 constructor(private readonly service: BranchAdministrationService) {}
 @Get() @Header('Cache-Control', 'private, no-store')
 list(@CurrentUser() u: AuthenticatedUser, @Query() q: any) { return this.service.list(u.id, q); }
 @Post() @Header('Cache-Control', 'private, no-store')
 create(@CurrentUser() u: AuthenticatedUser, @Body() body: any) { return this.service.create(u.id, body); }
 @Patch(':id') @Header('Cache-Control', 'private, no-store')
 update(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string, @Body() body: any) { return this.service.update(u.id, id, body); }
 @Get(':id/history') @Header('Cache-Control', 'private, no-store')
 history(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string, @Query() q: any) { return this.service.history(u.id, id, 0, q); }
 @Get(':id/generations') @Header('Cache-Control', 'private, no-store')
 generations(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string, @Query() q: any) { return this.service.generations(u.id, id, q); }
 @Post(':id/generations') @Header('Cache-Control', 'private, no-store')
 createGeneration(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string, @Body() body: any) { return this.service.saveGeneration(u.id, id, body); }
 @Patch(':id/generations/:generation') @Header('Cache-Control', 'private, no-store')
 updateGeneration(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string, @Param('generation') generation: string, @Body() body: any) { return this.service.saveGeneration(u.id, id, body, generation); }
 @Get(':id/generations/:generation/history') @Header('Cache-Control', 'private, no-store')
 generationHistory(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string, @Param('generation') generation: string, @Query() q: any) { return this.service.history(u.id, id, generation, q); }
}
