import { Injectable, BadRequestException, ForbiddenException, NotFoundException, ConflictException } from '@nestjs/common';
import { Role } from '@kashyap/contracts';
import { DatabaseService } from '../../database/database.service';
import { AuditOutboxRepository } from '../../database/repositories/audit-outbox.repository';
import { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { PrivacyEngineService } from '../genealogy/privacy/privacy-engine.service';
import { allowedFields, member, textField, uuid } from '../community/community-policy';

const scopes=['PRIVATE','IMMEDIATE_FAMILY','BRANCH','VERIFIED_COMMUNITY','PUBLIC_AGGREGATE'];
function bounds(query:any){
 allowedFields(query,['minLat','maxLat','minLng','maxLng','branchId','district']);
 const values=['minLat','maxLat','minLng','maxLng'].map(k=>query[k]===undefined?undefined:Number(query[k]));
 if(values.some(v=>v!==undefined)&&(!values.every(v=>v!==undefined&&Number.isFinite(v))||values[0]! < -90||values[1]! > 90||values[2]! < -180||values[3]! > 180||values[0]!>=values[1]!||values[2]!>=values[3]!))throw new BadRequestException('Provide a valid complete map bounding box');
 if(query.branchId)uuid(query.branchId,'branch');if(query.district)textField(query.district,'District',100);
 return (row:any)=> (!query.branchId||row.branchId===query.branchId)&&(!query.district||row.district.toLowerCase().includes(query.district.toLowerCase()))&&
  (values[0]===undefined||row.approxLatitude>=values[0]&&row.approxLatitude<=values[1]!&&row.approxLongitude>=values[2]!&&row.approxLongitude<=values[3]!);
}
function verified(user?:AuthenticatedUser){return !!user&&user.roles.some(r=>![Role.GUEST,Role.REGISTERED_USER].includes(r));}
function admin(user:AuthenticatedUser,branch:string){return user.roleAssignments.some(a=>a.role===Role.SUPER_ADMIN||a.role===Role.CENTRAL_ADMIN||a.role===Role.BRANCH_ADMIN&&a.branchId===branch);}

@Injectable()
export class MapService {
 constructor(private readonly db:DatabaseService,private readonly audit:AuditOutboxRepository,private readonly privacy:PrivacyEngineService){}
 private async rows(){
  return (await this.db.query(`SELECT h.*,p.birth_year_bs,p.birth_date_bs,p.living_status,p.is_minor_protected,p.profile_visibility,p.is_archived,
   EXISTS(SELECT 1 FROM profile_claims c WHERE c.target_person_id=h.person_id AND c.status='DISPUTED') AS disputed,
   ARRAY(SELECT child_id FROM parent_links l WHERE l.parent_id=h.person_id AND l.confidence='VERIFIED'
    UNION SELECT parent_id FROM parent_links l WHERE l.child_id=h.person_id AND l.confidence='VERIFIED'
    UNION SELECT CASE WHEN l.person_id=h.person_id THEN l.spouse_id ELSE l.person_id END FROM spouse_links l WHERE (l.person_id=h.person_id OR l.spouse_id=h.person_id) AND l.confidence='VERIFIED' AND (l.status IS NULL OR l.status<>'CANCELLED')) AS family
   FROM household_locations h JOIN persons p ON p.id=h.person_id JOIN user_accounts u ON u.id=h.owner_user_id
   WHERE h.status='APPROVED' AND h.map_consent AND h.approx_latitude IS NOT NULL AND u.is_active AND NOT u.is_suspended AND u.deleted_at IS NULL AND u.person_id=h.person_id ORDER BY h.id LIMIT 5000`)).rows;
 }
 private eligible(row:any){return !row.protected_location&&!row.disputed&&!row.is_archived&&row.living_status==='LIVING'&&!this.privacy.isMinorOrUncertainAge(row);}
 private visible(scope:string,row:any,user:AuthenticatedUser){
  if(row.owner_user_id===user.id)return true;
  if(scope==='PRIVATE')return false;
  if(scope==='IMMEDIATE_FAMILY')return !!user.personId&&row.family.includes(user.personId);
  if(scope==='BRANCH')return user.branchIds.includes(row.branch_id);
  return ['VERIFIED_COMMUNITY','PUBLIC','PUBLIC_AGGREGATE'].includes(scope);
 }
 async getHouseholds(query:any={},user?:AuthenticatedUser){
  const match=bounds(query);if(!verified(user))return this.getDistrictClusters(query);
  return (await this.rows()).filter(r=>this.eligible(r)&&this.visible(r.visibility,r,user!)&&this.visible(r.profile_visibility,r,user!)).map(r=>({
   id:r.id,title:r.title,district:r.district,municipality:r.municipality,branchId:r.branch_id,
   approxLatitude:Number(r.approx_latitude),approxLongitude:Number(r.approx_longitude),precision:'LOCALITY',
  })).filter(match).slice(0,500);
 }
 async getDistrictClusters(query:any={}){
  const match=bounds(query),groups=new Map<string,any>();
  for(const row of await this.rows()){
   if(!this.eligible(row)||row.visibility!=='PUBLIC_AGGREGATE'||row.profile_visibility!=='PUBLIC')continue;
   // Fixed coarse cells, not a centroid of private addresses; filters apply only after aggregation.
   const lat=Math.round(Number(row.approx_latitude)*2)/2,lng=Math.round(Number(row.approx_longitude)*2)/2;
   const key=[row.branch_id,row.district,lat,lng].join(':');
   const g=groups.get(key)||{district:row.district,branchId:row.branch_id,approxLatitude:lat,approxLongitude:lng,totalHouseholds:0,precision:'DISTRICT'};g.totalHouseholds++;groups.set(key,g);
  }
  return [...groups.values()].filter(g=>g.totalHouseholds>=3&&match(g)).slice(0,500);
 }
 async mine(user:AuthenticatedUser){member(user);return (await this.db.query('SELECT * FROM household_locations WHERE owner_user_id=$1',[user.id])).rows[0]||null;}
 async save(user:AuthenticatedUser,body:any){
  member(user);allowedFields(body,['title','district','municipality','latitude','longitude','visibility','mapConsent','protectedLocation','version']);
  const title=textField(body.title,'Household title',150),district=textField(body.district,'District',100),municipality=textField(body.municipality,'Municipality',100);
  if(!scopes.includes(body.visibility)||typeof body.mapConsent!=='boolean'||typeof body.protectedLocation!=='boolean')throw new BadRequestException('Select visibility, consent and protection settings');
  if(!user.personId)throw new BadRequestException('Link a verified adult profile before adding a household');
  if(body.mapConsent&&(!Number.isFinite(body.latitude)||!Number.isFinite(body.longitude)||Math.abs(body.latitude)>90||Math.abs(body.longitude)>180))throw new BadRequestException('Valid manually selected locality coordinates are required');
  return this.db.transaction(async client=>{
   await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`household:${user.id}`]);
   const person=(await client.query('SELECT * FROM persons WHERE id=$1 AND claimed_by_user_id=$2 AND NOT is_archived FOR UPDATE',[user.personId,user.id])).rows[0];
   if(!person||!person.branch_id||person.living_status!=='LIVING'||this.privacy.isMinorOrUncertainAge(person))throw new ForbiddenException('Household mapping requires an eligible adult profile');
   const old=(await client.query('SELECT * FROM household_locations WHERE owner_user_id=$1 FOR UPDATE',[user.id])).rows[0];
   if(old&&body.version!==old.version)throw new ConflictException('Household changed; reload before saving');
   if(!old&&body.version!==0)throw new BadRequestException('New household version must be zero');
   // Round before persistence. Exact input is neither stored nor written to audit metadata.
   const lat=body.mapConsent?Math.round(body.latitude*10)/10:null,lng=body.mapConsent?Math.round(body.longitude*10)/10:null;
   const result=(await client.query(`INSERT INTO household_locations(owner_user_id,person_id,branch_id,title,district,municipality,approx_latitude,approx_longitude,visibility,map_consent,protected_location,status)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT(owner_user_id) DO UPDATE SET
    person_id=excluded.person_id,branch_id=excluded.branch_id,title=excluded.title,district=excluded.district,municipality=excluded.municipality,
    approx_latitude=excluded.approx_latitude,approx_longitude=excluded.approx_longitude,visibility=excluded.visibility,map_consent=excluded.map_consent,
    protected_location=excluded.protected_location,status=excluded.status,version=household_locations.version+1,reviewed_by=NULL,reviewed_at=NULL,review_reason=NULL,updated_at=now() RETURNING *`,
    [user.id,person.id,person.branch_id,title,district,municipality,lat,lng,body.visibility,body.mapConsent,body.protectedLocation,body.mapConsent?'PENDING':'WITHDRAWN'])).rows[0];
   await this.audit.recordAuditIntent({action:body.mapConsent?'HOUSEHOLD_LOCATION_PROPOSED':'HOUSEHOLD_MAP_CONSENT_WITHDRAWN',entityType:'household_location',entityId:result.id,actorId:user.id,newValue:{version:result.version,visibility:result.visibility,status:result.status}},client);
   return result;
  });
 }
 async withdraw(user:AuthenticatedUser){
  member(user);return this.db.transaction(async client=>{
   const row=(await client.query("UPDATE household_locations SET map_consent=false,approx_latitude=NULL,approx_longitude=NULL,status='WITHDRAWN',version=version+1,updated_at=now() WHERE owner_user_id=$1 RETURNING id",[user.id])).rows[0];
   if(!row)throw new NotFoundException('Household not found');
   await this.audit.recordAuditIntent({action:'HOUSEHOLD_MAP_CONSENT_WITHDRAWN',entityType:'household_location',entityId:row.id,actorId:user.id},client);return {success:true};
  });
 }
 async queue(user:AuthenticatedUser){
  member(user);const rows=(await this.db.query("SELECT h.* FROM household_locations h WHERE status='PENDING' ORDER BY updated_at LIMIT 500")).rows;
  return rows.filter(r=>admin(user,r.branch_id)).map(r=>({...r,canReview:r.owner_user_id!==user.id}));
 }
 async review(id:string,user:AuthenticatedUser,body:any){
  member(user);uuid(id);allowedFields(body,['version','decision','reason']);const reason=textField(body.reason,'Review reason',1000);
  if(!['APPROVE','REJECT'].includes(body.decision))throw new BadRequestException('Invalid review decision');
  return this.db.transaction(async client=>{
   const row=(await client.query('SELECT * FROM household_locations WHERE id=$1 FOR UPDATE',[id])).rows[0];
   if(!row)throw new NotFoundException('Household not found');if(!admin(user,row.branch_id)||row.owner_user_id===user.id)throw new ForbiddenException('Independent branch administrator review required');
   if(row.status!=='PENDING'||body.version!==row.version)throw new ConflictException('Review is stale; reload the queue');
   await client.query("UPDATE household_locations SET status=$2,reviewed_by=$3,review_reason=$4,reviewed_at=now(),updated_at=now(),version=version+1 WHERE id=$1",[id,body.decision==='APPROVE'?'APPROVED':'REJECTED',user.id,reason]);
   await this.audit.recordAuditIntent({action:'HOUSEHOLD_LOCATION_REVIEWED',entityType:'household_location',entityId:id,actorId:user.id,newValue:{decision:body.decision,version:row.version+1}},client);return {success:true};
  });
 }
}
