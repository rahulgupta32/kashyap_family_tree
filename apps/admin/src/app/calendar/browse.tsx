'use client';
import {useEffect,useRef,useState} from 'react';
import {CalendarEventDetailDto} from '@kashyap/contracts';
import {ApiClient} from '../../lib/api-client';
export function CalendarBrowse({token}:{token:string}){
 const [items,setItems]=useState<CalendarEventDetailDto[]>([]),[next,setNext]=useState<string|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [year,setYear]=useState(''),[month,setMonth]=useState('');const generation=useRef(0);
 async function load(before?:string){const request=++generation.current;setBusy(true);setError('');setItems([]);setNext(null);
  try{const query=new URLSearchParams({...before?{before}:{},...year?{yearBs:year}:{},...month?{monthBs:month}:{}});
   const result=await ApiClient.calendarRequest(token,`browse?${query}`) as {items:CalendarEventDetailDto[];nextBefore:string|null};
   if(generation.current===request){setItems(result.items);setNext(result.nextBefore);}
  }catch(e){if(generation.current===request)setError((e as Error).message);}finally{if(generation.current===request)setBusy(false);}
 }
 useEffect(()=>{void load();return()=>{generation.current++;};},[token]);
 return <section aria-label="Browse all calendar events" className="border rounded p-4 space-y-3">
  <h2>सबै कार्यक्रम (Browse all events)</h2><p>Newest submissions first. BS filters use stored BS/Tithi metadata; AD events are not converted. Earlier records are available through older pages.</p>
  <form onSubmit={e=>{e.preventDefault();void load();}} className="flex flex-wrap gap-3">
   <label>BS year<input aria-label="Browse BS year" type="number" min={2000} max={2090} value={year} onChange={e=>{setYear(e.target.value);setItems([]);setNext(null);}} className="border p-2"/></label>
   <label>BS month<select aria-label="Browse BS month" value={month} onChange={e=>{setMonth(e.target.value);setItems([]);setNext(null);}} className="border p-2"><option value="">All months</option>{Array.from({length:12},(_,i)=><option key={i+1} value={i+1}>{i+1}</option>)}</select></label>
   <button disabled={busy} className="border p-2">Apply calendar filters</button>
  </form>
  {error&&<p role="alert">{error}</p>}{busy?<p>Loading events…</p>:items.length===0?<p>No accessible events in this page.</p>:items.map(e=><div key={e.id} className="border rounded p-3"><h3>{e.title}</h3><p>{e.solarDate?`BS: ${e.solarDate}`:e.startsAt?`AD: ${e.startsAt}`:`Tithi: ${e.tithiYearBs} / ${e.tithiMonthBs} · ${e.tithiPaksha} ${e.tithiNumber} (conversion unavailable)`}</p><p>{e.eventType} · {e.audienceScope} · {e.lifecycleState}</p><p>{e.description}</p></div>)}
  <button disabled={busy} onClick={()=>void load()} className="border p-2">Latest calendar events</button><button disabled={busy||!next} onClick={()=>void load(next!)} className="border p-2">Older calendar events</button>
 </section>;
}
