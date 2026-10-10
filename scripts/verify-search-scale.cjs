/* Generated fictional databases only. Repository benchmark, never full production acceptance. */
const { Pool } = require('../services/api/node_modules/pg');
const { PersonRepository } = require('../services/api/dist/database/repositories/person.repository');
const { randomUUID,createHash } = require('node:crypto');
const { performance } = require('node:perf_hooks');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { summarize } = require('./search-scale-metrics.cjs');
const result={kind:'FICTIONAL_MILLION_PERSON_REPOSITORY_BENCHMARK',status:'FAILED',productionAcceptance:false,
 fullApiLatencyVerified:false,productionLoadVerified:false,registeredUserScaleVerified:false,realtimeScaleVerified:false,
 startedAt:new Date().toISOString(),cleanup:'NOT_STARTED',cases:[]};
let admin,pool,name,created=false,stage='CONFIGURATION';
const identifier=n=>`"${n.replace(/"/g,'""')}"`;
async function run(){
 if(process.env.NODE_ENV!=='test'||process.env.KASHYAP_DISPOSABLE_SEARCH_SCALE!=='true')throw Error('Explicit fictional benchmark mode required');
 const host=process.env.DB_HOST,user=process.env.DB_USER,port=Number(process.env.DB_PORT||5432);
 if(!['127.0.0.1','localhost'].includes(host)||!user||!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(user)||!Number.isInteger(port)||port<1||port>65535)throw Error('Isolated PostgreSQL configuration required');
 const settings={host,user,port,password:process.env.DB_PASSWORD,connectionTimeoutMillis:10000};
 name=`kashyap_iso_search_scale_${randomUUID().replace(/-/g,'')}`;
 admin=new Pool({...settings,database:'postgres',max:1});
 stage='CREATE_DISPOSABLE_DATABASE';await admin.query(`CREATE DATABASE ${identifier(name)}`);created=true;
 pool=new Pool({...settings,database:name,max:4,statement_timeout:30000});
 assert.equal((await pool.query('SELECT current_database() AS name')).rows[0].name,name);
 stage='MIGRATIONS';
 const root=path.join(__dirname,'../database/migrations');
 const files=fs.readdirSync(root).filter(f=>/^\d{3}_.*\.sql$/.test(f)&&!f.endsWith('.down.sql')).sort();
 for(const file of files)await pool.query(fs.readFileSync(path.join(root,file),'utf8'));
 result.migrations=files.length;
 stage='SEED_ONE_MILLION_FICTIONAL_PERSONS';
 const started=performance.now();
 for(let start=1;start<=1000000;start+=25000){
  const end=start+24999;
  await pool.query(`INSERT INTO persons(id,generation,profile_visibility,mool_ghar)
   SELECT md5('fictional-scale-person-'||i)::uuid,(i%5)+1,CASE WHEN i=2 THEN 'PRIVATE' ELSE 'PUBLIC' END,
    CASE WHEN i=3 THEN 'QzxRemoteResidenceMarker' ELSE NULL END FROM generate_series($1::int,$2::int) i`,[start,end]);
  await pool.query(`INSERT INTO person_names(person_id,language,first_name,last_name,full_name,is_primary)
   SELECT md5('fictional-scale-person-'||i)::uuid,'en','Fictional','Fixture',
    CASE WHEN i IN (1,2) THEN 'Ｓｃａｌｅ　Ｎａｍｅ　Ｎｅｅｄｌｅ' ELSE 'Fixture '||md5(i::text) END,true
   FROM generate_series($1::int,$2::int) i`,[start,end]);
 }
 result.seedElapsedMs=performance.now()-started;
 result.personCount=Number((await pool.query('SELECT count(*) FROM persons')).rows[0].count);assert.equal(result.personCount,1000000);
 await pool.query('ANALYZE persons');await pool.query('ANALYZE person_names');
 result.postgresqlVersion=(await pool.query('SHOW server_version')).rows[0].server_version;
 result.sourceSha=process.env.GITHUB_SHA||null;
 const repo=new PersonRepository({query:(sql,params)=>pool.query(sql,params)});
 const id=i=>createHash('md5').update('fictional-scale-person-'+i).digest('hex').replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/,'$1-$2-$3-$4-$5');
 const scenarios=[{label:'NORMALIZED_NAME_WITH_PRIVATE_MATCH_EXCLUDED',query:'scale name needle',expectedId:id(1)},
  {label:'LOCATION_ONLY_MATCH',query:'QzxRemoteResidenceMarker',expectedId:id(3)}];
 for(const scenario of scenarios){
  stage='WARMUP_'+scenario.label;
  const warm=await repo.searchPersons({query:scenario.query,page:1,limit:20});assert.equal(warm.total,1);assert.equal(warm.items[0]?.id,scenario.expectedId);
  stage='MEASURE_'+scenario.label;const samples=[];let next=0;
  await Promise.all(Array.from({length:4},async()=>{
   while(next++<20){const start=performance.now();let correct=false;
    try{const r=await repo.searchPersons({query:scenario.query,page:1,limit:20});correct=r.total===1&&r.items.length===1&&r.items[0].id===scenario.expectedId;}
    catch{}samples.push({elapsedMs:performance.now()-start,correct});
   }
  }));
  result.cases.push({label:scenario.label,concurrency:4,warmupRequests:1,...summarize(samples,20,1000)});
 }
 result.status=result.cases.every(c=>c.passed)?'PASSED':'TARGET_NOT_MET';
 if(result.status!=='PASSED')process.exitCode=1;
}
(async()=>{
 try{await run();}catch{result.status='FAILED';result.failedStage=stage;result.errorCode='SEARCH_SCALE_REHEARSAL_FAILED';process.exitCode=1;}
 finally{
  result.cleanup='PASSED';
  if(pool)try{await pool.end();}catch{result.cleanup='FAILED';}
  if(created)try{if(!/^kashyap_iso_search_scale_[a-f0-9]{32}$/.test(name))throw Error('Unsafe cleanup');await admin.query(`DROP DATABASE ${identifier(name)}`);}catch{result.cleanup='FAILED';}
  if(admin)try{await admin.end();}catch{result.cleanup='FAILED';}
  if(result.cleanup!=='PASSED'){result.status='FAILED';process.exitCode=1;}
  result.finishedAt=new Date().toISOString();const report=path.join(__dirname,'../test-results/search-scale.json');fs.mkdirSync(path.dirname(report),{recursive:true});fs.writeFileSync(report,JSON.stringify(result,null,2),{mode:0o600});
  console.log(`${result.status}: fictional million-Person repository benchmark; production acceptance remains open`);
 }
})();
