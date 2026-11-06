'use client';
import { FormEvent, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { BranchAdministrationDto, BranchAdministrationHistoryDto, BranchAdministrationPageDto, BranchGenerationDto, Role } from '@kashyap/contracts';
import { useAuth } from '../../context/auth-context';
import { ApiClient, SessionRefreshError } from '../../lib/api-client';

const empty = {code:'',nameNepali:'',nameEnglish:'',description:'',moolGhar:'',kuldevata:'',generation:'1',reason:''};
type Mode = 'BRANCH_CREATE' | 'BRANCH_EDIT' | 'GENERATION_CREATE' | 'GENERATION_EDIT';
export default function BranchesPage() {
 const {accessToken,user,isLoading}=useAuth(),tokenRef=useRef(accessToken),epoch=useRef(0);tokenRef.current=accessToken;
 const permitted=!!user?.roles.includes(Role.SUPER_ADMIN);
 const [catalog,setCatalog]=useState<BranchAdministrationPageDto>({items:[],nextAfter:null});
 const [branch,setBranch]=useState<BranchAdministrationDto|null>(null),[generations,setGenerations]=useState<BranchGenerationDto[]>([]),[generation,setGeneration]=useState<BranchGenerationDto|null>(null);
 const [mode,setMode]=useState<Mode|null>(null),[form,setForm]=useState(empty),[history,setHistory]=useState<BranchAdministrationHistoryDto|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const valid=(token:string,request:number)=>tokenRef.current===token&&epoch.current===request;
 function clearSelection(){setBranch(null);setGeneration(null);setGenerations([]);setMode(null);setForm(empty);setHistory(null);}
 useEffect(()=>{const request=++epoch.current;clearSelection();setCatalog({items:[],nextAfter:null});setBusy(false);setError('');
  if(!accessToken||!permitted)return;const token=accessToken;setBusy(true);
  ApiClient.branchAdministration<BranchAdministrationPageDto>('',token).then(data=>{if(valid(token,request))setCatalog(data);}).catch(e=>{if(valid(token,request))setError(e.message);}).finally(()=>{if(valid(token,request))setBusy(false);});
 },[accessToken,permitted]);
 async function chooseBranch(item:BranchAdministrationDto){if(!accessToken)return;const token=accessToken,request=++epoch.current;clearSelection();setBusy(true);setError('');
  try{const [g,h]=await Promise.all([ApiClient.branchAdministration<BranchGenerationDto[]>(`/${item.id}/generations`,token),ApiClient.branchAdministration<BranchAdministrationHistoryDto>(`/${item.id}/history`,token)]);
   if(valid(token,request)){setBranch(item);setGenerations(g);setHistory(h);setMode('BRANCH_EDIT');setForm({...empty,...item,description:item.description||'',moolGhar:item.moolGhar||'',kuldevata:item.kuldevata||''});}
  }catch(e){if(valid(token,request))setError((e as Error).message);}finally{if(valid(token,request))setBusy(false);}}
 async function chooseGeneration(item:BranchGenerationDto){if(!accessToken||!branch)return;const token=accessToken,request=++epoch.current;setGeneration(null);setMode(null);setHistory(null);setBusy(true);setError('');
  try{const h=await ApiClient.branchAdministration<BranchAdministrationHistoryDto>(`/${branch.id}/generations/${item.generation}/history`,token);
   if(valid(token,request)){setGeneration(item);setHistory(h);setMode('GENERATION_EDIT');setForm({...empty,...item,generation:String(item.generation),description:item.description||''});}
  }catch(e){if(valid(token,request))setError((e as Error).message);}finally{if(valid(token,request))setBusy(false);}}
 function create(next:Mode){++epoch.current;setMode(next);setGeneration(null);setHistory(null);setForm(empty);setError('');if(next==='BRANCH_CREATE'){setBranch(null);setGenerations([]);}}
 async function save(e:FormEvent){e.preventDefault();if(!accessToken||!mode)return;const token=accessToken,request=++epoch.current;setBusy(true);setError('');
  const gen=mode.startsWith('GENERATION'),createMode=mode.endsWith('CREATE');
  const path=gen?`/${branch!.id}/generations${createMode?'':`/${generation!.generation}`}`:createMode?'':`/${branch!.id}`;
  const body={nameNepali:form.nameNepali,nameEnglish:form.nameEnglish,description:form.description||null,reason:form.reason,
   ...(gen?(createMode?{generation:Number(form.generation)}:{version:generation!.version}):{moolGhar:form.moolGhar||null,kuldevata:form.kuldevata||null,...(createMode?{code:form.code}:{version:branch!.version})})};
  try{const result=await ApiClient.branchAdministration<BranchAdministrationDto|BranchGenerationDto>(path,token,createMode?'POST':'PATCH',body);
   const branchId=gen?branch!.id:(result as BranchAdministrationDto).id;
   const historyPath=gen?`/${branchId}/generations/${(result as BranchGenerationDto).generation}/history`:`/${branchId}/history`;
   const [c,g,h]=await Promise.all([ApiClient.branchAdministration<BranchAdministrationPageDto>('',token),ApiClient.branchAdministration<BranchGenerationDto[]>(`/${branchId}/generations`,token),ApiClient.branchAdministration<BranchAdministrationHistoryDto>(historyPath,token)]);
   if(valid(token,request)){setCatalog(c);setGenerations(g);setHistory(h);setForm(old=>({...old,reason:''}));if(gen){setGeneration(result as BranchGenerationDto);setMode('GENERATION_EDIT');}else{setBranch(result as BranchAdministrationDto);setMode('BRANCH_EDIT');}}
  }catch(e){if(valid(token,request)){clearSelection();setCatalog({items:[],nextAfter:null});setError((e as Error).message);
    if(e instanceof SessionRefreshError&&e.status===409){setError('रेकर्ड परिवर्तन भयो; पुनः चयन गरी समीक्षा गर्नुहोस् (Record changed; select again and review).');}
    try{const c=await ApiClient.branchAdministration<BranchAdministrationPageDto>('',token);if(valid(token,request))setCatalog(c);}catch{}
   }}finally{if(valid(token,request))setBusy(false);}}
 async function moreBranches(){if(!accessToken||!catalog.nextAfter)return;const token=accessToken,request=++epoch.current;setBusy(true);setError('');
  try{const c=await ApiClient.branchAdministration<BranchAdministrationPageDto>(`?after=${catalog.nextAfter}`,token);if(valid(token,request))setCatalog(old=>({items:[...old.items,...c.items],nextAfter:c.nextAfter}));}catch(e){if(valid(token,request))setError((e as Error).message);}finally{if(valid(token,request))setBusy(false);}}
 async function older(){if(!accessToken||!branch||!history?.nextBefore)return;const token=accessToken,request=++epoch.current;setBusy(true);setError('');
  const path=`/${branch.id}${generation?`/generations/${generation.generation}`:''}/history?before=${history.nextBefore}`;
  try{const h=await ApiClient.branchAdministration<BranchAdministrationHistoryDto>(path,token);if(valid(token,request))setHistory(old=>({items:[...(old?.items||[]),...h.items],nextBefore:h.nextBefore}));}catch(e){if(valid(token,request))setError((e as Error).message);}finally{if(valid(token,request))setBusy(false);}}
 if(isLoading)return <p>लोड हुँदैछ (Loading)…</p>;
 if(!accessToken)return <p><Link href="/login?next=/branches">प्रवेश गर्नुहोस् (Sign in)</Link></p>;
 if(!permitted)return <p>सुपर प्रशासक अधिकार चाहिन्छ (Super Admin authority required).</p>;
 const gen=mode?.startsWith('GENERATION');
 return <section className="max-w-4xl space-y-4"><h1 className="text-2xl font-bold">शाखा र पुस्ता व्यवस्थापन (Branch and generation administration)</h1>
 <p>शाखाको विवरण र पुस्ताको नाम व्यवस्थापन गर्नुहोस् (Manage branch details and generation labels).</p>
 <p>व्यक्तिको शाखा स्थानान्तरण वा सम्बन्ध परिवर्तनका लागि <Link href="/change-requests" className="underline">परिवर्तन अनुरोध समीक्षा (Review genealogy change requests)</Link> प्रयोग गर्नुहोस्।</p>
 <button disabled={busy} onClick={()=>create('BRANCH_CREATE')} className="border rounded p-2">नयाँ शाखा (New branch)</button>
 <div className="space-y-2">{catalog.items.map(b=><button key={b.id} disabled={busy} onClick={()=>chooseBranch(b)} className="block border rounded p-3 text-left w-full">{b.nameNepali} ({b.nameEnglish}) · {b.code} · v{b.version}</button>)}</div>
 {catalog.nextAfter&&<button disabled={busy} onClick={moreBranches}>थप शाखा (More branches)</button>}
 {branch&&<section aria-label="Branch generations" className="space-y-2"><h2 className="font-bold">{branch.code}: पुस्ता (Generations)</h2>
 <button disabled={busy} onClick={()=>create('GENERATION_CREATE')} className="border rounded p-2">पुस्ताको नाम थप्नुहोस् (Add generation label)</button>
 {generations.map(g=><button key={g.generation} disabled={busy} onClick={()=>chooseGeneration(g)} className="block border rounded p-2">{g.generation}: {g.nameNepali} ({g.nameEnglish}) · v{g.version}</button>)}
 {!generations.length&&<p>पुस्ताको नाम थपिएको छैन (No generation labels configured).</p>}</section>}
 {mode&&<form onSubmit={save} className="border rounded p-4 space-y-3"><h2 className="font-bold">{gen?'पुस्ताको नाम (Generation label)':'शाखाको विवरण (Branch details)'}</h2>
 {mode==='BRANCH_CREATE'&&<label className="block">शाखा कोड (Branch code)<input required maxLength={50} pattern="[A-Z0-9][A-Z0-9_-]*" disabled={busy} value={form.code} onChange={e=>setForm({...form,code:e.target.value})} className="block border p-2"/></label>}
 {mode==='GENERATION_CREATE'&&<label className="block">पुस्ता नम्बर (Generation number)<input type="number" required min={1} max={100} step={1} disabled={busy} value={form.generation} onChange={e=>setForm({...form,generation:e.target.value})} className="block border p-2"/></label>}
 <label className="block">नेपाली नाम (Nepali name)<input required maxLength={100} disabled={busy} value={form.nameNepali} onChange={e=>setForm({...form,nameNepali:e.target.value})} className="block border p-2 w-full"/></label>
 <label className="block">अङ्ग्रेजी नाम (English name)<input required maxLength={100} disabled={busy} value={form.nameEnglish} onChange={e=>setForm({...form,nameEnglish:e.target.value})} className="block border p-2 w-full"/></label>
 {!gen&&<><label className="block">मूल घर (Mool ghar)<input maxLength={200} disabled={busy} value={form.moolGhar} onChange={e=>setForm({...form,moolGhar:e.target.value})} className="block border p-2 w-full"/></label><label className="block">कुलदेवता (Kuldevata)<input maxLength={200} disabled={busy} value={form.kuldevata} onChange={e=>setForm({...form,kuldevata:e.target.value})} className="block border p-2 w-full"/></label></>}
 <label className="block">विवरण (Description)<textarea maxLength={3000} disabled={busy} value={form.description} onChange={e=>setForm({...form,description:e.target.value})} className="block border p-2 w-full"/></label>
 <label className="block">परिवर्तनको कारण (Change reason)<textarea required minLength={10} maxLength={1000} disabled={busy} value={form.reason} onChange={e=>setForm({...form,reason:e.target.value})} className="block border p-2 w-full"/></label>
 <button disabled={busy||form.reason.trim().length<10} className="border rounded p-2">सुरक्षित गर्नुहोस् (Save metadata)</button></form>}
 {error&&<p role="alert">{error}</p>}{busy&&<p role="status">लोड हुँदैछ (Loading)…</p>}
 {history&&<section aria-label="Branch administration history" className="space-y-2"><h2 className="font-bold">परिवर्तन इतिहास (Change history)</h2>{history.items.map(r=><article key={r.version} className="border rounded p-3"><p>v{r.version} · {r.changedAt}</p><p>{r.reason}</p><p>{r.actorId||'अघिल्लो विवरणको अभिलेख (Existing metadata snapshot)'}</p><p>अघिल्लो नाम (Previous name): {r.oldValue?.nameNepali||'—'} / {r.oldValue?.nameEnglish||'—'}</p><p>नयाँ नाम (New name): {r.newValue.nameNepali} / {r.newValue.nameEnglish}</p></article>)}{history.nextBefore&&<button disabled={busy} onClick={older}>पुरानो इतिहास (Older history)</button>}</section>}
 </section>;
}
