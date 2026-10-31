import { Injectable, BadRequestException, ForbiddenException, NotFoundException, ConflictException } from '@nestjs/common';
import { Role } from '@kashyap/contracts';
import { DatabaseService } from '../../database/database.service';
import { AuditOutboxRepository } from '../../database/repositories/audit-outbox.repository';
import { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { allowedFields, textField, uuid } from '../community/community-policy';

const EDITORS=[Role.SUPER_ADMIN,Role.CENTRAL_ADMIN,Role.CULTURAL_HISTORIAN];
@Injectable()
export class CulturalContentService {
 constructor(private readonly db:DatabaseService,private readonly audit:AuditOutboxRepository){}
 private editor(u:AuthenticatedUser){if(!u.roles.some(r=>EDITORS.includes(r)))throw new ForbiddenException('Content manager authority required');}
 private admin(u:AuthenticatedUser){if(!u.roles.some(r=>[Role.SUPER_ADMIN,Role.CENTRAL_ADMIN].includes(r)))throw new ForbiddenException('Central administrator required');}
 private content(b:any){
  allowedFields(b,['slug','titleNepali','titleEnglish','contentNepali','contentEnglish','category','keywords','provenance','version','reason']);
  if(!Array.isArray(b.keywords)||b.keywords.length>20)throw new BadRequestException('At most 20 keywords are required');
  return [textField(b.titleNepali,'Nepali title',255),b.titleEnglish===undefined?null:textField(b.titleEnglish,'English title',255),
   textField(b.contentNepali,'Nepali content',50000),b.contentEnglish===undefined?null:textField(b.contentEnglish,'English content',50000),
   textField(b.category,'Category',50),b.keywords.map((k:any)=>textField(k,'Keyword',80)),textField(b.provenance,'Source provenance',4000)];
 }
 private version(b:any){if(!Number.isSafeInteger(b.version)||b.version<1)throw new BadRequestException('Current document version required');return b.version;}
 private async event(c:any,d:any,r:number,u:AuthenticatedUser,action:string,reason:string){
  await c.query('INSERT INTO cultural_revision_events(document_id,revision,action,actor_id,reason,document_version,designated_approver_id) VALUES($1,$2,$3,$4,$5,$6,$7)',[d.id,r,action,u.id,reason,d.version,d.designated_approver_id||null]);
  await this.audit.recordAuditIntent({action:'CULTURAL_CONTENT_'+action,entityType:'CULTURAL_DOCUMENT',entityId:d.id,actorId:u.id,newValue:{revision:r,documentVersion:d.version,reason,designatedApproverId:d.designated_approver_id||null}},c);
 }
 private async document(c:any,id:string,u:AuthenticatedUser,version?:number){
  const d=(await c.query('SELECT * FROM cultural_documents WHERE id=$1 FOR UPDATE',[uuid(id)])).rows[0];
  if(!d)throw new NotFoundException('Document not found');
  if(!u.roles.some(r=>EDITORS.includes(r))&&d.designated_approver_id!==u.id)throw new NotFoundException('Document not found');
  if(version!==undefined&&d.version!==version)throw new ConflictException('Document changed; reload its current version');
  return d;
 }
 async create(u:AuthenticatedUser,b:any){
  this.editor(u);const values=this.content(b),slug=textField(b.slug,'Slug',120);
  if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))throw new BadRequestException('Use a lowercase URL slug');
  if(b.version!==undefined||b.reason!==undefined)throw new BadRequestException('New documents do not accept revision controls');
  return this.db.transaction(async c=>{
   // ON CONFLICT avoids exposing database error details for occupied slugs.
   const d=(await c.query('INSERT INTO cultural_documents(slug) VALUES($1) ON CONFLICT(slug) DO NOTHING RETURNING *',[slug])).rows[0];
   if(!d)throw new ConflictException('Slug already exists');
   await this.insert(c,d.id,1,u.id,values);await this.event(c,d,1,u,'CREATED','Initial draft');return d;
  });
 }
 private async insert(c:any,id:string,r:number,author:string,values:any[]){
  await c.query(`INSERT INTO cultural_revisions(document_id,revision,state,author_id,title_nepali,title_english,content_nepali,content_english,category,keywords,provenance)
   VALUES($1,$2,'DRAFT',$3,$4,$5,$6,$7,$8,$9,$10)`,[id,r,author,...values]);
 }
 async revise(id:string,u:AuthenticatedUser,b:any){
  this.editor(u);const values=this.content(b),v=this.version(b),reason=textField(b.reason,'Revision reason',2000);
  if(b.slug!==undefined)throw new BadRequestException('A document slug is immutable');
  return this.db.transaction(async c=>{
   const d=await this.document(c,id,u,v);
   const pending=(await c.query("SELECT * FROM cultural_revisions WHERE document_id=$1 AND state IN ('DRAFT','REVIEW','APPROVED')",[id])).rows[0];
   if(pending&&pending.state!=='DRAFT')throw new ConflictException('Return the pending revision to draft before replacing it');
   if(pending){await c.query("UPDATE cultural_revisions SET state='ARCHIVED' WHERE document_id=$1 AND revision=$2",[id,pending.revision]);}
   const r=Number((await c.query('SELECT coalesce(max(revision),0)+1 AS next FROM cultural_revisions WHERE document_id=$1',[id])).rows[0].next);
   await this.insert(c,id,r,u.id,values);d.version++;
   await c.query('UPDATE cultural_documents SET version=$2 WHERE id=$1',[id,d.version]);
   if(pending)await this.event(c,d,pending.revision,u,'DRAFT_REPLACED',reason);
   await this.event(c,d,r,u,'REVISED',reason);return d;
  });
 }
 async designate(id:string,u:AuthenticatedUser,b:any){
  this.admin(u);allowedFields(b,['version','approverId','reason']);const v=this.version(b),approver=uuid(b.approverId),reason=textField(b.reason,'Designation reason',2000);
  return this.db.transaction(async c=>{
   const d=await this.document(c,id,u,v);
   // Only active, currently verified accounts may be designated. Assignment is explicit, not inferred from admin status.
   const candidate=(await c.query(`SELECT u.id FROM user_accounts u WHERE u.id=$1 AND u.is_phone_verified AND u.is_active AND NOT u.is_suspended AND u.deleted_at IS NULL
    AND EXISTS(SELECT 1 FROM user_roles r WHERE r.user_id=u.id AND r.role NOT IN ('REGISTERED_USER','GUEST'))`,[approver])).rows[0];
   if(!candidate)throw new BadRequestException('Approver must be an active verified account');
   const pending=(await c.query("SELECT * FROM cultural_revisions WHERE document_id=$1 AND state IN ('DRAFT','REVIEW','APPROVED')",[id])).rows[0];
   if(!pending||pending.state==='APPROVED')throw new ConflictException('Designate the approver before approval');
   if([pending.author_id,pending.reviewer_id].includes(approver))throw new ForbiddenException('Approver must be independent from author and reviewer');
   d.designated_approver_id=approver;d.version++;await c.query('UPDATE cultural_documents SET designated_approver_id=$2,version=$3 WHERE id=$1',[id,approver,d.version]);
   await this.event(c,d,pending.revision,u,'APPROVER_ASSIGNED',reason);return {...d,designated_approver_id:approver};
  });
 }
 async transition(id:string,u:AuthenticatedUser,b:any){
  allowedFields(b,['version','revision','action','reason']);const v=this.version(b),reason=textField(b.reason,'Decision reason',2000);
  if(!Number.isSafeInteger(b.revision)||b.revision<1)throw new BadRequestException('Revision required');
  if(!['SUBMIT','REVIEW','RETURN','APPROVE','PUBLISH','ARCHIVE'].includes(b.action))throw new BadRequestException('Unknown content action');
  return this.db.transaction(async c=>{
   const d=await this.document(c,id,u,v),r=(await c.query('SELECT * FROM cultural_revisions WHERE document_id=$1 AND revision=$2',[id,b.revision])).rows[0];
   if(!r)throw new NotFoundException('Revision not found');
   const requireState=(s:string)=>{if(r.state!==s)throw new ConflictException('Revision is not in the required state');};
   if(b.action==='SUBMIT'){
    this.editor(u);requireState('DRAFT');await c.query("UPDATE cultural_revisions SET state='REVIEW',reviewer_id=NULL,reviewed_at=NULL,approved_by=NULL,approved_at=NULL WHERE document_id=$1 AND revision=$2",[id,r.revision]);
   }else if(b.action==='REVIEW'){
    this.editor(u);requireState('REVIEW');if(r.reviewer_id)throw new ConflictException('Revision already reviewed');
    if(r.author_id===u.id||d.designated_approver_id===u.id)throw new ForbiddenException('Reviewer must be independent from author and approver');
    await c.query('UPDATE cultural_revisions SET reviewer_id=$3,reviewed_at=NOW() WHERE document_id=$1 AND revision=$2',[id,r.revision,u.id]);
   }else if(b.action==='RETURN'){
    this.editor(u);if(!['REVIEW','APPROVED'].includes(r.state))throw new ConflictException('Only pending review or approval can be returned');
    await c.query("UPDATE cultural_revisions SET state='DRAFT',reviewer_id=NULL,reviewed_at=NULL,approved_by=NULL,approved_at=NULL WHERE document_id=$1 AND revision=$2",[id,r.revision]);
   }else if(b.action==='APPROVE'){
    requireState('REVIEW');if(!u.roles.some(x=>x!==Role.REGISTERED_USER&&x!==Role.GUEST)||d.designated_approver_id!==u.id||!r.reviewer_id||r.author_id===u.id||r.reviewer_id===u.id)throw new ForbiddenException('Independent designated approval after review required');
    await c.query("UPDATE cultural_revisions SET state='APPROVED',approved_by=$3,approved_at=NOW() WHERE document_id=$1 AND revision=$2",[id,r.revision,u.id]);
   }else if(b.action==='PUBLISH'){
    this.editor(u);requireState('APPROVED');if(!r.approved_by||r.approved_by!==d.designated_approver_id)throw new ConflictException('Current designated approval required');
    const signers=(await c.query(`SELECT u.id FROM user_accounts u WHERE u.id=ANY($1::uuid[]) AND u.is_phone_verified AND u.is_active AND NOT u.is_suspended AND u.deleted_at IS NULL AND EXISTS(SELECT 1 FROM user_roles x WHERE x.user_id=u.id AND ((u.id=$2 AND x.role IN ('SUPER_ADMIN','CENTRAL_ADMIN','CULTURAL_HISTORIAN')) OR (u.id=$3 AND x.role NOT IN ('REGISTERED_USER','GUEST'))))`,[[r.reviewer_id,r.approved_by],r.reviewer_id,r.approved_by])).rows;
    if(signers.length!==2)throw new ForbiddenException('Reviewer and approver must remain active verified accounts');
    if(d.published_revision){await c.query("UPDATE cultural_revisions SET state='SUPERSEDED' WHERE document_id=$1 AND revision=$2 AND state='PUBLISHED'",[id,d.published_revision]);}
    await c.query("UPDATE cultural_revisions SET state='PUBLISHED',published_by=$3,published_at=NOW() WHERE document_id=$1 AND revision=$2",[id,r.revision,u.id]);
    await c.query('UPDATE cultural_documents SET published_revision=$2 WHERE id=$1',[id,r.revision]);
   }else{
    this.editor(u);requireState('PUBLISHED');await c.query("UPDATE cultural_revisions SET state='ARCHIVED' WHERE document_id=$1 AND revision=$2",[id,r.revision]);
    await c.query('UPDATE cultural_documents SET published_revision=NULL WHERE id=$1',[id]);
   }
   d.version++;await c.query('UPDATE cultural_documents SET version=$2 WHERE id=$1',[id,d.version]);
   if(b.action==='PUBLISH'&&d.published_revision)await this.event(c,d,d.published_revision,u,'SUPERSEDED',reason);
   await this.event(c,d,r.revision,u,b.action,reason);return {id,version:d.version};
  });
 }
 async list(u:AuthenticatedUser){
  return (await this.db.query(`SELECT d.*,r.* FROM cultural_documents d JOIN cultural_revisions r ON r.document_id=d.id
   AND r.revision=(SELECT max(x.revision) FROM cultural_revisions x WHERE x.document_id=d.id)
   WHERE $1 OR d.designated_approver_id=$2 ORDER BY d.created_at DESC,d.id LIMIT 50`,[u.roles.some(r=>EDITORS.includes(r)),u.id])).rows;
 }
 async history(id:string,u:AuthenticatedUser,before?:string){
  let v=2147483647;if(before!==undefined){v=Number(before);if(!Number.isSafeInteger(v)||v<1||v>2147483647)throw new BadRequestException('Invalid revision cursor');}
  return this.db.transaction(async c=>{await this.document(c,id,u);const rows=(await c.query('SELECT * FROM cultural_revisions WHERE document_id=$1 AND revision<$2 ORDER BY revision DESC LIMIT 51',[id,v])).rows;
   const items=rows.slice(0,50);return {items,nextBefore:rows.length>50?String(items[49].revision):null};});
 }
 async events(id:string,u:AuthenticatedUser,before?:string){
  if(before!==undefined&&!/^[1-9][0-9]{0,18}$/.test(before))throw new BadRequestException('Invalid event cursor');
  if(before!==undefined&&BigInt(before)>9223372036854775807n)throw new BadRequestException('Invalid event cursor');
  return this.db.transaction(async c=>{await this.document(c,id,u);const rows=(await c.query('SELECT * FROM cultural_revision_events WHERE document_id=$1 AND ($2::bigint IS NULL OR sequence<$2) ORDER BY sequence DESC LIMIT 51',[id,before||null])).rows;
   const items=rows.slice(0,50);return {items,nextBefore:rows.length>50?String(items[49].sequence):null};});
 }
 async published(query?:string){
  const q=query===undefined?'':textField(query,'Search',120);
  return (await this.db.query(`SELECT d.id,d.slug,r.revision AS version,r.title_nepali,r.title_english,r.content_nepali,r.content_english,r.category,r.keywords,r.provenance,r.author_id,r.reviewer_id,r.reviewed_at,r.approved_by,r.approved_at,r.published_at
   FROM cultural_documents d JOIN cultural_revisions r ON r.document_id=d.id AND r.revision=d.published_revision AND r.state='PUBLISHED'
   WHERE $1='' OR to_tsvector('simple',r.title_nepali||' '||coalesce(r.title_english,'')||' '||r.content_nepali||' '||coalesce(r.content_english,'')||' '||array_to_string(r.keywords,' ')) @@ plainto_tsquery('simple',$1)
   ORDER BY r.published_at DESC,d.id LIMIT 50`,[q])).rows;
 }
}
