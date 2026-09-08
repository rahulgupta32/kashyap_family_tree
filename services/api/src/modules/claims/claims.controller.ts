import { Controller, Post, Get, Patch, Body, Param } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ClaimsService } from './claims.service';
import { SubmitClaimDto, ClaimDetailDto, ReviewClaimDto } from '@kashyap/contracts';

@ApiTags('Claims')
@Controller('claims')
export class ClaimsController {
  constructor(private readonly claimsService: ClaimsService) {}

  @Post()
  @ApiOperation({ summary: 'Submit profile claim for person' })
  async submitClaim(@Body() dto: SubmitClaimDto): Promise<ClaimDetailDto> {
    return this.claimsService.submitClaim('u-401', dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all verification claims (Admin)' })
  async listClaims(): Promise<ClaimDetailDto[]> {
    return this.claimsService.listClaims();
  }

  @Patch(':id/review')
  @ApiOperation({ summary: 'Review and approve/reject verification claim (Admin)' })
  async reviewClaim(@Param('id') id: string, @Body() dto: ReviewClaimDto): Promise<ClaimDetailDto> {
    return this.claimsService.reviewClaim(id, 'u-admin', dto);
  }
}
