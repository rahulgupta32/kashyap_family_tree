import { Injectable, BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { AuditOutboxRepository } from '../../database/repositories/audit-outbox.repository';
import { PoolClient } from 'pg';
import { createHash } from 'crypto';
import { DatabaseService } from '../../database/database.service';
import { GenealogyService } from '../genealogy/genealogy.service';
import { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { allowedFields, textField, uuid } from '../community/community-policy';
import { ClaimsService } from './claims.service';
import { FileClaimDisputeDto, SubmitMemberDisputeDto, MemberDisputeSummaryDto, MemberDisputePageDto, MemberDisputeResolutionDto, ClaimDisputeDetailDto, Role } from '@kashyap/contracts';

@Injectable()
export class MemberDisputesService {
  constructor(private readonly db: DatabaseService, private readonly claims: ClaimsService,
    private readonly genealogy: GenealogyService, private readonly audit: AuditOutboxRepository) {}

  private viewer(actor: AuthenticatedUser) {
    return { userId: actor.id, personId: actor.personId, roles: actor.roles,
      roleAssignments: actor.roleAssignments, branchId: actor.branchIds?.[0], branchIds: actor.branchIds,
      isVerifiedMember: actor.roles.some(role => [Role.VERIFIED_MEMBER,Role.SUPER_ADMIN,Role.BRANCH_ADMIN].includes(role)) };
  }
  private summary(row: any): MemberDisputeSummaryDto {
    return { id: row.id, targetPersonId: row.target_person_id, reason: row.reason, status: row.status,
      resolutionNotes: row.resolution_notes || undefined, createdAt: row.created_at, updatedAt: row.updated_at };
  }
  async list(actor: AuthenticatedUser, cursor?: unknown): Promise<MemberDisputePageDto> {
    if (cursor !== undefined) {
      uuid(cursor, 'dispute cursor');
      if (!(await this.db.query('SELECT 1 FROM claim_disputes WHERE id=$1 AND disputant_user_id=$2', [cursor, actor.id])).rows.length) {
        throw new BadRequestException('Invalid dispute history cursor');
      }
    }
    const rows = (await this.db.query(`SELECT d.*,c.target_person_id FROM claim_disputes d
      JOIN profile_claims c ON c.id=d.claim_id WHERE d.disputant_user_id=$1
      AND ($2::uuid IS NULL OR (d.created_at,d.id)<(SELECT created_at,id FROM claim_disputes WHERE id=$2 AND disputant_user_id=$1))
      ORDER BY d.created_at DESC,d.id DESC LIMIT 101`, [actor.id, cursor ?? null])).rows;
    const page = rows.slice(0,100);
    return { items: page.map(row => this.summary(row)), nextCursor: rows.length > 100 ? page[99].id : null };
  }
  private input(personId:string,body:SubmitMemberDisputeDto) {
    personId = uuid(personId, 'person ID').toLowerCase(); allowedFields(body, ['submissionKey','reason','evidenceAttachments']);
    const key = uuid(body.submissionKey, 'submission key').toLowerCase();
    const reason = textField(body.reason, 'Dispute reason', 4000);
    const dto: FileClaimDisputeDto = { reason, ...(body.evidenceAttachments === undefined ? {} : { evidenceAttachments: body.evidenceAttachments }) };
    // Canonical JSON includes every supplied field; do not silently drop malformed evidence metadata.
    const canonical = (value: any): any => Array.isArray(value) ? value.map(canonical)
      : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(k => [k,canonical(value[k])])) : value;
    const hash = createHash('sha256').update(JSON.stringify(canonical({ personId, ...dto }))).digest('hex');
    return {personId,key,dto,hash};
  }

  private async recorded(client:PoolClient,accountId:string,key:string,personId:string,hash:string) {
    const receipt=(await client.query('SELECT * FROM member_dispute_receipts WHERE account_id=$1 AND submission_key=$2',[accountId,key])).rows[0];
    if(!receipt)return null;
    if(receipt.payload_hash!==hash||receipt.target_person_id!==personId)throw new ConflictException('Submission key already binds a different dispute');
    const saved=(await client.query(`SELECT d.*,c.target_person_id FROM claim_disputes d JOIN profile_claims c ON c.id=d.claim_id
      WHERE d.id=$1 AND d.disputant_user_id=$2`,[receipt.dispute_id,accountId])).rows[0];
    if(!saved)throw new ConflictException('Retained dispute outcome unavailable');
    return this.summary(saved);
  }
  private async authorizeCurrentPerson(personId:string,claimantId:string,actor:AuthenticatedUser,client:PoolClient) {
    // The raw claim mutation already holds the claim lock. Both HTTP entry paths
    // then hold the target Person lock while rechecking identity and visibility.
    const person=(await client.query(`SELECT p.id,p.claimed_user_id,p.is_claimed,u.person_id AS claimant_person_id
      FROM persons p JOIN user_accounts u ON u.id=$2 WHERE p.id=$1 FOR SHARE OF p`,[personId,claimantId])).rows[0];
    if(!person?.is_claimed||person.claimed_user_id!==claimantId||person.claimant_person_id!==personId){
      throw new ConflictException('Reload current claim state');
    }
    const latest=await this.genealogy.getPersonById(personId,this.viewer(actor));
    if(latest.id!==personId)throw new ForbiddenException('Person unavailable for dispute');
  }

  // Compatibility entry point for clients with a previously known claim UUID.
  // Knowing that UUID never confers permission to mutate a private Person.
  async submitForClaim(claimId:string,actor:AuthenticatedUser,body:FileClaimDisputeDto):Promise<ClaimDisputeDetailDto> {
    claimId=uuid(claimId,'claim ID').toLowerCase();allowedFields(body,['reason','evidenceAttachments']);
    const reason=textField(body.reason,'Dispute reason',4000);
    return this.db.transaction(async client=>{
      const claim=(await client.query('SELECT target_person_id FROM profile_claims WHERE id=$1',[claimId])).rows[0];
      if(!claim)throw new NotFoundException('Claim record not found');
      const personId=claim.target_person_id;
      const visible=await this.genealogy.getPersonById(personId,this.viewer(actor));
      if(visible.id!==personId)throw new ConflictException('Reload the current Person before disputing');
      return this.claims.fileDispute(claimId,actor.id,{...body,reason},{client,authorize:async(locked,tx)=>{
        if(locked.target_person_id!==personId)throw new ConflictException('Reload current claim state');
        await this.authorizeCurrentPerson(personId,locked.claimant_user_id,actor,tx);
      }});
    });
  }
  async resolve(personId:string,actor:AuthenticatedUser,body:SubmitMemberDisputeDto): Promise<MemberDisputeResolutionDto> {
    const prepared=this.input(personId,body);personId=prepared.personId;const {key,hash}=prepared;
    return this.db.transaction(async client=>{
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`member-dispute:${actor.id}:${key}`]);
      const existing=await this.recorded(client,actor.id,key,personId,hash);
      if(existing)return {outcome:'CREATED' as const,dispute:existing};
      const closed=(await client.query('SELECT * FROM member_dispute_closures WHERE account_id=$1 AND submission_key=$2',[actor.id,key])).rows[0];
      if(closed){
        if(closed.payload_hash!==hash||closed.target_person_id!==personId)throw new ConflictException('Submission key already binds a different dispute');
        return {outcome:'ABANDONED' as const};
      }
      // No target lookup: an invalid/deleted/merged target must still allow owned no-create closure.
      await client.query('INSERT INTO member_dispute_closures(account_id,submission_key,target_person_id,payload_hash) VALUES($1,$2,$3,$4)',[actor.id,key,personId,hash]);
      await this.audit.recordAuditIntent({action:'MEMBER_DISPUTE_SUBMISSION_ABANDONED',entityType:'CLAIM_DISPUTE_SUBMISSION',entityId:key,
        actorId:actor.id,actorRole:actor.roles[0]||Role.REGISTERED_USER,newValue:{outcome:'ABANDONED'}},client);
      return {outcome:'ABANDONED' as const};
    });
  }
  async submit(personId: string, actor: AuthenticatedUser, body: SubmitMemberDisputeDto): Promise<MemberDisputeSummaryDto> {
    const prepared=this.input(personId,body);personId=prepared.personId;
    const {key,dto,hash}=prepared;
    return this.db.transaction(async client => {
      // Same-account/key requests serialize before looking at current claim state; hash collisions only serialize.
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`member-dispute:${actor.id}:${key}`]);
      const existing=await this.recorded(client,actor.id,key,personId,hash);
      if(existing)return existing;
      if((await client.query('SELECT 1 FROM member_dispute_closures WHERE account_id=$1 AND submission_key=$2',[actor.id,key])).rows.length){
        throw new ConflictException({errorCode:'MEMBER_DISPUTE_SUBMISSION_ABANDONED',message:'Original dispute submission was permanently closed'});
      }
      const visible = await this.genealogy.getPersonById(personId,this.viewer(actor));
      if (visible.id !== personId) throw new ConflictException('Reload the current Person before disputing');
      const current = (await client.query(`SELECT c.id FROM profile_claims c JOIN persons p ON p.id=c.target_person_id
        JOIN user_accounts u ON u.id=c.claimant_user_id AND u.person_id=p.id
        WHERE p.id=$1 AND p.is_claimed=TRUE AND p.claimed_user_id=c.claimant_user_id AND c.status='APPROVED'
        ORDER BY c.updated_at DESC,c.id DESC LIMIT 1`, [personId])).rows[0];
      if (!current) throw new BadRequestException('No eligible approved claim for this Person');
      const result = await this.claims.fileDispute(current.id,actor.id,dto,{ client, authorize: async (claim,tx) => {
        if(claim.target_person_id!==personId)throw new ConflictException('Reload current claim state');
        await this.authorizeCurrentPerson(personId,claim.claimant_user_id,actor,tx);
      }});
      await client.query(`INSERT INTO member_dispute_receipts(account_id,submission_key,target_person_id,payload_hash,dispute_id)
        VALUES($1,$2,$3,$4,$5)`,[actor.id,key,personId,hash,result.id]);
      return { id: result.id, targetPersonId: personId, reason: result.reason, status: result.status,
        resolutionNotes: result.resolutionNotes, createdAt: result.createdAt, updatedAt: result.updatedAt };
    });
  }
}
