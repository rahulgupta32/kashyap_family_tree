/** Explicitly enabled only by the isolated pilot deployment. */
export const emailPilotEnabled = (): boolean => process.env.AUTH_EMAIL_PILOT_ENABLED === 'true';

export function pilotEmailInvited(normalizedEmail: string): boolean {
  if (!emailPilotEnabled()) return true;
  return (process.env.AUTH_EMAIL_PILOT_ALLOWLIST ?? '').split(',')
    .some(entry => entry.trim().toLowerCase() === normalizedEmail);
}
