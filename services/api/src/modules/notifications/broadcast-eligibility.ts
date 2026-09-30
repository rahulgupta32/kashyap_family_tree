// The same current membership rule protects recipient selection, outbox delivery,
// notice detail, and old inbox entries after a role or person branch changes.
export function broadcastEligibility(b = 'b', u = 'u'): string {
  return `${u}.is_active=TRUE AND ${u}.is_suspended=FALSE AND ${u}.deleted_at IS NULL
    AND EXISTS(SELECT 1 FROM user_roles role WHERE role.user_id=${u}.id
      AND role.role NOT IN ('GUEST','REGISTERED_USER'))
    AND (
      ${b}.scope='ALL' OR
      (${b}.scope='BRANCH' AND (
        EXISTS(SELECT 1 FROM user_roles branch_role WHERE branch_role.user_id=${u}.id
          AND branch_role.branch_id=${b}.branch_id AND branch_role.role NOT IN ('GUEST','REGISTERED_USER'))
        OR EXISTS(SELECT 1 FROM persons bp WHERE bp.id=${u}.person_id AND bp.is_archived=FALSE
          AND bp.branch_id=${b}.branch_id)
      )) OR
      (${b}.scope='GENERATION' AND EXISTS(SELECT 1 FROM persons gp
        WHERE gp.id=${u}.person_id AND gp.is_archived=FALSE
          AND gp.generation=${b}.generation
          AND (${b}.branch_id IS NULL OR gp.branch_id=${b}.branch_id)))
    )`;
}
