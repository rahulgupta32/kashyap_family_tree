'use client';
import { useEffect, useState } from 'react';
import { chatManagement as labels } from '@kashyap/localization';
import { ApiClient } from '../../lib/api-client';

type Call = (path:string,method?:string,body?:unknown)=>Promise<any>;
function name(person:any){return person.primaryNameNepali||person.primaryNameEnglish||'Member';}

export function PrivateGroupCreator({token,call,onCreated}:{token:string;call:Call;onCreated:(group:any)=>Promise<void>}){
 const [title,setTitle]=useState(''),[description,setDescription]=useState(''),[query,setQuery]=useState('');
 const [people,setPeople]=useState<any[]>([]),[selected,setSelected]=useState<any[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function search(){setBusy(true);setError('');try{setPeople((await ApiClient.searchPersons({query},token)).items);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 async function create(){setBusy(true);setError('');try{
  const group=await call('/conversations','POST',{type:'GROUP',title,description,memberPersonIds:selected.map(p=>p.id)});
  await onCreated(group);setTitle('');setDescription('');setSelected([]);setPeople([]);
 }catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <fieldset className="border-t pt-3 space-y-2"><legend>{labels.create}</legend>
  {error&&<p role="alert">{error}</p>}
  <label>{labels.privateTitle}<input value={title} maxLength={150} onChange={e=>setTitle(e.target.value)} className="block border p-2 w-full"/></label>
  <label>{labels.description}<textarea value={description} maxLength={1000} onChange={e=>setDescription(e.target.value)} className="block border p-2 w-full"/></label>
  <label>{labels.search}<input value={query} onChange={e=>setQuery(e.target.value)} className="block border p-2 w-full"/></label>
  <button disabled={busy||query.trim().length<2} onClick={()=>void search()}>{labels.searchButton}</button>
  {people.map(p=><label key={p.id} className="block"><input type="checkbox" checked={selected.some(s=>s.id===p.id)} disabled={busy||selected.length>=49&&!selected.some(s=>s.id===p.id)} onChange={e=>setSelected(e.target.checked?[...selected,p]:selected.filter(s=>s.id!==p.id))}/>{name(p)}</label>)}
  <p>{labels.selected}: {selected.map(name).join(', ')} ({selected.length}/49)</p>
  <button className="border p-2 rounded" disabled={busy||!title.trim()||!selected.length} onClick={()=>void create()}>{labels.create}</button>
  <p className="text-xs">{labels.historyNote}</p>
 </fieldset>;
}

export function GroupManager({id,token,call,onClose,onChanged}:{id:string;token:string;call:Call;onClose:()=>void;onChanged:(info:any)=>void}){
 const [info,setInfo]=useState<any>(null),[title,setTitle]=useState(''),[description,setDescription]=useState('');
 const [query,setQuery]=useState(''),[people,setPeople]=useState<any[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 useEffect(()=>{let active=true;call(`/conversations/${id}`).then(next=>{if(active){setInfo(next);setTitle(next.title);setDescription(next.description);}}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[id,call]);
 async function refresh(){const next=await call(`/conversations/${id}`);setInfo(next);setTitle(next.title);setDescription(next.description);onChanged(next);}
 async function action(work:()=>Promise<any>){setBusy(true);setError('');try{await work();await refresh();}catch(e){setError((e as Error).message);try{await refresh();}catch{setInfo(null);}}finally{setBusy(false);}}
 return <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"><div role="dialog" aria-modal="true" aria-label={labels.info} className="bg-white p-5 rounded-xl max-w-2xl w-full max-h-[90vh] overflow-auto space-y-3">
  <h2 className="text-xl">{labels.info}</h2>{error&&<p role="alert">{error}</p>}
  <button disabled={busy} onClick={()=>void action(async()=>{})}>{labels.refresh}</button>
  {info&&<><p>{info.title} · {info.myRole} · {info.memberCount}</p><p>{info.description}</p>
   {info.canManage&&<><label>{labels.title}<input aria-label={labels.title} value={title} maxLength={150} onChange={e=>setTitle(e.target.value)} className="block border p-2 w-full"/></label>
    <label>{labels.description}<textarea aria-label={labels.description} value={description} maxLength={1000} onChange={e=>setDescription(e.target.value)} className="block border p-2 w-full"/></label>
    <button disabled={busy||!title.trim()} onClick={()=>void action(()=>call(`/conversations/${id}`,'PATCH',{version:info.version,title,description}))}>{labels.save}</button>
    <label>{labels.search}<input value={query} onChange={e=>setQuery(e.target.value)} className="block border p-2 w-full"/></label>
    <button disabled={busy||query.trim().length<2} onClick={async()=>{setBusy(true);setError('');try{setPeople((await ApiClient.searchPersons({query},token)).items);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}>{labels.searchButton}</button>
    {people.map(p=><button key={p.id} disabled={busy} className="block" onClick={()=>void action(()=>call(`/conversations/${id}/members`,'POST',{version:info.version,personId:p.id}))}>{labels.add}: {name(p)}</button>)}
   </>}
   <ul aria-label="Group members" className="space-y-3">{info.members.map((m:any)=><li key={m.userId} data-user-id={m.userId} className="border p-2 rounded"><span>{m.name} · {m.role}</span>
    {info.isOwner&&m.role!=='OWNER'&&<><button disabled={busy} onClick={()=>void action(()=>call(`/conversations/${id}/members/${m.userId}`,'PATCH',{version:info.version,role:m.role==='ADMIN'?'MEMBER':'ADMIN'}))}>{m.role==='ADMIN'?labels.demote:labels.promote}</button>
     <button disabled={busy} onClick={()=>{if(confirm(labels.transfer))void action(()=>call(`/conversations/${id}/owner`,'POST',{version:info.version,userId:m.userId}));}}>{labels.transfer}</button></>}
    {info.canManage&&m.role!=='OWNER'&&(info.isOwner||m.role==='MEMBER')&&<button disabled={busy} onClick={()=>{if(confirm(labels.remove))void action(()=>call(`/conversations/${id}/members/${m.userId}`,'DELETE',{version:info.version}));}}>{labels.remove}</button>}
   </li>)}</ul><p className="text-xs">{labels.historyNote}</p><p className="text-xs">{labels.transferNote}</p>
  </>}
  <button onClick={onClose}>{labels.close}</button>
 </div></div>;
}
