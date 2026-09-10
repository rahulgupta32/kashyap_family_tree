import { Controller, Post, Get, Patch, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ChangeRequestsService } from './change-requests.service';
import { SubmitChangeRequestDto, ChangeRequestDetailDto, ReviewChangeRequestDto, Role } from '@kashyap/contracts';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Genealogy Change Requests')
@Controller('change-requests')
export class ChangeRequestsController {
  constructor(private readonly changeRequestsService: ChangeRequestsService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Submit a new genealogy modification request' })
  async submitRequest(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SubmitChangeRequestDto,
  ): Promise<ChangeRequestDetailDto> {
    return this.changeRequestsService.submitRequest(user.id, dto);
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.BRANCH_ADMIN, Role.BRANCH_VERIFIER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List change requests (Admin/Verifier)' })
  async listRequests(): Promise<ChangeRequestDetailDto[]> {
    return this.changeRequestsService.listRequests();
  }

  @Patch(':id/review')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.BRANCH_ADMIN, Role.BRANCH_VERIFIER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Review change request (Admin/Verifier)' })
  async reviewRequest(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ReviewChangeRequestDto,
  ): Promise<ChangeRequestDetailDto> {
    return this.changeRequestsService.reviewRequest(id, user.id, dto);
  }
}
