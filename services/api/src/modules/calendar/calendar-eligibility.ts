// Alias arguments are internal SQL identifiers, never request values.
export function eventVisibility(e = 'e', u = 'u'): string {
  return `${u}.is_active=TRUE AND ${u}.is_suspended=FALSE AND ${u}.deleted_at IS NULL AND (
    ${e}.host_user_id=${u}.id OR ${e}.audience_scope IN ('PUBLIC','COMMUNITY')
    OR (${e}.audience_scope='BRANCH' AND EXISTS(SELECT 1 FROM user_roles br WHERE br.user_id=${u}.id
      AND br.branch_id=${e}.branch_id AND br.role NOT IN ('GUEST','REGISTERED_USER')))
    OR (${e}.audience_scope IN ('PRIVATE','INVITED_ONLY','FAMILY','IMMEDIATE_FAMILY') AND EXISTS(
      SELECT 1 FROM event_invitations i WHERE i.event_id=${e}.id AND i.invited_user_id=${u}.id AND i.revoked_at IS NULL))
    OR (${e}.audience_scope IN ('FAMILY','IMMEDIATE_FAMILY') AND EXISTS(
      SELECT 1 FROM user_accounts host WHERE host.id=${e}.host_user_id AND (
        EXISTS(SELECT 1 FROM parent_links pl WHERE pl.confidence='VERIFIED' AND
          ((pl.parent_id=host.person_id AND pl.child_id=${u}.person_id) OR (pl.child_id=host.person_id AND pl.parent_id=${u}.person_id)))
        OR EXISTS(SELECT 1 FROM spouse_links sl WHERE sl.confidence='VERIFIED' AND sl.status='CURRENT' AND
          ((sl.person_id=host.person_id AND sl.spouse_id=${u}.person_id) OR (sl.spouse_id=host.person_id AND sl.person_id=${u}.person_id)))
      )))
  )`;
}

export function calendarNoticeEligibility(nr = 'nr', o = 'o', e = 'e', u = 'u'): string {
  return `${nr}.event_version=${e}.version AND ${eventVisibility(e,u)}
    AND (${u}.id=${e}.host_user_id OR EXISTS(SELECT 1 FROM event_invitations ci
      WHERE ci.event_id=${e}.id AND ci.invited_user_id=${u}.id AND ci.revoked_at IS NULL))
    AND ((${o}.action='CALENDAR_EVENT_CANCELLED' AND ${e}.lifecycle_state='CANCELLED')
      OR (${o}.action<>'CALENDAR_EVENT_CANCELLED' AND ${e}.lifecycle_state='ACTIVE'))
    AND (${o}.action<>'CALENDAR_EVENT_REMINDER_DUE' OR (${e}.starts_at>NOW() AND NOT EXISTS(
      SELECT 1 FROM event_invitations declined WHERE declined.event_id=${e}.id AND declined.invited_user_id=${u}.id
        AND declined.rsvp_status='DECLINED' AND declined.revoked_at IS NULL)))`;
}
