import { Injectable, BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { AuditOutboxRepository } from '../../database/repositories/audit-outbox.repository';
import { allowedFields, uuid } from '../community/community-policy';

const current = `d.effective_at<=now() AND (d.expires_at IS NULL OR d.expires_at>now()) AND NOT EXISTS
 (SELECT 1 FROM policy_documents newer WHERE newer.kind=d.kind AND newer.version>d.version AND newer.effective_at<=now())`;
@Injectable()
export class PolicyAcknowledgementService {
 constructor(private readonly db:DatabaseService,private readonly audit:AuditOutboxRepository){}
 private async account(id:string,tx:any){
  if(!(await tx.query('SELECT id FROM user_accounts WHERE id=$1 AND is_active=TRUE AND is_suspended=FALSE AND deleted_at IS NULL FOR SHARE',[id])).rows.length)
   throw new ForbiddenException('Active account required');
 }
 async list(id:string){
  return this.db.transaction(async tx=>{
   await this.account(id,tx);
   const documents=(await tx.query(`SELECT d.id,d.kind,d.version,d.title_ne AS "titleNe",d.title_en AS "titleEn",
    d.body_ne AS "bodyNe",d.body_en AS "bodyEn",d.content_hash AS "contentHash",d.effective_at AS "effectiveAt",a.accepted_at AS "acceptedAt"
    FROM policy_documents d LEFT JOIN policy_acknowledgements a ON a.document_id=d.id AND a.account_id=$1 WHERE ${current} ORDER BY d.kind`,[id])).rows;
   const history=(await tx.query(`SELECT a.document_id AS "documentId",d.kind,d.version,a.content_hash AS "contentHash",a.accepted_at AS "acceptedAt"
    FROM policy_acknowledgements a JOIN policy_documents d ON d.id=a.document_id WHERE a.account_id=$1 ORDER BY a.accepted_at DESC,a.document_id LIMIT 20`,[id])).rows;
   return {available:documents.length>0,documents,history};
  });
 }
 async accept(id:string,body:any){
  allowedFields(body,['documentId','contentHash','accepted']);uuid(body.documentId,'document');
  if(body.accepted!==true||typeof body.contentHash!=='string'||!/^[a-f0-9]{64}$/.test(body.contentHash))throw new BadRequestException('Explicit acknowledgement and content hash required');
  return this.db.transaction(async tx=>{
   await this.account(id,tx);
   // Publication INSERTs cannot race the current-version check and receipt commit.
   await tx.query('LOCK TABLE policy_documents IN SHARE MODE');
   const d=(await tx.query(`SELECT d.id,d.content_hash,(${current}) AS current FROM policy_documents d WHERE d.id=$1`,[body.documentId])).rows[0];
   if(!d||d.content_hash!==body.contentHash)throw new ConflictException('Policy changed; reload before acknowledging');
   const prior=(await tx.query('SELECT accepted_at FROM policy_acknowledgements WHERE account_id=$1 AND document_id=$2',[id,d.id])).rows[0];
   if(prior)return {documentId:d.id,acceptedAt:prior.accepted_at,current:d.current};
   if(!d.current)throw new ConflictException('Policy changed; reload before acknowledging');
   const inserted=(await tx.query(`INSERT INTO policy_acknowledgements(account_id,document_id,content_hash) VALUES($1,$2,$3)
    ON CONFLICT DO NOTHING RETURNING accepted_at`,[id,d.id,body.contentHash])).rows[0];
   if(inserted){
    await this.audit.recordAuditIntent({action:'POLICY_ACKNOWLEDGED',entityType:'POLICY_DOCUMENT',entityId:d.id,actorId:id,
     newValue:{contentHash:body.contentHash}},tx);
    return {documentId:d.id,acceptedAt:inserted.accepted_at,current:true};
   }
   const receipt=(await tx.query('SELECT accepted_at FROM policy_acknowledgements WHERE account_id=$1 AND document_id=$2',[id,d.id])).rows[0];
   return {documentId:d.id,acceptedAt:receipt.accepted_at,current:true};
  });
 }
}
