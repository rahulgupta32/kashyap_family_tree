import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  UseGuards,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { GenealogyService, ActorContext } from './genealogy.service';
import { SearchService } from './search.service';
import { DuplicateService } from './duplicate.service';
import { ViewerContext } from './privacy/privacy-engine.service';
import {
  PersonDetailDto,
  PersonSummaryDto,
  TreeNodeDto,
  CreatePersonDto,
  AdminCreatePersonDto,
  AdminUpdatePersonDto,
  AdminArchivePersonDto,
  Role,
  ParentType,
  SpouseStatus,
  LivingStatus,
  Gender,
  PersonSearchResponseDto,
  EvaluatePersonDto,
  DuplicateCandidateDto,
  DuplicateCandidateQueryDto,
  DuplicateCompareDto,
  ResolveDuplicateCandidateDto,
  MergePersonsDto,
  MergeResultDto,
  GenealogyExportQueryDto,
  GenealogyExportDto,
} from '@kashyap/contracts';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { BranchGuard } from '../auth/guards/branch.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Genealogy')
@Controller('genealogy')
export class GenealogyController {
  constructor(
    private readonly genealogyService: GenealogyService,
    private readonly searchService: SearchService,
    private readonly duplicateService: DuplicateService,
  ) {}

  private extractViewer(user?: AuthenticatedUser): ViewerContext | undefined {
    if (!user) return undefined;
    const branchIds = user.branchIds || (user.roleAssignments?.map((r) => r.branchId).filter(Boolean) as string[]) || [];
    return {
      userId: user.id,
      roles: user.roles as Role[],
      branchId: branchIds[0] || undefined,
      branchIds,
      isVerifiedMember:
        user.roles.includes(Role.VERIFIED_MEMBER) ||
        user.roles.includes(Role.SUPER_ADMIN) ||
        user.roles.includes(Role.BRANCH_ADMIN),
    };
  }

  private extractActor(user: AuthenticatedUser, req?: any): ActorContext {
    const branchIds = user.branchIds || (user.roleAssignments?.map((r) => r.branchId).filter(Boolean) as string[]) || [];
    return {
      id: user.id,
      roles: user.roles as Role[],
      branchId: branchIds[0] || undefined,
      branchIds,
      ipAddress: req?.ip || '127.0.0.1',
      userAgent: req?.headers ? req.headers['user-agent'] : 'system',
    };
  }

  @Get('search')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: 'Bilingual trigram search for persons (SRCH-FR-001..008)' })
  @ApiResponse({ status: 200, description: 'Search results with privacy masking' })
  async searchPersons(
    @Query('query') query?: string,
    @Query('branchId') branchId?: string,
    @Query('generation') generation?: number,
    @Query('livingStatus') livingStatus?: LivingStatus,
    @Query('gender') gender?: Gender,
    @Query('moolGhar') moolGhar?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @CurrentUser() user?: AuthenticatedUser,
  ): Promise<PersonSearchResponseDto> {
    return this.searchService.searchPersons(
      {
        query,
        branchId,
        generation: generation ? Number(generation) : undefined,
        livingStatus,
        gender,
        moolGhar,
        page: page ? Number(page) : 1,
        limit: limit ? Number(limit) : 20,
      },
      this.extractViewer(user),
    );
  }

  @Get('people/:id')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: 'Get complete Person profile with relatives (Public read / privacy filtered)' })
  @ApiResponse({ status: 200, description: 'Person details' })
  async getPerson(
    @Param('id') id: string,
    @CurrentUser() user?: AuthenticatedUser,
  ): Promise<PersonDetailDto> {
    return this.genealogyService.getPersonById(id, this.extractViewer(user));
  }

  @Get('people/:id/tree')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: 'Get hierarchical genealogy family tree from root Person (GEN-FR-009..010)' })
  @ApiResponse({ status: 200, description: 'Hierarchical tree structure' })
  async getTree(
    @Param('id') id: string,
    @Query('ancestorGenerations') ancestorGenerations?: number,
    @Query('descendantGenerations') descendantGenerations?: number,
    @CurrentUser() user?: AuthenticatedUser,
  ): Promise<TreeNodeDto> {
    return this.genealogyService.getTree(
      {
        rootPersonId: id,
        ancestorGenerations: ancestorGenerations ? Number(ancestorGenerations) : 2,
        descendantGenerations: descendantGenerations ? Number(descendantGenerations) : 2,
      },
      this.extractViewer(user),
    );
  }

  @Get('branches')
  @ApiOperation({ summary: 'List all registered Kashyap Adhikari branches (Public read)' })
  async listBranches() {
    return this.genealogyService.listBranches();
  }

  @Post('duplicates/evaluate')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Pre-creation duplicate evaluation before record creation (DUP-FR-001)' })
  async evaluateDuplicates(
    @Body() dto: EvaluatePersonDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Array<{ person: PersonSummaryDto; score: number; signals: any }>> {
    return this.duplicateService.evaluateProposedPerson(dto, this.extractViewer(user));
  }

  @Get('duplicates/candidates')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.CENTRAL_ADMIN, Role.BRANCH_ADMIN, Role.BRANCH_VERIFIER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List duplicate review queue (DUP-FR-003)' })
  async listDuplicateCandidates(
    @Query() query: DuplicateCandidateQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ items: DuplicateCandidateDto[]; total: number }> {
    return this.duplicateService.listCandidates(query, this.extractViewer(user));
  }

  @Get('duplicates/compare')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.CENTRAL_ADMIN, Role.BRANCH_ADMIN, Role.BRANCH_VERIFIER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Side-by-side duplicate comparison (ADM-UI-011)' })
  async compareDuplicates(
    @Query('personAId') personAId: string,
    @Query('personBId') personBId: string,
    @Query('candidateId') candidateId?: string,
    @CurrentUser() user?: AuthenticatedUser,
  ): Promise<DuplicateCompareDto> {
    return this.duplicateService.comparePersons(personAId, personBId, candidateId, this.extractViewer(user));
  }

  @Patch('duplicates/candidates/:id')
  @Post('duplicates/candidates/:id/resolve')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.CENTRAL_ADMIN, Role.BRANCH_ADMIN, Role.BRANCH_VERIFIER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Resolve candidate as not-duplicate or confirmed (DUP-FR-004)' })
  async resolveCandidate(
    @Param('id') candidateId: string,
    @Body() dto: ResolveDuplicateCandidateDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<DuplicateCandidateDto> {
    return this.duplicateService.resolveCandidate(candidateId, dto, this.extractActor(user));
  }

  @Post('duplicates/merge')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.CENTRAL_ADMIN, Role.BRANCH_ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Governed atomic merge of two Person records (DUP-FR-005..009)' })
  async mergePersons(
    @Body() dto: MergePersonsDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: any,
  ): Promise<MergeResultDto> {
    return this.duplicateService.mergePersons(dto, this.extractActor(user, req));
  }

  @Post('people')
  @UseGuards(JwtAuthGuard, RolesGuard, BranchGuard)
  @Roles(Role.SUPER_ADMIN, Role.CENTRAL_ADMIN, Role.BRANCH_ADMIN, Role.BRANCH_VERIFIER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create new Person record in genealogy tree with justification (GEN-FR-016)' })
  @ApiResponse({ status: 201, description: 'Person created' })
  async createPerson(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreatePersonDto | AdminCreatePersonDto,
    @Req() req: any,
  ): Promise<PersonDetailDto> {
    const actor = this.extractActor(user, req);
    const created = await this.genealogyService.createPerson(dto, actor);
    // Background candidate scan for created person
    this.duplicateService.scanAndRecordCandidates(created.id).catch(() => {});
    return created;
  }

  @Patch('people/:id')
  @UseGuards(JwtAuthGuard, RolesGuard, BranchGuard)
  @Roles(Role.SUPER_ADMIN, Role.CENTRAL_ADMIN, Role.BRANCH_ADMIN, Role.BRANCH_VERIFIER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Direct administrative edit of Person record (GEN-FR-016)' })
  async updatePerson(
    @Param('id') id: string,
    @Body() dto: AdminUpdatePersonDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: any,
  ): Promise<PersonDetailDto> {
    return this.genealogyService.updatePerson(id, dto, this.extractActor(user, req));
  }

  @Post('people/:id/archive')
  @UseGuards(JwtAuthGuard, RolesGuard, BranchGuard)
  @Roles(Role.SUPER_ADMIN, Role.CENTRAL_ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Soft archive Person record (GEN-FR-017)' })
  async archivePerson(
    @Param('id') id: string,
    @Body() dto: AdminArchivePersonDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: any,
  ): Promise<{ success: true }> {
    await this.genealogyService.archivePerson(id, dto, this.extractActor(user, req));
    return { success: true };
  }

  @Post('people/:id/parents')
  @UseGuards(JwtAuthGuard, RolesGuard, BranchGuard)
  @Roles(Role.SUPER_ADMIN, Role.CENTRAL_ADMIN, Role.BRANCH_ADMIN, Role.BRANCH_VERIFIER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Link parent to child with cycle safety (GEN-FR-005, 008)' })
  async addParent(
    @Param('id') childId: string,
    @Body() body: { parentId: string; parentType?: ParentType },
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: any,
  ): Promise<{ success: true }> {
    await this.genealogyService.addParentLink(
      body.parentId,
      childId,
      body.parentType || ParentType.BIOLOGICAL,
      this.extractActor(user, req),
    );
    return { success: true };
  }

  @Delete('people/:id/parents/:parentId')
  @UseGuards(JwtAuthGuard, RolesGuard, BranchGuard)
  @Roles(Role.SUPER_ADMIN, Role.CENTRAL_ADMIN, Role.BRANCH_ADMIN, Role.BRANCH_VERIFIER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Remove parent link (Admin only)' })
  async removeParent(
    @Param('id') childId: string,
    @Param('parentId') parentId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: any,
  ): Promise<{ success: true }> {
    await this.genealogyService.removeParentLink(parentId, childId, this.extractActor(user, req));
    return { success: true };
  }

  @Post('people/:id/spouses')
  @UseGuards(JwtAuthGuard, RolesGuard, BranchGuard)
  @Roles(Role.SUPER_ADMIN, Role.CENTRAL_ADMIN, Role.BRANCH_ADMIN, Role.BRANCH_VERIFIER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Link spouses (GEN-FR-006)' })
  async addSpouse(
    @Param('id') personId: string,
    @Body() body: { spouseId: string; status?: SpouseStatus; marriageDateBs?: string },
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: any,
  ): Promise<{ success: true }> {
    await this.genealogyService.addSpouseLink(
      personId,
      body.spouseId,
      body.status || SpouseStatus.CURRENT,
      body.marriageDateBs,
      this.extractActor(user, req),
    );
    return { success: true };
  }

  @Delete('people/:id/spouses/:spouseId')
  @UseGuards(JwtAuthGuard, RolesGuard, BranchGuard)
  @Roles(Role.SUPER_ADMIN, Role.CENTRAL_ADMIN, Role.BRANCH_ADMIN, Role.BRANCH_VERIFIER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Remove spouse link (Admin only)' })
  async removeSpouse(
    @Param('id') personId: string,
    @Param('spouseId') spouseId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: any,
  ): Promise<{ success: true }> {
    await this.genealogyService.removeSpouseLink(personId, spouseId, this.extractActor(user, req));
    return { success: true };
  }

  @Get('export')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.CENTRAL_ADMIN, Role.BRANCH_ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Export genealogy dataset subject to privacy filtering (GEN-FR-018, PRIV-FR-007)' })
  async exportGenealogy(
    @Query() query: GenealogyExportQueryDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: any,
  ): Promise<GenealogyExportDto> {
    return this.genealogyService.exportGenealogy(query, this.extractActor(user, req));
  }
}
