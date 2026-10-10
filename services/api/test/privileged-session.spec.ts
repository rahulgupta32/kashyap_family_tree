import { Role } from '@kashyap/contracts';
import { privilegedSessionExpired, PRIVILEGED_ROLES, PRIVILEGED_SESSION_MAX_AGE_MS } from '../src/modules/auth/privileged-session.policy';

describe('Privileged absolute authentication age', () => {
  const now = Date.UTC(2026, 9, 6, 12);
  it.each(PRIVILEGED_ROLES)('requires original authentication time for %s', role => {
    expect(privilegedSessionExpired([role], null, now)).toBe(true);
    expect(privilegedSessionExpired([role], new Date(now - PRIVILEGED_SESSION_MAX_AGE_MS), now)).toBe(true);
    expect(privilegedSessionExpired([role], new Date(now - PRIVILEGED_SESSION_MAX_AGE_MS + 1), now)).toBe(false);
  });
  it('rejects malformed and future timestamps', () => {
    expect(privilegedSessionExpired([Role.SUPER_ADMIN], new Date(NaN), now)).toBe(true);
    expect(privilegedSessionExpired([Role.SUPER_ADMIN], new Date(now + 1), now)).toBe(true);
  });
  it('does not apply privileged expiry to ordinary members', () => {
    expect(privilegedSessionExpired([Role.REGISTERED_USER, Role.VERIFIED_MEMBER], null, now)).toBe(false);
  });
});
