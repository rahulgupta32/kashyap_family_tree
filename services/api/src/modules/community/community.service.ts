import { Injectable, NotFoundException, BadRequestException, ForbiddenException, ConflictException } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { AuditOutboxRepository } from '../../database/repositories/audit-outbox.repository';
import { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { allowedFields, branchAccess, canModerate, globalAdmin, member, textField, uuid } from './community-policy';

@Injectable()
export class CommunityService {
  constructor(private readonly db: DatabaseService, private readonly audit: AuditOutboxRepository) {}

  private async visiblePost(id: string, user: AuthenticatedUser, client?: any) {
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
      `SELECT p.*, (SELECT count(*)::int FROM community_reactions r WHERE r.post_id = p.id) AS reaction_count,
         EXISTS(SELECT 1 FROM community_reactions r WHERE r.post_id = p.id AND r.user_id = $1) AS is_liked,
         (SELECT count(*)::int FROM community_comments c WHERE c.post_id = p.id AND c.deleted_at IS NULL) AS comment_count,
         (SELECT count(*)::int FROM community_reports r WHERE r.post_id = p.id AND r.status = 'OPEN') AS report_count
       FROM community_posts p WHERE p.deleted_at IS NULL
         AND ($2 OR p.branch_id IS NULL OR p.branch_id = ANY($3::uuid[]))
         AND ($4::uuid IS NULL OR p.branch_id = $4)
         AND (CASE WHEN $5 THEN p.status = 'PENDING' AND ($6 OR p.branch_id = ANY($7::uuid[]))
              ELSE p.status = 'PUBLISHED' OR p.author_user_id = $1 OR ($6 OR p.branch_id = ANY($7::uuid[])) END)
       ORDER BY p.created_at DESC, p.id DESC LIMIT 50 OFFSET $8`,
      [user.id, globalAdmin(user) || moderatorAll, branches, options.branchId || null, !!options.queue, moderatorAll, modBranches, (page - 1) * 50]);
    return result.rows.map(row => this.dto(row, user));
  }

  private dto(row: any, user: AuthenticatedUser) {
    return { id: row.id, title: row.title, content: row.content, category: row.category, branchId: row.branch_id,
      authorUserId: row.author_user_id, authorName: 'Community member', moderationStatus: row.status,
      version: row.version, createdAt: row.created_at, updatedAt: row.updated_at,
      likesCount: row.reaction_count || 0, isLiked: !!row.is_liked, commentsCount: row.comment_count || 0,
      reportsCount: canModerate(user, row.branch_id) ? row.report_count || 0 : undefined,
      canModerate: canModerate(user, row.branch_id) && row.author_user_id !== user.id,
      canDelete: row.author_user_id === user.id || canModerate(user, row.branch_id) };
  }

  async createPost(user: AuthenticatedUser, body: any) {
    allowedFields(body, ['title', 'content', 'category', 'branchId']);
    const branchId = body.branchId ? uuid(body.branchId, 'branch') : null;
    branchAccess(user, branchId);
    const title = textField(body.title, 'Title', 180);
    const content = textField(body.content, 'Content', 10000);
    if (!['ANNOUNCEMENT', 'DISCUSSION', 'RITUAL', 'ACHIEVEMENT'].includes(body.category)) throw new BadRequestException('Invalid category');
    if (body.category === 'ANNOUNCEMENT' && !canModerate(user, branchId)) throw new ForbiddenException('Announcements require moderator authority');
    return this.db.transaction(async client => {
      const row = (await client.query(`INSERT INTO community_posts (author_user_id, branch_id, title, content, category, status)
        VALUES ($1,$2,$3,$4,$5,'PENDING') RETURNING *`, [user.id, branchId, title, content, body.category])).rows[0];
      await this.audit.recordAuditIntent({ action: 'COMMUNITY_POST_SUBMITTED', entityType: 'community_post', entityId: row.id, actorId: user.id, newValue: { status: 'PENDING', branchId } }, client);
      return this.dto(row, user);
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

  async report(id: string, user: AuthenticatedUser, reason: string) {
    reason = textField(reason, 'Reason', 1000, 5);
    return this.db.transaction(async client => {
      await this.visiblePost(id, user, client);
      await client.query(`INSERT INTO community_reports(post_id,reporter_user_id,reason) VALUES($1,$2,$3)
        ON CONFLICT(post_id,reporter_user_id) WHERE status='OPEN' DO UPDATE SET reason=EXCLUDED.reason`, [id,user.id,reason]);
      await client.query("UPDATE community_posts SET status='PENDING', version=version+1, updated_at=now() WHERE id=$1", [id]);
      await this.audit.recordAuditIntent({ action: 'COMMUNITY_POST_REPORTED', entityType: 'community_post', entityId: id, actorId: user.id }, client);
      return { success: true };
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
      await client.query('UPDATE community_posts SET status=$2, version=version+1, updated_at=now() WHERE id=$1', [id,body.decision]);
      await client.query("UPDATE community_reports SET status='RESOLVED', reviewed_by=$2,review_notes=$3,resolved_at=now() WHERE post_id=$1 AND status='OPEN'", [id,user.id,notes]);
      await this.audit.recordAuditIntent({ action: 'COMMUNITY_POST_MODERATED', entityType: 'community_post', entityId: id, actorId: user.id,
        oldValue: {status:post.status}, newValue: {status:body.decision,notes} }, client);
      return { success: true };
    });
  }

  async deletePost(id: string, user: AuthenticatedUser) {
    return this.db.transaction(async client => {
      const post = await this.visiblePost(id, user, client);
      if (post.author_user_id !== user.id && !canModerate(user,post.branch_id)) throw new ForbiddenException('Only the author or scoped moderator may delete this post');
      await client.query("UPDATE community_posts SET status='DELETED', deleted_at=now(),version=version+1,updated_at=now() WHERE id=$1", [id]);
      await this.audit.recordAuditIntent({action:'COMMUNITY_POST_DELETED',entityType:'community_post',entityId:id,actorId:user.id},client);
      return {success:true};
    });
  }
}
