import { BadRequestException } from '@nestjs/common';
import { createHash } from 'crypto';
import { GenealogyImportPayload, GenealogyImportIssue } from '@kashyap/contracts';
import { allowedFields, uuid } from '../community/community-policy';
import { normalizeSearchQuery } from '../genealogy/search-normalization';

// Source spelling is retained. Normalization is exclusively for duplicate candidates.
function sourceText(value:any,label:string,max:number,min=1){
 if(typeof value!=='string'||value.trim().length<min||value.length>max||/[\u0000-\u001f\u007f]/u.test(value))throw new BadRequestException(`Invalid ${label}`);
 return value;
}
function id(value:any){const s=sourceText(value,'source identifier',80);if(!/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,79}$/.test(s))throw new BadRequestException('Invalid source identifier');return s;}
function date(value:any){allowedFields(value,['value','calendar','precision']);return {value:sourceText(value.value,'original date',80),calendar:sourceText(value.calendar,'calendar',20),precision:sourceText(value.precision,'date precision',20)};}
function sourceNames(value:any){
 const fields=['givenNepali','middleNepali','familyNepali','givenEnglish','middleEnglish','familyEnglish','knownAs'];
 allowedFields(value,fields);
 if(!Object.keys(value).length)throw new BadRequestException('Source name components must not be empty');
 return Object.fromEntries(fields.filter(field=>value[field]!==undefined).map(field=>[field,sourceText(value[field],`source name ${field}`,255)]));
}
function relationshipDetails(value:any){
 const fields=['parentRole','legalStatus','startDate','startCalendar','endDate','endCalendar','certainty','relationshipStatus','visibility','proposedBy','reviewedBy','reviewDate','notes'];
 allowedFields(value,fields);
 if(!Object.keys(value).length)throw new BadRequestException('Relationship source details must not be empty');
 return Object.fromEntries(fields.filter(field=>value[field]!==undefined).map(field=>[field,sourceText(value[field],`relationship source ${field}`,field==='notes'?1000:100)]));
}
export function parseImportPayload(body:any):GenealogyImportPayload{
 allowedFields(body,['schemaVersion','datasetKey','branchId','sourceDescription','persons','parentLinks']);
 if(body.schemaVersion!==1)throw new BadRequestException('Supported import schemaVersion is 1');
 if(!Array.isArray(body.persons)||body.persons.length<1||body.persons.length>200||!Array.isArray(body.parentLinks)||body.parentLinks.length>400)throw new BadRequestException('Stage 1–200 persons and up to 400 parent links per batch');
 const payload:GenealogyImportPayload={schemaVersion:1,datasetKey:id(body.datasetKey),branchId:uuid(body.branchId,'branch'),sourceDescription:sourceText(body.sourceDescription,'source description',1000,10),persons:body.persons.map((p:any)=>{
  allowedFields(p,['sourceId','nameNepali','nameEnglish','gender','livingStatus','generation','sourceRef','consent','verification','visibility','targetPersonId','birth','death','sourceNames']);
  if(!Number.isInteger(p.generation)||p.generation<1||p.generation>100)throw new BadRequestException('Generation must be between 1 and 100');
  return {sourceId:id(p.sourceId),nameNepali:sourceText(p.nameNepali,'Nepali source name',255),...(p.nameEnglish===undefined?{}:{nameEnglish:sourceText(p.nameEnglish,'English source name',255)}),generation:p.generation,
   gender:sourceText(p.gender,'gender',20),livingStatus:sourceText(p.livingStatus,'living status',20),sourceRef:id(p.sourceRef),consent:sourceText(p.consent,'consent',30),verification:sourceText(p.verification,'verification',30),visibility:sourceText(p.visibility,'visibility',30),
   ...(p.targetPersonId===undefined?{}:{targetPersonId:uuid(p.targetPersonId,'target Person')}),...(p.sourceNames===undefined?{}:{sourceNames:sourceNames(p.sourceNames)}),...(p.birth===undefined?{}:{birth:date(p.birth)}),...(p.death===undefined?{}:{death:date(p.death)})};
 }),parentLinks:body.parentLinks.map((e:any)=>{allowedFields(e,['sourceId','parentSourceId','childSourceId','type','sourceRef','verification','sourceDetails']);return {sourceId:id(e.sourceId),parentSourceId:id(e.parentSourceId),childSourceId:id(e.childSourceId),type:sourceText(e.type,'parent type',30),sourceRef:id(e.sourceRef),verification:sourceText(e.verification,'verification',30),...(e.sourceDetails===undefined?{}:{sourceDetails:relationshipDetails(e.sourceDetails)})};})};
 if(Buffer.byteLength(JSON.stringify(payload),'utf8')>1048576)throw new BadRequestException('Staged payload exceeds 1 MiB');
 return payload;
}
// Sorting object keys makes retries independent of JSON key order. Array order remains source order.
function canonical(value:any):string{if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';return JSON.stringify(value);}
export function importHash(payload:GenealogyImportPayload){return createHash('sha256').update(canonical(payload)).digest('hex');}
export function validateImport(payload:GenealogyImportPayload):GenealogyImportIssue[]{
 const issues:GenealogyImportIssue[]=[],personIds=new Set<string>(),edgeIds=new Set<string>(),targets=new Set<string>(),names=new Set<string>(),edges=new Set<string>(),adj=new Map<string,string[]>();
 const issue=(entity:GenealogyImportIssue['entity'],sourceId:string,code:string)=>issues.push({entity,sourceId,code});
 for(const p of payload.persons){
  const add=(code:string)=>issue('PERSON',p.sourceId,code);
  if(personIds.has(p.sourceId))add('DUPLICATE_SOURCE_ID');personIds.add(p.sourceId);
  if(!['MALE','FEMALE','OTHER','UNKNOWN'].includes(p.gender))add('UNSUPPORTED_GENDER');
  if(!['LIVING','DECEASED','UNKNOWN'].includes(p.livingStatus))add('UNSUPPORTED_LIVING_STATUS');
  if(p.visibility!=='PRIVATE')add('PRIVACY_REVIEW_REQUIRED');
  if(p.verification!=='VERIFIED')add('VERIFICATION_REQUIRED');
  if(p.sourceNames)add('SOURCE_NAME_COMPONENTS_REVIEW_REQUIRED');
  if(p.consent!=='GRANTED'&&!(p.livingStatus==='DECEASED'&&p.consent==='NOT_REQUIRED'))add('CONSENT_REVIEW_REQUIRED');
  if(p.death&&p.livingStatus!=='DECEASED')add('DEATH_STATUS_CONFLICT');
  for(const d of [p.birth,p.death])if(d){
   if(!['AD','BS','TITHI','UNKNOWN'].includes(d.calendar)||!['EXACT','MONTH','YEAR','APPROXIMATE','UNKNOWN'].includes(d.precision))add('UNSUPPORTED_DATE_METADATA');
   if(d.calendar!=='AD'||d.precision!=='EXACT')add('DATE_AUTHORITY_REVIEW_REQUIRED');
   else if(!/^\d{4}-\d{2}-\d{2}$/.test(d.value)||!Number.isFinite(Date.parse(d.value))||new Date(d.value).toISOString().slice(0,10)!==d.value)add('INVALID_AD_DATE');
  }
  if(p.birth?.calendar==='AD'&&p.death?.calendar==='AD'&&p.birth.precision==='EXACT'&&p.death.precision==='EXACT'&&p.death.value<p.birth.value)add('DEATH_BEFORE_BIRTH');
  if(p.targetPersonId){if(targets.has(p.targetPersonId.toLowerCase()))add('DUPLICATE_TARGET_MAPPING');targets.add(p.targetPersonId.toLowerCase());}
  const name=normalizeSearchQuery(p.nameNepali);if(names.has(name))add('SOURCE_NAME_DUPLICATE_CANDIDATE');names.add(name);
 }
 for(const e of payload.parentLinks){const add=(code:string)=>issue('PARENT_LINK',e.sourceId,code);
  if(edgeIds.has(e.sourceId))add('DUPLICATE_SOURCE_ID');edgeIds.add(e.sourceId);
  if(!personIds.has(e.parentSourceId)||!personIds.has(e.childSourceId))add('DANGLING_PERSON_REFERENCE');
  if(e.parentSourceId===e.childSourceId)add('SELF_PARENT');
  if(!['BIOLOGICAL','ADOPTIVE'].includes(e.type))add('UNSUPPORTED_PARENT_TYPE');
  if(e.verification!=='VERIFIED')add('RELATIONSHIP_VERIFICATION_REQUIRED');
  if(e.sourceDetails)add('RELATIONSHIP_SOURCE_DETAILS_REVIEW_REQUIRED');
  const key=JSON.stringify([e.parentSourceId,e.childSourceId]);if(edges.has(key))add('DUPLICATE_PARENT_PAIR');edges.add(key);
  adj.set(e.parentSourceId,[...(adj.get(e.parentSourceId)||[]),e.childSourceId]);
 }
 const visiting=new Set<string>(),done=new Set<string>();let cycle=false;
 function visit(id:string){if(visiting.has(id)){cycle=true;return;}if(done.has(id))return;visiting.add(id);for(const next of adj.get(id)||[])visit(next);visiting.delete(id);done.add(id);}
 for(const id of personIds)visit(id);if(cycle)issue('BATCH',payload.datasetKey,'PARENT_CYCLE');
 return issues;
}
