import { ProfileService } from '../src/modules/profile/profile.service';
import { ClaimsService,claimCreationFingerprint } from '../src/modules/claims/claims.service';
import { notificationCategoryEnabled } from '../src/modules/notifications/notification-policy';
import { randomUUID } from 'crypto';
describe('Private claim evidence and creation identity',()=>{
 const id=randomUUID(),image=Buffer.from([0xff,0xd8,0xff,0x00]).toString('base64');
 function upload(status='CLEAN'){
  const query=jest.fn(async(sql:string)=>({rows:sql.includes('SELECT is_active')?[{is_active:true}]:[]}));
  const db={query,transaction:jest.fn(async(run:any)=>run({query}))},audit={recordAuditIntent:jest.fn().mockResolvedValue({})},storage={put:jest.fn().mockResolvedValue('/private/fixture'),remove:jest.fn().mockResolvedValue(undefined)},scanner={scanFile:jest.fn().mockResolvedValue({status,evidence:{fixture:true}})},images={enqueue:jest.fn()},processor={inspect:jest.fn().mockResolvedValue({})};
  const service=new ProfileService(db as any,{} as any,{} as any,{} as any,audit as any,scanner as any,undefined,storage as any,images as any,processor as any);
  return {service,query,audit,storage,scanner,images};
 }
 const body={mimeType:'image/jpeg',dataBase64:image,documentType:'family_photo',evidenceNoticeAccepted:true};
 it.each([{...body,evidenceNoticeAccepted:false},{...body,documentType:'passport'},{...body,documentType:'citizenship'},{...body,uploaderUserId:id}])('rejects prohibited/unknown upload inputs before scanning %j',async value=>{
  const f=upload();await expect(f.service.uploadClaimEvidence(id,value)).rejects.toThrow();expect(f.scanner.scanFile).not.toHaveBeenCalled();expect(f.storage.put).not.toHaveBeenCalled();
 });
 it('stores private scanned evidence without changing avatar or generating public profile derivatives',async()=>{
  const f=upload(),result=await f.service.uploadClaimEvidence(id,body);
  expect(result).toMatchObject({documentType:'family_photo',quarantineStatus:'CLEAN'});expect(result).not.toHaveProperty('url');
  expect(f.images.enqueue).not.toHaveBeenCalled();expect(f.query.mock.calls.some(([sql])=>sql.includes('UPDATE user_accounts SET avatar'))).toBe(false);
  expect(f.storage.put).toHaveBeenCalledWith('private-profiles',expect.stringMatching(/^evidence_/),expect.any(Buffer),'image/jpeg',id);
  expect(f.audit.recordAuditIntent).toHaveBeenCalledWith(expect.objectContaining({action:'PROFILE_CLAIM_EVIDENCE_UPLOADED',actorId:id}),expect.anything());
 });
 it.each(['INFECTED','SCANNER_FAILED'])('fails closed on scanner result %s without exposing an attachable ID',async status=>{
  const f=upload(status);await expect(f.service.uploadClaimEvidence(id,body)).rejects.toThrow();expect(f.images.enqueue).not.toHaveBeenCalled();
 });
 it('upload evidence is audit-only and cannot emit workflow notifications',()=>expect(notificationCategoryEnabled('PROFILE_CLAIM_EVIDENCE_UPLOADED',{})).toBe(false));
 it('retains the established profile photo avatar behavior',async()=>{
  const f=upload();await f.service.uploadPhoto(id,'image/jpeg',image);expect(f.images.enqueue).toHaveBeenCalled();expect(f.query.mock.calls.some(([sql])=>sql.includes('UPDATE user_accounts SET avatar'))).toBe(true);
 });
 it('cleans uncommitted evidence after transaction/audit failure',async()=>{
  const f=upload();f.audit.recordAuditIntent.mockRejectedValueOnce(new Error('audit failed'));await expect(f.service.uploadClaimEvidence(id,body)).rejects.toThrow('audit failed');expect(f.storage.remove).toHaveBeenCalled();
 });
 it('rejects malformed, oversized and unsupported attachment metadata before asset lookup',async()=>{
  const f=new ClaimsService({} as any,{} as any,{} as any,{} as any,{} as any,{} as any),query=jest.fn();
  for(const list of [{},Array(6).fill({}),[{mediaAssetId:'bad',documentType:'family_photo'}],[{mediaAssetId:id,documentType:'passport'}]]){
   await expect((f as any).validateEvidenceAttachments({query},id,list)).rejects.toThrow();
  }expect(query).not.toHaveBeenCalled();
 });
 it('canonicalizes object keys and binds creation identity to content and ordered attachments',()=>{
  expect(claimCreationFingerprint({a:1,b:2,creationKey:id} as any)).toBe(claimCreationFingerprint({b:2,a:1} as any));
  expect(claimCreationFingerprint({evidenceAttachments:[1,2]} as any)).not.toBe(claimCreationFingerprint({evidenceAttachments:[2,1]} as any));
 });
 it('replays only an owned receipt after active-account check, even after person linking',async()=>{
  const dto={creationKey:randomUUID(),targetPersonId:id,relationshipDescription:'Original',statementOfTruth:true};
  const query=jest.fn(async(sql:string)=>({rows:sql.includes('FROM user_accounts')?[{id,is_active:true,person_id:'now-linked'}]:sql.includes('FROM claim_creation_receipts')?[{payload_hash:claimCreationFingerprint(dto),claim_id:id}]:sql.includes('SELECT * FROM profile_claims WHERE id=')?[{id,claimant_user_id:id}]:[]}));
  const service=new ClaimsService({transaction:async(run:any)=>run({query})} as any,{} as any,{} as any,{} as any,{} as any,{} as any);
  jest.spyOn(service as any,'mapToDetailDto').mockResolvedValue({id});
  await expect(service.submitClaim(id,dto)).resolves.toEqual({id});expect(query).toHaveBeenCalledWith(expect.stringContaining('claimant_user_id=$2'),[id,id]);
  await expect(service.submitClaim(id,{...dto,relationshipDescription:'Changed'})).rejects.toThrow('different claim');
  expect(query.mock.calls.some(([sql])=>sql.includes('INSERT'))).toBe(false);
 });
});
