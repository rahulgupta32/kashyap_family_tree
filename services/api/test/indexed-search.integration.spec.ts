import { randomUUID } from 'crypto';
import { PersonRepository } from '../src/database/repositories/person.repository';
import { normalizeSearchQuery,literalSearchPattern } from '../src/modules/genealogy/search-normalization';
import { createDisposableDatabase,DisposableDatabase,assertDatabaseIsolation } from './helpers/disposable-db';

describe('Indexed source-preserving candidates and fixed fuzzy semantics (PostgreSQL)',()=>{
 let iso:DisposableDatabase,repo:PersonRepository;
 const names=['Rahul Gupta','Ｒａｈｕｌ　Ｇｕｐｔａ','राहुल गुप्ता','Rahl Gupta','Gupta','100%_literal\\name','aaaa bbbb','aaaa cccc','not similar'];
 beforeAll(async()=>{
  iso=await createDisposableDatabase('indexed_search');await assertDatabaseIsolation(iso.client,iso.dbName);repo=new PersonRepository(iso.client as any);
  for(let i=0;i<names.length;i++){
   const id=randomUUID();await iso.client.query("INSERT INTO persons(id,generation,profile_visibility,mool_ghar,birth_place) VALUES($1,2,$2,$3,$4)",[id,i===1?'PRIVATE':'PUBLIC',i===7?'RemoteOrigin':null,i===8?'RemoteBirth':null]);
   await iso.client.query("INSERT INTO person_names(person_id,language,first_name,last_name,full_name) VALUES($1,'en','Fictional','Fixture',$2)",[id,names[i]]);
  }
 },60000);
 afterAll(async()=>{if(iso)await iso.drop();});
 const expected=async(q:string,pattern:string)=>(await iso.client.query(`SELECT p.id FROM persons p WHERE
  EXISTS(SELECT 1 FROM person_names pn WHERE pn.person_id=p.id AND
   (lower(btrim(regexp_replace(normalize(pn.full_name,NFKC),'[[:space:]]+',' ','g'))) LIKE $2
    OR similarity(lower(btrim(regexp_replace(normalize(pn.full_name,NFKC),'[[:space:]]+',' ','g'))),$1)>=0.3))
  OR p.mool_ghar ILIKE $2 OR p.birth_place ILIKE $2 ORDER BY p.id`,[q,pattern])).rows.map(r=>r.id);
 it('matches the original candidate predicate for aliases, Unicode, fuzzy, literal and location queries',async()=>{
  for(const input of ['rahul gupta',' ＲＡＨＵＬ　ＧＵＰＴＡ ','राहुल गुप्ता','Rahl','100%_literal\\name','%','_','\\','aaaa bbbb','RemoteOrigin','RemoteBirth','unmatched']){
   const q=normalizeSearchQuery(input),pattern=literalSearchPattern(q);
   const actual=(await iso.client.query('SELECT person_id FROM public.person_search_candidates($1,$2) ORDER BY person_id',[q,pattern])).rows.map(r=>r.person_id);
   expect(actual).toEqual(await expected(q,pattern));
  }
 });
 it('pins fuzzy matching to 0.3 without leaking function-local settings into the connection',async()=>{
  const q='rahl gupta',pattern=literalSearchPattern(q),reference=await expected(q,pattern);expect(reference.length).toBeGreaterThan(0);
  for(const threshold of ['0.99','0.01']){
   await iso.client.query("SELECT set_config('pg_trgm.similarity_threshold',$1,false)",[threshold]);
   const actual=(await iso.client.query('SELECT person_id FROM public.person_search_candidates($1,$2) ORDER BY person_id',[q,pattern])).rows.map(r=>r.person_id);
   expect(actual).toEqual(reference);expect((await iso.client.query("SELECT current_setting('pg_trgm.similarity_threshold') AS threshold")).rows[0].threshold).toBe(threshold);
  }
  await iso.client.query("SET pg_trgm.similarity_threshold='0.3'");
 });
 it('keeps private candidates excluded from count/items, retains scores/order/pagination and preserves recorded source',async()=>{
  const result=await repo.searchPersons({query:'rahul gupta',page:1,limit:1});expect(result.total).toBeGreaterThan(0);expect(result.items).toHaveLength(1);
  expect(result.items[0].similarityScore).toBeGreaterThanOrEqual(.3);
  const visible=(await iso.client.query("SELECT p.id FROM persons p WHERE p.profile_visibility='PUBLIC' AND p.id IN(SELECT person_id FROM public.person_search_candidates($1,$2)) ORDER BY p.generation,(SELECT full_name FROM person_names n WHERE n.person_id=p.id AND n.language='en' AND n.is_primary),p.id",['rahul gupta',literalSearchPattern('rahul gupta')])).rows.map(r=>r.id);
  expect(result.total).toBe(visible.length);expect(result.items[0].id).toBe(visible[0]);
  const next=await repo.searchPersons({query:'rahul gupta',page:2,limit:1});expect(next.total).toBe(visible.length);expect(next.items.map(i=>i.id)).toEqual(visible.slice(1,2));
  const source=(await iso.client.query('SELECT full_name FROM person_names ORDER BY created_at,id')).rows.map(r=>r.full_name);expect(source.sort()).toEqual([...names].sort());
 });
 it('scores a matching recorded non-primary alias while returning the original primary display name',async()=>{
  const owner=(await iso.client.query("SELECT person_id FROM person_names WHERE full_name='Rahul Gupta'")).rows[0].person_id;
  await iso.client.query("INSERT INTO person_names(person_id,language,first_name,last_name,full_name,is_primary) VALUES($1,'en','Rahul','Fixture','Rahul Exact Alias',false)",[owner]);
  const result=await repo.searchPersons({query:'rahul exact alias',page:1,limit:20});
  const person=result.items.find(item=>item.id===owner);expect(person).toBeDefined();expect(person!.similarityScore).toBe(1);expect(person!.primaryNameEnglish).toBe('Rahul Gupta');
 });
});
