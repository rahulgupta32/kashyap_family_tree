import { ConflictException, ServiceUnavailableException } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { GenealogyImportPayload } from '@kashyap/contracts';

function contactKey():Buffer {
 const configured=process.env.IMPORT_CONTACTS_ENCRYPTION_KEY;
 if(!configured||! /^[A-Za-z0-9+/]{43}=$/.test(configured))throw new ServiceUnavailableException('Private contact staging encryption is unavailable');
 const key=Buffer.from(configured,'base64');
 if(key.length!==32||key.toString('base64')!==configured||configured===process.env.MFA_ENCRYPTION_KEY)throw new ServiceUnavailableException('Private contact staging encryption is unavailable');
 return key;
}
function binding(payload:any,hash:string){return Buffer.from(JSON.stringify(['genealogy-private-contacts-v1',payload.datasetKey,payload.branchId,hash]));}
/** Entire contact records are sealed; identifiers and values never reach plaintext JSONB. */
export function sealImportContacts(payload:GenealogyImportPayload,hash:string):any {
 if(payload.privateContacts===undefined)return payload;
 const key=contactKey(),iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);
 cipher.setAAD(binding(payload,hash));
 const ciphertext=Buffer.concat([cipher.update(JSON.stringify(payload.privateContacts),'utf8'),cipher.final()]);
 const {privateContacts,...rest}=payload;
 return {...rest,privateContactsSealed:{version:1,ciphertext:Buffer.concat([iv,cipher.getAuthTag(),ciphertext]).toString('base64')}};
}
/** Called only behind current staging authority; unavailable/tampered keys fail closed. */
export function openImportContacts(stored:any,hash:string):GenealogyImportPayload {
 if(stored.privateContacts!==undefined)throw new ConflictException('Unprotected private contact staging payload');
 if(stored.privateContactsSealed===undefined)return stored;
 const key=contactKey();
 try {
  const sealed=stored.privateContactsSealed;
  if(!sealed||sealed.version!==1||typeof sealed.ciphertext!=='string'||sealed.ciphertext.length>1398104)throw new Error('Envelope');
  const bytes=Buffer.from(sealed.ciphertext,'base64');
  if(bytes.length<30||bytes.toString('base64')!==sealed.ciphertext)throw new Error('Encoding');
  const decipher=createDecipheriv('aes-256-gcm',key,bytes.subarray(0,12));decipher.setAAD(binding(stored,hash));decipher.setAuthTag(bytes.subarray(12,28));
  const contacts=JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)),decipher.final()]).toString('utf8'));
  if(!Array.isArray(contacts))throw new Error('Shape');
  const {privateContactsSealed,...rest}=stored;return {...rest,privateContacts:contacts};
 }catch {throw new ConflictException('Private contact source integrity check failed');}
}
