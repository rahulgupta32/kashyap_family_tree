import {
  Controller,
  Post,
  Get,
  Header,
  NotFoundException,
  StreamableFile,
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
import { MediaStorageService } from '../../media/media-storage.service';

@Controller('change-requests')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ChangeRequestsController {
  constructor(
    private readonly changeRequestsService: ChangeRequestsService,
    private readonly storage: MediaStorageService,
  ) {}

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
  @Header('Cache-Control', 'private, no-store')
  async getRequest(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ChangeRequestDetailDto> {
    return this.changeRequestsService.getRequestById(id, user);
  }

  @Get(':id/evidence')
  @Header('Cache-Control', 'private, no-store')
  @Roles(Role.BRANCH_ADMIN, Role.BRANCH_VERIFIER, Role.SUPER_ADMIN)
  async listEvidence(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    const assets = await this.changeRequestsService.reviewEvidence(id, actor);
    return assets.map(asset => ({ id: asset.id, mimeType: asset.mime_type }));
  }

  @Get(':id/evidence/:assetId')
  @Header('Cache-Control', 'private, no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  @Roles(Role.BRANCH_ADMIN, Role.BRANCH_VERIFIER, Role.SUPER_ADMIN)
  async downloadEvidence(
    @Param('id') id: string,
    @Param('assetId') assetId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    const [asset] = await this.changeRequestsService.reviewEvidence(id, actor, assetId);
    if (!asset) throw new NotFoundException('Request evidence is unavailable');
    return new StreamableFile(await this.storage.read(asset), {
      type: asset.mime_type,
      disposition: 'attachment',
    });
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
