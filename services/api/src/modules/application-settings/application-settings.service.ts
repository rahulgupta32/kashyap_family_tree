import {Injectable,ForbiddenException,BadRequestException,ConflictException} from '@nestjs/common';
import {ApplicationSettingDto,ApplicationSettingHistoryDto} from '@kashyap/contracts';
import {DatabaseService} from '../../database/database.service';
import {AuditOutboxRepository} from '../../database/repositories/audit-outbox.repository';
import {allowedFields,textField} from '../community/community-policy';
import {settingCatalog,settingDefinition,settingValue} from './application-settings.catalog';

@Injectable()
export class ApplicationSettingsService {
 constructor(private readonly db:DatabaseService,private readonly audit:AuditOutboxRepository){}
 private async authorize(userId:string,tx:any){
  // Hold current account and authority rows for the transaction: revocation cannot race the write.
  const rows=(await tx.query(`SELECT u.id FROM user_accounts u JOIN user_roles r ON r.user_id=u.id AND r.role='SUPER_ADMIN'
   WHERE u.id=$1 AND u.is_active=TRUE AND u.is_phone_verified=TRUE AND u.is_suspended=FALSE AND u.deleted_at IS NULL FOR SHARE OF u,r`,[userId])).rows;
  if(!rows.length)throw new ForbiddenException('Current phone-verified Super Admin authority required');
 }
 private dto(row:any):ApplicationSettingDto {
  return {key:row.setting_key,...settingDefinition(row.setting_key),value:settingValue(row.setting_key,row.value),version:row.version,updatedAt:row.updated_at};
 }
 async listWithQuery(userId:string,query:any){allowedFields(query,[]);return this.list(userId);}
 async list(userId:string){return this.db.transaction(async tx=>{
  await this.authorize(userId,tx);const rows=(await tx.query('SELECT * FROM application_settings ORDER BY setting_key')).rows;
  if(rows.length!==Object.keys(settingCatalog).length)throw new Error('Incomplete application settings');
  const values=rows.map(r=>this.dto(r));
  for(const row of rows)await this.audit.recordAuditIntent({action:'APPLICATION_SETTING_READ',entityType:'APPLICATION_SETTING',entityId:row.id,actorId:userId,newValue:{key:row.setting_key,version:row.version}},tx);
  return values;
 });}
 async update(userId:string,key:string,body:any){return this.db.transaction(async tx=>{
  await this.authorize(userId,tx);settingDefinition(key);allowedFields(body,['value','version','reason']);const value=settingValue(key,body.value),reason=textField(body.reason,'Change reason',1000,10);
  if(!Number.isInteger(body.version)||body.version<1||body.version>2147483647)throw new BadRequestException('Current setting version required');
  const row=(await tx.query('SELECT * FROM application_settings WHERE setting_key=$1 FOR UPDATE',[key])).rows[0];
  if(!row)throw new Error('Missing application setting');if(row.version!==body.version)throw new ConflictException('Setting changed; reload before editing');
  if(row.value===value)throw new BadRequestException('Choose a different value');
  const updated=(await tx.query(`UPDATE application_settings SET value=$2,version=version+1,updated_by=$3,reason=$4,updated_at=clock_timestamp()
   WHERE setting_key=$1 RETURNING *`,[key,JSON.stringify(value),userId,reason])).rows[0];
  await this.audit.recordAuditIntent({action:'APPLICATION_SETTING_CHANGED',entityType:'APPLICATION_SETTING',entityId:row.id,actorId:userId,
   oldValue:{key,value:row.value,version:row.version},newValue:{key,value,version:updated.version,reason}},tx);
  return this.dto(updated);
 });}
 async history(userId:string,key:string,query:any):Promise<ApplicationSettingHistoryDto>{return this.db.transaction(async tx=>{
  await this.authorize(userId,tx);settingDefinition(key);allowedFields(query,['before']);
  const before=query.before;
  if(before!==undefined&&(typeof before!=='string'||!/^\d{1,10}$/.test(before)||Number(before)<1||Number(before)>2147483647))throw new BadRequestException('Invalid setting history cursor');
  const setting=(await tx.query('SELECT id FROM application_settings WHERE setting_key=$1',[key])).rows[0];if(!setting)throw new Error('Missing application setting');
  const rows=(await tx.query(`SELECT version,old_value AS "oldValue",new_value AS "newValue",actor_id AS "actorId",reason,changed_at AS "changedAt"
   FROM application_setting_revisions WHERE setting_key=$1 AND ($2::int IS NULL OR version<$2) ORDER BY version DESC LIMIT 51`,[key,before===undefined?null:Number(before)])).rows;
  await this.audit.recordAuditIntent({action:'APPLICATION_SETTING_HISTORY_READ',entityType:'APPLICATION_SETTING',entityId:setting.id,actorId:userId,newValue:{key}},tx);
  return {items:rows.slice(0,50),nextBefore:rows.length>50?rows[49].version:null};
 });}
 async calendarPolicy(tx?:any){
  const rows=(await this.db.query('SELECT setting_key,value,version FROM application_settings ORDER BY setting_key FOR SHARE',[],tx)).rows;
  if(rows.length!==4)throw new Error('Incomplete calendar settings');
  const values:Record<string,number>={},versions:Record<string,number>={};
  for(const row of rows){values[row.setting_key]=settingValue(row.setting_key,row.value);versions[row.setting_key]=row.version;}
  for(const key of Object.keys(settingCatalog))if(values[key]===undefined)throw new Error('Missing calendar setting');
  return {maxInvitees:values['calendar.max_invitees'],maxPersons:values['calendar.max_audience_persons'],maxEdges:values['calendar.max_audience_edges'],previewTtlMinutes:values['calendar.preview_ttl_minutes'],versions};
 }
}
