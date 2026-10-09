import { randomUUID } from 'crypto';
import { importHash, parseImportPayload, validateImport } from '../src/modules/genealogy-import/import-validation';
const person={sourceId:'PER-00000001',nameNepali:'  नमुना अधिकारी  ',gender:'UNKNOWN',livingStatus:'LIVING',generation:1,sourceRef:'SRC-00000001',consent:'GRANTED',verification:'VERIFIED',visibility:'PRIVATE'};
const payload=()=>({schemaVersion:1,datasetKey:'FICTIONAL_TEST',branchId:randomUUID(),sourceDescription:'Fictional validator fixture only',persons:[{...person}],parentLinks:[]});
describe('Source-preserving import validation',()=>{
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
