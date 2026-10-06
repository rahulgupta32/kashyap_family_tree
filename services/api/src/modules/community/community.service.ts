import { communitySharing } from './community-privacy';
import { PrivacyEngineService } from '../genealogy/privacy/privacy-engine.service';
import { Injectable, NotFoundException, BadRequestException, ForbiddenException, ConflictException } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { AuditOutboxRepository } from '../../database/repositories/audit-outbox.repository';
import { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { allowedFields, branchAccess, canModerate, globalAdmin, member, textField, uuid } from './community-policy';

@Injectable()
export class CommunityService {
  private readonly privacy=new PrivacyEngineService();
  constructor(private readonly db: DatabaseService, private readonly audit: AuditOutboxRepository) {}

  async visiblePost(id: string, user: AuthenticatedUser, client?: any) {
    member(user);
    const result = await this.db.query('SELECT * FROM community_posts WHERE id = $1 AND deleted_at IS NULL' + (client ? ' FOR UPDATE' : ''), [uuid(id)], client);
    const row = result.rows[0];
    if (!row) throw new NotFoundException('Post not found');
    branchAccess(user, row.branch_id);
    if (row.status !== 'PUBLISHED' && row.author_user_id !== user.id && !canModerate(user, row.branch_id)) {
      throw new NotFoundException('Post not found');
    }
    return row;
  }

  async listPosts(user: AuthenticatedUser, options: { branchId?: string; queue?: boolean; page?: number } = {}) {
    member(user);
    if (options.branchId) branchAccess(user, uuid(options.branchId, 'branch'));
    const page = options.page ?? 1;
    if (!Number.isSafeInteger(page) || page < 1 || page > 10000) throw new BadRequestException('Invalid page');
    const branches = user.branchIds;
    const modBranches = user.roleAssignments.filter(a => canModerate({ ...user, roles: [a.role], roleAssignments: [a] }, a.branchId)).map(a => a.branchId).filter(Boolean);
    const moderatorAll = canModerate(user, undefined);
    if (options.queue && !moderatorAll && !modBranches.length) throw new ForbiddenException('Moderator authority required');
    const result = await this.db.query(
      `SELECT p.*, u.phone_number AS author_phone,u.privacy_settings AS author_privacy,
         u.is_active AS author_active,u.is_suspended AS author_suspended,u.deleted_at AS author_deleted,
         person.id AS author_person_id,person.is_minor_protected,person.birth_year_bs,person.birth_date_bs,person.living_status,person.is_archived,person.phone_visibility,person.address_visibility,person.claimed_user_id,person.is_claimed,
         (SELECT json_build_object('decision',d.decision,'notes',d.notes,'version',d.version,
           'appealed',EXISTS(SELECT 1 FROM community_post_appeals a WHERE a.decision_id=d.id))
           FROM community_moderation_decisions d WHERE d.post_id=p.id ORDER BY d.version DESC LIMIT 1) AS outcome,
         (SELECT a.reason FROM community_post_appeals a WHERE a.post_id=p.id AND a.status='OPEN') AS appeal_reason,
         (SELECT json_build_object('assetId',a.id,'mimeType',a.mime_type,'fileName',a.file_name)
          FROM community_post_media m JOIN media_assets a ON a.id=m.asset_id
          WHERE m.post_id=p.id AND m.removed_at IS NULL AND a.quarantine_status='CLEAN' AND a.retention_status IN ('ACTIVE','LEGAL_HOLD')) AS media,
         (SELECT count(*)::int FROM community_reactions r WHERE r.post_id = p.id) AS reaction_count,
         EXISTS(SELECT 1 FROM community_reactions r WHERE r.post_id = p.id AND r.user_id = $1) AS is_liked,
         (SELECT count(*)::int FROM community_comments c WHERE c.post_id = p.id AND c.deleted_at IS NULL) AS comment_count,
         EXISTS(SELECT 1 FROM community_escalations e WHERE e.post_id=p.id AND e.status='OPEN') AS escalated,
         (SELECT count(*)::int FROM community_reports r WHERE r.post_id = p.id AND r.status = 'OPEN') AS report_count
       FROM community_posts p LEFT JOIN user_accounts u ON u.id=p.author_user_id LEFT JOIN persons person ON person.id=u.person_id WHERE p.deleted_at IS NULL
         AND ($2 OR p.branch_id IS NULL OR p.branch_id = ANY($3::uuid[]))
         AND ($4::uuid IS NULL OR p.branch_id = $4)
         AND (CASE WHEN $5 THEN p.status = 'PENDING' AND ($6 OR p.branch_id = ANY($7::uuid[]))
              ELSE p.status = 'PUBLISHED' OR p.author_user_id = $1 OR ($6 OR p.branch_id = ANY($7::uuid[])) END)
       ORDER BY p.created_at DESC, p.id DESC LIMIT 50 OFFSET $8`,
      [user.id, globalAdmin(user) || moderatorAll, branches, options.branchId || null, !!options.queue, moderatorAll, modBranches, (page - 1) * 50]);
    return result.rows.map(row => this.dto(row, user));
  }

  private dto(row: any, user: AuthenticatedUser) {
    const privileged=row.author_user_id===user.id||canModerate(user,row.branch_id);
    const adultAuthor=row.author_active&&!row.author_suspended&&!row.author_deleted&&row.author_person_id&&row.living_status==='LIVING'&&!row.is_archived&&row.is_claimed&&row.claimed_user_id===row.author_user_id
      &&!this.privacy.isMinorOrUncertainAge(row);
    const phoneAllowed=adultAuthor&&row.contact_consent&&row.contact_visibility==='VERIFIED_COMMUNITY'&&row.status==='PUBLISHED'
      &&['PUBLIC','VERIFIED_COMMUNITY'].includes(row.phone_visibility)
      &&['PUBLIC','VERIFIED_COMMUNITY'].includes(row.author_privacy?.contactVisibility);
    const localityAllowed=adultAuthor&&row.locality_visibility==='VERIFIED_COMMUNITY'&&row.status==='PUBLISHED'
      &&['PUBLIC','VERIFIED_COMMUNITY'].includes(row.address_visibility)
      &&['PUBLIC','VERIFIED_COMMUNITY'].includes(row.author_privacy?.addressVisibility);
    return { locality:privileged||localityAllowed?row.locality:undefined,
      contactPhone:phoneAllowed?row.author_phone:undefined,
      sharing:privileged?{localityVisibility:row.locality_visibility,contactVisibility:row.contact_visibility,contactConsent:row.contact_consent}:undefined,
      id: row.id, title: row.title, content: row.content, category: row.category, branchId: row.branch_id,
      authorUserId: row.author_user_id, authorName: 'Community member', moderationStatus: row.status,
      media:row.media, version: row.version, createdAt: row.created_at, updatedAt: row.updated_at,
      likesCount: row.reaction_count || 0, isLiked: !!row.is_liked, commentsCount: row.comment_count || 0,
      reportsCount: canModerate(user, row.branch_id) ? row.report_count || 0 : undefined,
      canViewReports: canModerate(user,row.branch_id) && row.author_user_id!==user.id,
      escalated: privileged ? !!row.escalated : undefined,
      canEscalate: canModerate(user,row.branch_id) && row.author_user_id!==user.id && row.status==='PENDING' && !row.escalated,
      canModerate: canModerate(user, row.branch_id) && row.author_user_id !== user.id && (!row.escalated || globalAdmin(user)),
      moderationOutcome: row.author_user_id === user.id || canModerate(user,row.branch_id) ? row.outcome : undefined,
      appealReason: row.author_user_id === user.id || canModerate(user,row.branch_id) ? row.appeal_reason : undefined,
      canAppeal: row.author_user_id === user.id && row.status === 'REJECTED' && !!row.outcome && !row.outcome.appealed,
      canEdit: row.author_user_id === user.id,
      canViewRevisions: row.author_user_id === user.id || canModerate(user, row.branch_id),
      canDelete: row.author_user_id === user.id || canModerate(user, row.branch_id) };
  }

  async createPost(user: AuthenticatedUser, body: any) {
    allowedFields(body, ['title', 'content', 'category', 'branchId']);
    const branchId = body.branchId ? uuid(body.branchId, 'branch') : null;
    branchAccess(user, branchId);
    const title = textField(body.title, 'Title', 180);
    const content = textField(body.content, 'Content', 10000);
    if (!['ANNOUNCEMENT', 'DISCUSSION', 'RITUAL', 'ACHIEVEMENT', 'MISSING_PERSON', 'PROPERTY_ROOM', 'ASSISTANCE', 'COMMUNITY_PROGRAM'].includes(body.category)) throw new BadRequestException('Invalid category');
    if (body.category === 'ANNOUNCEMENT' && !canModerate(user, branchId)) throw new ForbiddenException('Announcements require moderator authority');
    return this.db.transaction(async client => {
      const row = (await client.query(`INSERT INTO community_posts (author_user_id, branch_id, title, content, category, status)
        VALUES ($1,$2,$3,$4,$5,'PENDING') RETURNING *`, [user.id, branchId, title, content, body.category])).rows[0];
      await this.saveRevision(row, user.id, 'Initial submission', client);
      await this.audit.recordAuditIntent({ action: 'COMMUNITY_POST_SUBMITTED', entityType: 'community_post', entityId: row.id, actorId: user.id, newValue: { status: 'PENDING', branchId } }, client);
      return this.dto(row, user);
    });
  }

  async saveRevision(post: any, editorId: string, reason: string, client: any) {
    await client.query(`INSERT INTO community_post_revisions
      (post_id,version,editor_user_id,title,content,category,reason,locality,locality_visibility,contact_visibility,contact_consent) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [post.id,post.version,editorId,post.title,post.content,post.category,reason,post.locality?JSON.stringify(post.locality):null,post.locality_visibility||'PRIVATE',post.contact_visibility||'PRIVATE',post.contact_consent||false]);
    await client.query(`INSERT INTO community_revision_media(post_id,version,asset_id)
      SELECT post_id,$2,asset_id FROM community_post_media WHERE post_id=$1 AND removed_at IS NULL`,[post.id,post.version]);
  }

  async editPost(id: string, user: AuthenticatedUser, body: any) {
    allowedFields(body, ['title','content','category','version','reason']);
    const title = textField(body.title, 'Title', 180);
    const content = textField(body.content, 'Content', 10000);
    const reason = textField(body.reason, 'Edit reason', 1000, 5);
    if (!Number.isSafeInteger(body.version) || body.version < 1) throw new BadRequestException('Invalid version');
    if (!['ANNOUNCEMENT','DISCUSSION','RITUAL','ACHIEVEMENT','MISSING_PERSON','PROPERTY_ROOM','ASSISTANCE','COMMUNITY_PROGRAM'].includes(body.category)) throw new BadRequestException('Invalid category');
    return this.db.transaction(async client => {
      const post = await this.visiblePost(id, user, client);
      if (post.author_user_id !== user.id) throw new ForbiddenException('Only the author may edit this post');
      if (post.version !== body.version) throw new ConflictException('Post changed; reload before editing');
      if (body.category === 'ANNOUNCEMENT' && !canModerate(user, post.branch_id)) throw new ForbiddenException('Announcements require moderator authority');
      if (post.title === title && post.content === content && post.category === body.category) return this.dto(post, user);
      const updated = (await client.query(`UPDATE community_posts SET title=$2,content=$3,category=$4,
        status='PENDING',version=version+1,updated_at=now() WHERE id=$1 RETURNING *`, [id,title,content,body.category])).rows[0];
      await client.query("UPDATE community_post_appeals SET status='WITHDRAWN',resolved_at=now() WHERE post_id=$1 AND status='OPEN'",[id]);
      await this.saveRevision(updated,user.id,reason,client);
      await this.audit.recordAuditIntent({action:'COMMUNITY_POST_EDITED',entityType:'community_post',entityId:id,actorId:user.id,
        oldValue:{version:post.version,status:post.status},newValue:{version:updated.version,status:'PENDING',reason}},client);
      return this.dto(updated,user);
    });
  }

  async updateSharing(id:string,user:AuthenticatedUser,body:any){
    const input=communitySharing(body);
    return this.db.transaction(async client=>{
      const post=await this.visiblePost(id,user,client);
      if(post.author_user_id!==user.id)throw new ForbiddenException('Only the author may change sharing');
      if(post.version!==body.version)throw new ConflictException('Post changed; reload before changing sharing');
      if(post.category==='ANNOUNCEMENT'&&!canModerate(user,post.branch_id))throw new ForbiddenException('Announcements require moderator authority');
      if((post.locality?.district??null)===(input.locality?.district??null)&&(post.locality?.municipality??null)===(input.locality?.municipality??null)&&post.locality_visibility===body.localityVisibility&&post.contact_visibility===body.contactVisibility&&post.contact_consent===body.contactConsent)return {version:post.version,unchanged:true};
      const updated=(await client.query(`UPDATE community_posts SET locality=$2,locality_visibility=$3,contact_visibility=$4,contact_consent=$5,
        status='PENDING',version=version+1,updated_at=NOW() WHERE id=$1 RETURNING *`,[id,input.locality?JSON.stringify(input.locality):null,body.localityVisibility,body.contactVisibility,body.contactConsent])).rows[0];
      await client.query("UPDATE community_post_appeals SET status='WITHDRAWN',resolved_at=NOW() WHERE post_id=$1 AND status='OPEN'",[id]);
      await this.saveRevision(updated,user.id,input.reason,client);
      // Audit the consent transition, never copy contact numbers or locality labels to delivery payloads.
      await this.audit.recordAuditIntent({action:'COMMUNITY_SHARING_CHANGED',entityType:'community_post',entityId:id,actorId:user.id,
        oldValue:{version:post.version,localityVisibility:post.locality_visibility,contactVisibility:post.contact_visibility},
        newValue:{version:updated.version,localityVisibility:body.localityVisibility,contactVisibility:body.contactVisibility,contactConsent:body.contactConsent}},client);
      return {version:updated.version};
    });
  }

  async revisions(id: string, user: AuthenticatedUser, page = 1) {
    if (!Number.isSafeInteger(page) || page < 1 || page > 10000) throw new BadRequestException('Invalid page');
    // Lock the post during authorization and history read so a concurrent deletion cannot expose history.
    return this.db.transaction(async client => {
      const post = await this.visiblePost(id,user,client);
      if (post.author_user_id !== user.id && !canModerate(user,post.branch_id)) throw new ForbiddenException('Revision history requires author or moderator authority');
      return (await client.query(`SELECT r.version,r.title,r.content,r.category,r.reason,r.locality,r.locality_visibility AS "localityVisibility",r.contact_visibility AS "contactVisibility",r.contact_consent AS "contactConsent",r.created_at AS "createdAt",
          (SELECT json_agg(json_build_object('assetId',a.id,'mimeType',a.mime_type,'fileName',a.file_name))
           FROM community_revision_media l JOIN media_assets a ON a.id=l.asset_id WHERE l.post_id=r.post_id AND l.version=r.version) AS media
        FROM community_post_revisions r WHERE r.post_id=$1 ORDER BY r.version DESC LIMIT 50 OFFSET $2`,[id,(page-1)*50])).rows;
    });
  }

  async moderationHistory(id: string, user: AuthenticatedUser, beforeVersion?: number) {
    if (beforeVersion !== undefined && (!Number.isSafeInteger(beforeVersion) || beforeVersion < 1 || beforeVersion > 2147483647)) {
      throw new BadRequestException('Invalid history cursor');
    }
    return this.db.transaction(async client => {
      const post = await this.visiblePost(id,user,client);
      if (post.author_user_id !== user.id && !canModerate(user,post.branch_id)) {
        throw new ForbiddenException('Moderation history requires author or moderator authority');
      }
      const rows = (await client.query(`SELECT d.version,d.decision,d.notes,d.created_at AS "createdAt",
        CASE WHEN a.id IS NULL THEN NULL ELSE json_build_object('reason',a.reason,'status',a.status,
          'createdAt',a.created_at,'resolvedAt',a.resolved_at) END AS appeal
        FROM community_moderation_decisions d LEFT JOIN community_post_appeals a ON a.decision_id=d.id
        WHERE d.post_id=$1 AND ($2::integer IS NULL OR d.version<$2)
        ORDER BY d.version DESC LIMIT 51`,[id,beforeVersion ?? null])).rows;
      const items = rows.slice(0,50);
      return { items, nextBeforeVersion: rows.length > 50 ? items[49].version : null };
    });
  }

  async react(id: string, user: AuthenticatedUser, liked: boolean) {
    if (typeof liked !== 'boolean') throw new BadRequestException('liked must be a boolean');
    return this.db.transaction(async client => {
      const post = await this.visiblePost(id, user, client);
      if (post.status !== 'PUBLISHED') throw new ConflictException('Only published posts accept reactions');
      if (liked) await client.query('INSERT INTO community_reactions(post_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING', [id, user.id]);
      else await client.query('DELETE FROM community_reactions WHERE post_id=$1 AND user_id=$2', [id, user.id]);
      const count = (await client.query('SELECT count(*)::int AS count FROM community_reactions WHERE post_id=$1', [id])).rows[0].count;
      return { likesCount: count, isLiked: liked };
    });
  }

  async comments(id: string, user: AuthenticatedUser) {
    await this.visiblePost(id, user);
    return (await this.db.query(`SELECT id, post_id AS "postId", author_user_id AS "authorUserId", parent_comment_id AS "parentCommentId",
      content, created_at AS "createdAt" FROM community_comments WHERE post_id=$1 AND deleted_at IS NULL ORDER BY created_at, id LIMIT 200`, [id])).rows;
  }

  async browseComments(id: string, user: AuthenticatedUser, before?: string) {
    const cursor = before === undefined ? null : uuid(before, 'comment cursor');
    return this.db.transaction(async client => {
      const post = await this.visiblePost(id, user, client);
      if (cursor && !(await client.query('SELECT id FROM community_comments WHERE id=$1 AND post_id=$2', [cursor,id])).rows.length) {
        throw new BadRequestException('Comment cursor does not belong to this post');
      }
      const rows = (await client.query(`SELECT c.id, c.post_id AS "postId", c.author_user_id AS "authorUserId",
        c.parent_comment_id AS "parentCommentId", parent.content AS "parentContent", c.content, c.created_at AS "createdAt"
        FROM community_comments c LEFT JOIN community_comments parent
          ON parent.id=c.parent_comment_id AND parent.post_id=c.post_id AND parent.deleted_at IS NULL
        WHERE c.post_id=$1 AND c.deleted_at IS NULL AND ($2::uuid IS NULL OR
          (c.created_at,c.id) < (SELECT boundary.created_at,boundary.id FROM community_comments boundary WHERE boundary.id=$2 AND boundary.post_id=$1))
        ORDER BY c.created_at DESC,c.id DESC LIMIT 51`,[id,cursor])).rows;
      return {items:rows.slice(0,50).map(c=>({...c,canRemove:c.authorUserId===user.id||canModerate(user,post.branch_id)})),nextBefore:rows.length>50?rows[49].id:null};
    });
  }

  async addComment(id: string, user: AuthenticatedUser, body: any) {
    allowedFields(body, ['content', 'parentCommentId']);
    const content = textField(body.content, 'Comment', 2000);
    const parent = body.parentCommentId ? uuid(body.parentCommentId) : null;
    return this.db.transaction(async client => {
      const post = await this.visiblePost(id, user, client);
      if (post.status !== 'PUBLISHED') throw new ConflictException('Only published posts accept comments');
      if (parent && !(await client.query('SELECT id FROM community_comments WHERE id=$1 AND post_id=$2 AND deleted_at IS NULL', [parent, id])).rows.length) throw new BadRequestException('Reply must belong to this post');
      const row = (await client.query('INSERT INTO community_comments(post_id,author_user_id,parent_comment_id,content) VALUES($1,$2,$3,$4) RETURNING id', [id, user.id, parent, content])).rows[0];
      await this.audit.recordAuditIntent({ action: 'COMMUNITY_COMMENT_CREATED', entityType: 'community_comment', entityId: row.id, actorId: user.id, newValue: { postId: id } }, client);
      return { ...row, postId: id, authorUserId: user.id, content };
    });
  }

  async removeComment(id:string, commentId:string, user:AuthenticatedUser, body:any) {
    allowedFields(body,['reason']);
    const reason=textField(body.reason,'Removal reason',1000,5);
    uuid(commentId,'comment ID');
    return this.db.transaction(async client=>{
      const post=await this.visiblePost(id,user,client);
      const comment=(await client.query('SELECT * FROM community_comments WHERE id=$1 AND post_id=$2 FOR UPDATE',[commentId,id])).rows[0];
      if(!comment)throw new NotFoundException('Comment not found');
      const own=comment.author_user_id===user.id;
      if(!own&&!canModerate(user,post.branch_id))throw new ForbiddenException('Comment removal requires its author or a current scoped moderator');
      if(comment.deleted_at)return {success:true,unchanged:true};
      await client.query('UPDATE community_comments SET deleted_at=now() WHERE id=$1',[commentId]);
      await this.audit.recordAuditIntent({action:'COMMUNITY_COMMENT_REMOVED',entityType:'community_comment',entityId:commentId,actorId:user.id,newValue:{postId:id,reason,authority:own?'AUTHOR':'MODERATOR'}},client);
      return {success:true,unchanged:false};
    });
  }

  async report(id: string, user: AuthenticatedUser, reason: string) {
    reason = textField(reason, 'Reason', 1000, 5);
    return this.db.transaction(async client => {
      const post=await this.visiblePost(id, user, client);
      const inserted=await client.query(`INSERT INTO community_reports(post_id,reporter_user_id,reason,reported_version) VALUES($1,$2,$3,$4)
        ON CONFLICT(post_id,reporter_user_id) WHERE status='OPEN' DO NOTHING`, [id,user.id,reason,post.version]);
      if(!inserted.rowCount) return {success:true};
      await client.query("UPDATE community_posts SET status='PENDING', version=version+1, updated_at=now() WHERE id=$1", [id]);
      await this.audit.recordAuditIntent({ action: 'COMMUNITY_POST_REPORTED', entityType: 'community_post', entityId: id, actorId: user.id }, client);
      return { success: true };
    });
  }

  async reportEvidence(id:string,user:AuthenticatedUser,before?:string,beforeEscalation?:string) {
    for(const cursor of [before,beforeEscalation]) if(cursor!==undefined&&!/^[1-9][0-9]{0,18}$/.test(cursor)) throw new BadRequestException('Invalid evidence cursor');
    for(const cursor of [before,beforeEscalation]) if(cursor!==undefined&&BigInt(cursor)>9223372036854775807n) throw new BadRequestException('Invalid evidence cursor');
    return this.db.transaction(async client=>{
      const post=await this.visiblePost(id,user,client);
      if(!canModerate(user,post.branch_id)||post.author_user_id===user.id) throw new ForbiddenException('Independent scoped moderator authority required');
      const reports=(await client.query(`SELECT evidence_sequence::text AS sequence,reason,status,reported_version AS "reportedVersion",review_notes AS "reviewNotes",created_at AS "createdAt",resolved_at AS "resolvedAt"
        FROM community_reports WHERE post_id=$1 AND ($2::bigint IS NULL OR evidence_sequence<$2) ORDER BY evidence_sequence DESC LIMIT 51`,[id,before||null])).rows;
      const escalations=(await client.query(`SELECT sequence::text,submitted_version AS "submittedVersion",reason,status,created_at AS "createdAt",resolved_at AS "resolvedAt"
        FROM community_escalations WHERE post_id=$1 AND ($2::bigint IS NULL OR sequence<$2) ORDER BY community_escalations.sequence DESC LIMIT 51`,[id,beforeEscalation||null])).rows;
      const page=(rows:any[])=>({items:rows.slice(0,50),nextBefore:rows.length>50?rows[49].sequence:null});
      return {version:post.version,reports:page(reports),escalations:page(escalations)};
    });
  }

  async escalate(id:string,user:AuthenticatedUser,body:any) {
    allowedFields(body,['version','reason']);
    const reason=textField(body.reason,'Escalation reason',1000,5);
    if(!Number.isSafeInteger(body.version)||body.version<1) throw new BadRequestException('Invalid version');
    return this.db.transaction(async client=>{
      const post=await this.visiblePost(id,user,client);
      if(!canModerate(user,post.branch_id)||post.author_user_id===user.id) throw new ForbiddenException('Independent scoped moderator authority required');
      if(post.version!==body.version||post.status!=='PENDING') throw new ConflictException('Reload the pending post before escalating');
      if((await client.query("SELECT sequence FROM community_escalations WHERE post_id=$1 AND status='OPEN'",[id])).rows.length) throw new ConflictException('Case already escalated');
      await client.query('INSERT INTO community_escalations(post_id,submitted_by,submitted_version,reason) VALUES($1,$2,$3,$4)',[id,user.id,post.version,reason]);
      await client.query('UPDATE community_posts SET version=version+1,updated_at=now() WHERE id=$1',[id]);
      await this.audit.recordAuditIntent({action:'COMMUNITY_POST_ESCALATED',entityType:'community_post',entityId:id,actorId:user.id,newValue:{version:post.version+1}},client);
      return {success:true};
    });
  }

  async moderate(id: string, user: AuthenticatedUser, body: any) {
    allowedFields(body, ['decision','notes','version']);
    if (!['PUBLISHED','REJECTED'].includes(body.decision)) throw new BadRequestException('Invalid decision');
    const notes = textField(body.notes, 'Review notes', 1000, 5);
    return this.db.transaction(async client => {
      const post = await this.visiblePost(id, user, client);
      if (!canModerate(user, post.branch_id) || post.author_user_id === user.id) throw new ForbiddenException('An independent authorized moderator is required');
      if (post.version !== body.version) throw new ConflictException('Post changed; reload before reviewing');
      const escalated=(await client.query("SELECT sequence FROM community_escalations WHERE post_id=$1 AND status='OPEN'",[id])).rows.length>0;
      if(escalated&&!globalAdmin(user)) throw new ForbiddenException('An escalated case requires independent central review');
      const appeal=(await client.query(`SELECT a.id,d.reviewer_user_id FROM community_post_appeals a
        JOIN community_moderation_decisions d ON d.id=a.decision_id WHERE a.post_id=$1 AND a.status='OPEN'`,[id])).rows[0];
      if (appeal?.reviewer_user_id === user.id) throw new ForbiddenException('An appeal requires a different independent moderator');
      await client.query(`INSERT INTO community_moderation_decisions(post_id,version,reviewer_user_id,decision,notes)
        VALUES($1,$2,$3,$4,$5)`,[id,post.version+1,user.id,body.decision,notes]);
      await client.query("UPDATE community_post_appeals SET status='RESOLVED',resolved_at=now() WHERE post_id=$1 AND status='OPEN'",[id]);
      await client.query('UPDATE community_posts SET status=$2, version=version+1, updated_at=now() WHERE id=$1', [id,body.decision]);
      await client.query("UPDATE community_escalations SET status='RESOLVED',resolved_by=$2,resolved_at=now() WHERE post_id=$1 AND status='OPEN'",[id,user.id]);
      await client.query("UPDATE community_reports SET status='RESOLVED', reviewed_by=$2,review_notes=$3,resolved_at=now() WHERE post_id=$1 AND status='OPEN'", [id,user.id,notes]);
      await this.audit.recordAuditIntent({ action: 'COMMUNITY_POST_MODERATED', entityType: 'community_post', entityId: id, actorId: user.id,
        oldValue: {status:post.status}, newValue: {status:body.decision,notes,version:post.version+1} }, client);
      return { success: true };
    });
  }

  async appealPost(id: string, user: AuthenticatedUser, body: any) {
    allowedFields(body,['version','reason']);
    const reason=textField(body.reason,'Appeal reason',1000,5);
    if (!Number.isSafeInteger(body.version) || body.version<1) throw new BadRequestException('Invalid version');
    return this.db.transaction(async client=>{
      const post=await this.visiblePost(id,user,client);
      if(post.author_user_id!==user.id) throw new ForbiddenException('Only the author may appeal');
      if(post.version!==body.version || post.status!=='REJECTED') throw new ConflictException('Reload the current rejected post before appealing');
      const decision=(await client.query('SELECT * FROM community_moderation_decisions WHERE post_id=$1 AND version=$2',[id,post.version])).rows[0];
      if(!decision || (await client.query('SELECT id FROM community_post_appeals WHERE decision_id=$1',[decision.id])).rows.length) throw new ConflictException('This decision cannot be appealed again');
      await client.query('INSERT INTO community_post_appeals(decision_id,post_id,author_user_id,reason) VALUES($1,$2,$3,$4)',[decision.id,id,user.id,reason]);
      await client.query("UPDATE community_posts SET status='PENDING',version=version+1,updated_at=now() WHERE id=$1",[id]);
      await this.audit.recordAuditIntent({action:'COMMUNITY_POST_APPEALED',entityType:'community_post',entityId:id,actorId:user.id,newValue:{decisionId:decision.id}},client);
      return {success:true};
    });
  }

  async deletePost(id: string, user: AuthenticatedUser) {
    return this.db.transaction(async client => {
      const post = await this.visiblePost(id, user, client);
      if (post.author_user_id !== user.id && !canModerate(user,post.branch_id)) throw new ForbiddenException('Only the author or scoped moderator may delete this post');
      await client.query("UPDATE community_post_appeals SET status='WITHDRAWN',resolved_at=now() WHERE post_id=$1 AND status='OPEN'",[id]);
      await client.query("UPDATE community_escalations SET status='WITHDRAWN',resolved_by=$2,resolved_at=now() WHERE post_id=$1 AND status='OPEN'",[id,user.id]);
      await client.query("UPDATE community_posts SET status='DELETED', deleted_at=now(),version=version+1,updated_at=now() WHERE id=$1", [id]);
      await this.audit.recordAuditIntent({action:'COMMUNITY_POST_DELETED',entityType:'community_post',entityId:id,actorId:user.id},client);
      return {success:true};
    });
  }
}
