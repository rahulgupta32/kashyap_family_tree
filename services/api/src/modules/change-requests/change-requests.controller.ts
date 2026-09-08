import { Controller, Post, Get, Patch, Body, Param } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ChangeRequestsService } from './change-requests.service';
import { SubmitChangeRequestDto, ChangeRequestDetailDto, ReviewChangeRequestDto } from '@kashyap/contracts';

@ApiTags('Genealogy Change Requests')
@Controller('change-requests')
export class ChangeRequestsController {
  constructor(private readonly changeRequestsService: ChangeRequestsService) {}

  @Post()
  @ApiOperation({ summary: 'Submit a new genealogy modification request' })
  async submitRequest(@Body() dto: SubmitChangeRequestDto): Promise<ChangeRequestDetailDto> {
    return this.changeRequestsService.submitRequest('u-401', dto);
  }

  @Get()
  @ApiOperation({ summary: 'List change requests' })
  async listRequests(): Promise<ChangeRequestDetailDto[]> {
    return this.changeRequestsService.listRequests();
  }

  @Patch(':id/review')
  @ApiOperation({ summary: 'Review change request (Admin/Verifier)' })
  async reviewRequest(@Param('id') id: string, @Body() dto: ReviewChangeRequestDto): Promise<ChangeRequestDetailDto> {
    return this.changeRequestsService.reviewRequest(id, 'u-admin', dto);
  }
}
