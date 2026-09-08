import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { GenealogyService } from './genealogy.service';
import { PersonDetailDto, TreeNodeDto } from '@kashyap/contracts';

@ApiTags('Genealogy')
@Controller('genealogy')
export class GenealogyController {
  constructor(private readonly genealogyService: GenealogyService) {}

  @Get('people/:id')
  @ApiOperation({ summary: 'Get complete Person profile with relatives' })
  @ApiResponse({ status: 200, description: 'Person details' })
  async getPerson(@Param('id') id: string): Promise<PersonDetailDto> {
    return this.genealogyService.getPersonById(id);
  }

  @Get('people/:id/tree')
  @ApiOperation({ summary: 'Get hierarchical genealogy family tree from root Person' })
  @ApiResponse({ status: 200, description: 'Hierarchical tree structure' })
  async getTree(
    @Param('id') id: string,
    @Query('ancestorGenerations') ancestorGenerations?: number,
    @Query('descendantGenerations') descendantGenerations?: number,
  ): Promise<TreeNodeDto> {
    return this.genealogyService.getTree({
      rootPersonId: id,
      ancestorGenerations: ancestorGenerations ? Number(ancestorGenerations) : 2,
      descendantGenerations: descendantGenerations ? Number(descendantGenerations) : 2,
    });
  }

  @Get('branches')
  @ApiOperation({ summary: 'List all registered Kashyap Adhikari branches' })
  async listBranches() {
    return this.genealogyService.listBranches();
  }
}
