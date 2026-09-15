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
  SubmitClaimDto,
  ClaimDetailDto,
  Tier1ReviewClaimDto,
  Tier2ReviewClaimDto,
  RequestClaimCorrectionDto,
  ResubmitClaimDto,
  FileClaimDisputeDto,
  ClaimDisputeDetailDto,
  ClaimStatus,
  Role,
} from '@kashyap/contracts';
import { ClaimsService } from './claims.service';
import { CurrentUser, AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('claims')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ClaimsController {
  constructor(private readonly claimsService: ClaimsService) {}

  @Post()
  async submitClaim(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SubmitClaimDto,
  ): Promise<ClaimDetailDto> {
    return this.claimsService.submitClaim(user.id, dto);
  }

  @Get()
  @Roles(Role.BRANCH_VERIFIER, Role.BRANCH_ADMIN, Role.SUPER_ADMIN, Role.VERIFIED_MEMBER, Role.REGISTERED_USER)
  async listClaims(
    @CurrentUser() user: AuthenticatedUser,
    @Query('status') status?: ClaimStatus,
    @Query('branchId') branchId?: string,
    @Query('claimantUserId') claimantUserId?: string,
  ): Promise<ClaimDetailDto[]> {
    return this.claimsService.listClaims(user, { status, branchId, claimantUserId });
  }

  @Get(':id')
  @Roles(Role.BRANCH_VERIFIER, Role.BRANCH_ADMIN, Role.SUPER_ADMIN, Role.VERIFIED_MEMBER, Role.REGISTERED_USER)
  async getClaim(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ClaimDetailDto> {
    return this.claimsService.getClaimById(id, user);
  }

  @Post(':id/correction-request')
  @Roles(Role.BRANCH_VERIFIER, Role.BRANCH_ADMIN, Role.SUPER_ADMIN)
  async requestCorrection(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: RequestClaimCorrectionDto,
  ): Promise<ClaimDetailDto> {
    return this.claimsService.requestCorrection(id, user, dto);
  }

  @Post(':id/resubmit')
  async resubmit(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ResubmitClaimDto,
  ): Promise<ClaimDetailDto> {
    return this.claimsService.resubmit(id, user.id, dto);
  }

  @Post(':id/tier1-review')
  @Roles(Role.BRANCH_VERIFIER, Role.BRANCH_ADMIN, Role.SUPER_ADMIN)
  async tier1Review(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: Tier1ReviewClaimDto,
  ): Promise<ClaimDetailDto> {
    return this.claimsService.tier1Review(id, user, dto);
  }

  @Post(':id/escalate')
  @Roles(Role.BRANCH_VERIFIER, Role.BRANCH_ADMIN, Role.SUPER_ADMIN)
  async escalate(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: { notes: string },
  ): Promise<ClaimDetailDto> {
    return this.claimsService.escalate(id, user, body.notes);
  }

  @Post(':id/tier2-review')
  @Roles(Role.SUPER_ADMIN)
  async tier2Review(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: Tier2ReviewClaimDto,
  ): Promise<{ claim: ClaimDetailDto; alreadyApproved: boolean }> {
    return this.claimsService.tier2Review(id, user, dto);
  }

  @Post(':id/dispute')
  async fileDispute(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: FileClaimDisputeDto,
  ): Promise<ClaimDisputeDetailDto> {
    return this.claimsService.fileDispute(id, user.id, dto);
  }

  @Post('disputes/:disputeId/resolve')
  @Roles(Role.SUPER_ADMIN)
  async resolveDispute(
    @Param('disputeId') disputeId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: { decision: 'DISMISSED' | 'RESOLVED'; notes: string },
  ): Promise<ClaimDisputeDetailDto> {
    return this.claimsService.resolveDispute(disputeId, user, body);
  }

  @Post(':id/withdraw')
  async withdraw(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ClaimDetailDto> {
    return this.claimsService.withdrawClaim(id, user.id);
  }
}
