import {ClaimsService} from '../src/modules/claims/claims.service';
import {ProfileService} from '../src/modules/profile/profile.service';
import {Role} from '@kashyap/contracts';

const id = '11111111-1111-4111-8111-111111111111';
const owner = {id: 'owner', roles: [Role.REGISTERED_USER]} as any;
const central = {id: 'central', roles: [Role.CENTRAL_ADMIN]} as any;
const global = {id: 'global', roles: [Role.SUPER_ADMIN]} as any;
const branch = {id: 'reviewer', roles: [Role.BRANCH_VERIFIER],
  roleAssignments: [{role: Role.BRANCH_VERIFIER, branchId: 'branch'}]} as any;

function fixture(options: {kind?: string; related?: boolean; self?: boolean; dispute?: boolean; unattached?: boolean; unsubmitted?: boolean} = {}) {
  const asset = {id, uploader_user_id: owner.id, bucket: 'private-profiles',
    quarantine_status: 'CLEAN', retention_status: 'ACTIVE', file_name: options.unsubmitted ? 'evidence_fictional.png' : 'fictional.png', mime_type: 'image/png', byte_size: 7};
  const context = {kind: options.kind || 'CLAIM', target_person_id: 'person', branch_id: 'branch',
    requester_user_id: options.self ? global.id : owner.id, dispute_id: options.dispute ? 'dispute' : null};
  const db = {query: jest.fn(async (sql: string) => {
    if (sql.includes('FROM media_assets')) return {rows: [asset]};
    if (sql.includes('claim_evidence_attachments')) return {rows: options.unattached || (context.kind === 'CHANGE' && !sql.includes('change_request_evidence_attachments')) ? [] : [context]};
    if (sql.includes('FROM user_accounts')) return {rows: [{person_id: options.related ? 'relative' : null}]};
    if (sql.includes('FROM parent_links')) return {rows: options.related ? [{found: 1}] : []};
    return {rows: []};
  })};
  const storage = {read: jest.fn().mockResolvedValue(Buffer.from('fixture'))};
  const images = {read: jest.fn().mockResolvedValue({buffer: Buffer.from('derived')})};
  const claims = new ClaimsService(db as any, {} as any, {} as any, {} as any, {} as any, {} as any, storage as any);
  const profile = new ProfileService(db as any, {} as any, {} as any, {} as any, {} as any, {} as any,
    undefined, storage as any, images as any);
  return {claims, profile, storage, images, asset};
}

describe('Private evidence route parity and reviewer recusal', () => {
  it('does not turn the generic media route into a CENTRAL_ADMIN claim-evidence bypass', async () => {
    const h = fixture();
    await expect(h.claims.getEvidenceMediaAsset(id, central)).rejects.toThrow();
    await expect(h.profile.getMediaAsset(id, central)).rejects.toThrow();
    expect(h.storage.read).not.toHaveBeenCalled();
  });
  it.each(['CLAIM', 'CHANGE'])('denies a recused global reviewer through generic %s evidence reads and derivatives', async kind => {
    const h = fixture({kind, related: true});
    await expect(h.profile.getMediaAsset(id, global)).rejects.toThrow();
    await expect(h.profile.getMediaAsset(id, global, undefined, undefined, undefined, 'display')).rejects.toThrow();
    expect(h.storage.read).not.toHaveBeenCalled(); expect(h.images.read).not.toHaveBeenCalled();
  });
  it('denies a recused branch reviewer on the claim evidence route', async () => {
    const h = fixture({related: true});
    await expect(h.claims.getEvidenceMediaAsset(id, branch)).rejects.toThrow();
    expect(h.storage.read).not.toHaveBeenCalled();
  });
  it('does not grant a proposer review access to another uploader evidence merely through global authority', async () => {
    const h = fixture({self: true});
    await expect(h.claims.getEvidenceMediaAsset(id, global)).rejects.toThrow();
    await expect(h.profile.getMediaAsset(id, global)).rejects.toThrow();
    expect(h.storage.read).not.toHaveBeenCalled();
  });
  it('preserves owner access regardless of family relation or dispute status', async () => {
    const h = fixture({related: true, dispute: true});
    await expect(h.claims.getEvidenceMediaAsset(id, owner)).resolves.toMatchObject({buffer: Buffer.from('fixture')});
    await expect(h.profile.getMediaAsset(id, owner)).resolves.toMatchObject({buffer: Buffer.from('fixture')});
  });
  it('preserves independent global review on both routes', async () => {
    const h = fixture();
    await expect(h.claims.getEvidenceMediaAsset(id, global)).resolves.toMatchObject({buffer: Buffer.from('fixture')});
    await expect(h.profile.getMediaAsset(id, global)).resolves.toMatchObject({buffer: Buffer.from('fixture')});
  });
  it('preserves canonical assigned-branch claim review without widening generic media permissions', async () => {
    const h = fixture();
    await expect(h.claims.getEvidenceMediaAsset(id, branch)).resolves.toMatchObject({buffer: Buffer.from('fixture')});
    await expect(h.profile.getMediaAsset(id, branch)).rejects.toThrow();
  });
  it('does not treat proposal-only evidence as branch-readable claim evidence', async () => {
    const h = fixture({kind: 'CHANGE'});
    await expect(h.claims.getEvidenceMediaAsset(id, branch)).rejects.toThrow();
    expect(h.storage.read).not.toHaveBeenCalled();
  });
  it('retains existing unlinked-avatar policy and owner canonical download', async () => {
    const h = fixture({unattached: true});
    await expect(h.profile.getMediaAsset(id, central)).resolves.toMatchObject({buffer: Buffer.from('fixture')});
    await expect(h.claims.getEvidenceMediaAsset(id, owner)).resolves.toMatchObject({buffer: Buffer.from('fixture')});
    await expect(h.claims.getEvidenceMediaAsset(id, branch)).rejects.toThrow();
  });
  it('does not use a signed URL as a substitute for current evidence authority', async () => {
    const h = fixture();
    const signed = new URL(h.profile.generateSignedMediaUrl(id, central.id), 'https://synthetic.invalid');
    await expect(h.profile.getMediaAsset(id, central, central.id,
      signed.searchParams.get('expires')!, signed.searchParams.get('sig')!)).rejects.toThrow();
    expect(h.storage.read).not.toHaveBeenCalled();
  });
  it('rejects a mismatched signed audience before reading evidence bytes', async () => {
    const h = fixture();
    const signed = new URL(h.profile.generateSignedMediaUrl(id, owner.id), 'https://synthetic.invalid');
    await expect(h.profile.getMediaAsset(id, global, owner.id,
      signed.searchParams.get('expires')!, signed.searchParams.get('sig')!)).rejects.toThrow('Signed URL user mismatch');
    expect(h.storage.read).not.toHaveBeenCalled();
  });
  it.each([central, global])('keeps an unsubmitted evidence upload private from $id until a review context exists', async viewer => {
    const h = fixture({unattached: true, unsubmitted: true});
    await expect(h.profile.getMediaAsset(id, viewer)).rejects.toThrow();
    await expect(h.claims.getEvidenceMediaAsset(id, viewer)).rejects.toThrow();
    expect(h.storage.read).not.toHaveBeenCalled();
    await expect(h.profile.getMediaAsset(id, owner)).resolves.toMatchObject({buffer: Buffer.from('fixture')});
  });
});
