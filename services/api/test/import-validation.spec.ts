import { randomUUID } from 'crypto';
import { importHash, parseImportPayload, validateImport } from '../src/modules/genealogy-import/import-validation';
const person={sourceId:'PER-00000001',nameNepali:'  नमुना अधिकारी  ',gender:'UNKNOWN',livingStatus:'LIVING',generation:1,sourceRef:'SRC-00000001',consent:'GRANTED',verification:'VERIFIED',visibility:'PRIVATE'};
const payload=()=>({schemaVersion:1,datasetKey:'FICTIONAL_TEST',branchId:randomUUID(),sourceDescription:'Fictional validator fixture only',persons:[{...person}],parentLinks:[]});
describe('Source-preserving import validation',()=>{
 const contact={sourceId:'CON-1',personSourceId:person.sourceId,contactType:'Phone',contactValue:'  fictional private value  ',primary:'Yes',verified:'Approved',verificationDate:'2080 BS',consentStatus:'Granted',consentDate:'Unknown',accessClass:'Public',retentionReviewDate:'Source date',notes:'Original source notes'};
 it('preserves all private contact evidence without interpreting verification or consent claims',()=>{
  const p=parseImportPayload({...payload(),privateContacts:[contact]});expect(p.privateContacts).toEqual([contact]);expect(validateImport(p)).toEqual([{entity:'PRIVATE_CONTACT',sourceId:'CON-1',code:'PRIVATE_CONTACT_SOURCE_REVIEW_REQUIRED'}]);expect(JSON.stringify(validateImport(p))).not.toContain(contact.contactValue);
  expect(importHash(p)).not.toBe(importHash(parseImportPayload({...p,privateContacts:[{...contact,consentStatus:'Corrected'}]})));
 });
 it('flags duplicate contact IDs, dangling people and contact claim references',()=>{
  const p=parseImportPayload({...payload(),privateContacts:[{...contact,personSourceId:'MISSING'},contact],claims:[{sourceId:'CASE-CON',entityType:'PRIVATE_CONTACT',entitySourceId:'MISSING',fieldOrRelationship:'Consent',riskLevel:'High',visibility:'Private',status:'Pending'}]});expect(validateImport(p).map(i=>i.code)).toEqual(expect.arrayContaining(['DUPLICATE_SOURCE_ID','DANGLING_PERSON_REFERENCE','DANGLING_ENTITY_REFERENCE','PRIVATE_CONTACT_SOURCE_REVIEW_REQUIRED']));
 });
 it('rejects malformed, oversized and unknown private contact fields and preserves legacy hashes',()=>{
  for(const privateContacts of [null,{},Array(401).fill(contact),[{...contact,unknown:'private'}],[{...contact,contactValue:undefined}],[{...contact,contactValue:'x'.repeat(256)}],[{...contact,notes:'bad\u0000text'}],[{...contact,verified:true}],[{...contact,personSourceId:'bad id'}]])expect(()=>parseImportPayload({...payload(),privateContacts})).toThrow();
  const body=payload(),p=parseImportPayload(body);expect(p).not.toHaveProperty('privateContacts');expect(importHash(p)).toBe(importHash(body as any));
 });
 const branch={sourceId:'BR-1',nameNepali:'  मूल शाखा  ',nameEnglish:'Original branch',parentSourceId:'BR-2',historicalOrigin:'Original history',district:'District',municipality:'Municipality',ward:'Unknown',authorityPersonSourceId:person.sourceId,authorityRole:'Administrator',status:'Approved',sourceRef:person.sourceRef,approvedBy:'Source approver',approvalDate:'2080 BS'};
 const residence={sourceId:'RES-1',personSourceId:person.sourceId,residenceType:'Historical',country:'Nepal',province:'Original province',district:'District',municipality:'Municipality',ward:'Unknown',locality:'Locality',exactAddress:'  Original private address  ',latitude:'Approximate 27',longitude:'Unknown',startDate:'2080 BS',endDate:'Unknown',current:'Yes',visibility:'Public',sourceRef:person.sourceRef};
 it('preserves all branch fields and requires review of source authority and approval',()=>{
  const p=parseImportPayload({...payload(),branches:[branch,{sourceId:'BR-2',nameNepali:'दोस्रो शाखा',status:'Pending'}]});expect(p.branches?.[0]).toEqual(branch);
  expect(validateImport(p).filter(i=>i.entity==='BRANCH')).toEqual([{entity:'BRANCH',sourceId:'BR-1',code:'BRANCH_SOURCE_REVIEW_REQUIRED'},{entity:'BRANCH',sourceId:'BR-2',code:'BRANCH_SOURCE_REVIEW_REQUIRED'}]);
  expect(JSON.stringify(validateImport(p))).not.toContain('Source approver');expect(importHash(p)).not.toBe(importHash(parseImportPayload({...p,branches:[{...branch,status:'Corrected'},p.branches![1]]})));
 });
 it('detects cyclic, self, duplicate and dangling branch references without changing source records',()=>{
  const p=parseImportPayload({...payload(),evidenceSources:[],persons:[{...person,sourceMetadata:{branchSourceId:'MISSING'}}],branches:[{...branch,authorityPersonSourceId:'MISSING'}, {...branch,sourceId:'BR-2',parentSourceId:'BR-1'}, {...branch,parentSourceId:'BR-1'}, {...branch,sourceId:'BR-3',parentSourceId:'MISSING'}]});
  expect(validateImport(p).map(i=>i.code)).toEqual(expect.arrayContaining(['BRANCH_CYCLE','SELF_BRANCH_PARENT','DUPLICATE_SOURCE_ID','DANGLING_PERSON_REFERENCE','DANGLING_BRANCH_REFERENCE','DANGLING_EVIDENCE_REFERENCE']));expect(p.branches?.[0].parentSourceId).toBe('BR-2');
 });
 it('preserves residence history and raw coordinates without exposing them in reports',()=>{
  const p=parseImportPayload({...payload(),residences:[residence,{...residence,sourceId:'RES-2',current:'No'}]});expect(p.residences?.[0]).toEqual(residence);
  expect(validateImport(p).filter(i=>i.entity==='RESIDENCE')).toHaveLength(2);expect(JSON.stringify(validateImport(p))).not.toContain(residence.exactAddress);
  expect(importHash(p)).not.toBe(importHash(parseImportPayload({...p,residences:[{...residence,exactAddress:'Corrected address'}]})));
 });
 it('flags duplicate residence IDs and dangling person/evidence references',()=>{
  const p=parseImportPayload({...payload(),evidenceSources:[],residences:[{...residence,personSourceId:'MISSING'},residence]});expect(validateImport(p).filter(i=>i.entity==='RESIDENCE').map(i=>i.code)).toEqual(expect.arrayContaining(['DUPLICATE_SOURCE_ID','DANGLING_PERSON_REFERENCE','DANGLING_EVIDENCE_REFERENCE','RESIDENCE_SOURCE_REVIEW_REQUIRED']));
 });
 it('rejects unknown, unsafe, malformed and excessive branch or residence records',()=>{
  for(const branches of [null,{},Array(201).fill(branch),[{...branch,phone:'private'}],[{...branch,status:undefined}],[{...branch,parentSourceId:'bad id'}],[{...branch,historicalOrigin:'x'.repeat(1001)}],[{...branch,approvedBy:'bad\u0000text'}]])expect(()=>parseImportPayload({...payload(),branches})).toThrow();
  for(const residences of [null,{},Array(401).fill(residence),[{...residence,phone:'private'}],[{...residence,country:undefined}],[{...residence,personSourceId:'bad id'}],[{...residence,exactAddress:'x'.repeat(1001)}],[{...residence,latitude:27}],[{...residence,locality:'bad\u0000text'}]])expect(()=>parseImportPayload({...payload(),residences})).toThrow();
 });
 it('checks branch and residence claim references and preserves legacy hashes',()=>{
  const p=parseImportPayload({...payload(),branches:[],residences:[],claims:[{sourceId:'CASE-B',entityType:'BRANCH',entitySourceId:'MISSING',fieldOrRelationship:'Parent',riskLevel:'High',visibility:'Private',status:'Pending'},{sourceId:'CASE-R',entityType:'RESIDENCE',entitySourceId:'MISSING',fieldOrRelationship:'Address',riskLevel:'High',visibility:'Private',status:'Pending'}]});expect(validateImport(p).filter(i=>i.code==='DANGLING_ENTITY_REFERENCE')).toHaveLength(2);
  const body=payload(),legacy=parseImportPayload(body);expect(legacy).not.toHaveProperty('branches');expect(legacy).not.toHaveProperty('residences');expect(importHash(legacy)).toBe(importHash(body as any));
 });
 const sourceMetadata={branchSourceId:'Original branch',birthPlace:'Original birthplace',currentDistrict:'District',currentMunicipality:'Municipality',currentWard:'Unknown',country:'Nepal',occupation:'Source occupation',education:'Source education',gotra:'Unreviewed gotra',lineageNotes:'  मूल वंश टिप्पणी  ',profilePhotoRef:'Original media reference',consentDate:'2080 BS',createdBy:'Source creator',createdDate:'Original date',lastUpdated:'Unknown',dataSteward:'Source steward',restrictionReason:'Restricted by source'};
 it('preserves all person metadata without changing branch, consent or name authority',()=>{
  const p=parseImportPayload({...payload(),persons:[{...person,sourceMetadata}]});expect(p.persons[0].sourceMetadata).toEqual(sourceMetadata);expect(p.persons[0].consent).toBe(person.consent);
  expect(validateImport(p)).toEqual([{entity:'PERSON',sourceId:person.sourceId,code:'PERSON_SOURCE_METADATA_REVIEW_REQUIRED'}]);expect(JSON.stringify(validateImport(p))).not.toContain('Source steward');
  expect(importHash(p)).not.toBe(importHash(parseImportPayload({...p,persons:[{...p.persons[0],sourceMetadata:{...sourceMetadata,restrictionReason:'Corrected restriction'}}]})));
 });
 it('rejects empty, unknown, excessive and unsafe person metadata',()=>{
  for(const sourceMetadata of [{},null,[],{phone:'private'},{lineageNotes:'x'.repeat(1001)},{country:'x'.repeat(256)},{consentDate:42},{restrictionReason:'bad\u0000text'}])expect(()=>parseImportPayload({...payload(),persons:[{...person,sourceMetadata}]})).toThrow();
 });
 it('retains legacy person hashes when original metadata is absent',()=>{const body=payload(),p=parseImportPayload(body);expect(p.persons[0]).not.toHaveProperty('sourceMetadata');expect(importHash(p)).toBe(importHash(body as any));});
 const claim={sourceId:'CASE-1',entityType:'PERSON',entitySourceId:person.sourceId,fieldOrRelationship:'Original name',riskLevel:'High',visibility:'Private',status:'Resolved',claimA:'  मूल दाबी  ',claimASourceRef:person.sourceRef,claimB:'Alternate account',claimBSourceRef:person.sourceRef,assignedAuthority:'Source authority',decision:'Approved',decisionEvidenceRef:person.sourceRef,decisionDate:'2080 BS',appealStatus:'Pending',auditNotes:'Original audit notes'};
 it('retains all claim and dispute evidence without granting authority to source decisions',()=>{
  const p=parseImportPayload({...payload(),claims:[claim]});expect(p.claims).toEqual([claim]);expect(validateImport(p)).toEqual([{entity:'CLAIM',sourceId:'CASE-1',code:'CLAIM_SOURCE_REVIEW_REQUIRED'}]);
  expect(JSON.stringify(validateImport(p))).not.toContain('Source authority');expect(importHash(p)).not.toBe(importHash(parseImportPayload({...p,claims:[{...claim,decision:'Corrected'}]})));
 });
 it('flags duplicate cases and dangling entity/evidence references',()=>{
  const p=parseImportPayload({...payload(),evidenceSources:[],claims:[{...claim,entitySourceId:'MISSING'},claim]});
  expect(validateImport(p).filter(i=>i.entity==='CLAIM').map(i=>i.code)).toEqual(expect.arrayContaining(['DUPLICATE_SOURCE_ID','DANGLING_ENTITY_REFERENCE','DANGLING_EVIDENCE_REFERENCE','CLAIM_SOURCE_REVIEW_REQUIRED']));
 });
 it('requires explicit mapping for source entity vocabularies including object prototype names',()=>{
  for(const entityType of ['Person','External entity','constructor','__proto__'])expect(validateImport(parseImportPayload({...payload(),claims:[{...claim,entityType}]}))).toContainEqual({entity:'CLAIM',sourceId:'CASE-1',code:'CLAIM_ENTITY_MAPPING_REVIEW_REQUIRED'});
 });
 it('rejects malformed, excessive and unknown claim fields and retains legacy hashes',()=>{
  for(const claims of [null,{},Array(201).fill(claim),[{...claim,phone:'private'}],[{...claim,status:undefined}],[{...claim,claimA:'x'.repeat(1001)}],[{...claim,decisionEvidenceRef:'invalid id'}],[{...claim,auditNotes:'bad\u0000text'}]])expect(()=>parseImportPayload({...payload(),claims})).toThrow();
  const body=payload(),p=parseImportPayload(body);expect(p).not.toHaveProperty('claims');expect(importHash(p)).toBe(importHash(body as any));
 });
 const union={sourceId:'UNI-1',partner1SourceId:person.sourceId,partner2SourceId:'PER-2',unionType:' Historical marriage ',status:'Disputed',sourceRef:person.sourceRef,visibility:'Private',startDate:'2080-01',startCalendar:'BS',startPrecision:'MONTH',endDate:'Unknown',endCalendar:'Unknown',endPrecision:'UNKNOWN',ceremonyPlace:'Original place',registrationRef:'Source register',consentLegalReview:'Approved',proposedBy:'Source proposer',reviewedBy:'Source reviewer',notes:'  मूल टिप्पणी  '};
 it('preserves all union source fields and binds corrected evidence to a new hash',()=>{
  const body={...payload(),persons:[person,{...person,sourceId:'PER-2',nameNepali:'दोस्रो नमुना'}],unions:[union]};const p=parseImportPayload(body);
  expect(p.unions).toEqual([union]);expect(validateImport(p)).toEqual([{entity:'UNION',sourceId:'UNI-1',code:'UNION_SOURCE_REVIEW_REQUIRED'}]);
  expect(JSON.stringify(validateImport(p))).not.toContain('Source reviewer');
  expect(importHash(p)).not.toBe(importHash(parseImportPayload({...body,unions:[{...union,status:'Corrected'}]})));
 });
 it('flags duplicate union IDs, self unions and dangling partner/evidence references',()=>{
  const p=parseImportPayload({...payload(),evidenceSources:[],unions:[{...union,partner2SourceId:person.sourceId},union]});
  expect(validateImport(p).filter(i=>i.entity==='UNION').map(i=>i.code)).toEqual(expect.arrayContaining(['SELF_UNION','DUPLICATE_SOURCE_ID','DANGLING_PERSON_REFERENCE','DANGLING_EVIDENCE_REFERENCE','UNION_SOURCE_REVIEW_REQUIRED']));
 });
 it('rejects malformed, excessive and unknown union fields',()=>{
  for(const unions of [null,{},Array(201).fill(union),[{...union,phone:'private'}],[{...union,partner1SourceId:'invalid id'}],[{...union,status:undefined}],[{...union,notes:'x'.repeat(1001)}],[{...union,notes:'bad\u0000text'}]])expect(()=>parseImportPayload({...payload(),unions})).toThrow();
 });
 it('preserves legacy hashes when unions are absent',()=>{const body=payload(),p=parseImportPayload(body);expect(p).not.toHaveProperty('unions');expect(importHash(p)).toBe(importHash(body as any));});
 const evidence={sourceId:person.sourceRef,sourceType:'Interview',description:'  Fictional original evidence  ',recordedDate:'Unknown',reliability:'Unconfirmed',permission:'Granted',accessClass:'Private',recordedBy:'Source collector',reviewStatus:'Accepted'};
 it('preserves evidence source text and requires review even when source claims permission and acceptance',()=>{
  const p=parseImportPayload({...payload(),evidenceSources:[{...evidence,url:'https://example.invalid/source',notes:'Original source notes'}]});expect(p.evidenceSources?.[0].description).toBe(evidence.description);
  expect(validateImport(p)).toEqual([{entity:'SOURCE',sourceId:evidence.sourceId,code:'SOURCE_EVIDENCE_REVIEW_REQUIRED'}]);expect(JSON.stringify(validateImport(p))).not.toContain('Source collector');
  expect(importHash(p)).not.toBe(importHash(parseImportPayload({...p,evidenceSources:[{...evidence,permission:'Pending'}]})));
 });
 it('detects missing and duplicated evidence references without filling them in',()=>{
  const p=parseImportPayload({...payload(),evidenceSources:[{...evidence,sourceId:'OTHER'}, {...evidence,sourceId:'OTHER'}]});expect(validateImport(p).map(i=>i.code)).toEqual(expect.arrayContaining(['DUPLICATE_SOURCE_ID','DANGLING_EVIDENCE_REFERENCE']));
  expect(validateImport(parseImportPayload({...payload(),evidenceSources:[]})).map(i=>i.code)).toContain('DANGLING_EVIDENCE_REFERENCE');
 });
 it('rejects oversized, unknown and malformed evidence records',()=>{
  for(const evidenceSources of [null,{},Array(201).fill(evidence),[{...evidence,phone:'private'}],[{...evidence,permission:undefined}],[{...evidence,url:'x'.repeat(2049)}],[{...evidence,notes:'bad\u0000text'}]])expect(()=>parseImportPayload({...payload(),evidenceSources})).toThrow();
 });
 it('keeps legacy evidence representation absent without altering its hash',()=>{
  const body=payload(),p=parseImportPayload(body);expect(p).not.toHaveProperty('evidenceSources');expect(importHash(p)).toBe(importHash(body as any));
 });
 it('retains independent source name components and alias text without transliteration or splitting',()=>{
  const sourceNames={givenNepali:'  नाम  ',middleNepali:'मध्य',familyNepali:'अधिकारी',givenEnglish:'Original',middleEnglish:'Source',familyEnglish:'Adhikari',knownAs:'First alias / दोस्रो उपनाम'};
  const p=parseImportPayload({...payload(),persons:[{...person,sourceNames}]});expect(p.persons[0].sourceNames).toEqual(sourceNames);expect(p.persons[0].nameNepali).toBe(person.nameNepali);
  expect(validateImport(p)).toContainEqual({entity:'PERSON',sourceId:person.sourceId,code:'SOURCE_NAME_COMPONENTS_REVIEW_REQUIRED'});expect(JSON.stringify(validateImport(p))).not.toContain(sourceNames.knownAs);
  expect(importHash(p)).not.toBe(importHash(parseImportPayload({...p,persons:[{...p.persons[0],sourceNames:{...sourceNames,knownAs:'Corrected alias'}}]})));
 });
 it('rejects empty, unknown, oversized and invalid source name component shapes',()=>{
  for(const sourceNames of [{},null,[],{phone:'private'},{givenNepali:'x'.repeat(256)},{knownAs:'bad\u0000name'},{givenEnglish:23}])expect(()=>parseImportPayload({...payload(),persons:[{...person,sourceNames}]})).toThrow();
 });
 it('preserves legacy names and hashes when component evidence is absent',()=>{
  const body=payload(),p=parseImportPayload(body);expect(p.persons[0]).not.toHaveProperty('sourceNames');expect(importHash(p)).toBe(importHash(body as any));
 });
 const link={sourceId:'PCR-DETAIL',parentSourceId:person.sourceId,childSourceId:'PER-2',type:'BIOLOGICAL',sourceRef:'SRC-1',verification:'VERIFIED'};
 it('preserves relationship source spelling and original dates without treating source review as authority',()=>{
  const sourceDetails={parentRole:' Father ',legalStatus:'Unknown',startDate:'2080-01',startCalendar:'BS',endDate:'Unknown',endCalendar:'Unknown',certainty:'Disputed',relationshipStatus:'Historical',visibility:'Private',proposedBy:'Source proposer',reviewedBy:'Source reviewer',reviewDate:'Approximate',notes:'  मूल स्रोतको टिप्पणी  '};
  const p=parseImportPayload({...payload(),persons:[person,{...person,sourceId:'PER-2',nameNepali:'दोस्रो नमुना'}],parentLinks:[{...link,sourceDetails}]});
  expect(p.parentLinks[0].sourceDetails).toEqual(sourceDetails);expect(validateImport(p)).toContainEqual({entity:'PARENT_LINK',sourceId:link.sourceId,code:'RELATIONSHIP_SOURCE_DETAILS_REVIEW_REQUIRED'});
  expect(JSON.stringify(validateImport(p))).not.toContain('Source reviewer');
 });
 it('binds relationship source details into the immutable hash without changing legacy payloads',()=>{
  const original={...payload(),parentLinks:[link]};const parsed=parseImportPayload(original);
  expect(parsed.parentLinks[0]).toEqual(link);
  expect(importHash(parsed)).not.toBe(importHash(parseImportPayload({...original,parentLinks:[{...link,sourceDetails:{notes:'Source history evidence'}}]})));
 });
 it('rejects unknown, empty, oversized and unsafe relationship source details',()=>{
  for(const sourceDetails of [{},{phone:'private'},null,[],{notes:'x'.repeat(1001)},{parentRole:'x'.repeat(101)},{notes:'bad\u0000text'},{reviewDate:42}])expect(()=>parseImportPayload({...payload(),parentLinks:[{...link,sourceDetails}]})).toThrow();
 });
 it('retains source names and hashes reordered object keys consistently',()=>{const p=payload();const parsed=parseImportPayload(p);expect(parsed.persons[0].nameNepali).toBe(person.nameNepali);expect(validateImport(parsed)).toEqual([]);const reversed=Object.fromEntries(Object.entries(p).reverse());expect(importHash(parsed)).toBe(importHash(parseImportPayload(reversed)));});
 it('rejects unknown sensitive fields and invalid shape or resource bounds',()=>{for(const p of [{...payload(),contacts:[]},{...payload(),schemaVersion:2},{...payload(),persons:[]},{...payload(),persons:Array(201).fill(person)},{...payload(),persons:[{...person,phone:'+977000000'}]},{...payload(),persons:[{...person,generation:0}]},{...payload(),persons:[{...person,nameNepali:'bad\u0000name'}]}])expect(()=>parseImportPayload(p)).toThrow();});
 it('keeps pending consent, verification and visibility as actionable exceptions',()=>{const p=parseImportPayload({...payload(),persons:[{...person,consent:'PENDING',verification:'DISPUTED',visibility:'PUBLIC'}]});expect(validateImport(p).map(i=>i.code)).toEqual(expect.arrayContaining(['CONSENT_REVIEW_REQUIRED','VERIFICATION_REQUIRED','PRIVACY_REVIEW_REQUIRED']));});
 it('never converts BS, Tithi or approximate source dates',()=>{const p=parseImportPayload({...payload(),persons:[{...person,birth:{value:'2080-01-01',calendar:'BS',precision:'EXACT'}}]});expect(p.persons[0].birth?.value).toBe('2080-01-01');expect(validateImport(p).map(i=>i.code)).toContain('DATE_AUTHORITY_REVIEW_REQUIRED');});
 it('rejects impossible AD dates and death dates before birth',()=>{const p=parseImportPayload({...payload(),persons:[{...person,livingStatus:'DECEASED',birth:{value:'2024-03-01',calendar:'AD',precision:'EXACT'},death:{value:'2023-02-29',calendar:'AD',precision:'EXACT'}}]});expect(validateImport(p).map(i=>i.code)).toEqual(expect.arrayContaining(['INVALID_AD_DATE','DEATH_BEFORE_BIRTH']));});
 it('flags duplicate source IDs and equivalent source names without overwriting either',()=>{const p=parseImportPayload({...payload(),persons:[person,{...person,nameNepali:person.nameNepali.trim()}]});expect(p.persons).toHaveLength(2);expect(validateImport(p).map(i=>i.code)).toEqual(expect.arrayContaining(['DUPLICATE_SOURCE_ID','SOURCE_NAME_DUPLICATE_CANDIDATE']));});
 it('flags dangling, self and unsupported parent edges explicitly',()=>{const p=parseImportPayload({...payload(),parentLinks:[{sourceId:'PCR-1',parentSourceId:person.sourceId,childSourceId:person.sourceId,type:'GUARDIAN',sourceRef:'SRC-1',verification:'DRAFT'},{sourceId:'PCR-2',parentSourceId:person.sourceId,childSourceId:'PER-MISSING',type:'BIOLOGICAL',sourceRef:'SRC-1',verification:'VERIFIED'}]});expect(validateImport(p).map(i=>i.code)).toEqual(expect.arrayContaining(['SELF_PARENT','UNSUPPORTED_PARENT_TYPE','RELATIONSHIP_VERIFICATION_REQUIRED','DANGLING_PERSON_REFERENCE','PARENT_CYCLE']));});
 it('detects a cycle across multiple independently identified persons',()=>{const p=parseImportPayload({...payload(),persons:[person,{...person,sourceId:'PER-2',nameNepali:'दोस्रो नमुना'}],parentLinks:[{sourceId:'PCR-1',parentSourceId:person.sourceId,childSourceId:'PER-2',type:'ADOPTIVE',sourceRef:'SRC-1',verification:'VERIFIED'},{sourceId:'PCR-2',parentSourceId:'PER-2',childSourceId:person.sourceId,type:'BIOLOGICAL',sourceRef:'SRC-1',verification:'VERIFIED'}]});expect(validateImport(p).map(i=>i.code)).toContain('PARENT_CYCLE');});
});
