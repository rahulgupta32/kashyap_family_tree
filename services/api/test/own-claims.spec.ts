import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { ClaimsService } from '../src/modules/claims/claims.service';
import { ClaimsController } from '../src/modules/claims/claims.controller';
import { Role } from '@kashyap/contracts';

const claimId = '11111111-1111-4111-8111-111111111111';
const cursor = (fields: any) => Buffer.from(JSON.stringify(fields)).toString('base64url');
describe('Account-owned claim discovery', () => {
  const row = { id:claimId, target_person_id:'person', status:'CORRECTION_REQUESTED',
    version:2, created_at:new Date('2026-10-22T01:00:00.123Z'), updated_at:'2026-10-22T02:00:00Z',
    cursor_created_at:'2026-10-22T01:00:00.123456Z',
    claimant_phone_number:'private-phone', correction_request_notes:'private-note', evidence:'private' };
  let query: jest.Mock, service: ClaimsService;
  beforeEach(() => {
    query = jest.fn().mockResolvedValue({rows:[row]});
    service = new ClaimsService({query} as any, {} as any, {} as any, {} as any, {} as any, {} as any);
  });
  it.each([Role.REGISTERED_USER,Role.SUPER_ADMIN,Role.BRANCH_VERIFIER])('scopes %s to authenticated owner, never reviewer scope', async role => {
    const result = await service.listOwnClaims({id:'owner',roles:[role],branchIds:['other']} as any);
    expect(query.mock.calls[0][1]).toEqual(['owner']);
    expect(query.mock.calls[0][0]).toContain('WHERE claimant_user_id = $1');
    expect(query.mock.calls[0][0]).toContain('ORDER BY created_at DESC, id DESC LIMIT 100');
    expect(result).toEqual([{id:claimId,targetPersonId:'person',status:row.status,version:2,
      createdAt:row.created_at,updatedAt:row.updated_at}]);
  });
  it('rejects missing identity before reading private data', async () => {
    await expect(service.listOwnClaims(undefined as any)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(query).not.toHaveBeenCalled();
  });
  it('uses one bounded lookahead and creates cursor from exact database text, not rounded JS Date', async () => {
    query.mockResolvedValue({rows:Array.from({length:101},()=>row)});
    const result = await service.listOwnClaims({id:'owner'} as any,{});
    expect(result.items).toHaveLength(100);
    expect(query.mock.calls[0][0]).toContain('LIMIT 101');
    expect(JSON.parse(Buffer.from(result.nextCursor!, 'base64url').toString())).toEqual({
      owner:'owner',createdAt:'2026-10-22T01:00:00.123456Z',id:claimId,
    });
    expect(Object.keys(result.items[0]).sort()).toEqual(['createdAt','id','status','targetPersonId','updatedAt','version']);
  });
  it('uses strict parameterized timestamp and ID keyset while preserving microseconds', async () => {
    const after = cursor({owner:'owner',createdAt:'2026-10-22T01:00:00.123456Z',id:claimId});
    const result = await service.listOwnClaims({id:'owner'} as any,{cursor:after});
    expect(query.mock.calls[0][1]).toEqual(['owner','2026-10-22T01:00:00.123456Z',claimId]);
    expect(query.mock.calls[0][0]).toContain('AND (created_at, id) < ($2::timestamptz, $3::uuid)');
    expect(result.nextCursor).toBeNull();
  });
  it('returns an empty terminal page', async () => {
    query.mockResolvedValue({rows:[]});
    await expect(service.listOwnClaims({id:'owner'} as any,{})).resolves.toEqual({items:[],nextCursor:null});
  });
  it.each([
    '!', '', 'a'.repeat(1025), ['duplicate'],
    cursor({owner:'another',createdAt:'2026-10-22T01:00:00.123456Z',id:claimId}),
    cursor({owner:'owner',createdAt:'2026-02-30T01:00:00.123456Z',id:claimId}),
    cursor({owner:'owner',createdAt:'2026-10-22T01:00:00.123Z',id:claimId}),
    cursor({owner:'owner',createdAt:'2026-10-22T01:00:00.123456Z',id:'bad-id'}),
    cursor({owner:'owner',createdAt:'2026-10-22T01:00:00.123456Z',id:claimId,extra:true}),
  ])('rejects malformed or account-mismatched cursor before database access %#', async invalid => {
    await expect(service.listOwnClaims({id:'owner'} as any,{cursor:invalid})).rejects.toBeInstanceOf(BadRequestException);
    expect(query).not.toHaveBeenCalled();
  });
  it('controller preserves legacy mode and refuses a cursor outside explicit page mode', async () => {
    const controller = new ClaimsController(service);
    await expect(controller.listOwnClaims({id:'owner'} as any)).resolves.toHaveLength(1);
    await expect(controller.listOwnClaims({id:'owner'} as any,'true')).resolves.toHaveProperty('items');
    await expect(controller.listOwnClaims({id:'owner'} as any,'false','cursor')).rejects.toBeInstanceOf(BadRequestException);
    await expect(controller.listOwnClaims({id:'owner'} as any,['true'])).rejects.toBeInstanceOf(BadRequestException);
  });
});
