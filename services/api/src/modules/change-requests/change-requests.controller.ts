import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  SubmitChangeRequestDto,
  ChangeRequestDetailDto,
  ReviewChangeRequestDto,
  ResubmitChangeRequestDto,
  ChangeRequestStatus,
  Role,
} from '@kashyap/contracts';
import { ChangeRequestsService } from './change-requests.service';
import { CurrentUser, AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('change-requests')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ChangeRequestsController {
  constructor(private readonly changeRequestsService: ChangeRequestsService) {}

  @Post()
  async submitRequest(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SubmitChangeRequestDto,
  ): Promise<ChangeRequestDetailDto> {
    return this.changeRequestsService.submitRequest(user.id, dto);
  }

  @Get()
  async listRequests(
    @CurrentUser() user: AuthenticatedUser,
    @Query('status') status?: ChangeRequestStatus,
    @Query('branchId') branchId?: string,
  ): Promise<ChangeRequestDetailDto[]> {
    return this.changeRequestsService.listRequests(user, { status, branchId });
  }

  @Get(':id')
  async getRequest(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ChangeRequestDetailDto> {
    return this.changeRequestsService.getRequestById(id, user);
  }

  @Post(':id/correction-request')
  @Roles(Role.BRANCH_ADMIN, Role.BRANCH_VERIFIER, Role.SUPER_ADMIN)
  async requestCorrection(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body('notes') notes: string,
  ): Promise<ChangeRequestDetailDto> {
    return this.changeRequestsService.requestCorrection(id, user, notes);
  }

  @Post(':id/resubmit')
  async resubmit(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ResubmitChangeRequestDto,
  ): Promise<ChangeRequestDetailDto> {
    return this.changeRequestsService.resubmit(id, user.id, dto);
  }

  @Post(':id/escalate')
  @Roles(Role.BRANCH_ADMIN, Role.BRANCH_VERIFIER, Role.SUPER_ADMIN)
  async escalate(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body('notes') notes: string,
  ): Promise<ChangeRequestDetailDto> {
    return this.changeRequestsService.escalate(id, user, notes);
  }

  @Post(':id/review')
  @Roles(Role.BRANCH_ADMIN, Role.BRANCH_VERIFIER, Role.SUPER_ADMIN)
  async reviewRequest(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ReviewChangeRequestDto,
  ): Promise<ChangeRequestDetailDto> {
    return this.changeRequestsService.reviewRequest(id, user, dto);
  }
}
