import {Injectable,BadRequestException,ForbiddenException,NotFoundException} from '@nestjs/common';
import {Role} from '@kashyap/contracts';
import {DatabaseService} from '../../database/database.service';
import {AuditOutboxRepository} from '../../database/repositories/audit-outbox.repository';
import {AuthenticatedUser} from '../auth/decorators/current-user.decorator';
import {GenealogyService} from '../genealogy/genealogy.service';
import {ClaimsService} from '../claims/claims.service';
import {ChangeRequestsService} from '../change-requests/change-requests.service';
import {uuid} from '../community/community-policy';

@Injectable()
export class AdminLookupService {
 constructor(private readonly db:DatabaseService,private readonly audit:AuditOutboxRepository,private readonly genealogy:GenealogyService,private readonly claims:ClaimsService,private readonly changes:ChangeRequestsService){}
 async lookup(user:AuthenticatedUser,type:string,id:string){
  const permitted=[Role.SUPER_ADMIN,Role.CENTRAL_ADMIN,Role.BRANCH_ADMIN,Role.BRANCH_VERIFIER];
  if(!user.roles.some(r=>permitted.includes(r)))throw new ForbiddenException('Administrative lookup authority required');
  if(!['PERSON','USER','CLAIM','CHANGE_REQUEST'].includes(type))throw new BadRequestException('Choose Person, User, claim or change request');
  id=uuid(id);
  const global=user.roles.some(r=>[Role.SUPER_ADMIN,Role.CENTRAL_ADMIN].includes(r));
  let result:any;
  if(type==='USER'){
   if(!global)throw new ForbiddenException('Central account administration authority required');
   const row=(await this.db.query('SELECT id,is_active,is_suspended,is_phone_verified,person_id,created_at FROM user_accounts WHERE id=$1 AND deleted_at IS NULL',[id])).rows[0];
   if(!row)throw new NotFoundException('Record not found');
   const roles=(await this.db.query('SELECT role,branch_id FROM user_roles WHERE user_id=$1 ORDER BY role,branch_id',[id])).rows;
   result={id:row.id,isActive:row.is_active,isSuspended:row.is_suspended,isPhoneVerified:row.is_phone_verified,personId:row.person_id,createdAt:row.created_at,roles:roles.map(r=>({role:r.role,branchId:r.branch_id}))};
  }else{
   try{
    if(type==='PERSON'){
     if(!global){const branches=user.roleAssignments.filter(r=>[Role.BRANCH_ADMIN,Role.BRANCH_VERIFIER].includes(r.role)&&r.branchId).map(r=>r.branchId);
      const target=(await this.db.query('SELECT id FROM persons WHERE id=$1 AND branch_id=ANY($2::uuid[])',[id,branches])).rows[0];
      if(!target)throw new NotFoundException('Record not found');
     }
     result=await this.genealogy.getPersonById(id,{userId:user.id,personId:user.personId,roles:user.roles,roleAssignments:user.roleAssignments,branchIds:user.branchIds,isVerifiedMember:true});
     if(!global&&!user.roleAssignments.some(r=>[Role.BRANCH_ADMIN,Role.BRANCH_VERIFIER].includes(r.role)&&r.branchId===result.branchId))throw new NotFoundException('Record not found');
    }else if(type==='CLAIM')result=await this.claims.getClaimById(id,user);
    else result=await this.changes.getRequestById(id,user);
   }catch(e){if(e instanceof ForbiddenException||e instanceof NotFoundException)throw new NotFoundException('Record not found');throw e;}
  }
  await this.audit.recordAuditIntent({action:'ADMIN_EXACT_ID_LOOKUP',entityType:type,entityId:id,actorId:user.id,newValue:{lookupType:type}});
  return {type,id,result};
 }
}
