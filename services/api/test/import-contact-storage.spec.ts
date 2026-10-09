import { openImportContacts, sealImportContacts } from '../src/modules/genealogy-import/import-contact-storage';
const key=Buffer.alloc(32,17).toString('base64');
const payload:any={datasetKey:'FICTIONAL',branchId:'branch',persons:[],parentLinks:[],privateContacts:[{sourceId:'CON-1',contactValue:'Fictional private value'}]};
describe('Encrypted private contact staging',()=>{
 let original:string|undefined;
 beforeEach(()=>{original=process.env.IMPORT_CONTACTS_ENCRYPTION_KEY;process.env.IMPORT_CONTACTS_ENCRYPTION_KEY=key;});
 afterEach(()=>{if(original===undefined)delete process.env.IMPORT_CONTACTS_ENCRYPTION_KEY;else process.env.IMPORT_CONTACTS_ENCRYPTION_KEY=original;});
 it('seals full records with fresh nonces and preserves their exact source text',()=>{
  const a=sealImportContacts(payload,'hash'),b=sealImportContacts(payload,'hash');expect(a.privateContactsSealed.ciphertext).not.toBe(b.privateContactsSealed.ciphertext);
  expect(JSON.stringify(a)).not.toContain('Fictional private value');expect(JSON.stringify(a)).not.toContain('CON-1');expect(a).not.toHaveProperty('privateContacts');expect(openImportContacts(a,'hash')).toEqual(payload);
 });
 it('binds ciphertext to dataset, branch and original hash and rejects tampering',()=>{
  const sealed=sealImportContacts(payload,'hash');for(const modified of [{...sealed,branchId:'other'},{...sealed,datasetKey:'other'},{...sealed,privateContactsSealed:{...sealed.privateContactsSealed,ciphertext:'AAAA'}},{...sealed,privateContactsSealed:{...sealed.privateContactsSealed,version:2}}])expect(()=>openImportContacts(modified,'hash')).toThrow();
  expect(()=>openImportContacts(sealed,'other-hash')).toThrow();process.env.IMPORT_CONTACTS_ENCRYPTION_KEY=Buffer.alloc(32,18).toString('base64');expect(()=>openImportContacts(sealed,'hash')).toThrow();
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
