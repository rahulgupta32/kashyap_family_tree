import { BadRequestException } from '@nestjs/common';
import { allowedFields, textField } from './community-policy';
export function communitySharing(body:any){
 allowedFields(body,['version','reason','locality','localityVisibility','contactVisibility','contactConsent']);
 if(!Number.isSafeInteger(body.version)||body.version<1)throw new BadRequestException('Invalid version');
 const reason=textField(body.reason,'Sharing change reason',1000,5);
 if(!['PRIVATE','VERIFIED_COMMUNITY'].includes(body.localityVisibility)||!['PRIVATE','VERIFIED_COMMUNITY'].includes(body.contactVisibility))throw new BadRequestException('Invalid sharing visibility');
 if(typeof body.contactConsent!=='boolean'||body.contactConsent!==(body.contactVisibility==='VERIFIED_COMMUNITY'))throw new BadRequestException('Explicit contact sharing consent required');
 let locality:null|{district:string;municipality:string}=null;
 if(body.locality!==null){
  allowedFields(body.locality,['district','municipality']);
  const district=textField(body.locality.district,'District',80),municipality=textField(body.locality.municipality,'Municipality',80);
  if(![district,municipality].every(value=>/^[\p{L}\p{M}\s.'’-]+$/u.test(value)))throw new BadRequestException('Use district and municipality names only; no coordinates, house numbers or contact details');
  locality={district,municipality};
 }
 if(body.localityVisibility==='VERIFIED_COMMUNITY'&&!locality)throw new BadRequestException('Choose a locality before sharing it');
 return {reason,locality};
}
