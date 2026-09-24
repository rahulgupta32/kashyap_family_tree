'use client';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../context/auth-context';
import { ApiClient } from '../../lib/api-client';
const API=process.env.NEXT_PUBLIC_API_URL||'http://127.0.0.1:3000';
const empty={title:'',district:'',municipality:'',latitude:'',longitude:'',visibility:'PRIVATE',mapConsent:false,protectedLocation:false,version:0};
export default function HouseholdMapPage(){
 const {accessToken,isLoading,user}=useAuth();
 const [points,setPoints]=useState<any[]>([]),[mine,setMine]=useState<any>(null),[form,setForm]=useState(empty),[queue,setQueue]=useState<any[]>([]),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
 const [branches,setBranches]=useState<any[]>([]),[branch,setBranch]=useState(''),[district,setDistrict]=useState(''),[zoom,setZoom]=useState(1);
 const request=useCallback(async(path:string,method='GET',body?:any)=>{
  const r=await fetch(`${API}/map${path}`,{method,headers:{'Content-Type':'application/json',...(accessToken?{Authorization:`Bearer ${accessToken}`}:{})},...(body?{body:JSON.stringify(body)}:{})});
  const data=await r.json();if(!r.ok)throw new Error(data.message||'Map request failed');return data;
 },[accessToken]);
 const load=useCallback(async()=>{if(isLoading)return;try{
  const q=new URLSearchParams({...branch?{branchId:branch}:{},...district?{district}:{}});setPoints((await request(`/households?${q}`)).data);
  if(accessToken){const record=await request('/mine');setMine(record);if(record)setForm({title:record.title,district:record.district,municipality:record.municipality,latitude:record.approx_latitude??'',longitude:record.approx_longitude??'',visibility:record.visibility,mapConsent:record.map_consent,protectedLocation:record.protected_location,version:record.version});setQueue(await request('/review-queue'));}
 }catch(e){setError((e as Error).message);}},[request,isLoading,accessToken,branch,district]);
 useEffect(()=>{void load();},[load]);useEffect(()=>{ApiClient.listBranches().then(setBranches).catch(()=>{});},[]);
 async function action(work:()=>Promise<void>){setBusy(true);setError('');try{await work();await load();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 const lats=points.map(p=>p.approxLatitude),lngs=points.map(p=>p.approxLongitude);
 const minLat=points.length?Math.min(...lats)-.2:26,maxLat=points.length?Math.max(...lats)+.2:31,minLng=points.length?Math.min(...lngs)-.2:80,maxLng=points.length?Math.max(...lngs)+.2:89;
 return <section className="max-w-6xl space-y-5"><h1 className="text-2xl font-bold">परिवारको स्थान (Household localities)</h1>
  <p className="text-slate-600">स्थान अनुमानित छ; घरको ठेगाना होइन। Locations are generalized and do not identify an exact home. No device location permission is needed.</p>
  {error&&<p role="alert" className="text-red-800">{error}</p>}{notice&&<p role="status" className="text-green-800">{notice}</p>}
  <div className="flex flex-wrap gap-3"><label>Branch<select value={branch} onChange={e=>setBranch(e.target.value)} className="block border rounded p-2"><option value="">All permitted branches</option>{branches.map(b=><option key={b.id} value={b.id}>{b.nameNepali}</option>)}</select></label><label>District filter<input value={district} onChange={e=>setDistrict(e.target.value)} className="block border rounded p-2"/></label><button onClick={()=>void load()}>Refresh map</button></div>
  <div className="border rounded-xl overflow-auto bg-slate-50"><div className="p-3 flex gap-3"><button aria-label="Zoom in" onClick={()=>setZoom(Math.min(4,zoom+.5))}>＋</button><button aria-label="Zoom out" onClick={()=>setZoom(Math.max(1,zoom-.5))}>−</button><span>Locality view · {points.length} permitted locations</span></div>
   <svg role="img" aria-label="Generalized household locality map" viewBox="0 0 800 360" style={{width:`${100*zoom}%`,minWidth:400}}>
    <defs><pattern id="map-grid" width="50" height="40" patternUnits="userSpaceOnUse"><path d="M 50 0 L 0 0 0 40" fill="none" stroke="#cbd5e1"/></pattern></defs><rect width="800" height="360" fill="url(#map-grid)"/>
    <text x="15" y="20" fill="#475569">N ↑</text><text x="600" y="345" fill="#475569">Generalized coordinates</text>
    {points.map((p,i)=>{const x=40+(p.approxLongitude-minLng)/(maxLng-minLng)*720,y=320-(p.approxLatitude-minLat)/(maxLat-minLat)*280;return <g key={p.id||i}><circle cx={x} cy={y} r="10" fill="#800000" stroke="white" strokeWidth="3"><title>{p.title||p.district}: approximate locality</title></circle><text x={x+13} y={y+4} fontSize="13" fill="#1e293b">{p.title||`${p.district} (${p.totalHouseholds})`}</text></g>;})}
   </svg>
  </div>
  {!points.length&&<p>No locations are shared with you. Public aggregates require at least three consenting households.</p>}
  <ul aria-label="Permitted household localities" className="grid gap-3 md:grid-cols-2">{points.map((p,i)=><li key={p.id||i} className="border p-3 rounded"><strong>{p.title||p.district}</strong><p>{p.municipality} · {p.district} · {p.precision==='LOCALITY'?'Approximate locality':`${p.totalHouseholds} households`}</p></li>)}</ul>
  {accessToken&&!isLoading&&<form className="border rounded-xl p-5 space-y-3" onSubmit={e=>{e.preventDefault();void action(async()=>{await request('/mine','PUT',{...form,latitude:Number(form.latitude),longitude:Number(form.longitude)});setNotice(form.mapConsent?'Submitted for independent location review.':'Map consent withdrawn; coordinates removed.');});}}>
   <h2 className="font-bold text-xl">आफ्नो घरको स्थान (Your household locality)</h2>{mine&&<p>Review status: {mine.status}{mine.review_reason?` · ${mine.review_reason}`:''}</p>}
   <div className="grid gap-3 md:grid-cols-3">{(['title','district','municipality'] as const).map(field=><label key={field}>{field==='title'?'Household title':field==='district'?'District':'Municipality'}<input required maxLength={field==='title'?150:100} value={form[field]} onChange={e=>setForm({...form,[field]:e.target.value})} className="block border rounded p-2 w-full"/></label>)}</div>
   <div className="grid gap-3 md:grid-cols-3"><label>Locality latitude<input type="number" step="any" min="-90" max="90" required={form.mapConsent} value={form.latitude} onChange={e=>setForm({...form,latitude:e.target.value})} className="block border rounded p-2"/></label><label>Locality longitude<input type="number" step="any" min="-180" max="180" required={form.mapConsent} value={form.longitude} onChange={e=>setForm({...form,longitude:e.target.value})} className="block border rounded p-2"/></label><label>Location audience<select value={form.visibility} onChange={e=>setForm({...form,visibility:e.target.value})} className="block border rounded p-2">{['PRIVATE','IMMEDIATE_FAMILY','BRANCH','VERIFIED_COMMUNITY','PUBLIC_AGGREGATE'].map(v=><option key={v}>{v}</option>)}</select></label></div>
   <p className="text-sm text-slate-600">Coordinates are rounded to 0.1° before saving. A linked adult profile and independent administrator review are required. Profile privacy remains in effect.</p>
   <label className="block"><input type="checkbox" checked={form.mapConsent} onChange={e=>setForm({...form,mapConsent:e.target.checked})}/> I consent to showing my generalized locality to the selected audience.</label>
   <label className="block"><input type="checkbox" checked={form.protectedLocation} onChange={e=>setForm({...form,protectedLocation:e.target.checked})}/> Keep this location protected and hidden from map viewers.</label>
   <button disabled={busy} className="rounded bg-slate-900 text-white p-3">Save household locality</button>{mine&&<button type="button" disabled={busy} className="ml-4 border rounded p-3" onClick={()=>void action(async()=>{await request('/mine','DELETE');setNotice('Map consent withdrawn; coordinates removed.');})}>Withdraw map consent</button>}
  </form>}
  {!!queue.length&&<section><h2 className="text-xl font-bold">Location review queue</h2>{queue.map(row=><article key={row.id} aria-label={row.title} className="border rounded p-4 my-3"><strong>{row.title}</strong><p>{row.municipality}, {row.district} · {row.visibility}</p>{row.owner_user_id===user?.id?<p>Your proposal requires independent review.</p>:<form className="flex flex-wrap gap-3" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);void action(async()=>{await request(`/households/${row.id}/review`,'POST',{version:row.version,decision:f.get('decision'),reason:f.get('reason')});setNotice('Location review recorded.');});}}><label>Review reason<input name="reason" required maxLength={1000} className="border rounded p-2 ml-2"/></label><select name="decision" aria-label="Location decision" className="border p-2"><option value="APPROVE">Approve</option><option value="REJECT">Reject</option></select><button disabled={busy} className="border rounded p-2">Record location review</button></form>}</article>)}</section>}
 </section>;
}
