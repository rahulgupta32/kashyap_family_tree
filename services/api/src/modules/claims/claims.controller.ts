import { Controller, Post, Get, Patch, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ClaimsService } from './claims.service';
import { SubmitClaimDto, ClaimDetailDto, ReviewClaimDto, Role } from '@kashyap/contracts';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Claims')
@Controller('claims')
export class ClaimsController {
  constructor(private readonly claimsService: ClaimsService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Submit profile claim for person' })
  async submitClaim(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SubmitClaimDto,
  ): Promise<ClaimDetailDto> {
    return this.claimsService.submitClaim(user.id, dto);
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.BRANCH_ADMIN, Role.BRANCH_VERIFIER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List all verification claims (Admin/Verifier)' })
  async listClaims(): Promise<ClaimDetailDto[]> {
    return this.claimsService.listClaims();
  }

  @Patch(':id/review')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.BRANCH_ADMIN, Role.BRANCH_VERIFIER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Review and approve/reject verification claim (Admin)' })
  async reviewClaim(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ReviewClaimDto,
  ): Promise<ClaimDetailDto> {
    return this.claimsService.reviewClaim(id, user.id, dto);
  }
}
