import { Controller, Get, Post, Param, Query, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { GenealogyService } from './genealogy.service';
import { PersonDetailDto, TreeNodeDto, CreatePersonDto, Role, ParentType, SpouseStatus } from '@kashyap/contracts';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { BranchGuard } from '../auth/guards/branch.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Genealogy')
@Controller('genealogy')
export class GenealogyController {
  constructor(private readonly genealogyService: GenealogyService) {}

  @Get('people/:id')
  @ApiOperation({ summary: 'Get complete Person profile with relatives (Public read)' })
  @ApiResponse({ status: 200, description: 'Person details' })
  async getPerson(@Param('id') id: string): Promise<PersonDetailDto> {
    return this.genealogyService.getPersonById(id);
  }

  @Get('people/:id/tree')
  @ApiOperation({ summary: 'Get hierarchical genealogy family tree from root Person (Public read)' })
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
  @ApiOperation({ summary: 'List all registered Kashyap Adhikari branches (Public read)' })
  async listBranches() {
    return this.genealogyService.listBranches();
  }

  @Post('people')
  @UseGuards(JwtAuthGuard, RolesGuard, BranchGuard)
  @Roles(Role.SUPER_ADMIN, Role.BRANCH_ADMIN, Role.BRANCH_VERIFIER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create new Person record in genealogy tree (Admin/Verifier only)' })
  @ApiResponse({ status: 201, description: 'Person created' })
  async createPerson(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreatePersonDto,
  ): Promise<PersonDetailDto> {
    return this.genealogyService.createPerson(dto);
  }

  @Post('people/:id/parents')
  @UseGuards(JwtAuthGuard, RolesGuard, BranchGuard)
  @Roles(Role.SUPER_ADMIN, Role.BRANCH_ADMIN, Role.BRANCH_VERIFIER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Link parent to child (Admin/Verifier only)' })
  async addParent(
    @Param('id') childId: string,
    @Body() body: { parentId: string; parentType?: ParentType },
  ): Promise<void> {
    return this.genealogyService.addParentLink(
      body.parentId,
      childId,
      body.parentType || ParentType.BIOLOGICAL,
    );
  }

  @Post('people/:id/spouses')
  @UseGuards(JwtAuthGuard, RolesGuard, BranchGuard)
  @Roles(Role.SUPER_ADMIN, Role.BRANCH_ADMIN, Role.BRANCH_VERIFIER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Link spouses (Admin/Verifier only)' })
  async addSpouse(
    @Param('id') personId: string,
    @Body() body: { spouseId: string; status?: SpouseStatus },
  ): Promise<void> {
    return this.genealogyService.addSpouseLink(
      personId,
      body.spouseId,
      body.status || SpouseStatus.CURRENT,
    );
  }
}
