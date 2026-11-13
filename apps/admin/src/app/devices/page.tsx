'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../../context/auth-context';
const API=process.env.NEXT_PUBLIC_API_URL||'http://127.0.0.1:3000';
type Device={id:string;platform:string;label:string|null;createdAt:string;expiresAt:string;isCurrent:boolean};
export default function DevicesPage(){
 const {accessToken,isLoading}=useAuth();
 const [items,setItems]=useState<Device[]>([]),[next,setNext]=useState<string|null>(null),[selected,setSelected]=useState<string|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const [loadedToken,setLoadedToken]=useState<string|null>(null);
 const generation=useRef(0),controller=useRef<AbortController|null>(null);
 const load=useCallback(async(cursor?:string)=>{
  if(!accessToken||isLoading)return;
  controller.current?.abort();const abort=new AbortController();controller.current=abort;const epoch=++generation.current;
  setItems([]);setNext(null);setSelected(null);setBusy(true);setMessage('');
  try{const response=await fetch(`${API}/auth/sessions${cursor?`?cursor=${encodeURIComponent(cursor)}`:''}`,{headers:{Authorization:`Bearer ${accessToken}`},cache:'no-store',signal:abort.signal});if(!response.ok)throw Error();const data=await response.json();
   if(!Array.isArray(data.items))throw Error();if(epoch===generation.current){setItems(data.items);setNext(data.nextCursor);setLoadedToken(accessToken);}
  }catch{if(epoch===generation.current&&!abort.signal.aborted)setMessage('उपकरण सूची अनुपलब्ध छ। (Device list unavailable. Refresh to retry.)');}
  finally{if(epoch===generation.current)setBusy(false);}
 },[accessToken,isLoading]);
 useEffect(()=>{setItems([]);setNext(null);setSelected(null);setMessage('');setBusy(false);void load();return()=>{generation.current++;controller.current?.abort();};},[accessToken,isLoading,load]); // Each token/account transition discards private responses.
 async function revoke(){
  if(!selected||!accessToken||busy)return;const epoch=++generation.current;controller.current?.abort();const abort=new AbortController();controller.current=abort;setBusy(true);setMessage('');
  try{const response=await fetch(`${API}/auth/sessions/${selected}/revoke`,{method:'POST',headers:{Authorization:`Bearer ${accessToken}`},cache:'no-store',signal:abort.signal});if(!response.ok)throw Error();if(epoch===generation.current)await load();}
  catch{if(epoch===generation.current&&!abort.signal.aborted){setItems([]);setNext(null);setSelected(null);setMessage('कार्य पुष्टि भएन। सूची ताजा गर्नुहोस्। (Action unconfirmed. Refresh the list before retrying.)');}}
  finally{if(epoch===generation.current)setBusy(false);}
 }
 return <section aria-label="मेरा उपकरणहरू (My devices)" className="mx-auto max-w-3xl p-6 space-y-4">
  <h1 className="text-2xl font-bold">मेरा उपकरणहरू (My devices)</h1>
  <p>आफ्नो अर्को उपकरणको सत्र समाप्त गर्न सक्नुहुन्छ। (Review recorded sessions and sign out another device. Device labels are supplied by the client and do not prove device identity.)</p>
  {!accessToken&&!isLoading&&<p role="alert">साइन इन आवश्यक छ। (Sign in required.)</p>}
  {message&&<p role="alert">{message}</p>}
  {busy&&<p role="status">लोड हुँदैछ… (Loading…)</p>}
  <button className="border rounded p-2" disabled={busy||!accessToken||isLoading} onClick={()=>void load()}>सूची ताजा गर्नुहोस् (Refresh devices)</button>
  {!busy&&accessToken&&!message&&items.length===0&&<p>सत्र भेटिएन। (No sessions found.)</p>}
  {(loadedToken===accessToken?items:[]).map(device=><article key={device.id} aria-label={`${device.platform} ${device.label||''}`} className="border rounded p-3 space-y-2">
   <h2 className="font-semibold">{device.platform} — {device.label||'उपकरण (Device)'}</h2>
   <p>सुरु (Created): {new Date(device.createdAt).toLocaleString()}</p><p>म्याद (Expires): {new Date(device.expiresAt).toLocaleString()}</p>
   {device.isCurrent?<p>यो उपकरण (This device)</p>:<button className="border rounded p-2" disabled={busy} onClick={()=>setSelected(device.id)}>साइन आउट गर्नुहोस् (Sign out device)</button>}
  </article>)}
  {next&&loadedToken===accessToken&&<button disabled={busy} onClick={()=>void load(next)}>अर्को पृष्ठ (Next devices)</button>}
  {selected&&loadedToken===accessToken&&<section aria-label="सत्र समाप्त गर्ने पुष्टि (Confirm device sign out)" className="border p-4 space-y-3">
   <p>यो अर्को उपकरणलाई फेरि साइन इन गर्नुपर्नेछ। (The selected other device will need to sign in again.)</p>
   <button disabled={busy} onClick={()=>void revoke()}>पुष्टि गर्नुहोस् (Confirm sign out)</button>{' '}
   <button disabled={busy} onClick={()=>setSelected(null)}>रद्द गर्नुहोस् (Cancel)</button>
  </section>}
 </section>;
}
