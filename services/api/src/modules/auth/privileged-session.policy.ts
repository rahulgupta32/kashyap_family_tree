import { Role } from '@kashyap/contracts';

export const PRIVILEGED_SESSION_MAX_AGE_MS = 60 * 60 * 1000;
export const PRIVILEGED_ROLES: readonly Role[] = [
  Role.SUPER_ADMIN, Role.CENTRAL_ADMIN, Role.BRANCH_ADMIN,
  Role.BRANCH_VERIFIER, Role.CULTURAL_HISTORIAN, Role.COMMUNITY_MODERATOR,
];

/** Current database authority determines policy, never client/JWT role claims. */
export function privilegedSessionExpired(roles: readonly Role[], authenticatedAt: Date | null, now = Date.now()): boolean {
  if (!roles.some(role => PRIVILEGED_ROLES.includes(role))) return false;
  if (!authenticatedAt) return true;
  const timestamp = new Date(authenticatedAt).getTime();
  return !Number.isFinite(timestamp) || timestamp > now || now - timestamp >= PRIVILEGED_SESSION_MAX_AGE_MS;
}
