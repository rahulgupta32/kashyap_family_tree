import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as request from 'supertest';
import { randomUUID } from 'crypto';
import { AppModule } from '../src/app.module';
import { DatabaseService } from '../src/database/database.service';
import { UserRepository } from '../src/database/repositories/user.repository';
import { SessionRepository } from '../src/database/repositories/session.repository';
import { AuditOutboxRepository } from '../src/database/repositories/audit-outbox.repository';
import { GenealogyImportService } from '../src/modules/genealogy-import/genealogy-import.service';
import * as fs from 'fs';
import * as path from 'path';
import { Role } from '@kashyap/contracts';
import { getJwtSecret, JWT_ALGORITHM, JWT_AUDIENCE, JWT_ISSUER } from '../src/modules/auth/auth.constants';
import { createDisposableDatabase, DisposableDatabase, assertDatabaseIsolation } from './helpers/disposable-db';

describe('Durable genealogy staging and dry runs (real PostgreSQL/HTTP)',()=>{
 let iso:DisposableDatabase,app:INestApplication,db:DatabaseService,users:UserRepository,audit:AuditOutboxRepository,service:GenealogyImportService,admin:any,member:any,branchId:string,batch:any;
 const reason='Fictional staged genealogy validation',base='/admin/genealogy-imports';
 const person={sourceId:'PER-00000001',nameNepali:'  काल्पनिक आयात अधिकारी  ',gender:'UNKNOWN',livingStatus:'LIVING',generation:1,sourceRef:'SRC-00000001',consent:'GRANTED',verification:'VERIFIED',visibility:'PRIVATE'};
 const source=(extra:any={})=>({schemaVersion:1,datasetKey:'FICTIONAL_IMPORT',branchId,sourceDescription:'Fictional controlled source fixture only',persons:[{...person}],parentLinks:[],...extra});
 const auth=(u=admin)=>({Authorization:`Bearer ${u.token}`});
 const run=(id=batch.id,hash=batch.sourceHash,key=randomUUID(),why=reason)=>request(app.getHttpServer()).post(`${base}/${id}/dry-runs`).set(auth()).send({sourceHash:hash,requestKey:key,reason:why});
 beforeAll(async()=>{
  iso=await createDisposableDatabase('genealogy_import');await assertDatabaseIsolation(iso.client,iso.dbName);
  const module=await Test.createTestingModule({imports:[AppModule]}).compile();app=module.createNestApplication();await app.init();db=module.get(DatabaseService);users=module.get(UserRepository);audit=module.get(AuditOutboxRepository);service=module.get(GenealogyImportService);await assertDatabaseIsolation(db,iso.dbName);
  async function fixture(phone:string,role:Role){const u=await users.findOrCreateByPhone(phone);await users.setPhoneVerified(u.id,true);await users.assignRole(u.id,role);
   const session=await module.get(SessionRepository).createSession({userId:u.id,refreshTokenHash:randomUUID(),devicePlatform:'WEB',ipAddress:'127.0.0.1',userAgent:'import-fixture',expiresAt:new Date(Date.now()+3600000)});
   const token=module.get(JwtService).sign({sub:u.id,sid:session.id,tokenType:'access'},{secret:getJwtSecret(),issuer:JWT_ISSUER,audience:JWT_AUDIENCE,algorithm:JWT_ALGORITHM});return {id:u.id,token};}
  admin=await fixture('+9779847555701',Role.SUPER_ADMIN);member=await fixture('+9779847555702',Role.VERIFIED_MEMBER);
  branchId=(await db.query("INSERT INTO branches(code,name_nepali,name_english) VALUES('IMPORT_TEST','काल्पनिक शाखा','Fictional import branch') RETURNING id")).rows[0].id;
 },60000);
 afterAll(async()=>{if(app)await app.close();if(iso)await iso.drop();});
 it('requires current phone-verified Super Admin authority on source reads and writes',async()=>{
  await request(app.getHttpServer()).get(base).expect(401);
  for(const role of [Role.VERIFIED_MEMBER,Role.CENTRAL_ADMIN,Role.BRANCH_ADMIN]){await users.assignRole(member.id,role);await request(app.getHttpServer()).get(base).set(auth(member)).expect(403);await request(app.getHttpServer()).post(base).set(auth(member)).send(source()).expect(403);}
  await users.setPhoneVerified(admin.id,false);try{await request(app.getHttpServer()).post(base).set(auth()).send(source()).expect(403);}finally{await users.setPhoneVerified(admin.id,true);}
 });
 it('stages an immutable source once under concurrent retries and retains original spelling',async()=>{
  const responses=await Promise.all([1,2].map(()=>request(app.getHttpServer()).post(base).set(auth()).send(source())));expect(responses.map(r=>r.status)).toEqual([201,201]);expect(responses[0].body.id).toBe(responses[1].body.id);batch=responses[0].body;
  const d=await request(app.getHttpServer()).get(`${base}/${batch.id}`).set(auth()).expect(200);expect(d.body.payload.persons[0].nameNepali).toBe(person.nameNepali);expect(d.headers['cache-control']).toBe('private, no-store');
  expect((await db.query('SELECT count(*) FROM genealogy_import_batches')).rows[0].count).toBe('1');
  await request(app.getHttpServer()).get(`${base}/${batch.id}`).set(auth(member)).expect(403);
  await db.query("DELETE FROM user_roles WHERE user_id=$1 AND role='SUPER_ADMIN'",[admin.id]);try{await request(app.getHttpServer()).get(`${base}/${batch.id}`).set(auth()).expect(403);}finally{await users.assignRole(admin.id,Role.SUPER_ADMIN);}
 });
 it('rejects sensitive/unknown fields, invalid IDs and unknown branches before storing',async()=>{
  for(const body of [source({contacts:[]}),source({persons:[{...person,phone:'fake'}]}),source({branchId:randomUUID()}),source({persons:Array(201).fill(person)})])await request(app.getHttpServer()).post(base).set(auth()).send(body).expect(400);
  await request(app.getHttpServer()).get(`${base}/bad-id`).set(auth()).expect(400);await request(app.getHttpServer()).get(`${base}?after=bad`).set(auth()).expect(400);
 });
 it('retains repeatable reports but never writes live genealogy or allows promotion',async()=>{
  const before=(await db.query('SELECT id,updated_at FROM persons ORDER BY id')).rows;
  const first=(await run().expect(201)).body;expect(first.report).toMatchObject({persons:1,parentLinks:0,mappedTargets:0,unmappedPersons:1,validationPassed:true,promotionAllowed:false});expect(first.report.gates).toContain('BRANCH_AUTHORITY_SAMPLING');
  expect((await new GenealogyImportService(db,audit).detail(admin.id,batch.id)).runs[0].id).toBe(first.id);
  expect((await db.query('SELECT id,updated_at FROM persons ORDER BY id')).rows).toEqual(before);
  await request(app.getHttpServer()).post(`${base}/${batch.id}/promote`).set(auth()).send({sourceHash:batch.sourceHash}).expect(404);
  await run(batch.id,'0'.repeat(64)).expect(409);
 });
 it('serializes concurrent dry-run retries and rejects changed request-key reuse',async()=>{
  const key=randomUUID();const responses=await Promise.all([1,2].map(()=>run(batch.id,batch.sourceHash,key)));expect(responses.map(r=>r.status)).toEqual([201,201]);expect(responses[0].body.id).toBe(responses[1].body.id);await run(batch.id,batch.sourceHash,key,'Fictional changed replay reason').expect(409);
 });
 it('reconciles current target state, flags name candidates and retains earlier reports',async()=>{
  const target=(await db.query('INSERT INTO persons(branch_id,generation) VALUES($1,1) RETURNING id',[branchId])).rows[0].id;
  await db.query("INSERT INTO person_names(person_id,language,first_name,last_name,full_name) VALUES($1,'ne','काल्पनिक','अधिकारी',$2)",[target,person.nameNepali.trim()]);
  const duplicate=(await run().expect(201)).body;expect(duplicate.report.duplicateCandidatePersons).toBe(1);expect(duplicate.report.issues.map((i:any)=>i.code)).toContain('TARGET_NAME_DUPLICATE_CANDIDATE');
  const mapped=await service.stage(admin.id,source({datasetKey:'MAPPED_TEST',persons:[{...person,targetPersonId:target}]}));const first=await service.dryRun(admin.id,mapped.id,{sourceHash:mapped.sourceHash,requestKey:randomUUID(),reason});expect(first.report.mappedTargets).toBe(1);
  await db.query('UPDATE persons SET is_archived=TRUE WHERE id=$1',[target]);const second=await service.dryRun(admin.id,mapped.id,{sourceHash:mapped.sourceHash,requestKey:randomUUID(),reason});expect(second.report.mappedTargets).toBe(0);expect(second.report.issues.map(i=>i.code)).toContain('TARGET_INELIGIBLE');
  const history=await service.runs(admin.id,mapped.id,{});expect(history.items[1].report.mappedTargets).toBe(1);
 });
 it('detects cycles through live targets and unmapped staged vertices without changing genealogy',async()=>{
  const targets=[];for(let i=0;i<3;i++)targets.push((await db.query('INSERT INTO persons(branch_id,generation) VALUES($1,$2) RETURNING id',[branchId,i+1])).rows[0].id);
  for(let i=0;i<2;i++)await db.query("INSERT INTO parent_links(parent_id,child_id,confidence) VALUES($1,$2,'VERIFIED')",[targets[i],targets[i+1]]);
  const persons=[{...person,sourceId:'start',nameNepali:'काल्पनिक सुरु',targetPersonId:targets[0]},{...person,sourceId:'end',nameNepali:'काल्पनिक अन्त',targetPersonId:targets[2]},{...person,sourceId:'bridge',nameNepali:'काल्पनिक नयाँ'}];
  const link=(sourceId:string,parentSourceId:string,childSourceId:string)=>({sourceId,parentSourceId,childSourceId,type:'BIOLOGICAL',sourceRef:'SRC-1',verification:'VERIFIED'});
  const staged=await service.stage(admin.id,source({datasetKey:'COMBINED_GRAPH',persons,parentLinks:[link('back-1','end','bridge'),link('back-2','bridge','start')]}));
  const before=(await db.query('SELECT parent_id,child_id FROM parent_links ORDER BY parent_id,child_id')).rows;
  const report=await service.dryRun(admin.id,staged.id,{sourceHash:staged.sourceHash,requestKey:randomUUID(),reason});
  expect(report.report.validatorVersion).toBe('staging-13-private-contacts');expect(report.report.validationPassed).toBe(false);expect(report.report.promotionAllowed).toBe(false);expect(report.report.issues.map(i=>i.code)).toContain('COMBINED_TARGET_PARENT_CYCLE');
  expect((await db.query('SELECT parent_id,child_id FROM parent_links ORDER BY parent_id,child_id')).rows).toEqual(before);
  const forward=await service.stage(admin.id,source({datasetKey:'FORWARD_GRAPH',persons,parentLinks:[link('forward','start','end')]}));
  const valid=await service.dryRun(admin.id,forward.id,{sourceHash:forward.sourceHash,requestKey:randomUUID(),reason});expect(valid.report.issues.map(i=>i.code)).not.toContain('COMBINED_TARGET_PARENT_CYCLE');
  await db.query('DELETE FROM parent_links WHERE parent_id=ANY($1::uuid[])',[targets]);
  const refreshed=await service.dryRun(admin.id,staged.id,{sourceHash:staged.sourceHash,requestKey:randomUUID(),reason});expect(refreshed.report.issues.map(i=>i.code)).not.toContain('COMBINED_TARGET_PARENT_CYCLE');
  expect((await service.runs(admin.id,staged.id,{})).items[1].report.issues.map(i=>i.code)).toContain('COMBINED_TARGET_PARENT_CYCLE');
 });
 it('retains peer hashes and blocks cross-batch identities and erased evidence',async()=>{
  const target=(await db.query('INSERT INTO persons(branch_id,generation) VALUES($1,1) RETURNING id',[branchId])).rows[0].id;
  const first=await service.stage(admin.id,source({datasetKey:'PEER_IDENTITIES',persons:[{...person,targetPersonId:target}]}));
  const initial=await service.dryRun(admin.id,first.id,{sourceHash:first.sourceHash,requestKey:randomUUID(),reason});expect(initial.report.peerBatches).toEqual([]);
  const peer=await service.stage(admin.id,source({datasetKey:'PEER_IDENTITIES',sourceDescription:'Fictional corrected source requires reconciliation',persons:[{...person,targetPersonId:target,nameNepali:'काल्पनिक संशोधन'}]}));
  const checked=await service.dryRun(admin.id,first.id,{sourceHash:first.sourceHash,requestKey:randomUUID(),reason});
  expect(checked.report.peerBatches).toEqual([{id:peer.id,sourceHash:peer.sourceHash}]);
  expect(checked.report.issues.map(i=>i.code)).toEqual(expect.arrayContaining(['CROSS_BATCH_SOURCE_ID_RECONCILIATION_REQUIRED','CROSS_BATCH_TARGET_MAPPING_RECONCILIATION_REQUIRED']));
  expect(checked.report.validationPassed).toBe(false);expect(checked.report.promotionAllowed).toBe(false);
  await service.erase(admin.id,peer.id,{sourceHash:peer.sourceHash,reason});
  const erased=await service.dryRun(admin.id,first.id,{sourceHash:first.sourceHash,requestKey:randomUUID(),reason});expect(erased.report.issues.map(i=>i.code)).toContain('PEER_SOURCE_ERASED_RECONCILIATION_REQUIRED');
  const history=await service.runs(admin.id,first.id,{});expect(history.items[2].report.peerBatches).toEqual([]);expect(history.items[1].report.peerBatches).toEqual(checked.report.peerBatches);
 });
 it('detects a cycle formed only by separate retained batch overlays',async()=>{
  const targets=[];for(let i=0;i<3;i++)targets.push((await db.query('INSERT INTO persons(branch_id,generation) VALUES($1,$2) RETURNING id',[branchId,i+1])).rows[0].id);
  const stageEdge=async(index:number,parent:number,child:number)=>service.stage(admin.id,source({datasetKey:'PEER_GRAPH',persons:[{...person,sourceId:`p-${index}`,nameNepali:`काल्पनिक अभिभावक ${index}`,targetPersonId:targets[parent]},{...person,sourceId:`c-${index}`,nameNepali:`काल्पनिक सन्तान ${index}`,targetPersonId:targets[child]}],parentLinks:[{sourceId:`edge-${index}`,parentSourceId:`p-${index}`,childSourceId:`c-${index}`,type:'BIOLOGICAL',sourceRef:'SRC-1',verification:'VERIFIED'}]}));
  const first=await stageEdge(1,0,1),second=await stageEdge(2,1,2);
  const runBatch=(b:any)=>service.dryRun(admin.id,b.id,{sourceHash:b.sourceHash,requestKey:randomUUID(),reason});
  const before=await runBatch(first);expect(before.report.issues.map(i=>i.code)).not.toContain('COMBINED_TARGET_PARENT_CYCLE');
  const third=await stageEdge(3,2,0);const cycled=await runBatch(first);
  expect(cycled.report.issues).toContainEqual({entity:'PARENT_LINK',sourceId:'edge-1',code:'COMBINED_TARGET_PARENT_CYCLE'});
  expect(cycled.report.issues.filter(i=>i.entity==='PARENT_LINK').map(i=>i.sourceId)).not.toContain('edge-3');
  expect(cycled.report.peerBatches?.map(b=>b.id).sort()).toEqual([second.id,third.id].sort());expect(cycled.report.validationPassed).toBe(false);
  expect((await db.query('SELECT * FROM parent_links WHERE parent_id=ANY($1::uuid[])',[targets])).rows).toEqual([]);
  expect((await service.runs(admin.id,first.id,{})).items[1].report).toEqual(before.report);
  await service.erase(admin.id,third.id,{sourceHash:third.sourceHash,reason});const erased=await runBatch(first);
  expect(erased.report.issues.map(i=>i.code)).toContain('PEER_SOURCE_ERASED_RECONCILIATION_REQUIRED');expect(erased.report.validationPassed).toBe(false);
  expect((await service.runs(admin.id,first.id,{})).items[1].report).toEqual(cycled.report);
 });
 it('flags target field differences, preserves private values and retains historical reports',async()=>{
  const target=(await db.query("INSERT INTO persons(branch_id,generation,gender,living_status,birth_date_ad) VALUES($1,2,'MALE','LIVING','1980-01-02') RETURNING id",[branchId])).rows[0].id;
  const staged=await service.stage(admin.id,source({datasetKey:'TARGET_FIELDS',persons:[{...person,targetPersonId:target,nameEnglish:'Fictional Name',birth:{calendar:'AD',precision:'EXACT',value:'1981-01-02'}}]}));
  const before=(await db.query('SELECT * FROM persons WHERE id=$1',[target])).rows;
  const checked=await service.dryRun(admin.id,staged.id,{sourceHash:staged.sourceHash,requestKey:randomUUID(),reason});
  expect(checked.report.issues.map(i=>i.code)).toEqual(expect.arrayContaining(['TARGET_GENERATION_RECONCILIATION_REQUIRED','TARGET_GENDER_RECONCILIATION_REQUIRED','TARGET_NEPALI_NAME_RECONCILIATION_REQUIRED','TARGET_ENGLISH_NAME_RECONCILIATION_REQUIRED','TARGET_BIRTH_DATE_AD_RECONCILIATION_REQUIRED']));
  expect(checked.report.mappedTargets).toBe(1);expect(checked.report.validationPassed).toBe(false);expect(JSON.stringify(checked.report.issues)).not.toMatch(/1980|1981|Fictional Name/);
  expect((await db.query('SELECT * FROM persons WHERE id=$1',[target])).rows).toEqual(before);
  await db.query("UPDATE persons SET generation=1,gender='UNKNOWN',birth_date_ad='1981-01-02' WHERE id=$1",[target]);
  for(const [language,name] of [['ne',person.nameNepali],['en','Fictional Name']])await db.query('INSERT INTO person_names(person_id,language,first_name,last_name,full_name) VALUES($1,$2,$3,$3,$3)',[target,language,name]);
  const refreshed=await service.dryRun(admin.id,staged.id,{sourceHash:staged.sourceHash,requestKey:randomUUID(),reason});
  expect(refreshed.report.issues.filter(i=>i.code.startsWith('TARGET_')&&i.code.endsWith('_RECONCILIATION_REQUIRED'))).toEqual([]);
  expect((await service.runs(admin.id,staged.id,{})).items[1].report).toEqual(checked.report);
 });
 it('retains relationship source details immutably and excludes private evidence from reports',async()=>{
  const sourceDetails={parentRole:'Source Parent',relationshipStatus:'Disputed',reviewedBy:'Fictional private source reviewer',startDate:'2080-01',startCalendar:'BS',notes:'Fictional private historical evidence'};
  const payload=source({datasetKey:'RELATIONSHIP_DETAILS',persons:[person,{...person,sourceId:'PER-DETAIL-2',nameNepali:'काल्पनिक विवरण व्यक्ति'}],parentLinks:[{sourceId:'EDGE-DETAIL',parentSourceId:person.sourceId,childSourceId:'PER-DETAIL-2',type:'BIOLOGICAL',sourceRef:'SRC-1',verification:'VERIFIED',sourceDetails}]});
  const staged=await service.stage(admin.id,payload);expect((await service.detail(admin.id,staged.id)).payload.parentLinks[0].sourceDetails).toEqual(sourceDetails);
  const checked=await service.dryRun(admin.id,staged.id,{sourceHash:staged.sourceHash,requestKey:randomUUID(),reason});
  expect(checked.report.issues).toContainEqual({entity:'PARENT_LINK',sourceId:'EDGE-DETAIL',code:'RELATIONSHIP_SOURCE_DETAILS_REVIEW_REQUIRED'});expect(checked.report.validationPassed).toBe(false);expect(JSON.stringify(checked.report)).not.toContain(sourceDetails.reviewedBy);
  const corrected=await service.stage(admin.id,{...payload,parentLinks:[{...payload.parentLinks[0],sourceDetails:{...sourceDetails,notes:'Fictional corrected private evidence'}}]});expect(corrected.sourceHash).not.toBe(staged.sourceHash);expect(corrected.id).not.toBe(staged.id);
  expect((await service.detail(admin.id,staged.id)).payload.parentLinks[0].sourceDetails).toEqual(sourceDetails);
  await service.erase(admin.id,staged.id,{sourceHash:staged.sourceHash,reason});expect((await service.runs(admin.id,staged.id,{})).items[0].report).toEqual(checked.report);
 });
 it('preserves source components and aliases separately across corrected batches and erasure',async()=>{
  const sourceNames={givenNepali:'  काल्पनिक  ',familyNepali:'अधिकारी',knownAs:'Fictional original alias / मूल उपनाम'};
  const payload=source({datasetKey:'SOURCE_NAME_COMPONENTS',persons:[{...person,sourceNames}]});const staged=await service.stage(admin.id,payload);
  expect((await service.detail(admin.id,staged.id)).payload.persons[0].sourceNames).toEqual(sourceNames);
  const checked=await service.dryRun(admin.id,staged.id,{sourceHash:staged.sourceHash,requestKey:randomUUID(),reason});expect(checked.report.issues).toContainEqual({entity:'PERSON',sourceId:person.sourceId,code:'SOURCE_NAME_COMPONENTS_REVIEW_REQUIRED'});expect(checked.report.validationPassed).toBe(false);expect(JSON.stringify(checked.report)).not.toContain(sourceNames.knownAs);
  const corrected=await service.stage(admin.id,{...payload,persons:[{...person,sourceNames:{...sourceNames,knownAs:'Fictional corrected alias'}}]});expect(corrected.sourceHash).not.toBe(staged.sourceHash);
  expect((await service.detail(admin.id,staged.id)).payload.persons[0].sourceNames).toEqual(sourceNames);
  await service.erase(admin.id,staged.id,{sourceHash:staged.sourceHash,reason});expect((await service.runs(admin.id,staged.id,{})).items[0].report).toEqual(checked.report);
 });
 it('retains permission/provenance evidence without accepting source claims or disclosing private content',async()=>{
  const evidence={sourceId:person.sourceRef,sourceType:'Interview',description:'Fictional private source description',recordedDate:'Unknown',reliability:'Unconfirmed',permission:'Granted',accessClass:'Private',recordedBy:'Fictional private collector',reviewStatus:'Accepted',notes:'Fictional private permission context'};
  const payload=source({datasetKey:'SOURCE_EVIDENCE',evidenceSources:[evidence]});const staged=await service.stage(admin.id,payload);
  expect((await service.detail(admin.id,staged.id)).payload.evidenceSources).toEqual([evidence]);
  const checked=await service.dryRun(admin.id,staged.id,{sourceHash:staged.sourceHash,requestKey:randomUUID(),reason});expect(checked.report.issues).toContainEqual({entity:'SOURCE',sourceId:evidence.sourceId,code:'SOURCE_EVIDENCE_REVIEW_REQUIRED'});expect(checked.report.validationPassed).toBe(false);expect(checked.report.promotionAllowed).toBe(false);expect(JSON.stringify(checked.report)).not.toContain(evidence.description);
  const corrected=await service.stage(admin.id,{...payload,evidenceSources:[{...evidence,permission:'Pending'}]});expect(corrected.sourceHash).not.toBe(staged.sourceHash);expect((await service.detail(admin.id,staged.id)).payload.evidenceSources).toEqual([evidence]);
  const missing=await service.stage(admin.id,source({datasetKey:'MISSING_EVIDENCE',evidenceSources:[]}));const r=await service.dryRun(admin.id,missing.id,{sourceHash:missing.sourceHash,requestKey:randomUUID(),reason});expect(r.report.issues.map(i=>i.code)).toContain('DANGLING_EVIDENCE_REFERENCE');
  await service.erase(admin.id,staged.id,{sourceHash:staged.sourceHash,reason});expect((await service.runs(admin.id,staged.id,{})).items[0].report).toEqual(checked.report);
 });
 it('preserves cycle, missing reference and calendar/consent exceptions',async()=>{
  const broken=await service.stage(admin.id,source({datasetKey:'BROKEN_TEST',persons:[{...person,consent:'PENDING',birth:{value:'2080-01-01',calendar:'BS',precision:'EXACT'}}],parentLinks:[{sourceId:'PCR-1',parentSourceId:person.sourceId,childSourceId:person.sourceId,type:'GUARDIAN',sourceRef:'SRC-1',verification:'DRAFT'}]}));
  const r=await service.dryRun(admin.id,broken.id,{sourceHash:broken.sourceHash,requestKey:randomUUID(),reason});expect(r.report.validationPassed).toBe(false);expect(r.report.issues.map(i=>i.code)).toEqual(expect.arrayContaining(['PARENT_CYCLE','CONSENT_REVIEW_REQUIRED','DATE_AUTHORITY_REVIEW_REQUIRED','UNSUPPORTED_PARENT_TYPE']));
 });
 it('retains union history across reload, correction and audited erasure without changing live genealogy',async()=>{
  const union={sourceId:'UNI-1',partner1SourceId:person.sourceId,partner2SourceId:'PER-2',unionType:'Historical',status:'Disputed',sourceRef:person.sourceRef,visibility:'Private',consentLegalReview:'Approved',startDate:'2080',startCalendar:'BS',startPrecision:'YEAR',notes:'Fictional original history'};
  const payload=source({datasetKey:'UNION_HISTORY',persons:[person,{...person,sourceId:'PER-2',nameNepali:'दोस्रो काल्पनिक व्यक्ति'}],unions:[union]});
  const before=(await db.query('SELECT id,updated_at FROM persons ORDER BY id')).rows;
  const staged=await service.stage(admin.id,payload);expect((await new GenealogyImportService(db,audit).detail(admin.id,staged.id)).payload.unions).toEqual([union]);
  const checked=await service.dryRun(admin.id,staged.id,{sourceHash:staged.sourceHash,requestKey:randomUUID(),reason});expect(checked.report.issues).toContainEqual({entity:'UNION',sourceId:'UNI-1',code:'UNION_SOURCE_REVIEW_REQUIRED'});expect(checked.report.promotionAllowed).toBe(false);
  const corrected=await service.stage(admin.id,{...payload,unions:[{...union,status:'Corrected'}]});expect(corrected.sourceHash).not.toBe(staged.sourceHash);expect((await service.detail(admin.id,staged.id)).payload.unions).toEqual([union]);
  expect((await db.query('SELECT id,updated_at FROM persons ORDER BY id')).rows).toEqual(before);
  await service.erase(admin.id,staged.id,{sourceHash:staged.sourceHash,reason});expect((await service.runs(admin.id,staged.id,{})).items[0].report).toEqual(checked.report);
 });
 it('retains dispute evidence through restart, correction and erasure without resolving live genealogy',async()=>{
  const claim={sourceId:'CASE-1',entityType:'PERSON',entitySourceId:person.sourceId,fieldOrRelationship:'Name',riskLevel:'High',visibility:'Private',status:'Resolved',claimA:'Fictional disputed history',claimB:'Alternate history',assignedAuthority:'Source authority',decision:'Approved',decisionDate:'Unknown',appealStatus:'Pending',auditNotes:'Fictional audit notes'};
  const payload=source({datasetKey:'CLAIM_HISTORY',claims:[claim]});const before=(await db.query('SELECT id,updated_at FROM persons ORDER BY id')).rows;
  const staged=await service.stage(admin.id,payload);expect((await new GenealogyImportService(db,audit).detail(admin.id,staged.id)).payload.claims).toEqual([claim]);
  const checked=await service.dryRun(admin.id,staged.id,{sourceHash:staged.sourceHash,requestKey:randomUUID(),reason});expect(checked.report.issues).toContainEqual({entity:'CLAIM',sourceId:'CASE-1',code:'CLAIM_SOURCE_REVIEW_REQUIRED'});expect(checked.report.promotionAllowed).toBe(false);
  const corrected=await service.stage(admin.id,{...payload,claims:[{...claim,decision:'Corrected'}]});expect(corrected.sourceHash).not.toBe(staged.sourceHash);expect((await service.detail(admin.id,staged.id)).payload.claims).toEqual([claim]);
  expect((await db.query('SELECT id,updated_at FROM persons ORDER BY id')).rows).toEqual(before);
  await service.erase(admin.id,staged.id,{sourceHash:staged.sourceHash,reason});expect((await service.runs(admin.id,staged.id,{})).items[0].report).toEqual(checked.report);
 });
 it('retains original person metadata through reload, correction and erasure without mutating live people',async()=>{
  const sourceMetadata={branchSourceId:'Original branch',gotra:'Unreviewed lineage',consentDate:'2080 BS',restrictionReason:'Private source restriction',dataSteward:'Original steward',profilePhotoRef:'Original media reference'};
  const payload=source({datasetKey:'PERSON_METADATA',persons:[{...person,sourceMetadata}]});const before=(await db.query('SELECT id,updated_at FROM persons ORDER BY id')).rows;
  const staged=await service.stage(admin.id,payload);expect((await new GenealogyImportService(db,audit).detail(admin.id,staged.id)).payload.persons[0].sourceMetadata).toEqual(sourceMetadata);
  const checked=await service.dryRun(admin.id,staged.id,{sourceHash:staged.sourceHash,requestKey:randomUUID(),reason});expect(checked.report.issues).toContainEqual({entity:'PERSON',sourceId:person.sourceId,code:'PERSON_SOURCE_METADATA_REVIEW_REQUIRED'});expect(checked.report.promotionAllowed).toBe(false);
  const corrected=await service.stage(admin.id,{...payload,persons:[{...person,sourceMetadata:{...sourceMetadata,restrictionReason:'Corrected restriction'}}]});expect(corrected.sourceHash).not.toBe(staged.sourceHash);expect((await service.detail(admin.id,staged.id)).payload.persons[0].sourceMetadata).toEqual(sourceMetadata);
  expect((await db.query('SELECT id,updated_at FROM persons ORDER BY id')).rows).toEqual(before);
  await service.erase(admin.id,staged.id,{sourceHash:staged.sourceHash,reason});expect((await service.runs(admin.id,staged.id,{})).items[0].report).toEqual(checked.report);
 });
 it('retains branch authority and private residence evidence without changing live branches or people',async()=>{
  const branch={sourceId:'BR-1',nameNepali:'मूल काल्पनिक शाखा',status:'Approved',approvedBy:'Source approver',authorityPersonSourceId:person.sourceId};
  const residence={sourceId:'RES-1',personSourceId:person.sourceId,residenceType:'Historical',country:'Nepal',current:'Yes',visibility:'Public',sourceRef:person.sourceRef,exactAddress:'Fictional private source address',latitude:'Approximate',startDate:'2080 BS'};
  const payload=source({datasetKey:'BRANCH_RESIDENCE',branches:[branch],residences:[residence]});const before=(await db.query('SELECT id,updated_at FROM persons ORDER BY id')).rows;const branchesBefore=(await db.query('SELECT * FROM branches ORDER BY id')).rows;
  const staged=await service.stage(admin.id,payload);const loaded=await new GenealogyImportService(db,audit).detail(admin.id,staged.id);expect(loaded.payload.branches).toEqual([branch]);expect(loaded.payload.residences).toEqual([residence]);
  await request(app.getHttpServer()).get(`${base}/${staged.id}`).set(auth(member)).expect(403);
  const checked=await service.dryRun(admin.id,staged.id,{sourceHash:staged.sourceHash,requestKey:randomUUID(),reason});expect(checked.report.issues).toEqual(expect.arrayContaining([{entity:'BRANCH',sourceId:'BR-1',code:'BRANCH_SOURCE_REVIEW_REQUIRED'},{entity:'RESIDENCE',sourceId:'RES-1',code:'RESIDENCE_SOURCE_REVIEW_REQUIRED'}]));expect(checked.report.promotionAllowed).toBe(false);expect(JSON.stringify(checked.report)).not.toContain(residence.exactAddress);
  const corrected=await service.stage(admin.id,{...payload,residences:[{...residence,exactAddress:'Corrected fictional address'}]});expect(corrected.sourceHash).not.toBe(staged.sourceHash);expect((await service.detail(admin.id,staged.id)).payload.residences).toEqual([residence]);
  expect((await db.query('SELECT id,updated_at FROM persons ORDER BY id')).rows).toEqual(before);expect((await db.query('SELECT * FROM branches ORDER BY id')).rows).toEqual(branchesBefore);
  await service.erase(admin.id,staged.id,{sourceHash:staged.sourceHash,reason});expect((await service.runs(admin.id,staged.id,{})).items[0].report).toEqual(checked.report);
 });
 it('encrypts private contact source records, restricts access and supports correction, replay and erasure',async()=>{
  const previous=process.env.IMPORT_CONTACTS_ENCRYPTION_KEY;process.env.IMPORT_CONTACTS_ENCRYPTION_KEY=Buffer.alloc(32,23).toString('base64');
  try{
   const contact={sourceId:'CON-1',personSourceId:person.sourceId,contactType:'Phone',contactValue:'Fictional private number',primary:'Yes',verified:'Approved',verificationDate:'2080 BS',consentStatus:'Granted',consentDate:'Unknown',accessClass:'Public',retentionReviewDate:'Unknown',notes:'Fictional source notes'};
   const payload=source({datasetKey:'PRIVATE_CONTACTS',privateContacts:[contact]});const before=(await db.query('SELECT id,updated_at FROM persons ORDER BY id')).rows;const usersBefore=(await db.query('SELECT count(*) FROM user_accounts')).rows;
   const staged=await service.stage(admin.id,payload);const stored=(await db.query('SELECT payload FROM genealogy_import_batches WHERE id=$1',[staged.id])).rows[0].payload;
   expect(stored).not.toHaveProperty('privateContacts');expect(JSON.stringify(stored)).not.toContain(contact.contactValue);expect(JSON.stringify(stored)).not.toContain(contact.sourceId);expect(stored.privateContactsSealed.version).toBe(1);
   expect((await new GenealogyImportService(db,audit).detail(admin.id,staged.id)).payload.privateContacts).toEqual([contact]);expect((await service.stage(admin.id,payload)).id).toBe(staged.id);
   await request(app.getHttpServer()).get(`${base}/${staged.id}`).set(auth(member)).expect(403);
   const checked=await service.dryRun(admin.id,staged.id,{sourceHash:staged.sourceHash,requestKey:randomUUID(),reason});expect(checked.report.issues).toContainEqual({entity:'PRIVATE_CONTACT',sourceId:'CON-1',code:'PRIVATE_CONTACT_SOURCE_REVIEW_REQUIRED'});expect(JSON.stringify(checked.report)).not.toContain(contact.contactValue);
   const corrected=await service.stage(admin.id,{...payload,privateContacts:[{...contact,consentStatus:'Corrected'}]});expect(corrected.sourceHash).not.toBe(staged.sourceHash);expect((await service.detail(admin.id,staged.id)).payload.privateContacts).toEqual([contact]);
   expect((await db.query('SELECT id,updated_at FROM persons ORDER BY id')).rows).toEqual(before);expect((await db.query('SELECT count(*) FROM user_accounts')).rows).toEqual(usersBefore);
   delete process.env.IMPORT_CONTACTS_ENCRYPTION_KEY;await request(app.getHttpServer()).get(`${base}/${staged.id}`).set(auth()).expect(503);
   await service.erase(admin.id,staged.id,{sourceHash:staged.sourceHash,reason});expect((await db.query('SELECT payload FROM genealogy_import_batches WHERE id=$1',[staged.id])).rows[0].payload).toBeNull();expect((await service.runs(admin.id,staged.id,{})).items[0].report).toEqual(checked.report);
  }finally{if(previous===undefined)delete process.env.IMPORT_CONTACTS_ENCRYPTION_KEY;else process.env.IMPORT_CONTACTS_ENCRYPTION_KEY=previous;}
 });
 it('reads immutable contact records across managed key rotation and refuses retired missing keys',async()=>{
  const oldRing=process.env.IMPORT_CONTACTS_ENCRYPTION_KEYS_JSON,oldActive=process.env.IMPORT_CONTACTS_ENCRYPTION_ACTIVE_KEY_ID;
  process.env.IMPORT_CONTACTS_ENCRYPTION_KEYS_JSON=JSON.stringify({first:Buffer.alloc(32,29).toString('base64'),second:Buffer.alloc(32,31).toString('base64')});process.env.IMPORT_CONTACTS_ENCRYPTION_ACTIVE_KEY_ID='first';
  try{
   const contact={sourceId:'CON-KEY',personSourceId:person.sourceId,contactType:'Phone',contactValue:'Fictional original private value',primary:'Yes',verified:'Pending',consentStatus:'Pending',accessClass:'Private'};
   const payload=source({datasetKey:'CONTACT_KEY_ROTATION',privateContacts:[contact]});const first=await service.stage(admin.id,payload);
   process.env.IMPORT_CONTACTS_ENCRYPTION_ACTIVE_KEY_ID='second';const second=await service.stage(admin.id,{...payload,privateContacts:[{...contact,contactValue:'Fictional corrected private value'}]});
   expect((await service.stage(admin.id,payload)).id).toBe(first.id);expect((await service.detail(admin.id,first.id)).payload.privateContacts).toEqual([contact]);
   const rows=(await db.query('SELECT payload FROM genealogy_import_batches WHERE id=ANY($1::uuid[]) ORDER BY id',[[first.id,second.id]])).rows;expect(new Set(rows.map(r=>r.payload.privateContactsSealed.keyId))).toEqual(new Set(['first','second']));
   process.env.IMPORT_CONTACTS_ENCRYPTION_KEYS_JSON=JSON.stringify({second:Buffer.alloc(32,31).toString('base64')});await request(app.getHttpServer()).get(`${base}/${first.id}`).set(auth()).expect(503);expect((await service.detail(admin.id,second.id)).payload.privateContacts?.[0].contactValue).toBe('Fictional corrected private value');
   await service.erase(admin.id,first.id,{sourceHash:first.sourceHash,reason});
  }finally{if(oldRing===undefined)delete process.env.IMPORT_CONTACTS_ENCRYPTION_KEYS_JSON;else process.env.IMPORT_CONTACTS_ENCRYPTION_KEYS_JSON=oldRing;if(oldActive===undefined)delete process.env.IMPORT_CONTACTS_ENCRYPTION_ACTIVE_KEY_ID;else process.env.IMPORT_CONTACTS_ENCRYPTION_ACTIVE_KEY_ID=oldActive;}
 });
 it('rolls back staged data, reports and erasure on audit failure; sensitive reads fail closed',async()=>{
  const counts=(await db.query('SELECT count(*) FROM genealogy_import_runs')).rows[0].count;
  const spy=jest.spyOn(audit,'recordAuditIntent').mockRejectedValue(new Error('Fictional audit failure'));try{
   await request(app.getHttpServer()).post(base).set(auth()).send(source({datasetKey:'AUDIT_FAIL'})).expect(500);await run().expect(500);
   await request(app.getHttpServer()).get(`${base}/${batch.id}`).set(auth()).expect(500);await request(app.getHttpServer()).get(base).set(auth()).expect(500);
   await request(app.getHttpServer()).post(`${base}/${batch.id}/erase-payload`).set(auth()).send({sourceHash:batch.sourceHash,reason}).expect(500);
  }finally{spy.mockRestore();}
  expect((await db.query('SELECT count(*) FROM genealogy_import_runs')).rows[0].count).toBe(counts);expect((await db.query("SELECT id FROM genealogy_import_batches WHERE dataset_key='AUDIT_FAIL'")).rows).toHaveLength(0);expect((await service.detail(admin.id,batch.id)).payload).toBeTruthy();
 });
 it('supports audited erasure without resurrecting source data or losing report evidence',async()=>{
  const r=await service.runs(admin.id,batch.id,{});await request(app.getHttpServer()).post(`${base}/${batch.id}/erase-payload`).set(auth(member)).send({sourceHash:batch.sourceHash,reason}).expect(403);
  await request(app.getHttpServer()).post(`${base}/${batch.id}/erase-payload`).set(auth()).send({sourceHash:batch.sourceHash,reason}).expect(201);
  await request(app.getHttpServer()).get(`${base}/${batch.id}`).set(auth()).expect(409);await request(app.getHttpServer()).post(base).set(auth()).send(source()).expect(409);await run().expect(409);
  expect((await service.runs(admin.id,batch.id,{})).items).toEqual(r.items);expect((await db.query('SELECT payload FROM genealogy_import_batches WHERE id=$1',[batch.id])).rows[0].payload).toBeNull();
  expect(JSON.stringify(r.items)).not.toContain(person.nameNepali);
 });
 it('protects evidence from mutation/destructive rollback and paginates reports',async()=>{
  await expect(db.query("UPDATE genealogy_import_batches SET source_description='changed' WHERE id=$1",[batch.id])).rejects.toThrow('append-only');await expect(db.query('DELETE FROM genealogy_import_runs WHERE batch_id=$1',[batch.id])).rejects.toThrow('append-only');
  await expect(db.query("UPDATE genealogy_import_runs SET reason='Fictional changed report reason' WHERE batch_id=$1",[batch.id])).rejects.toThrow('append-only');
  await expect(db.query('DELETE FROM genealogy_import_batches WHERE id=$1',[batch.id])).rejects.toThrow('append-only');
  const sql=fs.readFileSync(path.resolve(__dirname,'../../../database/migrations/046_genealogy_import_staging.down.sql'),'utf8');await expect(db.query(sql)).rejects.toThrow('Cannot discard');
  const h=await service.runs(admin.id,batch.id,{});const older=await service.runs(admin.id,batch.id,{before:String(h.items[0].sequence)});expect(older.items.every(r=>r.sequence<h.items[0].sequence)).toBe(true);
  await request(app.getHttpServer()).get(`${base}/${batch.id}/runs?before=invalid`).set(auth()).expect(400);await request(app.getHttpServer()).get(`${base}/${batch.id}/runs?extra=true`).set(auth()).expect(400);
 });
 it('covers real cursor boundaries without exposing source payload in list responses',async()=>{
  for(let i=0;i<51;i++)await service.stage(admin.id,source({datasetKey:`CURSOR_${i}`}));
  const first=await service.list(admin.id,{});expect(first.items).toHaveLength(50);expect(first.nextAfter).toBeTruthy();expect(JSON.stringify(first)).not.toContain(person.nameNepali);
  const second=await service.list(admin.id,{after:first.nextAfter});expect(new Set([...first.items,...second.items].map(b=>b.id)).size).toBe(Number((await db.query('SELECT count(*) FROM genealogy_import_batches')).rows[0].count));expect(second.nextAfter).toBeNull();
  const b=await service.stage(admin.id,source({datasetKey:'REPORT_CURSOR'}));
  for(let i=0;i<51;i++)await service.dryRun(admin.id,b.id,{sourceHash:b.sourceHash,requestKey:randomUUID(),reason});
  const reports=await service.runs(admin.id,b.id,{});expect(reports.items).toHaveLength(50);expect(reports.nextBefore).toBe(2);
  const tail=await service.runs(admin.id,b.id,{before:String(reports.nextBefore)});expect(tail.items.map(r=>r.sequence)).toEqual([1]);expect(tail.nextBefore).toBeNull();
 },45000);

});
