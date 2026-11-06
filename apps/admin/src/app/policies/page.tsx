'use client';
import {useLayoutEffect,useRef,useState} from 'react';
import {useAuth} from '../../context/auth-context';
import {policyLabels as l} from '../../lib/policy-labels';
import {ApiClient} from '../../lib/api-client';
type Policy={id:string;kind:string;version:number;titleNe:string;titleEn:string;bodyNe:string;bodyEn:string;contentHash:string;acceptedAt:string|null};
export default function PoliciesPage(){
 const {accessToken,user,isLoading}=useAuth();
 const scope=JSON.stringify([user?.id,accessToken,isLoading]);const scopeRef=useRef(scope);scopeRef.current=scope;
 const [loaded,setLoaded]=useState(''),[documents,setDocuments]=useState<Policy[]>([]),[checked,setChecked]=useState<Record<string,boolean>>({}),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 const operation=useRef<object|null>(null);
 async function load(){
  if(!accessToken||isLoading||scopeRef.current!==scope)return;
  const marker={};operation.current=marker;setBusy(true);setDocuments([]);setChecked({});setMessage('');
  try{const result=await ApiClient.policyRequest(accessToken);
   if(scopeRef.current===scope&&operation.current===marker){setDocuments(result.documents);setLoaded(scope);}
  }catch{if(scopeRef.current===scope)setMessage(l.unavailable);}
  finally{if(operation.current===marker){operation.current=null;setBusy(false);}}
 }
 useLayoutEffect(()=>{scopeRef.current=scope;operation.current=null;setDocuments([]);setChecked({});setLoaded('');setBusy(false);setMessage('');void load();return()=>{scopeRef.current='';operation.current=null;};},[scope]); // scope fences token/account transitions
 async function accept(d:Policy){
  if(scopeRef.current!==scope||!accessToken||operation.current||!checked[d.id]||d.acceptedAt)return;
  const marker={};operation.current=marker;setBusy(true);setMessage('');
  try{await ApiClient.policyRequest(accessToken,{documentId:d.id,contentHash:d.contentHash,accepted:true});
   if(scopeRef.current===scope){operation.current=null;await load();}
  }catch{if(scopeRef.current===scope)setMessage(l.unconfirmed);}
  finally{if(operation.current===marker){operation.current=null;setBusy(false);}}
 }
 const visible=loaded===scope&&!isLoading&&!!accessToken;
 return <section className="space-y-4" aria-label="Policy acknowledgements">
  <h1>{l.title}</h1>
  <p role="status">{message}</p>
  <button disabled={busy||isLoading||!accessToken} onClick={()=>void load()}>{l.reload}</button>
  {visible&&documents.length===0&&<p>{l.noApprovedPolicy}</p>}
  {visible&&documents.map(d=><article key={d.id} className="border p-4 space-y-3" aria-label={`${d.kind} ${d.version}`}>
   <h2>{d.titleNe} / {d.titleEn} · {d.version}</h2>
   <p lang="ne" className="whitespace-pre-wrap">{d.bodyNe}</p><p lang="en" className="whitespace-pre-wrap">{d.bodyEn}</p>
   {d.acceptedAt?<p>{l.acknowledged}: {d.acceptedAt}</p>:<>
    <label><input type="checkbox" disabled={busy} checked={!!checked[d.id]} onChange={e=>{if(scopeRef.current!==scope||operation.current)return;const selected=e.target.checked;setChecked(old=>({...old,[d.id]:selected}));}}/> {l.select}</label>
    <button disabled={busy||!checked[d.id]} onClick={()=>void accept(d)}>{l.confirm}</button>
   </>}
  </article>)}
 </section>;
}
