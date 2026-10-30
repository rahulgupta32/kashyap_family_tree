import { Injectable, BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { createHash } from 'crypto';
import { DatabaseService } from '../../database/database.service';
import { GenealogyService } from '../genealogy/genealogy.service';
import { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { allowedFields, textField, uuid } from '../community/community-policy';
import { ClaimsService } from './claims.service';
import { FileClaimDisputeDto, SubmitMemberDisputeDto, MemberDisputeSummaryDto, MemberDisputePageDto, Role } from '@kashyap/contracts';

@Injectable()
export class MemberDisputesService {
  constructor(private readonly db: DatabaseService, private readonly claims: ClaimsService,
    private readonly genealogy: GenealogyService) {}

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
  async submit(personId: string, actor: AuthenticatedUser, body: SubmitMemberDisputeDto): Promise<MemberDisputeSummaryDto> {
    uuid(personId, 'person ID'); allowedFields(body, ['submissionKey','reason','evidenceAttachments']);
    const key = uuid(body.submissionKey, 'submission key');
    const reason = textField(body.reason, 'Dispute reason', 4000);
    const dto: FileClaimDisputeDto = { reason, ...(body.evidenceAttachments === undefined ? {} : { evidenceAttachments: body.evidenceAttachments }) };
    // Canonical JSON includes every supplied field; do not silently drop malformed evidence metadata.
    const canonical = (value: any): any => Array.isArray(value) ? value.map(canonical)
      : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(k => [k,canonical(value[k])])) : value;
    const hash = createHash('sha256').update(JSON.stringify(canonical({ personId, ...dto }))).digest('hex');
    return this.db.transaction(async client => {
      // Same-account/key requests serialize before looking at current claim state; hash collisions only serialize.
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`member-dispute:${actor.id}:${key}`]);
      const receipt = (await client.query('SELECT * FROM member_dispute_receipts WHERE account_id=$1 AND submission_key=$2', [actor.id,key])).rows[0];
      if (receipt) {
        if (receipt.payload_hash !== hash || receipt.target_person_id !== personId) throw new ConflictException('Submission key already binds a different dispute');
        const saved = (await client.query(`SELECT d.*,c.target_person_id FROM claim_disputes d JOIN profile_claims c ON c.id=d.claim_id
          WHERE d.id=$1 AND d.disputant_user_id=$2`, [receipt.dispute_id,actor.id])).rows[0];
        if (!saved) throw new ConflictException('Retained dispute outcome unavailable');
        return this.summary(saved); // Own historical outcome remains available after privacy/claim changes.
      }
      const visible = await this.genealogy.getPersonById(personId,this.viewer(actor));
      if (visible.id !== personId) throw new ConflictException('Reload the current Person before disputing');
      const current = (await client.query(`SELECT c.id FROM profile_claims c JOIN persons p ON p.id=c.target_person_id
        JOIN user_accounts u ON u.id=c.claimant_user_id AND u.person_id=p.id
        WHERE p.id=$1 AND p.is_claimed=TRUE AND p.claimed_user_id=c.claimant_user_id AND c.status='APPROVED'
        ORDER BY c.updated_at DESC,c.id DESC LIMIT 1`, [personId])).rows[0];
      if (!current) throw new BadRequestException('No eligible approved claim for this Person');
      const result = await this.claims.fileDispute(current.id,actor.id,dto,{ client, authorize: async (claim,tx) => {
        // Consistent lock order: claim, then target Person. Recheck visibility before any dispute write.
        const person = (await tx.query('SELECT id,claimed_user_id,is_claimed FROM persons WHERE id=$1 FOR SHARE',[personId])).rows[0];
        if (!person?.is_claimed || person.claimed_user_id !== claim.claimant_user_id) throw new ConflictException('Reload current claim state');
        const latest = await this.genealogy.getPersonById(personId,this.viewer(actor));
        if (latest.id !== personId) throw new ForbiddenException('Person unavailable for dispute');
      }});
      await client.query(`INSERT INTO member_dispute_receipts(account_id,submission_key,target_person_id,payload_hash,dispute_id)
        VALUES($1,$2,$3,$4,$5)`,[actor.id,key,personId,hash,result.id]);
      return { id: result.id, targetPersonId: personId, reason: result.reason, status: result.status,
        resolutionNotes: result.resolutionNotes, createdAt: result.createdAt, updatedAt: result.updatedAt };
    });
  }
}
