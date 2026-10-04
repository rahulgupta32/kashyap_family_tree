'use client';
import {useEffect,useRef,useState} from 'react';
import {useAuth} from '../../context/auth-context';
const API=process.env.NEXT_PUBLIC_API_URL||'http://127.0.0.1:3000';
export default function MediaOperations(){
 const {user,accessToken,isLoading}=useAuth();const [runs,setRuns]=useState<any[]>([]),[report,setReport]=useState<any>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[selected,setSelected]=useState<string[]>([]),[notice,setNotice]=useState(''),[after,setAfter]=useState('0');
 const generation=useRef(0),current=useRef(user?.id);current.current=user?.id;
 async function request(path='',method='GET',data?:any){const response=await fetch(`${API}/media-operations/inventories${path}`,{method,headers:{Authorization:`Bearer ${accessToken}`,'Content-Type':'application/json'},cache:'no-store',...(data?{body:JSON.stringify(data)}:{})});const result=await response.json();if(!response.ok)throw new Error(result.message||'Operation unavailable');return result;}
 useEffect(()=>{const mine=++generation.current;setReport(null);setSelected([]);setNotice('');setError('');setBusy(false);if(!accessToken){setRuns([]);return;}void request().then(value=>{if(mine===generation.current)setRuns(value);}).catch(e=>{if(mine===generation.current)setError(e.message);});return()=>{generation.current++;};},[accessToken,user?.id]);
 async function operate(work:()=>Promise<any>,runId?:string,cursor='0'){
  if(busy)return;const mine=generation.current,owner=user?.id;setBusy(true);setError('');setNotice('');
  try{const result=await work();if(mine!==generation.current||current.current!==owner)return;const id=runId||result?.id;if(id){const value=await request(`/${id}?after=${cursor}`);if(mine!==generation.current)return;setReport(value);setAfter(cursor);setSelected([]);}const list=await request();if(mine!==generation.current)return;setRuns(list);if(result?.scheduled!==undefined)setNotice(`Scheduled: ${result.scheduled}; skipped: ${result.skipped}`);}catch(e:any){if(mine===generation.current)setError(e.message);}finally{if(mine===generation.current)setBusy(false);}
 }
 if(isLoading)return <p>लोड हुँदैछ / Loading</p>;
 if(!user||!accessToken)return <p>साइन इन गर्नुहोस् / Sign in to continue</p>;
 return <section className="space-y-5"><h1 className="text-2xl font-bold">मिडिया सञ्चालन / Media operations</h1><p>Check private storage and resume interrupted inventories. Findings describe observations at scan time. Recovery schedules eligible existing assets after checking their current state.</p><p>Unreferenced objects require review. This workflow does not delete them or release legal holds.</p>
 {error&&<p role="alert" className="text-red-700">{error}</p>}{notice&&<p role="status">{notice}</p>}
 <button className="border rounded p-2" disabled={busy||runs.some(r=>r.status==='RUNNING')} onClick={()=>void operate(()=>request('','POST',{}))}>नयाँ जाँच / Start inventory</button>
 <ul>{runs.map(run=><li key={run.id}><button disabled={busy} className="underline py-2" onClick={()=>void operate(()=>request(`/${run.id}`),run.id)}>{run.status} · {run.phase} · {new Date(run.created_at).toLocaleString()}</button></li>)}</ul>
 {report&&<div className="space-y-4"><h2 className="text-lg font-semibold">{report.run.status} · {report.run.phase}</h2>
 {report.run.status==='RUNNING'&&<div className="flex gap-3"><button disabled={busy} className="border rounded p-2" onClick={()=>void operate(()=>request(`/${report.run.id}/advance`,'POST',{}),report.run.id)}>अर्को चरण जाँच / Scan next batch</button><button disabled={busy} className="border rounded p-2" onClick={()=>void operate(()=>request(`/${report.run.id}/cancel`,'POST',{}),report.run.id)}>जाँच रोक्नुहोस् / Cancel inventory</button></div>}
 <ul>{report.summary.map((entry:any)=><li key={entry.finding}>{entry.finding}: {entry.count}</li>)}</ul>
 <table className="w-full text-left text-sm"><caption className="text-left">जाँच विवरण / Inventory findings</caption><thead><tr><th>Select</th><th>Finding</th><th>Asset</th><th>Area</th></tr></thead><tbody>{report.items.map((item:any)=><tr key={item.id} className="border-b"><td>{report.run.status==='COMPLETE'&&['IMAGE_JOB_MISSING','DELETION_QUEUE_MISSING'].includes(item.finding)&&<input type="checkbox" aria-label={`Select finding ${item.id}`} checked={selected.includes(String(item.id))} disabled={busy||!selected.includes(String(item.id))&&selected.length>=20} onChange={e=>setSelected(previous=>e.target.checked?[...previous,String(item.id)]:previous.filter(id=>id!==String(item.id)))}/>}</td><td>{item.finding}</td><td>{item.asset_id||item.item_key.slice(0,12)}</td><td>{item.bucket}</td></tr>)}</tbody></table>
 {after!=='0'&&<button disabled={busy} onClick={()=>void operate(()=>request(`/${report.run.id}`),report.run.id)}>First page</button>}{report.next&&<button disabled={busy} onClick={()=>void operate(()=>request(`/${report.run.id}?after=${report.next}`),report.run.id,report.next)}>Next findings</button>}
 {selected.length>0&&<button disabled={busy} className="border rounded p-2" onClick={()=>{if(window.confirm('Schedule selected image/deletion jobs? Current permissions and legal holds will be checked.'))void operate(()=>request(`/${report.run.id}/recover`,'POST',{itemIds:selected}),report.run.id,after);}}>चयन गरिएको पुनःस्थापना / Schedule selected recovery</button>}
 </div>}
 </section>;
}
