import { openImportContacts, sealImportContacts } from '../src/modules/genealogy-import/import-contact-storage';
const key=Buffer.alloc(32,17).toString('base64');
const payload:any={datasetKey:'FICTIONAL',branchId:'branch',persons:[],parentLinks:[],privateContacts:[{sourceId:'CON-1',contactValue:'Fictional private value'}]};
describe('Encrypted private contact staging',()=>{
 let original:string|undefined,originalRing:string|undefined,originalActive:string|undefined;
 beforeEach(()=>{originalRing=process.env.IMPORT_CONTACTS_ENCRYPTION_KEYS_JSON;originalActive=process.env.IMPORT_CONTACTS_ENCRYPTION_ACTIVE_KEY_ID;delete process.env.IMPORT_CONTACTS_ENCRYPTION_KEYS_JSON;delete process.env.IMPORT_CONTACTS_ENCRYPTION_ACTIVE_KEY_ID;original=process.env.IMPORT_CONTACTS_ENCRYPTION_KEY;process.env.IMPORT_CONTACTS_ENCRYPTION_KEY=key;});
 afterEach(()=>{if(originalRing===undefined)delete process.env.IMPORT_CONTACTS_ENCRYPTION_KEYS_JSON;else process.env.IMPORT_CONTACTS_ENCRYPTION_KEYS_JSON=originalRing;if(originalActive===undefined)delete process.env.IMPORT_CONTACTS_ENCRYPTION_ACTIVE_KEY_ID;else process.env.IMPORT_CONTACTS_ENCRYPTION_ACTIVE_KEY_ID=originalActive;if(original===undefined)delete process.env.IMPORT_CONTACTS_ENCRYPTION_KEY;else process.env.IMPORT_CONTACTS_ENCRYPTION_KEY=original;});
 it('seals full records with fresh nonces and preserves their exact source text',()=>{
  const a=sealImportContacts(payload,'hash'),b=sealImportContacts(payload,'hash');expect(a.privateContactsSealed.ciphertext).not.toBe(b.privateContactsSealed.ciphertext);
  expect(JSON.stringify(a)).not.toContain('Fictional private value');expect(JSON.stringify(a)).not.toContain('CON-1');expect(a).not.toHaveProperty('privateContacts');expect(openImportContacts(a,'hash')).toEqual(payload);
 });
 it('binds ciphertext to dataset, branch and original hash and rejects tampering',()=>{
  const sealed=sealImportContacts(payload,'hash');for(const modified of [{...sealed,branchId:'other'},{...sealed,datasetKey:'other'},{...sealed,privateContactsSealed:{...sealed.privateContactsSealed,ciphertext:'AAAA'}},{...sealed,privateContactsSealed:{...sealed.privateContactsSealed,version:2}}])expect(()=>openImportContacts(modified,'hash')).toThrow();
  expect(()=>openImportContacts(sealed,'other-hash')).toThrow();process.env.IMPORT_CONTACTS_ENCRYPTION_KEY=Buffer.alloc(32,18).toString('base64');expect(()=>openImportContacts(sealed,'hash')).toThrow();
 });
 it('rotates new writes while retaining immutable records under their original key IDs',()=>{
  process.env.IMPORT_CONTACTS_ENCRYPTION_KEYS_JSON=JSON.stringify({first:key,second:Buffer.alloc(32,18).toString('base64')});process.env.IMPORT_CONTACTS_ENCRYPTION_ACTIVE_KEY_ID='first';const first=sealImportContacts(payload,'hash');
  process.env.IMPORT_CONTACTS_ENCRYPTION_ACTIVE_KEY_ID='second';const second=sealImportContacts(payload,'hash');expect(first.privateContactsSealed.keyId).toBe('first');expect(second.privateContactsSealed.keyId).toBe('second');expect(openImportContacts(first,'hash')).toEqual(payload);expect(openImportContacts(second,'hash')).toEqual(payload);
  expect(()=>openImportContacts({...first,privateContactsSealed:{...first.privateContactsSealed,keyId:'second'}},'hash')).toThrow();
  process.env.IMPORT_CONTACTS_ENCRYPTION_KEYS_JSON=JSON.stringify({second:Buffer.alloc(32,18).toString('base64')});expect(()=>openImportContacts(first,'hash')).toThrow();expect(openImportContacts(second,'hash')).toEqual(payload);
 });
 it('rejects malformed keyrings, unknown active IDs and reused MFA keys',()=>{
  for(const ring of ['invalid','[]','{}',JSON.stringify({'invalid id':key}),JSON.stringify({first:'invalid'}),JSON.stringify(Object.fromEntries(Array.from({length:11},(_,i)=>['key'+i,key])))]){
   process.env.IMPORT_CONTACTS_ENCRYPTION_KEYS_JSON=ring;process.env.IMPORT_CONTACTS_ENCRYPTION_ACTIVE_KEY_ID='first';expect(()=>sealImportContacts(payload,'hash')).toThrow();
  }
  process.env.IMPORT_CONTACTS_ENCRYPTION_KEYS_JSON=JSON.stringify({first:key});process.env.IMPORT_CONTACTS_ENCRYPTION_ACTIVE_KEY_ID='missing';expect(()=>sealImportContacts(payload,'hash')).toThrow();
 });
 it('rejects reuse of the administrative authenticator key',()=>{
  const previous=process.env.MFA_ENCRYPTION_KEY;process.env.MFA_ENCRYPTION_KEY=key;
  try{expect(()=>sealImportContacts(payload,'hash')).toThrow();}finally{if(previous===undefined)delete process.env.MFA_ENCRYPTION_KEY;else process.env.MFA_ENCRYPTION_KEY=previous;}
 });
 it('fails closed without a valid independent key while preserving contact-free legacy payloads',()=>{
  const sealed=sealImportContacts(payload,'hash');const {privateContacts,...legacy}=payload;
  for(const configured of [undefined,'invalid',process.env.MFA_ENCRYPTION_KEY||'invalid']){
   if(configured===undefined)delete process.env.IMPORT_CONTACTS_ENCRYPTION_KEY;else process.env.IMPORT_CONTACTS_ENCRYPTION_KEY=configured;
   expect(()=>sealImportContacts(payload,'hash')).toThrow();expect(()=>openImportContacts(sealed,'hash')).toThrow();expect(sealImportContacts(legacy,'hash')).toEqual(legacy);expect(openImportContacts(legacy,'hash')).toEqual(legacy);
  }
  expect(()=>openImportContacts(payload,'hash')).toThrow();
 });
});
