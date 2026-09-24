'use client';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../context/auth-context';

interface Notice { id:string; category:string; message:string; destination:string; createdAt:string; readAt:string|null }
interface Inbox {items:Notice[];unreadCount:number;nextCursor:string|null}
type Options={inAppEnabled:boolean;workflowEnabled:boolean;chatEnabled:boolean;familyEventsEnabled:boolean};
const BASE=process.env.NEXT_PUBLIC_API_URL||'http://127.0.0.1:3000';
const settings: {key:keyof Options;label:string}[]=[
 {key:'inAppEnabled',label:'इन एप सूचनाहरू (In app notifications)'},
 {key:'workflowEnabled',label:'दाबी र संशोधन (Claims and change requests)'},
 {key:'chatEnabled',label:'सन्देश (Messages)'},
 {key:'familyEventsEnabled',label:'कार्यक्रम (Events)'},
];
export default function NotificationsPage(){
 const {accessToken,isLoading}=useAuth(),router=useRouter();
 const [inbox,setInbox]=useState<Inbox|null>(null),[options,setOptions]=useState<Options|null>(null);
 const [error,setError]=useState(''),[busy,setBusy]=useState(false);
 const request=useCallback(async(path:string,method='GET',body?:unknown)=>{
  const response=await fetch(`${BASE}/notifications${path}`,{method,headers:{Authorization:`Bearer ${accessToken}`,'Content-Type':'application/json'},
   ...(body===undefined?{}:{body:JSON.stringify(body)})});
  const value=await response.json();if(!response.ok)throw new Error(value.message||'Could not load notifications');return value;
 },[accessToken]);
 const load=useCallback(async()=>{if(!accessToken||isLoading)return;
  try{const [page,prefs]=await Promise.all([request(''),request('/preferences')]);setInbox(page);setOptions(prefs);setError('');}
  catch(e){setError((e as Error).message);}
 },[accessToken,isLoading,request]);
 useEffect(()=>{void load();},[load]);
 async function task(work:()=>Promise<void>){setBusy(true);setError('');try{await work();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 async function open(item:Notice){await task(async()=>{
  await request(`/${item.id}/read`,'POST');
  await load();
  // Routes are fixed by the API's category allowlist; never use a URL from audit payload.
  if(['/claims','/change-requests','/chat','/calendar'].includes(item.destination))router.push(item.destination);
 });}
 if(isLoading)return <p>लोड हुँदैछ…</p>;
 if(!accessToken)return <p>सूचनाहरूका लागि प्रवेश गर्नुहोस् (Sign in for notifications).</p>;
 return <section className="max-w-3xl space-y-5"><h1 className="text-2xl font-bold">सूचनाहरू (Notifications)</h1>
  {error&&<p role="alert" className="p-3 bg-red-50 text-red-800">{error}</p>}
  <div role="status">नपढिएका सूचनाहरू: {inbox?.unreadCount??0} (Unread)</div>
  <div className="flex gap-3"><button disabled={busy} onClick={()=>void load()} className="border rounded px-3 py-2">Refresh inbox</button>
   <button disabled={busy||!inbox?.unreadCount} onClick={()=>void task(async()=>{await request('/read-all','POST');await load();})} className="border rounded px-3 py-2">Mark all read</button></div>
  {options&&<fieldset className="border rounded-lg p-4 space-y-2"><legend className="font-semibold">सूचना प्राथमिकताहरू (Preferences)</legend>
   {settings.map(({key,label})=><label key={key} className="flex gap-2 items-center"><input type="checkbox" checked={options[key]} disabled={busy}
     onChange={e=>void task(async()=>setOptions(await request('/preferences','PATCH',{[key]:e.target.checked})))} />{label}</label>)}</fieldset>}
  <ol aria-label="Notification inbox" className="space-y-3">{inbox?.items.map(item=><li key={item.id} className={`border rounded-lg p-4 ${item.readAt?'bg-white':'bg-amber-50'}`}>
    <button disabled={busy} className="w-full text-left" onClick={()=>void open(item)}><span className="block font-semibold">{item.message}</span>
     <span className="text-xs">{new Date(item.createdAt).toLocaleString()} · {item.readAt?'Read':'Unread'} · Open {item.destination}</span></button>
   </li>)}</ol>
  {inbox?.items.length===0&&<p>अहिलेसम्म सूचना छैन। (No notifications yet.)</p>}
  {inbox?.nextCursor&&<button disabled={busy} className="border rounded px-3 py-2" onClick={()=>void task(async()=>{
   const next=await request(`?cursor=${encodeURIComponent(inbox.nextCursor!)}`) as Inbox;
   setInbox(current=>current?{...next,items:[...current.items,...next.items]}:next);
  })}>Load older notifications</button>}
 </section>;
}
