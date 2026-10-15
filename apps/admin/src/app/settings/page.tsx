'use client';
import {FormEvent,useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import {ApplicationSettingDto,ApplicationSettingHistoryDto} from '@kashyap/contracts';
import {useAuth} from '../../context/auth-context';
import {ApiClient,SessionRefreshError} from '../../lib/api-client';
export default function SettingsPage(){
 const {accessToken,user,isLoading}=useAuth();const current=useRef(accessToken);current.current=accessToken;const epoch=useRef(0);
 const [settings,setSettings]=useState<ApplicationSettingDto[]>([]),[selected,setSelected]=useState<ApplicationSettingDto|null>(null),[history,setHistory]=useState<ApplicationSettingHistoryDto|null>(null);
 const [value,setValue]=useState(''),[reason,setReason]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const permitted=!!user?.roles.some(r=>r==='SUPER_ADMIN');
 useEffect(()=>{const request=++epoch.current;setSettings([]);setSelected(null);setHistory(null);setValue('');setReason('');setError('');setBusy(false);
  if(!accessToken||!permitted)return;const token=accessToken;setBusy(true);
  ApiClient.applicationSettings<ApplicationSettingDto[]>('',token).then(data=>{if(current.current===token&&epoch.current===request)setSettings(data);}).catch(e=>{if(current.current===token&&epoch.current===request)setError(e.message);}).finally(()=>{if(current.current===token&&epoch.current===request)setBusy(false);});
 },[accessToken,permitted]);
 async function choose(setting:ApplicationSettingDto){if(!accessToken)return;const token=accessToken,request=++epoch.current;setSelected(setting);setValue(String(setting.value));setReason('');setHistory(null);setError('');setBusy(true);
  try{const data=await ApiClient.applicationSettings<ApplicationSettingHistoryDto>(`/${setting.key}/history`,token);if(current.current===token&&epoch.current===request)setHistory(data);}catch(e){if(current.current===token&&epoch.current===request)setError((e as Error).message);}finally{if(current.current===token&&epoch.current===request)setBusy(false);}}
 async function save(e:FormEvent){e.preventDefault();if(!accessToken||!selected)return;const token=accessToken,request=++epoch.current,setting=selected;setBusy(true);setError('');setHistory(null);
  try{await ApiClient.applicationSettings<ApplicationSettingDto>(`/${setting.key}`,token,'PATCH',{value:Number(value),version:setting.version,reason});
   const [catalog,h]=await Promise.all([ApiClient.applicationSettings<ApplicationSettingDto[]>('',token),ApiClient.applicationSettings<ApplicationSettingHistoryDto>(`/${setting.key}/history`,token)]);
   if(current.current===token&&epoch.current===request){setSettings(catalog);const updated=catalog.find(s=>s.key===setting.key)!;setSelected(updated);setValue(String(updated.value));setReason('');setHistory(h);}
  }catch(e){if(current.current===token&&epoch.current===request){setError((e as Error).message);setSelected(null);setReason('');setValue('');setSettings([]);
    try{const catalog=await ApiClient.applicationSettings<ApplicationSettingDto[]>('',token);if(current.current===token&&epoch.current===request)setSettings(catalog);}catch{};
    if(e instanceof SessionRefreshError&&e.status===409)setError('सेटिङ परिवर्तन भयो; पुनः चयन गरी समीक्षा गर्नुहोस् (Setting changed; select it again and review before saving).');
   }}finally{if(current.current===token&&epoch.current===request)setBusy(false);}}
 async function older(){if(!accessToken||!selected||!history?.nextBefore)return;const token=accessToken,request=++epoch.current,key=selected.key,cursor=history.nextBefore;setBusy(true);setError('');
  try{const data=await ApiClient.applicationSettings<ApplicationSettingHistoryDto>(`/${key}/history?before=${cursor}`,token);if(current.current===token&&epoch.current===request)setHistory(old=>({items:[...(old?.items??[]),...data.items],nextBefore:data.nextBefore}));}catch(e){if(current.current===token&&epoch.current===request)setError((e as Error).message);}finally{if(current.current===token&&epoch.current===request)setBusy(false);}}
 if(isLoading)return <p>लोड हुँदैछ (Loading)…</p>;
 if(!accessToken)return <p><Link href="/login">प्रवेश गर्नुहोस् (Sign in)</Link></p>;
 if(!permitted)return <p>सुपर प्रशासक अधिकार चाहिन्छ (Super Admin authority required).</p>;
 return <section className="max-w-3xl space-y-4"><h1 className="text-2xl font-bold">अनुप्रयोग सेटिङ (Application settings)</h1>
 <p>नयाँ वा बदलिएका निमन्त्रणामा सीमा लागू हुन्छ। पुराना निमन्त्रणा यथावत रहन्छन्। परिवर्तनपछि नयाँ वंशावली पूर्वावलोकन चाहिन्छ (Limits apply to new or replaced invitation lists. Existing rosters remain. Policy changes require a fresh genealogy preview).</p>
 <div className="space-y-2">{settings.map(s=><button key={s.key} disabled={busy} onClick={()=>choose(s)} className="block border rounded p-3 text-left w-full">{s.labelNepali} ({s.labelEnglish}): {s.value} · v{s.version}</button>)}</div>
 {selected&&<form onSubmit={save} className="border rounded p-4 space-y-3"><h2 className="font-semibold">{selected.labelNepali} ({selected.labelEnglish})</h2><p>{selected.descriptionNepali} ({selected.descriptionEnglish})</p><p>हालको मान (Current value): {selected.value} · v{selected.version}</p>
 <label className="block">नयाँ मान (New value)<input type="number" required step="1" min={selected.minimum} max={selected.maximum} value={value} disabled={busy} onChange={e=>setValue(e.target.value)} className="block border rounded p-2"/></label>
 <label className="block">परिवर्तनको कारण (Change reason)<textarea required minLength={10} maxLength={1000} value={reason} disabled={busy} onChange={e=>setReason(e.target.value)} className="block border rounded p-2 w-full"/></label>
 <p>{selected.value} → {value||'—'}</p><button disabled={busy||Number(value)===selected.value||reason.trim().length<10} className="border rounded p-2">परिवर्तन सुरक्षित गर्नुहोस् (Save change)</button></form>}
 {error&&<p role="alert">{error}</p>}
 {history&&<section aria-label="Setting history" className="space-y-3"><h2 className="font-semibold">परिवर्तन इतिहास (Change history)</h2>{history.items.map(r=><article key={r.version} className="border rounded p-3"><p>v{r.version}: {r.oldValue??'—'} → {r.newValue}</p><p className="whitespace-pre-wrap">{r.reason}</p><p>{r.actorId||'प्रारम्भिक प्रणाली मान (Initial system default)'} · {new Date(r.changedAt).toLocaleString()}</p></article>)}{history.nextBefore&&<button disabled={busy} onClick={older}>पुरानो इतिहास (Older history)</button>}</section>}
 </section>;
}
