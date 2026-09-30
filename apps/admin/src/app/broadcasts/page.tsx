'use client';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Role } from '@kashyap/contracts';
import { useAuth } from '../../context/auth-context';

const BASE = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:3000';
type Scope = 'ALL' | 'BRANCH' | 'GENERATION';
type Notice = {id:string;title:string;body?:string;scope:Scope;branchId:string|null;generation:number|null;createdAt:string};
type Branch = {id:string;nameEnglish?:string;nameNepali?:string;code:string};

export default function BroadcastsPage() {
  const {accessToken,isLoading,user}=useAuth();
  const [notices,setNotices]=useState<Notice[]>([]),[selected,setSelected]=useState<Notice|null>(null);
  const [branches,setBranches]=useState<Branch[]>([]),[branchIds,setBranchIds]=useState<string[]>([]);
  const [title,setTitle]=useState(''),[body,setBody]=useState(''),[scope,setScope]=useState<Scope>('BRANCH');
  const [branchId,setBranchId]=useState(''),[generation,setGeneration]=useState('');
  const [preview,setPreview]=useState<number|null>(null),[requestId,setRequestId]=useState('');
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[status,setStatus]=useState('');
  const globalAdmin=!!user?.roles.some(r=>r===Role.SUPER_ADMIN||r===Role.CENTRAL_ADMIN);
  const canSend=globalAdmin||!!user?.roles.includes(Role.BRANCH_ADMIN);
  const request=useCallback(async(path:string,method='GET',data?:unknown)=>{
    const res=await fetch(`${BASE}${path}`,{method,headers:{Authorization:`Bearer ${accessToken}`,'Content-Type':'application/json'},
      ...(data===undefined?{}:{body:JSON.stringify(data)})});
    const result=await res.json();if(!res.ok)throw new Error(result.message||`Request failed (${res.status})`);return result;
  },[accessToken]);
  const refresh=useCallback(async()=>{if(!accessToken||isLoading)return;
    try{const [all,profile,options]=await Promise.all([
      request('/notifications/broadcasts'),request('/profile/me'),request('/genealogy/branches')]);
      setNotices(all);setBranches(options);
      const permitted:string[]=profile.roleAssignments?.filter((r:{role:Role;branchId:string|null})=>r.role===Role.BRANCH_ADMIN&&r.branchId)
        .map((r:{branchId:string})=>r.branchId)||[];
      setBranchIds(permitted);setBranchId(previous=>previous||permitted[0]||options[0]?.id||'');setError('');
    }catch(e){setError((e as Error).message);}
  },[accessToken,isLoading,request]);
  useEffect(()=>{void refresh();},[refresh]);
  const audience=()=>({scope,...(scope==='ALL'?{}:{branchId:branchId||undefined}),
    ...(scope==='GENERATION'?{generation:Number(generation)}:{})});
  async function previewAudience(){setBusy(true);setError('');try{
    const result=await request('/notifications/broadcasts/preview','POST',audience());setPreview(result.recipientCount);
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  async function send(e:FormEvent){e.preventDefault();setBusy(true);setError('');try{
    const id=requestId||crypto.randomUUID();setRequestId(id);
    const result=await request('/notifications/broadcasts','POST',{...audience(),requestId:id,title,body});
    setStatus(`Notice recorded for ${result.recipientCount} members${result.alreadySent?' (previous request)':''}. Delivery is queued.`);
    setTitle('');setBody('');setPreview(null);setRequestId('');await refresh();
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  async function open(id:string){setBusy(true);setError('');try{setSelected(await request(`/notifications/broadcasts/${id}`));}
    catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  if(isLoading)return <p>लोड हुँदैछ… (Loading)</p>;
  if(!accessToken)return <p>Sign in to view official notices.</p>;
  const available=globalAdmin?branches:branches.filter(b=>branchIds.includes(b.id));
  return <section className="max-w-3xl space-y-6"><h1 className="text-2xl font-bold">प्रशासनिक सूचनाहरू (Official notices)</h1>
    {error&&<p role="alert" className="p-3 bg-red-50 text-red-800">{error}</p>}
    {status&&<p role="status" className="p-3 bg-green-50">{status}</p>}
    {canSend&&<form onSubmit={e=>void send(e)} className="border rounded-lg p-4 space-y-3">
      <h2 className="font-semibold">Send a governed notice</h2>
      <label className="block">Audience <select value={scope} onChange={e=>{setScope(e.target.value as Scope);setPreview(null);setRequestId('');}} className="border rounded p-2 ml-2">
        {globalAdmin&&<option value="ALL">All verified members</option>}<option value="BRANCH">Branch</option><option value="GENERATION">Generation</option>
      </select></label>
      {scope!=='ALL'&&<label className="block">Branch <select value={branchId} onChange={e=>{setBranchId(e.target.value);setPreview(null);setRequestId('');}}
        required={!globalAdmin||scope==='BRANCH'} className="border rounded p-2 ml-2">
        {globalAdmin&&scope==='GENERATION'&&<option value="">All branches</option>}
        {available.map(b=><option key={b.id} value={b.id}>{b.nameNepali||b.nameEnglish||b.code}</option>)}
      </select></label>}
      {scope==='GENERATION'&&<label className="block">Generation <input type="number" min="1" max="100" required value={generation}
        onChange={e=>{setGeneration(e.target.value);setPreview(null);setRequestId('');}} className="border rounded p-2 ml-2 w-24" /></label>}
      <label className="block">Title <input required maxLength={180} value={title} onChange={e=>{setTitle(e.target.value);setPreview(null);setRequestId('');}}
        className="block border rounded p-2 w-full" /></label>
      <label className="block">Notice <textarea required maxLength={4000} value={body} onChange={e=>{setBody(e.target.value);setPreview(null);setRequestId('');}}
        className="block border rounded p-2 w-full min-h-32" /></label>
      <div className="flex gap-3 items-center"><button type="button" disabled={busy} onClick={()=>void previewAudience()} className="border rounded px-3 py-2">Preview recipients</button>
        <button disabled={busy||preview===null||preview===0} className="rounded bg-slate-900 text-white px-3 py-2">Send notice</button>
        {preview!==null&&<span role="status">{preview} currently eligible recipients</span>}</div>
      <p className="text-sm text-slate-600">Recipient eligibility is checked again when sending and when a member reads a notice.</p>
    </form>}
    <h2 className="font-semibold">Received notices</h2>
    <ul aria-label="Official notices" className="space-y-2">{notices.map(n=><li key={n.id}>
      <button disabled={busy} onClick={()=>void open(n.id)} className="border rounded p-3 text-left w-full">{n.title} · {new Date(n.createdAt).toLocaleString()}</button>
    </li>)}</ul>
    {notices.length===0&&<p>No notices available for your current membership.</p>}
    {selected&&<article className="border rounded-lg p-4"><h2 className="font-semibold">{selected.title}</h2><p className="whitespace-pre-wrap mt-2">{selected.body}</p></article>}
  </section>;
}
