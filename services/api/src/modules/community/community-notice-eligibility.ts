// Aliases: p=post, o=outbox, u=recipient. Recheck the current decision and authority.
export function communityNoticeEligibility(): string {
 return `o.action='COMMUNITY_POST_MODERATED' AND o.entity_type='community_post'
  AND o.entity_id=p.id::text AND p.author_user_id=u.id AND p.deleted_at IS NULL
  AND (o.new_value->>'version')=p.version::text
  AND u.is_active=TRUE AND u.is_suspended=FALSE AND u.deleted_at IS NULL
  AND EXISTS(SELECT 1 FROM user_roles r WHERE r.user_id=u.id
    AND r.role NOT IN ('GUEST','REGISTERED_USER')
    AND (p.branch_id IS NULL OR r.branch_id=p.branch_id OR r.role IN ('SUPER_ADMIN','CENTRAL_ADMIN')
      OR (r.role='COMMUNITY_MODERATOR' AND r.branch_id IS NULL)))`;
}
