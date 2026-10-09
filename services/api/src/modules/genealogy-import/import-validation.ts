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
function evidenceSources(value:any){
 if(!Array.isArray(value)||value.length>200)throw new BadRequestException('Stage up to 200 evidence sources');
 const required=['sourceType','description','recordedDate','reliability','permission','accessClass','recordedBy','reviewStatus'];
 const optional=['custodian','sourceDate','language','repository','fileReference','url','relatedBranchId','reviewedBy','notes'];
 return value.map(source=>{
  allowedFields(source,['sourceId',...required,...optional]);
  const fields=Object.fromEntries([...required,...optional.filter(field=>source[field]!==undefined)].map(field=>[field,sourceText(source[field],`evidence ${field}`,field==='url'?2048:['description','notes','repository','fileReference'].includes(field)?1000:255)]));
  return {sourceId:id(source.sourceId),...fields} as import('@kashyap/contracts').GenealogyImportEvidence;
 });
}
function claims(value:any){
 if(!Array.isArray(value)||value.length>200)throw new BadRequestException('Stage up to 200 claims');
 const required=['entityType','fieldOrRelationship','riskLevel','visibility','status'];
 const optional=['claimA','claimB','assignedAuthority','decision','decisionDate','appealStatus','auditNotes'];
 const references=['claimASourceRef','claimBSourceRef','decisionEvidenceRef'];
 return value.map(record=>{
  allowedFields(record,['sourceId','entitySourceId',...required,...optional,...references]);
  const fields=Object.fromEntries([...required,...optional.filter(field=>record[field]!==undefined)].map(field=>[field,sourceText(record[field],`claim ${field}`,['claimA','claimB','decision','auditNotes'].includes(field)?1000:255)]));
  const refs=Object.fromEntries(references.filter(field=>record[field]!==undefined).map(field=>[field,id(record[field])]));
  return {sourceId:id(record.sourceId),entitySourceId:id(record.entitySourceId),...fields,...refs} as import('@kashyap/contracts').GenealogyImportClaim;
 });
}
function unions(value:any){
 if(!Array.isArray(value)||value.length>200)throw new BadRequestException('Stage up to 200 unions');
 const required=['unionType','status','visibility'];
 const optional=['startDate','startCalendar','startPrecision','endDate','endCalendar','endPrecision','ceremonyPlace','registrationRef','consentLegalReview','proposedBy','reviewedBy','notes'];
 return value.map(record=>{
  allowedFields(record,['sourceId','partner1SourceId','partner2SourceId','sourceRef',...required,...optional]);
  const fields=Object.fromEntries([...required,...optional.filter(field=>record[field]!==undefined)].map(field=>[field,sourceText(record[field],`union ${field}`,field==='notes'?1000:255)]));
  return {sourceId:id(record.sourceId),partner1SourceId:id(record.partner1SourceId),partner2SourceId:id(record.partner2SourceId),sourceRef:id(record.sourceRef),...fields} as import('@kashyap/contracts').GenealogyImportUnion;
 });
}
function branches(value:any){
 if(!Array.isArray(value)||value.length>200)throw new BadRequestException('Stage up to 200 branches');
 const required=['nameNepali','status'];
 const optional=['nameEnglish','historicalOrigin','district','municipality','ward','authorityRole','approvedBy','approvalDate'];
 const references=['parentSourceId','authorityPersonSourceId','sourceRef'];
 return value.map(record=>{
  allowedFields(record,['sourceId',...required,...optional,...references]);
  const fields=Object.fromEntries([...required,...optional.filter(field=>record[field]!==undefined)].map(field=>[field,sourceText(record[field],`branch ${field}`,field==='historicalOrigin'?1000:255)]));
  const refs=Object.fromEntries(references.filter(field=>record[field]!==undefined).map(field=>[field,id(record[field])]));
  return {sourceId:id(record.sourceId),...fields,...refs} as import('@kashyap/contracts').GenealogyImportBranch;
 });
}
function residences(value:any){
 if(!Array.isArray(value)||value.length>400)throw new BadRequestException('Stage up to 400 residences');
 const required=['residenceType','country','current','visibility'];
 const optional=['province','district','municipality','ward','locality','exactAddress','latitude','longitude','startDate','endDate'];
 return value.map(record=>{
  allowedFields(record,['sourceId','personSourceId','sourceRef',...required,...optional]);
  const fields=Object.fromEntries([...required,...optional.filter(field=>record[field]!==undefined)].map(field=>[field,sourceText(record[field],`residence ${field}`,field==='exactAddress'?1000:255)]));
  return {sourceId:id(record.sourceId),personSourceId:id(record.personSourceId),sourceRef:id(record.sourceRef),...fields} as import('@kashyap/contracts').GenealogyImportResidence;
 });
}
function sourceMetadata(value:any){
 const fields=['branchSourceId','birthPlace','currentDistrict','currentMunicipality','currentWard','country','occupation','education','gotra','lineageNotes','profilePhotoRef','consentDate','createdBy','createdDate','lastUpdated','dataSteward','restrictionReason'];
 allowedFields(value,fields);
 if(!Object.keys(value).length)throw new BadRequestException('Person source metadata must not be empty');
 return Object.fromEntries(fields.filter(field=>value[field]!==undefined).map(field=>[field,sourceText(value[field],`person source ${field}`,['lineageNotes','restrictionReason','profilePhotoRef'].includes(field)?1000:255)]));
}
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
 allowedFields(body,['schemaVersion','datasetKey','branchId','sourceDescription','persons','parentLinks','evidenceSources','unions','claims','branches','residences']);
 if(body.schemaVersion!==1)throw new BadRequestException('Supported import schemaVersion is 1');
 if(!Array.isArray(body.persons)||body.persons.length<1||body.persons.length>200||!Array.isArray(body.parentLinks)||body.parentLinks.length>400)throw new BadRequestException('Stage 1–200 persons and up to 400 parent links per batch');
 const payload:GenealogyImportPayload={schemaVersion:1,datasetKey:id(body.datasetKey),branchId:uuid(body.branchId,'branch'),sourceDescription:sourceText(body.sourceDescription,'source description',1000,10),persons:body.persons.map((p:any)=>{
  allowedFields(p,['sourceId','nameNepali','nameEnglish','gender','livingStatus','generation','sourceRef','consent','verification','visibility','targetPersonId','birth','death','sourceNames','sourceMetadata']);
  if(!Number.isInteger(p.generation)||p.generation<1||p.generation>100)throw new BadRequestException('Generation must be between 1 and 100');
  return {sourceId:id(p.sourceId),nameNepali:sourceText(p.nameNepali,'Nepali source name',255),...(p.nameEnglish===undefined?{}:{nameEnglish:sourceText(p.nameEnglish,'English source name',255)}),generation:p.generation,
   gender:sourceText(p.gender,'gender',20),livingStatus:sourceText(p.livingStatus,'living status',20),sourceRef:id(p.sourceRef),consent:sourceText(p.consent,'consent',30),verification:sourceText(p.verification,'verification',30),visibility:sourceText(p.visibility,'visibility',30),
   ...(p.targetPersonId===undefined?{}:{targetPersonId:uuid(p.targetPersonId,'target Person')}),...(p.sourceMetadata===undefined?{}:{sourceMetadata:sourceMetadata(p.sourceMetadata)}),...(p.sourceNames===undefined?{}:{sourceNames:sourceNames(p.sourceNames)}),...(p.birth===undefined?{}:{birth:date(p.birth)}),...(p.death===undefined?{}:{death:date(p.death)})};
 }),parentLinks:body.parentLinks.map((e:any)=>{allowedFields(e,['sourceId','parentSourceId','childSourceId','type','sourceRef','verification','sourceDetails']);return {sourceId:id(e.sourceId),parentSourceId:id(e.parentSourceId),childSourceId:id(e.childSourceId),type:sourceText(e.type,'parent type',30),sourceRef:id(e.sourceRef),verification:sourceText(e.verification,'verification',30),...(e.sourceDetails===undefined?{}:{sourceDetails:relationshipDetails(e.sourceDetails)})};})};
 if(body.branches!==undefined)payload.branches=branches(body.branches);
 if(body.residences!==undefined)payload.residences=residences(body.residences);
 if(body.claims!==undefined)payload.claims=claims(body.claims);
 if(body.unions!==undefined)payload.unions=unions(body.unions);
 if(body.evidenceSources!==undefined)payload.evidenceSources=evidenceSources(body.evidenceSources);
 if(Buffer.byteLength(JSON.stringify(payload),'utf8')>1048576)throw new BadRequestException('Staged payload exceeds 1 MiB');
 return payload;
}
// Sorting object keys makes retries independent of JSON key order. Array order remains source order.
function canonical(value:any):string{if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';return JSON.stringify(value);}
export function importHash(payload:GenealogyImportPayload){return createHash('sha256').update(canonical(payload)).digest('hex');}
export function validateImport(payload:GenealogyImportPayload):GenealogyImportIssue[]{
 const issues:GenealogyImportIssue[]=[],personIds=new Set<string>(),edgeIds=new Set<string>(),targets=new Set<string>(),names=new Set<string>(),edges=new Set<string>(),adj=new Map<string,string[]>();
 const issue=(entity:GenealogyImportIssue['entity'],sourceId:string,code:string)=>issues.push({entity,sourceId,code});
 if(payload.evidenceSources!==undefined){
  const sources=new Set<string>();
  for(const source of payload.evidenceSources){
   if(sources.has(source.sourceId))issue('SOURCE',source.sourceId,'DUPLICATE_SOURCE_ID');sources.add(source.sourceId);
   // Source permission/review strings are untrusted evidence, never application approval.
   issue('SOURCE',source.sourceId,'SOURCE_EVIDENCE_REVIEW_REQUIRED');
  }
  for(const person of payload.persons)if(!sources.has(person.sourceRef))issue('PERSON',person.sourceId,'DANGLING_EVIDENCE_REFERENCE');
  for(const link of payload.parentLinks)if(!sources.has(link.sourceRef))issue('PARENT_LINK',link.sourceId,'DANGLING_EVIDENCE_REFERENCE');
 }
 for(const p of payload.persons){
  const add=(code:string)=>issue('PERSON',p.sourceId,code);
  if(personIds.has(p.sourceId))add('DUPLICATE_SOURCE_ID');personIds.add(p.sourceId);
  if(!['MALE','FEMALE','OTHER','UNKNOWN'].includes(p.gender))add('UNSUPPORTED_GENDER');
  if(!['LIVING','DECEASED','UNKNOWN'].includes(p.livingStatus))add('UNSUPPORTED_LIVING_STATUS');
  if(p.visibility!=='PRIVATE')add('PRIVACY_REVIEW_REQUIRED');
  if(p.verification!=='VERIFIED')add('VERIFICATION_REQUIRED');
  if(p.sourceNames)add('SOURCE_NAME_COMPONENTS_REVIEW_REQUIRED');
  if(p.sourceMetadata)add('PERSON_SOURCE_METADATA_REVIEW_REQUIRED');
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
 const unionIds=new Set<string>();
 const evidenceIds=payload.evidenceSources===undefined?null:new Set(payload.evidenceSources.map(s=>s.sourceId));
 for(const union of payload.unions||[]){
  const add=(code:string)=>issue('UNION',union.sourceId,code);
  if(unionIds.has(union.sourceId))add('DUPLICATE_SOURCE_ID');unionIds.add(union.sourceId);
  if(!personIds.has(union.partner1SourceId)||!personIds.has(union.partner2SourceId))add('DANGLING_PERSON_REFERENCE');
  if(union.partner1SourceId===union.partner2SourceId)add('SELF_UNION');
  if(evidenceIds&&!evidenceIds.has(union.sourceRef))add('DANGLING_EVIDENCE_REFERENCE');
  // Historical unions and source approval claims require explicit reconciliation.
  add('UNION_SOURCE_REVIEW_REQUIRED');
 }
 const branchIds=new Set<string>(),residenceIds=new Set<string>(),branchParents=new Map<string,string[]>();
 for(const branch of payload.branches||[]){
  const add=(code:string)=>issue('BRANCH',branch.sourceId,code);
  if(branchIds.has(branch.sourceId))add('DUPLICATE_SOURCE_ID');branchIds.add(branch.sourceId);
  if(branch.authorityPersonSourceId&&!personIds.has(branch.authorityPersonSourceId))add('DANGLING_PERSON_REFERENCE');
  if(branch.sourceRef&&evidenceIds&&!evidenceIds.has(branch.sourceRef))add('DANGLING_EVIDENCE_REFERENCE');
  if(branch.parentSourceId===branch.sourceId)add('SELF_BRANCH_PARENT');
  if(branch.parentSourceId)branchParents.set(branch.sourceId,[...(branchParents.get(branch.sourceId)||[]),branch.parentSourceId]);
  add('BRANCH_SOURCE_REVIEW_REQUIRED');
 }
 for(const branch of payload.branches||[])if(branch.parentSourceId&&!branchIds.has(branch.parentSourceId))issue('BRANCH',branch.sourceId,'DANGLING_BRANCH_REFERENCE');
 const branchVisiting=new Set<string>(),branchDone=new Set<string>();let branchCycle=false;
 function visitBranch(sourceId:string){if(branchVisiting.has(sourceId)){branchCycle=true;return;}if(branchDone.has(sourceId))return;branchVisiting.add(sourceId);for(const parent of branchParents.get(sourceId)||[])visitBranch(parent);branchVisiting.delete(sourceId);branchDone.add(sourceId);}
 for(const sourceId of branchIds)visitBranch(sourceId);if(branchCycle)issue('BATCH',payload.datasetKey,'BRANCH_CYCLE');
 if(payload.branches!==undefined){
  for(const person of payload.persons)if(person.sourceMetadata?.branchSourceId&&!branchIds.has(person.sourceMetadata.branchSourceId))issue('PERSON',person.sourceId,'DANGLING_BRANCH_REFERENCE');
  for(const source of payload.evidenceSources||[])if(source.relatedBranchId&&!branchIds.has(source.relatedBranchId))issue('SOURCE',source.sourceId,'DANGLING_BRANCH_REFERENCE');
 }
 for(const residence of payload.residences||[]){
  const add=(code:string)=>issue('RESIDENCE',residence.sourceId,code);
  if(residenceIds.has(residence.sourceId))add('DUPLICATE_SOURCE_ID');residenceIds.add(residence.sourceId);
  if(!personIds.has(residence.personSourceId))add('DANGLING_PERSON_REFERENCE');
  if(evidenceIds&&!evidenceIds.has(residence.sourceRef))add('DANGLING_EVIDENCE_REFERENCE');
  // Location, date and current/visibility claims are retained for explicit review.
  add('RESIDENCE_SOURCE_REVIEW_REQUIRED');
 }
 const claimIds=new Set<string>();
 const entityIds=new Map<string,Set<string>>([['PERSON',personIds],['PARENT_LINK',edgeIds],['UNION',unionIds],['BRANCH',branchIds],['RESIDENCE',residenceIds]]);
 if(evidenceIds)entityIds.set('SOURCE',evidenceIds);
 for(const claim of payload.claims||[]){
  const add=(code:string)=>issue('CLAIM',claim.sourceId,code);
  if(claimIds.has(claim.sourceId))add('DUPLICATE_SOURCE_ID');claimIds.add(claim.sourceId);
  // Entity-type vocabulary is not inferred from source spelling or cultural rules.
  const ids=entityIds.get(claim.entityType);
  if(ids){if(!ids.has(claim.entitySourceId))add('DANGLING_ENTITY_REFERENCE');}
  else add('CLAIM_ENTITY_MAPPING_REVIEW_REQUIRED');
  if(evidenceIds&&[claim.claimASourceRef,claim.claimBSourceRef,claim.decisionEvidenceRef].some(ref=>ref&&!evidenceIds.has(ref)))add('DANGLING_EVIDENCE_REFERENCE');
  add('CLAIM_SOURCE_REVIEW_REQUIRED');
 }
 const visiting=new Set<string>(),done=new Set<string>();let cycle=false;
 function visit(id:string){if(visiting.has(id)){cycle=true;return;}if(done.has(id))return;visiting.add(id);for(const next of adj.get(id)||[])visit(next);visiting.delete(id);done.add(id);}
 for(const id of personIds)visit(id);if(cycle)issue('BATCH',payload.datasetKey,'PARENT_CYCLE');
 return issues;
}
