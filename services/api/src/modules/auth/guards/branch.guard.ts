import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { Role, ErrorCode } from '@kashyap/contracts';
import { PersonRepository } from '../../../database/repositories/person.repository';

@Injectable()
export class BranchGuard implements CanActivate {
  constructor(private readonly personRepo: PersonRepository) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException({
        errorCode: ErrorCode.UNAUTHORIZED,
        message: 'Authentication required for branch-scoped operations',
      });
    }

    // Super Admin has unrestricted authority across all branches (BR-GOV-014, GEN-002)
    if (user.roles?.includes(Role.SUPER_ADMIN)) {
      return true;
    }

    const personId = request.params?.id || request.params?.childId || request.params?.personId;

    // CASE 1: Existing-record operation targeting a person
    if (personId) {
      const primaryPerson = await this.personRepo.findById(personId);
      if (!primaryPerson) {
        throw new NotFoundException({
          errorCode: ErrorCode.PERSON_NOT_FOUND,
          message: `Target person with id ${personId} not found.`,
        });
      }

      const authoritativeBranchId = primaryPerson.branch_id;
      if (!authoritativeBranchId) {
        throw new BadRequestException({
          errorCode: ErrorCode.BRANCH_MISMATCH,
          message: 'Target person record has no branch assignment.',
        });
      }

      // Authoritative Branch: Supplied body/query branchId must never override database; reject mismatches
      const suppliedBranchId = request.body?.branchId || request.query?.branchId;
      if (suppliedBranchId && suppliedBranchId !== authoritativeBranchId) {
        throw new ForbiddenException({
          errorCode: ErrorCode.BRANCH_MISMATCH,
          message: `Branch mismatch: Supplied branchId (${suppliedBranchId}) does not match authoritative branch (${authoritativeBranchId}) of target record.`,
          messageNepali: 'शाखा बेमेल: प्रदान गरिएको शाखा आईडी रेकर्डको आधिकारिक शाखासँग मेल खाँदैन।',
        });
      }

      // Check caller authority for target record's authoritative branch
      if (!this.checkBranchAuthority(user, authoritativeBranchId)) {
        throw new ForbiddenException({
          errorCode: ErrorCode.BRANCH_MISMATCH,
          message: `Branch mismatch: You do not possess administrative authority for branch ${authoritativeBranchId} (BR-GOV-005).`,
          messageNepali: 'शाखा बेमेल: तपाईंसँग यस शाखाको लागि प्रशासनिक अधिकार छैन।',
        });
      }

      // Cross-Branch Check: Parent mutation (GEN-002)
      if (request.body?.parentId) {
        const parentId = request.body.parentId;
        const parentPerson = await this.personRepo.findById(parentId);
        if (!parentPerson) {
          throw new NotFoundException({
            errorCode: ErrorCode.PERSON_NOT_FOUND,
            message: `Parent person with id ${parentId} not found.`,
          });
        }

        const parentBranchId = parentPerson.branch_id;
        if (!parentBranchId || !this.checkBranchAuthority(user, parentBranchId)) {
          throw new ForbiddenException({
            errorCode: ErrorCode.BRANCH_MISMATCH,
            message: `Cross-branch relationship mismatch: Caller lacks administrative authority for parent branch ${parentBranchId} (GEN-002).`,
            messageNepali: 'अन्तर-शाखा सम्बन्ध बेमेल: तपाईंसँग अभिभावकको शाखाको लागि प्रशासनिक अधिकार छैन।',
          });
        }
      }

      // Cross-Branch Check: Spouse mutation (GEN-002)
      if (request.body?.spouseId) {
        const spouseId = request.body.spouseId;
        const spousePerson = await this.personRepo.findById(spouseId);
        if (!spousePerson) {
          throw new NotFoundException({
            errorCode: ErrorCode.PERSON_NOT_FOUND,
            message: `Spouse person with id ${spouseId} not found.`,
          });
        }

        const spouseBranchId = spousePerson.branch_id;
        if (!spouseBranchId || !this.checkBranchAuthority(user, spouseBranchId)) {
          throw new ForbiddenException({
            errorCode: ErrorCode.BRANCH_MISMATCH,
            message: `Cross-branch relationship mismatch: Caller lacks administrative authority for spouse branch ${spouseBranchId} (GEN-002).`,
            messageNepali: 'अन्तर-शाखा सम्बन्ध बेमेल: तपाईंसँग जीवनसाथीको शाखाको लागि प्रशासनिक अधिकार छैन।',
          });
        }
      }

      return true;
    }

    // CASE 2: Record creation operation without existing person ID (e.g. POST /genealogy/people)
    const targetBranchId = request.body?.branchId || request.query?.branchId;
    if (!targetBranchId) {
      throw new BadRequestException({
        errorCode: ErrorCode.BRANCH_MISMATCH,
        message: 'Branch identifier cannot be determined or is missing for branch-scoped operation.',
      });
    }

    if (!this.checkBranchAuthority(user, targetBranchId)) {
      throw new ForbiddenException({
        errorCode: ErrorCode.BRANCH_MISMATCH,
        message: `Branch mismatch: You do not possess administrative authority for branch ${targetBranchId} (BR-GOV-005).`,
        messageNepali: 'शाखा बेमेल: तपाईंसँग यस शाखाको लागि प्रशासनिक अधिकार छैन।',
      });
    }

    return true;
  }

  private checkBranchAuthority(user: any, branchId: string): boolean {
    if (user.roles?.includes(Role.SUPER_ADMIN) || user.roles?.includes(Role.CENTRAL_ADMIN)) return true;
    if (user.branchIds && user.branchIds.includes(branchId)) return true;
    const roleAssignments = user.roleAssignments || [];
    return roleAssignments.some(
      (ra: { role: Role; branchId: string | null }) =>
        ra.branchId === branchId &&
        (ra.role === Role.BRANCH_ADMIN || ra.role === Role.BRANCH_VERIFIER),
    );
  }
}
