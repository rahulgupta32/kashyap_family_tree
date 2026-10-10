import { Injectable, BadRequestException, ForbiddenException } from '@nestjs/common';
import { Role } from '@kashyap/contracts';
import { DatabaseService } from '../../database/database.service';
import { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { allowedFields, textField, uuid } from '../community/community-policy';

@Injectable()
export class AuditService {
 constructor(private readonly db:DatabaseService){}
 private central(user:AuthenticatedUser){return user.roles.includes(Role.SUPER_ADMIN)||user.roles.includes(Role.CENTRAL_ADMIN);}
 async listAuditLogs(user:AuthenticatedUser,query:any={}){
  if(!this.central(user))throw new ForbiddenException('Central audit authority required');
  allowedFields(query,['actorId','action','entityType','entityId','from','to','cursor','limit']);
  const values:any[]=[];const where:string[]=[];
  const filter=(column:string,value:any)=>{values.push(value);where.push(`${column}=$${values.length}`);};
  if(query.actorId)filter('actor_id',uuid(query.actorId,'actor'));
  for(const [key,column] of [['action','action'],['entityType','entity_type'],['entityId','entity_id']])if(query[key])filter(column,textField(query[key],key,150));
  for(const [key,op] of [['from','>='],['to','<=']])if(query[key]){
   const date=new Date(query[key]);if(!Number.isFinite(date.getTime()))throw new BadRequestException('Invalid audit date');values.push(date.toISOString());where.push(`created_at${op}$${values.length}`);
  }
  const limit=query.limit===undefined?50:Number(query.limit);if(!Number.isInteger(limit)||limit<1||limit>100)throw new BadRequestException('Audit page size must be 1–100');
  if(query.cursor){
   if(typeof query.cursor!=='string'||query.cursor.length>500)throw new BadRequestException('Invalid audit cursor');
   let cursor:any;try{cursor=JSON.parse(Buffer.from(query.cursor,'base64url').toString());}catch{throw new BadRequestException('Invalid audit cursor');}
   if(!Array.isArray(cursor)||cursor.length!==2||!Number.isFinite(new Date(cursor[0]).getTime()))throw new BadRequestException('Invalid audit cursor');uuid(cursor[1]);
   values.push(cursor[0],cursor[1]);where.push(`(created_at,id)<($${values.length-1}::timestamptz,$${values.length}::uuid)`);
  }
  values.push(limit+1);
  // Evidence payloads, IP addresses and private messages are deliberately excluded from routine browsing.
  const rows=(await this.db.query(`SELECT id,actor_id AS "actorId",actor_role AS "actorRole",action,entity_type AS "entityType",entity_id AS "entityId",
   prev_record_hash AS "prevRecordHash",current_record_hash AS "currentRecordHash",created_at AS "createdAt"
   FROM audit_logs ${where.length?'WHERE '+where.join(' AND '):''} ORDER BY created_at DESC,id DESC LIMIT $${values.length}`,values)).rows;
  const more=rows.length>limit,items=rows.slice(0,limit),last=items[items.length-1];
  return {items,nextCursor:more?Buffer.from(JSON.stringify([last.createdAt,last.id])).toString('base64url'):null};
 }
 async dashboard(user:AuthenticatedUser){
  const global=this.central(user),branches=user.roleAssignments.filter(a=>a.role===Role.BRANCH_ADMIN&&a.branchId).map(a=>a.branchId!);
  if(!global&&!branches.length)throw new ForbiddenException('Administrative dashboard authority required');
  const count=(sql:string)=>this.db.query(sql,[global,branches]).then(r=>r.rows[0].count);
  const [persons,pendingClaims,pendingChanges,pendingLocations]=await Promise.all([
   count('SELECT count(*)::int AS count FROM persons WHERE NOT is_archived AND ($1 OR branch_id=ANY($2::uuid[]))'),
   count("SELECT count(*)::int AS count FROM profile_claims c JOIN persons p ON p.id=c.target_person_id WHERE c.status IN('PENDING_TIER1','PENDING_TIER2','RESUBMITTED','ESCALATED') AND ($1 OR p.branch_id=ANY($2::uuid[]))"),
   count("SELECT count(*)::int AS count FROM genealogy_change_requests c LEFT JOIN persons p ON p.id=c.target_person_id WHERE c.status IN('PENDING','RESUBMITTED','ESCALATED') AND ($1 OR p.branch_id=ANY($2::uuid[]))"),
   count("SELECT count(*)::int AS count FROM household_locations WHERE status='PENDING' AND ($1 OR branch_id=ANY($2::uuid[]))"),
  ]);
  return {scope:global?'GLOBAL':'ASSIGNED_BRANCHES',persons,pendingClaims,pendingChanges,pendingLocations,generatedAt:new Date().toISOString()};
 }
}
