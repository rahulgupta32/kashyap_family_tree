import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Role } from '@kashyap/contracts';
import { DatabaseService } from '../../database/database.service';
import { GenealogyService } from '../genealogy/genealogy.service';
import { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { member, uuid, allowedFields } from '../community/community-policy';

type TargetType='PERSON'|'IMMEDIATE_FAMILY'|'BRANCH'|'GENERATION'|'RELATIONSHIP_GROUP';
const groups=['PARENTS','CHILDREN','SPOUSES','SIBLINGS'] as const;
const globalRoles=[Role.SUPER_ADMIN,Role.CENTRAL_ADMIN];

@Injectable()
export class NotificationFollowsService {
  constructor(private readonly db:DatabaseService,private readonly genealogy:GenealogyService){}
  private async ownedPerson(user:AuthenticatedUser):Promise<string>{
    member(user);
    const row=(await this.db.query(`SELECT person_id FROM user_accounts
      WHERE id=$1 AND is_active=TRUE AND is_suspended=FALSE AND deleted_at IS NULL`,[user.id])).rows[0];
    if(!row?.person_id)throw new ForbiddenException('A verified, linked person is required for family follows');
    return row.person_id;
  }
  private async visiblePerson(id:string,user:AuthenticatedUser){
    await this.genealogy.getPersonById(id,{userId:user.id,personId:user.personId,roles:user.roles,
      roleAssignments:user.roleAssignments,branchIds:user.branchIds,isVerifiedMember:true});
  }
  private async accessibleBranch(id:string,user:AuthenticatedUser){
    member(user);
    const branch=await this.db.query('SELECT id FROM branches WHERE id=$1',[id]);
    if(!branch.rows.length)throw new NotFoundException('Branch not found');
    if(!user.roles.some(r=>globalRoles.includes(r))&&
      !user.roleAssignments.some(r=>r.branchId===id && ![Role.GUEST,Role.REGISTERED_USER].includes(r.role))&&
      !(await this.db.query('SELECT 1 FROM user_accounts u JOIN persons p ON p.id=u.person_id WHERE u.id=$1 AND p.branch_id=$2',[user.id,id])).rows.length)
      throw new ForbiddenException('Branch membership is required for this follow');
  }
  async create(user:AuthenticatedUser,body:any){
    allowedFields(body,['targetType','personId','branchId','generation','relationshipGroup']);
    member(user);
    const type=body.targetType as TargetType;
    if(!['PERSON','IMMEDIATE_FAMILY','BRANCH','GENERATION','RELATIONSHIP_GROUP'].includes(type))
      throw new BadRequestException('Unsupported follow target');
    let person:string|null=null,branch:string|null=null,generation:number|null=null,group:string|null=null;
    if(type==='PERSON'){
      if(body.branchId!==undefined||body.generation!==undefined||body.relationshipGroup!==undefined)throw new BadRequestException('Invalid person follow fields');
      person=uuid(body.personId,'person');await this.visiblePerson(person,user);
    }else if(type==='IMMEDIATE_FAMILY'||type==='RELATIONSHIP_GROUP'){
      if(body.branchId!==undefined||body.generation!==undefined||body.personId!==undefined)throw new BadRequestException('Family follows use the linked person');
      person=await this.ownedPerson(user);
      if(type==='RELATIONSHIP_GROUP'){
        if(!groups.includes(body.relationshipGroup))throw new BadRequestException('Unsupported relationship group');
        group=body.relationshipGroup;
      }else if(body.relationshipGroup!==undefined)throw new BadRequestException('Invalid family follow fields');
    }else{
      if(body.personId!==undefined||body.relationshipGroup!==undefined)throw new BadRequestException('Invalid branch follow fields');
      branch=uuid(body.branchId,'branch');await this.accessibleBranch(branch,user);
      if(type==='GENERATION'){
        if(!Number.isInteger(body.generation)||body.generation<1||body.generation>100)throw new BadRequestException('Invalid generation');
        generation=body.generation;
      }else if(body.generation!==undefined)throw new BadRequestException('Invalid branch follow fields');
    }
    const key=[person??branch,generation,group].filter(x=>x!==null).join(':');
    return (await this.db.query(`INSERT INTO notification_follows(user_id,target_type,target_key,person_id,branch_id,generation,relationship_group)
      VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(user_id,target_type,target_key)
      DO UPDATE SET target_key=EXCLUDED.target_key
      RETURNING id,target_type AS "targetType",person_id AS "personId",branch_id AS "branchId",
        generation,relationship_group AS "relationshipGroup",created_at AS "createdAt"`,
      [user.id,type,key,person,branch,generation,group])).rows[0];
  }
  async list(user:AuthenticatedUser){
    member(user);
    const rows=(await this.db.query(`SELECT id,target_type AS "targetType",person_id AS "personId",branch_id AS "branchId",
      generation,relationship_group AS "relationshipGroup",created_at AS "createdAt"
      FROM notification_follows WHERE user_id=$1 ORDER BY created_at DESC,id DESC LIMIT 200`,[user.id])).rows;
    const result=[];
    for(const row of rows){
      try{
        if(row.targetType==='PERSON')await this.visiblePerson(row.personId,user);
        else if(row.targetType==='IMMEDIATE_FAMILY'||row.targetType==='RELATIONSHIP_GROUP'){
          if(row.personId!==await this.ownedPerson(user))continue;
        }else await this.accessibleBranch(row.branchId,user);
        result.push(row);
      }catch{ /* A revoked scope no longer appears in the member list. */ }
    }
    return result;
  }
  async remove(user:AuthenticatedUser,id:string){
    member(user);uuid(id,'follow');
    const row=await this.db.query('DELETE FROM notification_follows WHERE id=$1 AND user_id=$2 RETURNING id',[id,user.id]);
    if(!row.rows.length)throw new NotFoundException('Follow not found');
    return {removed:true};
  }
  // Resolve only currently visible followers after a governed genealogy edit commits.
  // No names, dates or family links are put into the resulting notification text.
  async recipientsForPerson(personId:string):Promise<string[]>{
    const target=(await this.db.query('SELECT id,branch_id,generation FROM persons WHERE id=$1 AND is_archived=FALSE',[personId])).rows[0];
    if(!target)return [];
    const results=await this.db.query(`SELECT DISTINCT f.user_id,f.id AS follow_id FROM notification_follows f
      JOIN user_accounts u ON u.id=f.user_id AND u.is_active=TRUE AND u.is_suspended=FALSE AND u.deleted_at IS NULL
      WHERE (f.target_type='PERSON' AND f.person_id=$1)
      OR (f.target_type='BRANCH' AND f.branch_id=$2)
      OR (f.target_type='GENERATION' AND f.branch_id=$2 AND f.generation=$3)
      OR (f.target_type IN ('IMMEDIATE_FAMILY','RELATIONSHIP_GROUP') AND (
        (f.target_type='IMMEDIATE_FAMILY' AND f.person_id=$1)
        OR EXISTS(SELECT 1 FROM parent_links pl WHERE pl.confidence='VERIFIED' AND (
          (pl.parent_id=f.person_id AND pl.child_id=$1 AND (f.target_type='IMMEDIATE_FAMILY' OR f.relationship_group='CHILDREN'))
          OR (pl.child_id=f.person_id AND pl.parent_id=$1 AND (f.target_type='IMMEDIATE_FAMILY' OR f.relationship_group='PARENTS'))))
        OR EXISTS(SELECT 1 FROM spouse_links sl WHERE sl.confidence='VERIFIED' AND
          ((sl.person_id=f.person_id AND sl.spouse_id=$1) OR (sl.spouse_id=f.person_id AND sl.person_id=$1))
          AND (f.target_type='IMMEDIATE_FAMILY' OR f.relationship_group='SPOUSES'))
        OR (f.relationship_group='SIBLINGS' AND EXISTS(SELECT 1 FROM parent_links a
          JOIN parent_links b ON a.parent_id=b.parent_id WHERE a.child_id=f.person_id AND b.child_id=$1
          AND f.person_id<>$1 AND a.confidence='VERIFIED' AND b.confidence='VERIFIED'))
      ))`,[personId,target.branch_id,target.generation]);
    const permitted:string[]=[];
    for(const row of results.rows){
      const u=(await this.db.query(`SELECT u.id,u.person_id,array_agg(DISTINCT r.role) FILTER(WHERE r.role IS NOT NULL) AS roles,
        array_agg(DISTINCT r.branch_id) FILTER(WHERE r.branch_id IS NOT NULL) AS branches
        FROM user_accounts u LEFT JOIN user_roles r ON r.user_id=u.id WHERE u.id=$1
        GROUP BY u.id,u.person_id`,[row.user_id])).rows[0];
      if(!u||!u.roles?.some((r:Role)=>r!==Role.GUEST&&r!==Role.REGISTERED_USER))continue;
      const context={id:u.id,personId:u.person_id,roles:u.roles as Role[],branchIds:(u.branches??[]) as string[],
        roleAssignments:(await this.db.query('SELECT role,branch_id AS "branchId" FROM user_roles WHERE user_id=$1',[u.id])).rows};
      const follows=await this.list(context as AuthenticatedUser);
      if(!follows.some(f=>f.id===row.follow_id))continue;
      try{await this.visiblePerson(personId,context as AuthenticatedUser);permitted.push(u.id);}
      catch{ /* Do not send when visibility was revoked since the follow was saved. */ }
    }
    return permitted;
  }
}
