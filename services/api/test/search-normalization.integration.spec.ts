import { PersonRepository } from '../src/database/repositories/person.repository';
import { createDisposableDatabase, DisposableDatabase, assertDatabaseIsolation } from './helpers/disposable-db';

describe('Source-preserving normalized Person and alias search with PostgreSQL',()=>{
 let iso:DisposableDatabase,repo:PersonRepository,visible:string,hidden:string;
 const roman='Ｒａｈｕｌ　　Ｇｕｐｔａ';
 const nepali='राहुल  गुप्ता';
 beforeAll(async()=>{
  iso=await createDisposableDatabase('normalized_search');await assertDatabaseIsolation(iso.client,iso.dbName);repo=new PersonRepository(iso.client as any);
  visible=(await iso.client.query("INSERT INTO persons(profile_visibility,generation,birth_year_bs) VALUES('PUBLIC',4,2040) RETURNING id")).rows[0].id;
  hidden=(await iso.client.query("INSERT INTO persons(profile_visibility,generation,birth_year_bs) VALUES('PRIVATE',4,2040) RETURNING id")).rows[0].id;
  for(const id of [visible,hidden]){
   await iso.client.query("INSERT INTO person_names(person_id,language,first_name,last_name,full_name,is_primary) VALUES($1,'ne','राहुल','गुप्ता',$2,TRUE)",[id,nepali]);
   await iso.client.query("INSERT INTO person_names(person_id,language,first_name,last_name,full_name,is_primary) VALUES($1,'en','Rahul','Gupta',$2,FALSE)",[id,roman]);
  }
 },45000);
 afterAll(async()=>{if(iso)await iso.drop();});
 it('finds recorded Roman aliases and Nepali names with compatibility/case/spacing normalization, preserving source and display',async()=>{
  for(const query of ['rahul gupta',' ＲＡＨＵＬ\tＧＵＰＴＡ ','राहुल\u00a0 गुप्ता']){
   const result=await repo.searchPersons({query,page:1,limit:20});expect(result.total).toBe(1);expect(result.items.map(i=>i.id)).toEqual([visible]);expect(result.items[0].primaryNameNepali).toBe(nepali);
  }
  const names=(await iso.client.query('SELECT full_name FROM person_names WHERE person_id=$1 ORDER BY language',[visible])).rows.map(r=>r.full_name);expect(names).toEqual([roman,nepali]);
 });
 it('keeps privacy/count/pagination consistent and treats wildcard-only queries as literal',async()=>{
  const result=await repo.searchPersons({query:'rahul gupta',page:2,limit:1});expect(result.total).toBe(1);expect(result.items).toEqual([]);
  for(const query of ['%','_','\\']){const empty=await repo.searchPersons({query});expect(empty.total).toBe(0);expect(empty.items).toEqual([]);}
  expect((await repo.searchPersons({query:'rahul gupta'})).items.some(i=>i.id===hidden)).toBe(false);
 });
});
