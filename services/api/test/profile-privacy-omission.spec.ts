import { ProfileService } from '../src/modules/profile/profile.service';

describe('Profile privacy updates preserve omitted scopes', () => {
  const userId = '00000000-0000-4000-8000-000000000071';
  const personId = '00000000-0000-4000-8000-000000000072';
  const ordinarySave = { profileVisibility: 'PUBLIC', contactVisibility: 'PRIVATE', addressVisibility: 'PRIVATE' } as const;
  function fixture(linked = true) {
    const user = { person_id: linked ? personId : null, privacy_settings: {
      profileVisibility: 'PRIVATE', contactVisibility: 'PRIVATE', addressVisibility: 'PRIVATE', dobVisibility: 'PRIVATE',
    } };
    const person = { profile_visibility: 'PRIVATE', phone_visibility: 'PRIVATE', address_visibility: 'PRIVATE', dob_visibility: 'PRIVATE' };
    const query = jest.fn(async (sql: string, values?: any[]) => {
      if (sql.startsWith('SELECT person_id, privacy_settings')) return { rows: [user] };
      if (sql.startsWith('SELECT profile_visibility')) return { rows: [person] };
      if (sql.includes('UPDATE user_accounts')) return { rows: [{ person_id: user.person_id }] };
      return { rows: [] };
    });
    const tx = { query };
    const db = { transaction: jest.fn((run: any) => run(tx)) };
    const audit = { recordAuditIntent: jest.fn().mockResolvedValue(undefined) };
    const service = new ProfileService(db as any, {} as any, {} as any, {} as any, audit as any, {} as any);
    return { service, query, tx, db, audit, user, person };
  }
  it('does not widen private DOB when normal Flutter/admin saves omit that field', async () => {
    const f = fixture();
    await f.service.updatePrivacySettings(userId, ordinarySave);
    const personWrite = f.query.mock.calls.find(([sql]) => sql.includes('UPDATE persons'));
    expect(personWrite?.[1]).toEqual(['PRIVATE', 'PRIVATE', 'PUBLIC', 'PRIVATE', personId]);
    const accountWrite = f.query.mock.calls.find(([sql]) => sql.includes('UPDATE user_accounts'));
    expect(JSON.parse(accountWrite?.[1]?.[0])).toEqual({ ...ordinarySave, dobVisibility: 'PRIVATE' });
    expect(f.query.mock.calls[0]).toEqual([expect.stringContaining('FOR UPDATE'), [userId]]);
  });
  it('retains authoritative Person DOB even if legacy account JSON has a wider scope', async () => {
    const f = fixture();
    f.user.privacy_settings.dobVisibility = 'PUBLIC';
    await f.service.updatePrivacySettings(userId, ordinarySave);
    expect(f.query.mock.calls.find(([sql]) => sql.includes('UPDATE persons'))?.[1]?.[3]).toBe('PRIVATE');
    expect(f.audit.recordAuditIntent).toHaveBeenCalledWith(expect.objectContaining({
      oldValue: expect.objectContaining({ dobVisibility: 'PRIVATE' }), newValue: expect.objectContaining({ dobVisibility: 'PRIVATE' }),
    }), f.tx);
  });
  it('preserves all omitted grouped scopes in a partial update', async () => {
    const f = fixture();
    const result = await f.service.updatePrivacySettings(userId, { contactVisibility: 'IMMEDIATE_FAMILY' } as any);
    expect(result).toEqual({ profileVisibility: 'PRIVATE', contactVisibility: 'IMMEDIATE_FAMILY', addressVisibility: 'PRIVATE', dobVisibility: 'PRIVATE' });
    expect(f.query.mock.calls.find(([sql]) => sql.startsWith('SELECT profile_visibility'))).toEqual([
      expect.stringContaining('FOR UPDATE'), [personId],
    ]);
  });
  it('preserves omitted DOB for an unlinked account and honors an explicit valid change', async () => {
    const f = fixture(false);
    await f.service.updatePrivacySettings(userId, ordinarySave);
    expect(JSON.parse(f.query.mock.calls.find(([sql]) => sql.includes('UPDATE user_accounts'))?.[1]?.[0]).dobVisibility).toBe('PRIVATE');
    expect(f.query.mock.calls.some(([sql]) => sql.includes('UPDATE persons'))).toBe(false);
    const linked = fixture();
    await linked.service.updatePrivacySettings(userId, { ...ordinarySave, dobVisibility: 'IMMEDIATE_FAMILY' });
    expect(linked.query.mock.calls.find(([sql]) => sql.includes('UPDATE persons'))?.[1]?.[3]).toBe('IMMEDIATE_FAMILY');
  });
  it.each([null, [], { ...ordinarySave, dobVisibility: 'EVERYONE' }, { ...ordinarySave, dobVisibility: null },
    { ...ordinarySave, contactVisibility: '' }, { ...ordinarySave, personId: 'other' }])('rejects malformed scopes before writing: %p', async body => {
    const f = fixture();
    await expect(f.service.updatePrivacySettings(userId, body as any)).rejects.toMatchObject({ status: 400 });
    expect(f.db.transaction).not.toHaveBeenCalled();
    expect(f.query).not.toHaveBeenCalled();
  });
  it('uses the caller transaction and does not acknowledge an audit failure', async () => {
    const f = fixture();
    f.audit.recordAuditIntent.mockRejectedValueOnce(new Error('Fictional audit outage'));
    await expect(f.service.updatePrivacySettings(userId, ordinarySave, f.tx)).rejects.toThrow('Fictional audit outage');
    expect(f.db.transaction).not.toHaveBeenCalled();
  });
  it('returns the authoritative retained DOB scope in profile reads', async () => {
    const db = { query: jest.fn().mockResolvedValue({ rows: [] }) };
    const personRepo = { findById: jest.fn().mockResolvedValue({ id: personId, dob_visibility: 'PRIVATE' }),
      findNamesByPersonId: jest.fn().mockResolvedValue([]) };
    const userRepo = { findById: jest.fn().mockResolvedValue({ id: userId, person_id: personId, privacy_settings: { dobVisibility: 'PUBLIC' } }) };
    const service = new ProfileService(db as any, personRepo as any, {} as any, userRepo as any, {} as any, {} as any);
    const profile = await service.getMe(userId);
    expect(Reflect.get(profile.privacy, 'dobVisibility')).toBe('PRIVATE');
    expect(Reflect.get(profile.privacySettings, 'dobVisibility')).toBe('PRIVATE');
  });
});
