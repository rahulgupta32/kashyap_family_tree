import { ChangeRequestsService } from '../src/modules/change-requests/change-requests.service';
import { DiffService } from '../src/modules/change-requests/diff.service';
import { ChangeRequestType, Role } from '@kashyap/contracts';

const assetId = '11111111-1111-4111-8111-111111111111';
const owner = {id: 'owner', roles: [Role.REGISTERED_USER], roleAssignments: []} as any;
const reviewer = {id: 'reviewer', roles: [Role.SUPER_ADMIN], roleAssignments: []} as any;
function harness(asset?: any, related = false) {
  const snapshot = {id: 'person', version: 1, currentAddress: 'Fictional private address', birthDateBs: '2040-01-01'};
  let record: any = {id: 'request', requester_user_id: 'owner', target_person_id: 'person', request_type: ChangeRequestType.EDIT_PERSON,
    status: 'CORRECTION_REQUESTED', version: 1, base_version: 1, proposed_changes: {currentAddress: 'Proposed fictional address'}, current_snapshot: snapshot};
  const query = jest.fn(async (sql: string, params?: any[]) => {
    if (sql.includes('FROM media_assets')) return {rows: asset ? [asset] : []};
    if (sql.includes('FROM user_accounts')) return {rows: [{person_id: related ? 'relative' : null}]};
    if (sql.includes('FROM parent_links')) return {rows: related ? [{found: 1}] : []};
    if (sql.includes('FROM persons WHERE')) return {rows: [{id: 'person', branch_id: 'branch', version: 1, current_address: snapshot.currentAddress, birth_date_bs: snapshot.birthDateBs}]};
    if (sql.includes('FROM person_names')) return {rows: []};
    if (sql.includes('INSERT INTO genealogy_change_requests')) {
      record = {...record, proposed_changes: JSON.parse(params![4]), current_snapshot: JSON.parse(params![5])};
      return {rows: [record]};
    }
    if (sql.includes('UPDATE genealogy_change_requests')) return {rows: [{...record, status: 'PENDING'}]};
    if (sql.includes('FROM genealogy_change_requests') || sql.includes('FROM genealogy_change_requests r')) return {rows: [{...record, person_branch_id: 'branch'}]};
    return {rows: []};
  });
  const db = {query, transaction: jest.fn((cb: any) => cb({query}))};
  const audit = {recordAuditIntent: jest.fn()};
  const service = new ChangeRequestsService(db as any, {findById: jest.fn().mockResolvedValue({branch_id: 'branch'})} as any,
    {} as any, {} as any, audit as any, new DiffService(), {} as any);
  return {service, query, audit, snapshot, record: () => record};
}
const body = {targetPersonId: 'person', type: ChangeRequestType.EDIT_PERSON,
  proposedChanges: {currentAddress: 'Proposed fictional address'}, reason: 'Fictional justified correction'};

describe('Change request disclosure and private evidence boundary', () => {
  it.each(['submit', 'get', 'list', 'resubmit'])('%s never discloses stored target values to the requester', async operation => {
    const h = harness();
    const result = operation === 'submit' ? await h.service.submitRequest('owner', body)
      : operation === 'get' ? await h.service.getRequestById('request', owner)
      : operation === 'list' ? (await h.service.listRequests(owner))[0]
      : await h.service.resubmit('request', 'owner', {proposedChanges: body.proposedChanges});
    expect(result.currentSnapshot).toBeUndefined();
    expect(result.visualDiff?.fields.find(field => field.field === 'currentAddress')?.oldValue).toBeNull();
    expect(result.proposedChanges).toEqual(body.proposedChanges);
    expect(h.record().current_snapshot.currentAddress).toBe(h.snapshot.currentAddress);
  });

  it('does not expose a requester snapshot merely because they also hold administrator authority', async () => {
    const h = harness();
    expect((await h.service.getRequestById('request', {...reviewer, id: 'owner'})).currentSnapshot).toBeUndefined();
  });

  it('does not disclose a snapshot through an administrator escalating their own proposal', async () => {
    const h = harness();
    const result = await h.service.escalate('request', {...reviewer, id: 'owner'}, 'Fictional escalation');
    expect(result.currentSnapshot).toBeUndefined();
    expect(result.visualDiff?.fields[0].oldValue).toBeNull();
  });

  it('retains the review snapshot for an independently authorized reviewer', async () => {
    const h = harness();
    const result = await h.service.getRequestById('request', reviewer);
    expect(result.currentSnapshot).toEqual(h.snapshot);
    expect(result.visualDiff?.fields[0].oldValue).toBe(h.snapshot.currentAddress);
  });

  it('does not expose review snapshots to a recused family reviewer', async () => {
    const h = harness(undefined, true);
    expect((await h.service.getRequestById('request', reviewer)).currentSnapshot).toBeUndefined();
    expect((await h.service.listRequests(reviewer))[0].currentSnapshot).toBeUndefined();
  });

  it.each(['get', 'list'])('%s requires an explicit actor', async operation => {
    const h = harness();
    await expect(operation === 'get' ? h.service.getRequestById('request') : h.service.listRequests()).rejects.toThrow('Authentication required');
    expect(h.query).not.toHaveBeenCalled();
  });

  const clean = {id: assetId, uploader_user_id: 'owner', bucket: 'private-profiles', is_private: true, quarantine_status: 'CLEAN', retention_status: 'ACTIVE'};
  it.each([
    ['foreign uploader', {...clean, uploader_user_id: 'other'}],
    ['public bucket', {...clean, bucket: 'public-community'}],
    ['public asset', {...clean, is_private: false}],
    ['unscanned asset', {...clean, quarantine_status: 'PENDING'}],
    ['quarantined asset', {...clean, quarantine_status: 'QUARANTINED'}],
    ['deleted asset', {...clean, retention_status: 'DELETED'}],
    ['purged asset', {...clean, retention_status: 'PURGED'}],
    ['missing asset', undefined],
  ])('rejects %s before creating any proposal or evidence links', async (_name, asset) => {
    const h = harness(asset);
    await expect(h.service.submitRequest('owner', {...body, evidenceAssetIds: [assetId]})).rejects.toThrow();
    expect(h.query.mock.calls.some(([sql]) => sql.includes('INSERT INTO'))).toBe(false);
    expect(h.audit.recordAuditIntent).not.toHaveBeenCalled();
  });

  it.each([{ids: [assetId, assetId]}, {ids: ['invalid']}, {ids: Array(6).fill(assetId)}])('rejects malformed, duplicate or excessive evidence ids', async ({ids}) => {
    const h = harness(clean);
    await expect(h.service.submitRequest('owner', {...body, evidenceAssetIds: ids})).rejects.toThrow();
    expect(h.query.mock.calls.some(([sql]) => sql.includes('INSERT INTO'))).toBe(false);
  });

  it('locks owned clean private retained evidence before linking it', async () => {
    const h = harness(clean);
    await h.service.submitRequest('owner', {...body, evidenceAssetIds: [assetId]});
    const statements = h.query.mock.calls.map(([sql]) => sql);
    const check = statements.findIndex(sql => sql.includes('FROM media_assets'));
    expect(statements[check]).toContain('FOR SHARE');
    expect(check).toBeLessThan(statements.findIndex(sql => sql.includes('INSERT INTO genealogy_change_requests')));
    expect(statements.some(sql => sql.includes('INSERT INTO change_request_evidence_attachments'))).toBe(true);
  });
});
