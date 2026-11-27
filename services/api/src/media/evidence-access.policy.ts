import {ForbiddenException} from '@nestjs/common';
import {Role} from '@kashyap/contracts';

type Queryable = {query: (...args: any[]) => Promise<any>};
type Viewer = {id: string; roles: string[]; roleAssignments?: {role: string; branchId?: string | null}[]};
export type EvidenceContext = {
  kind: 'CLAIM' | 'CHANGE'; target_person_id: string | null;
  requester_user_id: string; branch_id: string | null; dispute_id?: string | null;
};

function hasReviewAuthority(context: EvidenceContext, viewer: Viewer): boolean {
  if (context.requester_user_id === viewer.id) return false;
  if (viewer.roles?.includes(Role.SUPER_ADMIN)) return true;
  if (context.dispute_id || !context.branch_id) return false;
  return (viewer.roleAssignments || []).some(assignment =>
    (assignment.role === Role.BRANCH_ADMIN || assignment.role === Role.BRANCH_VERIFIER) &&
    viewer.roles?.includes(assignment.role) && assignment.branchId === context.branch_id);
}

async function actorPerson(db: Queryable, viewer: Viewer): Promise<string | null> {
  return (await db.query('SELECT person_id FROM user_accounts WHERE id=$1', [viewer.id])).rows[0]?.person_id || null;
}

async function independent(db: Queryable, context: EvidenceContext, person: string | null): Promise<boolean> {
  if (!person || !context.target_person_id) return true;
  if (person === context.target_person_id) return false;
  // Match the existing workflow recusal rules: claims also exclude siblings.
  const related = await db.query(`SELECT 1 FROM parent_links
    WHERE (parent_id=$1 AND child_id=$2) OR (parent_id=$2 AND child_id=$1)
    UNION SELECT 1 FROM spouse_links
    WHERE (person_id=$1 AND spouse_id=$2) OR (person_id=$2 AND spouse_id=$1)
    ${context.kind === 'CLAIM' ? `UNION SELECT 1 FROM parent_links p1 JOIN parent_links p2 ON p1.parent_id=p2.parent_id
      WHERE p1.child_id=$1 AND p2.child_id=$2` : ''}`, [person, context.target_person_id]);
  return related.rows.length === 0;
}

export async function canReviewEvidenceContext(db: Queryable, context: EvidenceContext, viewer: Viewer): Promise<boolean> {
  return hasReviewAuthority(context, viewer) && await independent(db, context, await actorPerson(db, viewer));
}

/** Additional purpose gate for every private-profile download/derivative route.
 * Unattached avatar policy remains with the caller; signatures never grant roles.
 */
export async function attachedEvidenceAccess(db: Queryable, asset: {id: string; uploader_user_id: string; file_name?: string}, viewer: Viewer):
  Promise<{attached: boolean; claim: boolean}> {
  // Uploaders retain their own bytes, including private dispute evidence.
  if (asset.uploader_user_id === viewer.id) return {attached: false, claim: true};
  const contexts: EvidenceContext[] = (await db.query(`
    SELECT 'CLAIM'::text AS kind, pc.target_person_id, pc.claimant_user_id AS requester_user_id,
           p.branch_id, cea.dispute_id
    FROM claim_evidence_attachments cea JOIN profile_claims pc ON pc.id=cea.claim_id
    JOIN persons p ON p.id=pc.target_person_id WHERE cea.media_asset_id=$1
    UNION ALL
    SELECT 'CHANGE'::text AS kind, r.target_person_id, r.requester_user_id,
           p.branch_id, NULL::uuid AS dispute_id
    FROM change_request_evidence_attachments e JOIN genealogy_change_requests r ON r.id=e.change_request_id
    LEFT JOIN persons p ON p.id=r.target_person_id WHERE e.media_asset_id=$1`, [asset.id])).rows;
  if (!contexts.length) {
    // storeProfileImage assigns this prefix, never the caller. Fresh evidence
    // has no independent review context yet. The marker only denies access;
    // filenames never grant authority or replace attachment checks.
    if (asset.file_name?.startsWith('evidence_')) throw new ForbiddenException('Evidence has no authorized review context');
    return {attached: false, claim: false};
  }
  let person: Promise<string | null> | undefined;
  let permitted = false, claim = false;
  for (const context of contexts) {
    if (!['CLAIM', 'CHANGE'].includes(context.kind) || !hasReviewAuthority(context, viewer)) continue;
    person ??= actorPerson(db, viewer);
    if (!await independent(db, context, await person)) continue;
    permitted = true;
    if (context.kind === 'CLAIM') claim = true;
  }
  if (!permitted) throw new ForbiddenException('Private evidence is unavailable to this viewer');
  return {attached: true, claim};
}
