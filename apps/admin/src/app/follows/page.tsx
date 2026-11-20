'use client';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../context/auth-context';
import { ApiClient } from '../../lib/api-client';

interface Follow {id:string;targetType:string;personId:string|null;branchId:string|null;generation:number|null;relationshipGroup:string|null}
interface Person {id:string;primaryNameNepali:string;primaryNameEnglish?:string}
interface Branch {id:string;nameNepali:string}
const base=process.env.NEXT_PUBLIC_API_URL||'http://127.0.0.1:3000';
export default function FollowsPage(){
 const {accessToken,isLoading}=useAuth();
 const [follows,setFollows]=useState<Follow[]>([]),[people,setPeople]=useState<Person[]>([]),[branches,setBranches]=useState<Branch[]>([]);
 const [query,setQuery]=useState(''),[branch,setBranch]=useState(''),[generation,setGeneration]=useState(3),[group,setGroup]=useState('PARENTS');
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const request=useCallback(async(path:string,method='GET',body?:unknown)=>{
  const response=await fetch(`${base}/notifications/follows${path}`,{method,headers:{Authorization:`Bearer ${accessToken}`,'Content-Type':'application/json'},
   ...(body===undefined?{}:{body:JSON.stringify(body)})});const data=await response.json();
  if(!response.ok)throw new Error(data.message||'Follow request failed');return data;
 },[accessToken]);
 const refresh=useCallback(async()=>{if(accessToken&&!isLoading){try{setFollows(await request(''));setError('');}catch(e){setError((e as Error).message);}}},[request,accessToken,isLoading]);
 useEffect(()=>{void refresh();},[refresh]);
 useEffect(()=>{ApiClient.listBranches().then(setBranches).catch(()=>{});},[]);
 async function action(work:()=>Promise<void>){setBusy(true);setError('');try{await work();await refresh();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 if(isLoading)return <p>लोड हुँदैछ…</p>;
 if(!accessToken)return <p>अनुसरणका लागि प्रवेश गर्नुहोस् (Sign in to follow).</p>;
 return <section className="max-w-4xl space-y-5"><h1 className="text-2xl font-bold">अनुसरण (Follow manager)</h1>
  <p className="text-sm text-slate-600">स्वीकृत वंशवृक्ष परिवर्तनका सूचनाहरूका लागि व्यक्ति, आफ्ना आफन्त वा शाखा चयन गर्नुहोस्।</p>
  {error&&<p role="alert" className="p-3 bg-red-50 text-red-800">{error}</p>}
  <div className="border rounded-lg p-4 space-y-3"><h2 className="font-semibold">व्यक्ति (People)</h2>
   <form onSubmit={e=>{e.preventDefault();void action(async()=>{setPeople((await ApiClient.searchPersons({query},accessToken)).items);});}}>
    <label>व्यक्ति खोज्नुहोस् (Search people)<input required minLength={2} value={query} onChange={e=>setQuery(e.target.value)} className="block border p-2 w-full"/></label>
    <button disabled={busy} className="border rounded px-3 py-2 mt-2">Search</button></form>
   {people.map(p=><div key={p.id} className="flex justify-between border-t pt-2"><span>{p.primaryNameNepali||p.primaryNameEnglish}</span>
    <button disabled={busy} className="underline" onClick={()=>void action(async()=>{await request('','POST',{targetType:'PERSON',personId:p.id});})}>Follow person</button></div>)}
  </div>
  <div className="border rounded-lg p-4 space-y-3"><h2 className="font-semibold">आफ्नो परिवार (My family)</h2>
   <button disabled={busy} className="border rounded px-3 py-2" onClick={()=>void action(async()=>{await request('','POST',{targetType:'IMMEDIATE_FAMILY'});})}>Follow immediate family</button>
   <div className="flex gap-2"><label>सम्बन्ध समूह (Relationship group)<select value={group} onChange={e=>setGroup(e.target.value)} className="block border rounded p-2">
    {['PARENTS','CHILDREN','SPOUSES','SIBLINGS'].map(value=><option key={value}>{value}</option>)}</select></label>
    <button disabled={busy} className="border rounded px-3 py-2 self-end" onClick={()=>void action(async()=>{await request('','POST',{targetType:'RELATIONSHIP_GROUP',relationshipGroup:group});})}>Follow group</button></div>
  </div>
  <div className="border rounded-lg p-4 space-y-3"><h2 className="font-semibold">शाखा र पुस्ता (Branch and generation)</h2>
   <label>शाखा (Branch)<select value={branch} onChange={e=>setBranch(e.target.value)} className="block border rounded p-2 w-full"><option value="">Select your branch</option>
    {branches.map(b=><option key={b.id} value={b.id}>{b.nameNepali}</option>)}</select></label>
   <button disabled={busy||!branch} className="border rounded px-3 py-2" onClick={()=>void action(async()=>{await request('','POST',{targetType:'BRANCH',branchId:branch});})}>Follow branch</button>
   <div className="flex gap-2"><label>पुस्ता (Generation)<input type="number" min={1} max={100} value={generation} onChange={e=>setGeneration(Number(e.target.value))} className="block border rounded p-2"/></label>
    <button disabled={busy||!branch||generation<1||generation>100} className="border rounded px-3 py-2 self-end" onClick={()=>void action(async()=>{await request('','POST',{targetType:'GENERATION',branchId:branch,generation});})}>Follow generation</button></div>
  </div>
  <h2 className="font-semibold">अनुसरण गरिएका (Following)</h2>
  {!follows.length&&<p>No active follows.</p>}
  <ul className="space-y-2">{follows.map(f=><li className="flex justify-between border rounded p-3" key={f.id}>
    <span>{f.targetType} · {f.relationshipGroup||branches.find(b=>b.id===f.branchId)?.nameNepali||f.personId||''}{f.generation?` · ${f.generation}`:''}</span>
    <button disabled={busy} className="underline" onClick={()=>void action(async()=>{await request(`/${f.id}`,'DELETE');})}>Unfollow</button></li>)}</ul>
 </section>;
}
