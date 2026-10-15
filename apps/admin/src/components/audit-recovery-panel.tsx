'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Role } from '@kashyap/contracts';
import { useAuth } from '../context/auth-context';
const API=process.env.NEXT_PUBLIC_API_URL||'http://127.0.0.1:3000';
interface RecoveryData {
 exhausted:{id:string;created_at:string;retry_count:number}[];
 requests:{id:string;outbox_id:string;proposed_by:string;reason_code:string;expires_at:string;outcome:string|null}[];
}
export function AuditRecoveryPanel(){
 const {user,accessToken,isLoading}=useAuth();
 const allowed=!!user?.roles.includes(Role.SUPER_ADMIN);
 const [data,setData]=useState<RecoveryData|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [reason,setReason]=useState('DEPENDENCY_RECOVERED');
 const active=useRef<AbortController|null>(null);
 const load=useCallback(async()=>{
  active.current?.abort();if(!allowed||!accessToken||isLoading)return;
  const controller=new AbortController();active.current=controller;setBusy(true);setData(null);setError('');
  try{const r=await fetch(`${API}/audit/delivery/recovery`,{headers:{Authorization:`Bearer ${accessToken}`},cache:'no-store',signal:controller.signal});
   if(!r.ok)throw new Error('हालको अधिकार र प्रमाणक जाँच गर्नुहोस्। Recovery review is unavailable; check your current authority and authenticator verification.');
   const value=await r.json();if(!controller.signal.aborted)setData(value);
  }catch(e){if(!controller.signal.aborted)setError(e instanceof Error?e.message:'Recovery review unavailable');}
  finally{if(!controller.signal.aborted)setBusy(false);}
 },[allowed,accessToken,isLoading]);
 useEffect(()=>{setNotice('');setReason('DEPENDENCY_RECOVERED');void load();return()=>{active.current?.abort();};},[load,user?.id]);
 async function command(url:string,body:object){
  if(busy||!accessToken)return;active.current?.abort();const controller=new AbortController();active.current=controller;
  setBusy(true);setError('');setNotice('');
  try{const r=await fetch(`${API}${url}`,{method:'POST',headers:{Authorization:`Bearer ${accessToken}`,'Content-Type':'application/json'},body:JSON.stringify(body),signal:controller.signal});
   if(!r.ok)throw new Error('कार्य पुष्टि भएन। अवस्था ताजा गरी समीक्षा गर्नुहोस्। Action unconfirmed or denied; refresh and review before retrying.');
   const value=await r.json();if(controller.signal.aborted)return;
   setNotice(value.outcome==='FAILED'?'पुनः प्रयास असफल भयो; अभिलेख सुरक्षित छ। Retry failed; evidence remains retained.':value.outcome?'निर्णय सुरक्षित भयो। Recorded outcome: '+value.outcome:'प्रस्ताव सुरक्षित भयो। A different Super Admin must review and approve.');
   await load();
  }catch(e){if(!controller.signal.aborted){setData(null);setError(e instanceof Error?e.message:'Action unconfirmed');}}
  finally{if(!controller.signal.aborted)setBusy(false);}
 }
 if(!allowed||isLoading||!accessToken)return null;
 return <section aria-labelledby="audit-recovery-heading" className="space-y-3 rounded border p-4">
  <h2 id="audit-recovery-heading" className="text-lg font-semibold">समीक्षित पुनः प्रयास (Reviewed audit retry)</h2>
  <p>Two different Super Admins with current authenticator verification are required. Each approval permits one delivery attempt. Failure history is preserved; proposals expire after 24 hours.</p>
  <a href="/mfa" className="underline">प्रमाणक जाँच (Verify authenticator)</a>
  <button disabled={busy} type="button" onClick={()=>void load()} className="rounded border p-2">समीक्षा ताजा गर्नुहोस् (Refresh recovery review)</button>
  {error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
  {data&&<>
   <label htmlFor="audit-recovery-reason">सुधारको कारण (Recovery reason)</label>
   <select id="audit-recovery-reason" disabled={busy} value={reason} onChange={e=>setReason(e.target.value)} className="rounded border p-2">
    <option value="DEPENDENCY_RECOVERED">सेवा पुनः उपलब्ध (Dependency recovered)</option>
    <option value="DELIVERY_CONFIGURATION_REPAIRED">वितरण सेटिङ सुधारिएको (Delivery configuration repaired)</option>
   </select>
   <h3 className="font-semibold">सीमा पुगेका अभिलेख (Exhausted events; oldest 20)</h3>
   {!data.exhausted.length&&<p>No exhausted events in this view.</p>}
   <ul className="space-y-2">{data.exhausted.map(event=><li key={event.id} className="break-all">
    {event.id} · {event.retry_count} failed attempts · {new Date(event.created_at).toLocaleString()}{' '}
    <button type="button" disabled={busy||data.requests.some(r=>r.outbox_id===event.id&&!r.outcome&&Date.parse(r.expires_at)>Date.now())}
     onClick={()=>void command(`/audit/delivery/${event.id}/recovery`,{requestId:crypto.randomUUID(),reasonCode:reason})} className="rounded border p-2">प्रस्ताव गर्नुहोस् (Propose one retry)</button>
   </li>)}</ul>
   <h3 className="font-semibold">पछिल्ला प्रस्ताव (Latest 20 proposals)</h3>
   <ul className="space-y-2">{data.requests.map(r=><li key={r.id} className="break-all">
    {r.outbox_id} · {r.reason_code==='DEPENDENCY_RECOVERED'?'Dependency recovered':'Delivery configuration repaired'} · {r.outcome||'Awaiting distinct approval'} · Expires {new Date(r.expires_at).toLocaleString()}{' '}
    {!r.outcome&&<button type="button" disabled={busy||r.proposed_by===user?.id||Date.parse(r.expires_at)<=Date.now()}
     onClick={()=>void command(`/audit/delivery/recovery/${r.id}/approve`,{})} className="rounded border p-2">स्वीकृत गरी एक प्रयास गर्नुहोस् (Approve one attempt)</button>}
   </li>)}</ul>
  </>}
 </section>;
}
