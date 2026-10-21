'use client';
import { useEffect, useRef, useState } from 'react';
import { GenealogyAudienceSelection } from '@kashyap/contracts';
import { ApiClient } from '../../lib/api-client';

export function GenealogyAudience({token,branches,onChange}:{token:string;branches:any[];onChange:(selection:GenealogyAudienceSelection|undefined,enabled:boolean)=>void}){
 const [mode,setMode]=useState('EXPLICIT'),[branch,setBranch]=useState(''),[generation,setGeneration]=useState(''),[q,setQ]=useState('');
 const [roots,setRoots]=useState<any[]>([]),[root,setRoot]=useState<any>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const epoch=useRef(0);
 useEffect(()=>{epoch.current++;setRoots([]);setRoot(null);setMode('EXPLICIT');setBusy(false);onChange(undefined,false);return()=>{epoch.current++;};},[token]);
 function change(nextMode=mode,nextBranch=branch,nextGeneration=generation,nextRoot=root){
  epoch.current++;setError('');setBusy(false);setMode(nextMode);setBranch(nextBranch);setGeneration(nextGeneration);setRoot(nextRoot);
  const selection:GenealogyAudienceSelection|undefined=nextMode==='BRANCH'&&nextBranch?{type:'BRANCH',branchId:nextBranch}:
   nextMode==='GENERATION'&&nextBranch&&/^[1-9][0-9]?$|^100$/.test(nextGeneration)?{type:'GENERATION',branchId:nextBranch,generation:Number(nextGeneration)}:
   nextMode==='DESCENDANTS'&&nextRoot?{type:'DESCENDANTS',ancestorPersonId:nextRoot.id}:undefined;
  onChange(selection,nextMode!=='EXPLICIT');
 }
 async function search(){const attempt=++epoch.current;setBusy(true);setError('');setRoots([]);
  try{const result=await ApiClient.searchPersons({query:q,page:1,limit:20},token);if(attempt===epoch.current)setRoots(result.items);}
  catch(e:any){if(attempt===epoch.current)setError(e.message);}
  finally{if(attempt===epoch.current)setBusy(false);}
 }
 return <fieldset className="space-y-2 border p-3 rounded"><legend>आमन्त्रित व्यक्ति छनोट (Invitee selection)</legend>
  <label className="block">छनोट विधि (Selection method)<select aria-label="Invitee selection method" value={mode} onChange={e=>{change(e.target.value);setRoots([]);setQ('');}}>
   <option value="EXPLICIT">व्यक्ति छान्नुहोस् (Choose individuals)</option><option value="BRANCH">शाखा (Branch)</option>
   <option value="GENERATION">शाखाभित्र पुस्ता (Generation in branch)</option><option value="DESCENDANTS">पूर्वजका वंशज (Descendants of an ancestor)</option>
  </select></label>
  {['BRANCH','GENERATION'].includes(mode)&&<label className="block">आमन्त्रण शाखा (Invitation branch)<select aria-label="Invitation branch" value={branch} onChange={e=>change(mode,e.target.value)}>
   <option value="">शाखा छान्नुहोस् (Select branch)</option>{branches.map(b=><option key={b.id} value={b.id}>{b.nameNepali} / {b.nameEnglish}</option>)}</select></label>}
  {mode==='GENERATION'&&<label className="block">पुस्ता (Generation)<input aria-label="Invitation generation" type="number" min="1" max="100" value={generation} onChange={e=>change(mode,branch,e.target.value)}/></label>}
  {mode==='DESCENDANTS'&&<div className="space-y-2"><label className="block">पूर्वज खोज्नुहोस् (Find ancestor)<input aria-label="Find invitation ancestor" value={q} onChange={e=>{change(mode,branch,generation,null);setQ(e.target.value);setRoots([]);}}/></label>
   <button type="button" disabled={busy||q.trim().length<2} onClick={search}>पूर्वज खोज्नुहोस् (Search ancestor)</button>
   {roots.map(p=><button className="block" type="button" key={p.id} aria-pressed={root?.id===p.id} onClick={()=>change(mode,branch,generation,p)}>{p.primaryNameNepali} / {p.primaryNameEnglish} · {p.generation}</button>)}
   {root&&<p>छानिएको पूर्वज (Selected ancestor): {root.primaryNameNepali} / {root.primaryNameEnglish}</p>}
  </div>}
  {error&&<p role="alert">{error}</p>}
  {mode!=='EXPLICIT'&&<p className="text-xs">योग्य प्रमाणित खाताहरू मात्र पूर्वावलोकनमा देखिन्छन्। पूर्वज स्वयं र निजी वा संरक्षित अभिलेखका मार्ग समावेश हुँदैनन्। (Preview includes eligible verified accounts. Descendant selection excludes the ancestor and paths through private or protected records.)</p>}
  <p className="text-xs">स्वीकृत सम्बन्ध समूह उपलब्ध छैनन्। कार्यक्रमको पहुँच दायरा आमन्त्रित सूचीभन्दा फरक हुन सक्छ। (Authority-defined relationship groups are unavailable. Event visibility can be broader than its invitation list.)</p>
 </fieldset>;
}
