'use client';
import {useEffect,useRef,useState} from 'react';
import {ApiClient} from '../../lib/api-client';
type PeriodPage={period:{source:string;view:string;date:string;daysInMonth:number;previousDate:string|null;nextDate:string|null};days:{date:string;count:number}[];undatedCount:number;items:any[];nextBefore:string|null};
export function CalendarPeriod({token}:{token:string}){
 const [source,setSource]=useState('AD'),[view,setView]=useState('MONTH'),[date,setDate]=useState(new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kathmandu',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()));
 const [storedPage,setPage]=useState<PeriodPage|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');const generation=useRef(0),session=useRef(token),loadedToken=useRef(token);session.current=token;const page=loadedToken.current===token?storedPage:null;
 async function load(nextView=view,nextDate=date,before?:string){const request=++generation.current,auth=token;setBusy(true);setError('');setPage(null);setView(nextView);setDate(nextDate);
  try{const query=new URLSearchParams({source,view:nextView,date:nextDate,...before?{before}:{}});const result=await ApiClient.calendarRequest(token,`period?${query}`) as PeriodPage;
   if(generation.current===request&&session.current===auth){loadedToken.current=auth;setPage(result);}
  }catch(e){if(generation.current===request&&session.current===auth)setError((e as Error).message);}finally{if(generation.current===request&&session.current===auth)setBusy(false);}
 }
 function clear(){generation.current++;setPage(null);setBusy(false);setError('');}
 useEffect(()=>{clear();return()=>{generation.current++;};},[token]);
 const groups=page?Array.from(new Set(page.items.map(e=>e.displayDate??'UNDATED'))):[];
 return <section aria-label="Calendar day month agenda" className="border rounded p-4 space-y-3">
  <h2>पात्रो दृश्य (Calendar views)</h2><p>AD times use Asia/Kathmandu. Select the original calendar; switching source does not convert an event or the selected date. BS month cells are numbered days; weekday conversion is unavailable.</p>
  <form onSubmit={e=>{e.preventDefault();void load();}} className="flex flex-wrap gap-3">
   <label>Date source<select aria-label="View calendar source" disabled={busy} value={source} onChange={e=>{clear();setSource(e.target.value);}} className="border p-2"><option>AD</option><option>BS</option></select></label>
   <label>View<select aria-label="Calendar view mode" disabled={busy} value={view} onChange={e=>{clear();setView(e.target.value);}} className="border p-2"><option value="DAY">दिन (Day)</option><option value="MONTH">महिना (Month)</option><option value="AGENDA">कार्यसूची (Agenda for month)</option></select></label>
   <label>Source date<input aria-label="Calendar source date" required pattern="[0-9]{4}-[0-9]{2}-[0-9]{2}" value={date} disabled={busy} onChange={e=>{clear();setDate(e.target.value);}} placeholder="YYYY-MM-DD" className="border p-2"/></label>
   <button disabled={busy} className="border p-2">Show calendar period</button>
  </form>
  {error&&<p role="alert">{error}</p>}{busy&&<p>Loading calendar period…</p>}
  {page&&<>
   <p>{page.period.source} · {page.period.view} · {page.period.date.slice(0,page.period.view==='DAY'?10:7)}. Counts cover all currently accessible events; each event page contains at most 50.</p>
   <div><button disabled={busy||!page.period.previousDate} onClick={()=>void load(view,page.period.previousDate!)} className="border p-2">Previous calendar period</button><button disabled={busy||!page.period.nextDate} onClick={()=>void load(view,page.period.nextDate!)} className="border p-2">Next calendar period</button></div>
   {page.period.view==='MONTH'&&<div aria-label="Calendar month days" className="grid grid-cols-4 sm:grid-cols-7 gap-2">{page.days.map(d=><button key={d.date} aria-label={`Open calendar day ${d.date}, ${d.count} events`} className="border rounded p-3" onClick={()=>void load('DAY',d.date)}><span>{Number(d.date.slice(-2))}</span><span className="block text-xs">{d.count} events</span></button>)}</div>}
   {page.undatedCount>0&&<p>Undated Tithi: {page.undatedCount} events. Conversion unavailable; these events are not assigned to a day.</p>}
   {!page.items.length&&<p>No accessible events in this period.</p>}
   {groups.map(group=><div key={group}><h3>{group==='UNDATED'?'Undated Tithi — conversion unavailable':group}</h3>{page.items.filter(e=>(e.displayDate??'UNDATED')===group).map(e=><div key={e.id} className="border rounded p-3"><h4>{e.title}</h4><p>{e.startsAt?`AD instant: ${e.startsAt}`:e.solarDate?`BS: ${e.solarDate}`:`Tithi: ${e.tithiYearBs} / ${e.tithiMonthBs} · ${e.tithiPaksha} ${e.tithiNumber}`}</p><p>{e.eventType} · {e.lifecycleState}</p><p>{e.description}</p></div>)}</div>)}
   <button disabled={busy} onClick={()=>void load()} className="border p-2">First calendar period page</button><button disabled={busy||!page.nextBefore} onClick={()=>void load(view,date,page.nextBefore!)} className="border p-2">More period events</button>
  </>}
 </section>;
}
