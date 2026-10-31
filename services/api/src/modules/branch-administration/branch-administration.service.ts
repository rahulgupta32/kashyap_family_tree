import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PoolClient } from 'pg';
import { BranchAdministrationDto, BranchAdministrationHistoryDto, BranchAdministrationPageDto, BranchGenerationDto } from '@kashyap/contracts';
import { DatabaseService } from '../../database/database.service';
import { AuditOutboxRepository } from '../../database/repositories/audit-outbox.repository';
import { allowedFields, textField, uuid } from '../community/community-policy';

const labels = ['nameNepali', 'nameEnglish', 'description'];
const branchFields = [...labels, 'moolGhar', 'kuldevata'];
@Injectable()
export class BranchAdministrationService {
 constructor(private readonly db: DatabaseService, private readonly audit: AuditOutboxRepository) {}

 private async authorize(userId: string, tx: PoolClient) {
  const result = await tx.query(`SELECT u.id FROM user_accounts u JOIN user_roles r ON r.user_id=u.id AND r.role='SUPER_ADMIN'
   WHERE u.id=$1 AND u.is_active=TRUE AND u.is_phone_verified=TRUE AND u.is_suspended=FALSE AND u.deleted_at IS NULL FOR SHARE OF u,r`, [userId]);
  if (!result.rows.length) throw new ForbiddenException('Current phone-verified Super Admin authority required');
 }
 private branchDto(r: any): BranchAdministrationDto {
  return { id:r.id, code:r.code, nameNepali:r.name_nepali, nameEnglish:r.name_english, moolGhar:r.mool_ghar,
   kuldevata:r.kuldevata, description:r.description, version:r.metadata_version };
 }
 private generationDto(r: any): BranchGenerationDto {
  return { generation:r.generation, nameNepali:r.name_nepali, nameEnglish:r.name_english, description:r.description, version:r.version };
 }
 private nullableText(value: any, label: string, max: number) {
  return value === undefined || value === null || value === '' ? null : textField(value, label, max);
 }
 private values(body: any) {
  return [textField(body.nameNepali,'Nepali name',100), textField(body.nameEnglish,'English name',100), this.nullableText(body.description,'Description',3000)];
 }
 private version(value: any) {
  if (!Number.isInteger(value) || value < 1 || value >= 2147483647) throw new BadRequestException('Current version required');
  return value;
 }
 private generation(value: any, path = false) {
  if (path && (typeof value !== 'string' || !/^[1-9]\d{0,2}$/.test(value))) throw new BadRequestException('Invalid generation');
  const number = path ? Number(value) : value;
  if (!Number.isInteger(number) || number < 1 || number > 100) throw new BadRequestException('Generation must be an integer from 1 to 100');
  return number;
 }
 private async branch(tx: PoolClient, id: string, lock = false) {
  const r = (await tx.query(`SELECT * FROM branches WHERE id=$1 ${lock ? 'FOR UPDATE' : 'FOR SHARE'}`, [uuid(id,'branch ID')])).rows[0];
  if (!r) throw new NotFoundException('Branch not found');
  return r;
 }
 private async revision(tx: PoolClient, branchId: string, generation: number, actorId: string | null, oldValue: any, newValue: any, reason: string) {
  await tx.query(`INSERT INTO branch_administration_revisions(branch_id,generation,version,old_value,new_value,actor_id,reason)
   VALUES($1,$2,$3,$4,$5,$6,$7)`, [branchId,generation,newValue.version,oldValue?JSON.stringify(oldValue):null,JSON.stringify(newValue),actorId,reason]);
 }
 private async readAudit(tx: PoolClient, userId: string, id: string, action: string, data: any) {
  await this.audit.recordAuditIntent({ action,entityType:'BRANCH',entityId:id,actorId:userId,newValue:data },tx);
 }
 private async conflict<T>(work: () => Promise<T>): Promise<T> {
  try { return await work(); } catch (e: any) {
   if (e.code === '23505') throw new ConflictException('Record already exists; reload before editing');
   throw e;
  }
 }
 async list(userId: string, query: any): Promise<BranchAdministrationPageDto> {
  return this.db.transaction(async tx => {
   await this.authorize(userId,tx); allowedFields(query,['after']);
   const after = query.after === undefined ? null : uuid(query.after,'branch cursor');
   const rows = (await tx.query('SELECT * FROM branches WHERE ($1::uuid IS NULL OR id>$1) ORDER BY id LIMIT 51',[after])).rows;
   for (const row of rows.slice(0,50)) await this.readAudit(tx,userId,row.id,'BRANCH_CATALOGUE_READ',{version:row.metadata_version});
   return {items:rows.slice(0,50).map(r=>this.branchDto(r)),nextAfter:rows.length>50?rows[49].id:null};
  });
 }
 async create(userId: string, body: any): Promise<BranchAdministrationDto> {
  return this.conflict(()=>this.db.transaction(async tx => {
   await this.authorize(userId,tx); allowedFields(body,[...branchFields,'code','reason']);
   const code = textField(body.code,'Branch code',50);
   if (!/^[A-Z0-9][A-Z0-9_-]{0,49}$/.test(code)) throw new BadRequestException('Branch code must use uppercase letters, digits, underscores or hyphens');
   const [ne,en,description]=this.values(body), reason=textField(body.reason,'Change reason',1000,10);
   const row=(await tx.query(`INSERT INTO branches(code,name_nepali,name_english,description,mool_ghar,kuldevata)
    VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,[code,ne,en,description,this.nullableText(body.moolGhar,'Mool ghar',200),this.nullableText(body.kuldevata,'Kuldevata',200)])).rows[0];
   const dto=this.branchDto(row); await this.revision(tx,row.id,0,userId,null,dto,reason);
   await this.audit.recordAuditIntent({action:'BRANCH_CREATED',entityType:'BRANCH',entityId:row.id,actorId:userId,newValue:{...dto,reason}},tx);
   return dto;
  }));
 }
 async update(userId: string, id: string, body: any): Promise<BranchAdministrationDto> {
  return this.db.transaction(async tx => {
   await this.authorize(userId,tx); allowedFields(body,[...branchFields,'version','reason']);
   const version=this.version(body.version), [ne,en,description]=this.values(body), reason=textField(body.reason,'Change reason',1000,10);
   const mool=this.nullableText(body.moolGhar,'Mool ghar',200),kul=this.nullableText(body.kuldevata,'Kuldevata',200);
   const row=await this.branch(tx,id,true), before=this.branchDto(row);
   if (row.metadata_version!==version) throw new ConflictException('Branch changed; reload and review before saving');
   if (row.name_nepali===ne&&row.name_english===en&&row.description===description&&row.mool_ghar===mool&&row.kuldevata===kul) throw new BadRequestException('Choose different metadata');
   // Retain the existing metadata before its first console edit. No fabricated original actor.
   const existing=(await tx.query('SELECT 1 FROM branch_administration_revisions WHERE branch_id=$1 AND generation=0 AND version=$2',[id,version])).rows;
   if (!existing.length) await this.revision(tx,id,0,null,null,before,'Pre-console metadata snapshot');
   const updated=(await tx.query(`UPDATE branches SET name_nepali=$2,name_english=$3,description=$4,mool_ghar=$5,kuldevata=$6,
    metadata_version=metadata_version+1,updated_at=clock_timestamp() WHERE id=$1 RETURNING *`,[id,ne,en,description,mool,kul])).rows[0];
   const dto=this.branchDto(updated);await this.revision(tx,id,0,userId,before,dto,reason);
   await this.audit.recordAuditIntent({action:'BRANCH_METADATA_CHANGED',entityType:'BRANCH',entityId:id,actorId:userId,oldValue:before,newValue:{...dto,reason}},tx);
   return dto;
  });
 }
 async generations(userId: string, id: string, query: any): Promise<BranchGenerationDto[]> {
  return this.db.transaction(async tx => {
   await this.authorize(userId,tx);allowedFields(query,[]);await this.branch(tx,id);
   const rows=(await tx.query('SELECT * FROM branch_generation_catalogue WHERE branch_id=$1 ORDER BY generation',[id])).rows;
   await this.readAudit(tx,userId,id,'BRANCH_GENERATIONS_READ',{generations:rows.map(r=>({generation:r.generation,version:r.version}))});
   return rows.map(r=>this.generationDto(r));
  });
 }
 async saveGeneration(userId: string, id: string, body: any, path?: string): Promise<BranchGenerationDto> {
  return this.conflict(()=>this.db.transaction(async tx => {
   await this.authorize(userId,tx);allowedFields(body,path===undefined?[...labels,'generation','reason']:[...labels,'version','reason']);
   const generation=this.generation(path===undefined?body.generation:path,path!==undefined);
   const [ne,en,description]=this.values(body),reason=textField(body.reason,'Change reason',1000,10);
   const version=path===undefined?null:this.version(body.version);
   await this.branch(tx,id,true);
   const row=(await tx.query('SELECT * FROM branch_generation_catalogue WHERE branch_id=$1 AND generation=$2 FOR UPDATE',[id,generation])).rows[0];
   if (path===undefined&&row) throw new ConflictException('Generation label already exists');
   if (path!==undefined&&!row) throw new NotFoundException('Generation label not found');
   if (row&&row.version!==version) throw new ConflictException('Generation changed; reload and review before saving');
   if (row&&row.name_nepali===ne&&row.name_english===en&&row.description===description) throw new BadRequestException('Choose different metadata');
   const before=row?this.generationDto(row):null;
   const updated=(await tx.query(row ? `UPDATE branch_generation_catalogue SET name_nepali=$3,name_english=$4,description=$5,version=version+1
    WHERE branch_id=$1 AND generation=$2 RETURNING *` : `INSERT INTO branch_generation_catalogue(branch_id,generation,name_nepali,name_english,description)
    VALUES($1,$2,$3,$4,$5) RETURNING *`,[id,generation,ne,en,description])).rows[0];
   const dto=this.generationDto(updated);await this.revision(tx,id,generation,userId,before,dto,reason);
   await this.audit.recordAuditIntent({action:row?'BRANCH_GENERATION_CHANGED':'BRANCH_GENERATION_CREATED',entityType:'BRANCH',entityId:id,actorId:userId,oldValue:before,newValue:{...dto,reason}},tx);
   return dto;
  }));
 }
 async history(userId: string, id: string, generation: string | number, query: any): Promise<BranchAdministrationHistoryDto> {
  return this.db.transaction(async tx => {
   await this.authorize(userId,tx);allowedFields(query,['before']);await this.branch(tx,id);
   const number=generation===0?0:this.generation(generation,true);
   if (query.before!==undefined&&(typeof query.before!=='string'||!/^\d{1,10}$/.test(query.before)||Number(query.before)<1||Number(query.before)>2147483647)) throw new BadRequestException('Invalid history cursor');
   if (number && !(await tx.query('SELECT 1 FROM branch_generation_catalogue WHERE branch_id=$1 AND generation=$2',[id,number])).rows.length) throw new NotFoundException('Generation label not found');
   const rows=(await tx.query(`SELECT version,old_value AS "oldValue",new_value AS "newValue",actor_id AS "actorId",reason,changed_at AS "changedAt"
    FROM branch_administration_revisions WHERE branch_id=$1 AND generation=$2 AND ($3::int IS NULL OR version<$3) ORDER BY version DESC LIMIT 51`,[id,number,query.before===undefined?null:Number(query.before)])).rows;
   await this.readAudit(tx,userId,id,'BRANCH_ADMINISTRATION_HISTORY_READ',{generation:number});
   return {items:rows.slice(0,50),nextBefore:rows.length>50?rows[49].version:null};
  });
 }
}
