import { BadRequestException } from '@nestjs/common';
import { ClaimsService } from '../src/modules/claims/claims.service';
import { Role } from '@kashyap/contracts';
import { createDisposableDatabase, DisposableDatabase, assertDatabaseIsolation } from './helpers/disposable-db';

describe('Real PostgreSQL owned claim history keyset pagination', () => {
  let isolated: DisposableDatabase;
  let service: ClaimsService;
  let owner: string, other: string, person: string;
  beforeAll(async () => {
    isolated = await createDisposableDatabase('own_claim_pages');
    await assertDatabaseIsolation(isolated.client, isolated.dbName);
    service = new ClaimsService(isolated.client as any,{} as any,{} as any,{} as any,{} as any,{} as any);
    const users = await isolated.client.query(`INSERT INTO user_accounts(phone_number,is_phone_verified)
      VALUES ('+9779800000711',true),('+9779800000712',true) RETURNING id`);
    [owner,other] = users.rows.map(row => row.id);
    const people = await isolated.client.query(`INSERT INTO persons(gender,living_status,generation,version)
      VALUES ('MALE','LIVING',1,1) RETURNING id`);
    person = people.rows[0].id;
    // The page boundary falls inside 105 exact ties; the next group differs by
    // one microsecond in the SAME JavaScript millisecond.
    await isolated.client.query(`INSERT INTO profile_claims(target_person_id,claimant_user_id,status,
        relationship_description,statement_of_truth,created_at)
      SELECT $1,$2,'REJECTED','Fictional pagination record',true,
        CASE WHEN n <= 105 THEN '2026-10-22T01:00:00.123456Z'::timestamptz
             ELSE '2026-10-22T01:00:00.123455Z'::timestamptz END
      FROM generate_series(1,205) n`,[person,owner]);
    await isolated.client.query(`INSERT INTO profile_claims(target_person_id,claimant_user_id,status,
      relationship_description,statement_of_truth,created_at)
      VALUES ($1,$2,'REJECTED','Another account private record',true,'2027-01-01T00:00:00Z')`,[person,other]);
  });
  afterAll(async () => { await isolated?.cleanup(); });

  it('traverses older owner history without gaps/duplicates despite ties, microseconds, and newer inserts', async () => {
    const expected = await isolated.client.query(`SELECT id FROM profile_claims
      WHERE claimant_user_id=$1 ORDER BY created_at DESC,id DESC`,[owner]);
    const actor = {id:owner,roles:[Role.SUPER_ADMIN],branchIds:[]} as any;
    const first = await service.listOwnClaims(actor,{});
    expect(first.items).toHaveLength(100);
    expect(first.nextCursor).not.toBeNull();
    const decoded = JSON.parse(Buffer.from(first.nextCursor!,'base64url').toString());
    expect(decoded.createdAt).toBe('2026-10-22T01:00:00.123456Z');
    await isolated.client.query(`INSERT INTO profile_claims(target_person_id,claimant_user_id,status,
      relationship_description,statement_of_truth,created_at)
      VALUES ($1,$2,'REJECTED','Newer concurrent fictional claim',true,'2028-01-01T00:00:00Z')`,[person,owner]);
    const second = await service.listOwnClaims(actor,{cursor:first.nextCursor});
    const third = await service.listOwnClaims(actor,{cursor:second.nextCursor});
    expect(second.items).toHaveLength(100);expect(third.items).toHaveLength(5);
    expect(third.nextCursor).toBeNull();
    const ids = [...first.items,...second.items,...third.items].map(row => row.id);
    expect(ids).toEqual(expected.rows.map(row => row.id));expect(new Set(ids).size).toBe(205);
    expect(Object.keys(first.items[0]).sort()).toEqual(['createdAt','id','status','targetPersonId','updatedAt','version']);
  });

  it('installs the account and stable-order index', async () => {
    const indexes = await isolated.client.query("SELECT indexdef FROM pg_indexes WHERE schemaname='public' AND indexname='idx_profile_claims_owner_history'");
    expect(indexes.rows).toHaveLength(1);
    expect(indexes.rows[0].indexdef).toContain('(claimant_user_id, created_at DESC, id DESC)');
  });

  it('refuses another account cursor even for a privileged reviewer', async () => {
    const page = await service.listOwnClaims({id:owner} as any,{});
    await expect(service.listOwnClaims({id:other,roles:[Role.SUPER_ADMIN]} as any,
      {cursor:page.nextCursor})).rejects.toBeInstanceOf(BadRequestException);
    const otherPage = await service.listOwnClaims({id:other,roles:[Role.SUPER_ADMIN]} as any,{});
    expect(otherPage.items).toHaveLength(1);expect(otherPage.nextCursor).toBeNull();
  });
});
