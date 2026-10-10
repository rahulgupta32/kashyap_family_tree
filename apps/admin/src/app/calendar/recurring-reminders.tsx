'use client';
import React,{useEffect,useLayoutEffect,useRef,useState} from 'react';
import {useAuth} from '../../context/auth-context';
import {ApiClient} from '../../lib/api-client';
import {CalendarEventDetailDto} from '@kashyap/contracts';

export function RecurringReminders({events}:{events:CalendarEventDetailDto[]}){
 const {accessToken,user,isLoading:sessionLoading}=useAuth();const epoch=useRef(0);
 const [rules,setRules]=useState<any[]>([]),[queue,setQueue]=useState<any[]>([]),[cursor,setCursor]=useState<string|null>(null),[queueCursor,setQueueCursor]=useState<string|null>(null);
 const [source,setSource]=useState(''),[time,setTime]=useState('09:00'),[policy,setPolicy]=useState(''),[reference,setReference]=useState(''),[reason,setReason]=useState(''),[consent,setConsent]=useState(false);
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[preview,setPreview]=useState<any>(null);
 const isReviewer=user?.roles?.includes('SUPER_ADMIN' as any);
 const sources=events.filter(e=>e.createdByUserId===user?.id&&e.lifecycleState!=='CANCELLED'&&e.startsAt&&!e.recurrenceRuleId&&['GENERAL_EVENT','COMMUNITY_MEETING'].includes(e.eventType));
 async function request(path:string,method='GET',body?:unknown){if(!accessToken)throw new Error('Session required');return ApiClient.calendarRecurrences<any>(path,accessToken,method,body);}
 async function refresh(generation:number){const [own,review]=await Promise.all([request(''),isReviewer?request('?queue=true'):Promise.resolve({items:[],nextAfter:null})]);if(epoch.current!==generation)return;setRules(own.items);setCursor(own.nextAfter);setQueue(review.items);setQueueCursor(review.nextAfter);}
 const authorityKey=user?.roles?.slice().sort().join(',');
 useLayoutEffect(()=>{epoch.current++;setRules([]);setQueue([]);setCursor(null);setQueueCursor(null);setSource('');setReference('');setReason('');setConsent(false);setPreview(null);setMessage('');setBusy(false);},[user?.id,authorityKey]);
 useLayoutEffect(()=>{epoch.current++;setPreview(null);setBusy(Boolean(accessToken));},[accessToken]);
 useEffect(()=>{const generation=epoch.current;
  if(sessionLoading||!accessToken)return;
  refresh(generation).catch(e=>{if(epoch.current===generation)setMessage(e.message);}).finally(()=>{if(epoch.current===generation)setBusy(false);});return()=>{epoch.current++;};
 },[accessToken,sessionLoading,isReviewer,user?.id,authorityKey]);
 async function run(action:()=>Promise<void>,reload=true){if(busy)return;const generation=epoch.current;setBusy(true);setMessage('');setPreview(null);try{await action();if(reload&&epoch.current===generation)await refresh(generation);}catch(e:any){if(epoch.current===generation)setMessage(e.message);}finally{if(epoch.current===generation)setBusy(false);}}
 function rows(items:any[],review:boolean){return items.map(r=><li key={r.id} className="border rounded p-3 space-y-2">
  <p>{r.source_date} · {r.local_time} Asia/Kathmandu · {r.leap_policy} · {r.state} · v{r.version}</p>
  <p>प्रमाण सन्दर्भ (Evidence): {r.source_ref}</p>
  <p>मूल कार्यक्रम (Source): {r.source_event_id} · v{r.source_version}</p>
  <div className="flex flex-wrap gap-3">
   <button disabled={busy} onClick={()=>run(async()=>{const generation=epoch.current;const p=await request(`/${r.id}/preview?year=${new Date().getUTCFullYear()+1}`);if(epoch.current===generation)setPreview(p);})}>अर्को वर्ष हेर्नुहोस् (Preview next year)</button>
   {review?['APPROVED','REJECTED'].map(decision=><button key={decision} disabled={busy||reason.trim().length<10} onClick={()=>run(async()=>{await request(`/${r.id}/decisions`,'POST',{version:r.version,decision,reason});})}>{decision==='APPROVED'?'स्वीकृत (Approve)':'अस्वीकृत (Reject)'}</button>):['PENDING','APPROVED'].includes(r.state)&&<button disabled={busy||reason.trim().length<10} onClick={()=>run(async()=>{await request(`/${r.id}/decisions`,'POST',{version:r.version,decision:'WITHDRAWN',reason});})}>सहमति फिर्ता (Withdraw)</button>}
  </div>
 </li>);}
 async function more(review:boolean){const generation=epoch.current,current=review?queueCursor:cursor;if(!current)return;const page=await request(`?after=${encodeURIComponent(current)}${review?'&queue=true':''}`);if(epoch.current!==generation)return;if(review){setQueue(q=>[...q,...page.items]);setQueueCursor(page.nextAfter);}else{setRules(q=>[...q,...page.items]);setCursor(page.nextAfter);}}
 return <section className="border rounded-xl p-4 space-y-4" aria-label="Annual recurring reminders">
  <h2 className="font-bold">वार्षिक निजी सम्झना (Private annual reminders)</h2>
  <p>स्पष्ट AD मिति भएको आफ्नै सामान्य कार्यक्रमबाट मात्र। स्वतन्त्र स्वीकृति आवश्यक। तिथि तथा सांस्कृतिक पुनरावृत्ति उपलब्ध छैन। (Own Gregorian general events only; independent approval required. Cultural recurrence is unavailable.)</p>
  <p>वार्षिक सम्झना मूल कार्यक्रमको अर्को वर्षदेखि सुरु हुन्छ। (Annual reminders begin in the year after the source event.)</p>
  <form className="grid gap-3" onSubmit={e=>{e.preventDefault();const chosen=sources.find(e=>e.id===source);if(!chosen||sessionLoading)return;run(async()=>{await request('','POST',{sourceEventId:source,sourceVersion:chosen.version,localTime:time,leapDayPolicy:policy,sourceRef:reference,consent});});}}>
   <fieldset disabled={busy||sessionLoading||!accessToken} className="grid gap-3">
   <label>मूल कार्यक्रम (Source event)<select required value={source} onChange={e=>setSource(e.target.value)}><option value="">छान्नुहोस् (Select)</option>{sources.map(e=><option key={e.id} value={e.id}>{e.title} · v{e.version}</option>)}</select></label>
   <label>नेपाल समय (Nepal time)<input required type="time" value={time} onChange={e=>setTime(e.target.value)}/></label>
   <label>फेब्रुअरी २९ नीति (Leap-day policy)<select required value={policy} onChange={e=>setPolicy(e.target.value)}><option value="">स्पष्ट नीति छान्नुहोस् (Choose explicitly)</option><option value="SKIP_YEAR">वर्ष छोड्ने (Skip non-leap year)</option><option value="FEBRUARY_28">फेब्रुअरी २८ (February 28)</option><option value="MARCH_01">मार्च १ (March 1)</option></select></label>
   <label>मिति प्रमाण सन्दर्भ (Date evidence reference)<input required minLength={10} maxLength={500} value={reference} onChange={e=>setReference(e.target.value)}/></label>
   <label><input type="checkbox" required checked={consent} onChange={e=>setConsent(e.target.checked)}/> निजी वार्षिक सम्झनामा स्पष्ट सहमति (I consent to private annual reminders)</label>
   <button disabled={busy||!accessToken}>स्वीकृतिका लागि प्रस्ताव (Propose for approval)</button>
   </fieldset>
  </form>
  <label>निर्णय वा फिर्ताको कारण (Review or withdrawal reason)<input minLength={10} maxLength={1000} value={reason} onChange={e=>setReason(e.target.value)}/></label>
  {message&&<p role="alert">{message}</p>}
  {preview&&<p role="status">{preview.year}: {preview.startsAt??'यो वर्ष सम्झना छैन (No occurrence this year)'} · {preview.deliveryEnabled?'स्वीकृत (Approved and current)':'पठाइँदैन (Delivery blocked)'} · {preview.ruleVersion}</p>}
  <h3>आफ्ना प्रस्ताव (My proposals)</h3><ul className="space-y-3">{rows(rules,false)}</ul>
  {cursor&&<button disabled={busy} onClick={()=>run(()=>more(false),false)}>थप प्रस्ताव (More proposals)</button>}
  {isReviewer&&<><h3>स्वतन्त्र समीक्षा (Independent review queue)</h3><ul className="space-y-3">{rows(queue,true)}</ul>{queueCursor&&<button disabled={busy} onClick={()=>run(()=>more(true),false)}>थप समीक्षा (More reviews)</button>}</>}
 </section>;
}
