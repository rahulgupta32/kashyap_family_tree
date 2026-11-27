'use client';
import { FormEvent, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { GenealogyImportBatch, GenealogyImportDetail, GenealogyImportRun, Role } from '@kashyap/contracts';
import { useAuth } from '../../context/auth-context';
import { ApiClient } from '../../lib/api-client';
type Page={items:GenealogyImportBatch[];nextAfter:string|null};
type Runs={items:GenealogyImportRun[];nextBefore:number|null};
const codes:Record<string,string>={PARENT_CYCLE:'अभिभावक सम्बन्धमा चक्र (Parent cycle)',SELF_PARENT:'आफैं अभिभावक (Self-parent)',DANGLING_PERSON_REFERENCE:'व्यक्ति सन्दर्भ भेटिएन (Person reference missing)',CONSENT_REVIEW_REQUIRED:'सहमति समीक्षा आवश्यक (Consent review required)',VERIFICATION_REQUIRED:'प्रमाणीकरण आवश्यक (Verification required)',TARGET_NAME_DUPLICATE_CANDIDATE:'मिल्दो नामको समीक्षा आवश्यक (Matching target name needs review)',SOURCE_NAME_DUPLICATE_CANDIDATE:'स्रोतमा मिल्दो नाम (Matching source name)',TARGET_INELIGIBLE:'लक्षित व्यक्ति योग्य छैन (Target ineligible)',TARGET_NOT_FOUND:'लक्षित व्यक्ति भेटिएन (Target missing)'};
export default function ImportsPage(){
 const {accessToken,user,isLoading}=useAuth(),tokenRef=useRef(accessToken),epoch=useRef(0);tokenRef.current=accessToken;
 const permitted=!!user?.roles.includes(Role.SUPER_ADMIN),valid=(token:string,e:number)=>tokenRef.current===token&&epoch.current===e;
 const [catalog,setCatalog]=useState<Page>({items:[],nextAfter:null}),[detail,setDetail]=useState<GenealogyImportDetail|null>(null),[runs,setRuns]=useState<Runs>({items:[],nextBefore:null});
 const [source,setSource]=useState(''),[reason,setReason]=useState(''),[confirmed,setConfirmed]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const requestKey=useRef<string|null>(null);
 useEffect(()=>{const e=++epoch.current;setCatalog({items:[],nextAfter:null});setDetail(null);setRuns({items:[],nextBefore:null});setSource('');setReason('');setConfirmed(false);setBusy(false);setError('');requestKey.current=null;
  if(!accessToken||!permitted)return;const token=accessToken;setBusy(true);ApiClient.genealogyImports<Page>('',token).then(c=>{if(valid(token,e))setCatalog(c);}).catch(x=>{if(valid(token,e))setError(x.message);}).finally(()=>{if(valid(token,e))setBusy(false);});
 },[accessToken,permitted]);
 async function select(id:string){if(!accessToken)return;const token=accessToken,e=++epoch.current;setDetail(null);setRuns({items:[],nextBefore:null});setReason('');setConfirmed(false);requestKey.current=null;setError('');setBusy(true);
  try{const [d,r]=await Promise.all([ApiClient.genealogyImports<GenealogyImportDetail>(`/${id}`,token),ApiClient.genealogyImports<Runs>(`/${id}/runs`,token)]);if(valid(token,e)){setDetail(d);setRuns(r);}}catch(x){if(valid(token,e)){setError((x as Error).message);try{const r=await ApiClient.genealogyImports<Runs>(`/${id}/runs`,token);if(valid(token,e))setRuns(r);}catch{}}}finally{if(valid(token,e))setBusy(false);}
 }
 async function stage(event:FormEvent){event.preventDefault();if(!accessToken)return;const token=accessToken,e=++epoch.current;setBusy(true);setError('');setDetail(null);setRuns({items:[],nextBefore:null});
  try{if(new TextEncoder().encode(source).length>1048576)throw new Error('स्रोत 1 MiB भन्दा ठूलो छ (Source exceeds 1 MiB).');const b=await ApiClient.genealogyImports<GenealogyImportBatch>('',token,'POST',JSON.parse(source));const [c,d]=await Promise.all([ApiClient.genealogyImports<Page>('',token),ApiClient.genealogyImports<GenealogyImportDetail>(`/${b.id}`,token)]);if(valid(token,e)){setCatalog(c);setDetail(d);setSource('');setReason('');requestKey.current=null;setRuns({items:d.runs,nextBefore:d.runs.length===50?d.runs[49].sequence:null});}}
  catch(x){if(valid(token,e))setError((x as Error).message);}finally{if(valid(token,e))setBusy(false);}
 }
 async function validate(event:FormEvent){event.preventDefault();if(!detail||!accessToken)return;const token=accessToken,e=++epoch.current;setError('');setBusy(true);requestKey.current??=crypto.randomUUID();
  try{await ApiClient.genealogyImports<GenealogyImportRun>(`/${detail.id}/dry-runs`,token,'POST',{sourceHash:detail.sourceHash,requestKey:requestKey.current,reason});const r=await ApiClient.genealogyImports<Runs>(`/${detail.id}/runs`,token);if(valid(token,e)){setRuns(r);setReason('');requestKey.current=null;}}catch(x){if(valid(token,e))setError((x as Error).message);}finally{if(valid(token,e))setBusy(false);}
 }
 async function erase(){if(!detail||!accessToken||!confirmed)return;const token=accessToken,e=++epoch.current;setBusy(true);setError('');
  try{await ApiClient.genealogyImports(`/${detail.id}/erase-payload`,token,'POST',{sourceHash:detail.sourceHash,reason});if(valid(token,e)){setDetail(null);setSource('');setReason('');setConfirmed(false);}}catch(x){if(valid(token,e))setError((x as Error).message);}finally{if(valid(token,e))setBusy(false);}
 }
 async function more(){if(!accessToken||!catalog.nextAfter)return;const token=accessToken,e=++epoch.current;setBusy(true);setError('');try{const c=await ApiClient.genealogyImports<Page>(`?after=${catalog.nextAfter}`,token);if(valid(token,e))setCatalog(old=>({items:[...old.items,...c.items],nextAfter:c.nextAfter}));}catch(x){if(valid(token,e))setError((x as Error).message);}finally{if(valid(token,e))setBusy(false);}}
 async function older(){if(!detail||!accessToken||!runs.nextBefore)return;const token=accessToken,e=++epoch.current;setBusy(true);try{const r=await ApiClient.genealogyImports<Runs>(`/${detail.id}/runs?before=${runs.nextBefore}`,token);if(valid(token,e))setRuns(old=>({items:[...old.items,...r.items],nextBefore:r.nextBefore}));}catch(x){if(valid(token,e))setError((x as Error).message);}finally{if(valid(token,e))setBusy(false);}}
 if(isLoading)return <p>लोड हुँदैछ (Loading)…</p>;
 if(!accessToken)return <p><Link href="/login?next=/imports">प्रवेश गर्नुहोस् (Sign in)</Link></p>;
 if(!permitted)return <p>सुपर प्रशासक अधिकार चाहिन्छ (Super Admin authority required).</p>;
 return <section className="max-w-4xl space-y-4"><h1 className="text-2xl font-bold">वंशावली आयात समीक्षा (Genealogy import review)</h1>
 <p>स्रोत अभिलेख राखी परीक्षण र मिलान गर्नुहोस्। वास्तविक वंशावली परिवर्तन हुँदैन। (Stage source records for validation and reconciliation. The live genealogy remains unchanged.)</p>
 <p>नामको मूल हिज्जे र मिति प्रणाली सुरक्षित राख्नुहोस्। फोन, ठेगाना र पहिचान कागजात यहाँ नपठाउनुहोस्। (Preserve source spelling and calendars. Exclude private contacts, addresses and identity documents.)</p>
 <form onSubmit={stage} className="space-y-2 border rounded p-4"><label className="block">स्रोत JSON (Source JSON)<textarea required disabled={busy} value={source} maxLength={1048576} onChange={e=>setSource(e.target.value)} rows={8} className="block border p-2 w-full font-mono"/></label>
 <details><summary>स्रोत ढाँचा (Source format)</summary><p>schemaVersion: 1; datasetKey; branchId; sourceDescription; persons; parentLinks. Each Person: sourceId, nameNepali, optional nameEnglish, gender, livingStatus, generation, sourceRef, consent, verification, visibility. Each parent link: sourceId, parentSourceId, childSourceId, type, sourceRef, verification. Optional targetPersonId reconciles an existing Person. Optional birth/death: value, calendar, precision.</p><p>यो नियन्त्रित JSON ढाँचा हो; पूर्ण कार्यपुस्तिका म्यापिङ समीक्षा बाँकी छ। (This controlled JSON format requires approved mapping from the complete collection workbook.)</p></details>
 <button disabled={busy||!source.trim()} className="border rounded p-2">स्रोत अभिलेख राख्नुहोस् (Stage source)</button></form>
 <div>{catalog.items.map(b=><button key={b.id} disabled={busy} onClick={()=>void select(b.id)} className="block border p-3 rounded w-full text-left">{b.datasetKey} · {b.persons} व्यक्ति (Persons) · {b.parentLinks} सम्बन्ध (Links) · {b.createdAt}</button>)}</div>
 {catalog.nextAfter&&<button disabled={busy} onClick={()=>void more()}>थप समूह (More batches)</button>}
 {detail&&<section aria-label="Staged source" className="border rounded p-4 space-y-3"><h2 className="font-bold">{detail.datasetKey}</h2><p>{detail.sourceDescription}</p><p className="break-all">स्रोत ह्यास (Source hash): {detail.sourceHash}</p>
 <details><summary>स्रोत समीक्षा (Review source)</summary><pre className="overflow-auto text-sm">{JSON.stringify(detail.payload,null,2)}</pre></details>
 <form onSubmit={validate}><label className="block">समीक्षाको कारण (Review reason)<textarea required minLength={10} maxLength={1000} disabled={busy} value={reason} onChange={e=>{setReason(e.target.value);requestKey.current=null;}} className="block border p-2 w-full"/></label><button disabled={busy||reason.trim().length<10} className="border rounded p-2">परीक्षण र मिलान (Run validation and reconciliation)</button></form>
 <label className="block"><input type="checkbox" disabled={busy} checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/> स्रोतका व्यक्तिगत विवरण स्थायी रूपमा हटाउने पुष्टि (Confirm permanent erasure of the source payload)</label>
 <button disabled={busy||!confirmed||reason.trim().length<10} onClick={()=>void erase()} className="border rounded p-2">स्रोत विवरण हटाउनुहोस् (Erase source payload)</button></section>}
 <section aria-label="Import reports" className="space-y-3"><h2 className="font-bold">परीक्षण इतिहास (Validation history)</h2>{runs.items.map(r=><article key={r.id} className="border rounded p-4 space-y-2"><p>#{r.sequence} · {r.createdAt} · {r.reason}</p><p>व्यक्ति / Persons: {r.report.persons}; सम्बन्ध / Links: {r.report.parentLinks}; मिलान / Mapped: {r.report.mappedTargets}; नमिलान / Unmapped: {r.report.unmappedPersons}</p><p>{r.report.validationPassed?'प्रारम्भिक जाँच सफल (Preliminary checks passed)':'समाधान आवश्यक (Exceptions need resolution)'}</p><p>प्रत्यक्ष आयात अवरुद्ध छ (Production promotion blocked).</p><ul>{r.report.issues.map((i,n)=><li key={n}>{i.sourceId}: {codes[i.code]||i.code}</li>)}</ul><details><summary>बाँकी अनिवार्य स्वीकृति (Outstanding mandatory gates)</summary><ul>{r.report.gates.map(g=><li key={g}>{g}</li>)}</ul></details></article>)}{detail&&runs.nextBefore&&<button disabled={busy} onClick={()=>void older()}>पुराना प्रतिवेदन (Older reports)</button>}</section>
 {busy&&<p role="status">लोड हुँदैछ (Loading)…</p>}{error&&<p role="alert">{error}</p>}
 </section>;
}
