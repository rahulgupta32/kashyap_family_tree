'use client';
import {FormEvent,useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import {useAuth} from '../../context/auth-context';
import {ApiClient} from '../../lib/api-client';
export default function ExactLookupPage(){
 const {accessToken,user,isLoading}=useAuth();const current=useRef(accessToken);current.current=accessToken;const epoch=useRef(0);
 const [type,setType]=useState('PERSON'),[id,setId]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [record,setRecord]=useState<Awaited<ReturnType<typeof ApiClient.exactLookup>>|null>(null);
 useEffect(()=>{epoch.current++;setRecord(null);setError('');setId('');setBusy(false);},[accessToken]);
 const permitted=!!user?.roles.some(r=>['SUPER_ADMIN','CENTRAL_ADMIN','BRANCH_ADMIN','BRANCH_VERIFIER'].includes(r));
 const global=!!user?.roles.some(r=>['SUPER_ADMIN','CENTRAL_ADMIN'].includes(r));
 async function submit(e:FormEvent){e.preventDefault();if(!accessToken)return;const token=accessToken,request=++epoch.current;setBusy(true);setRecord(null);setError('');
  try{const data=await ApiClient.exactLookup(type,id.trim(),token);if(current.current===token&&request===epoch.current)setRecord(data);}catch(e){if(current.current===token&&request===epoch.current)setError((e as Error).message);}finally{if(current.current===token&&request===epoch.current)setBusy(false);}}
 if(isLoading)return <p>लोड हुँदैछ (Loading)…</p>;
 if(!accessToken)return <p><Link href="/login?next=/lookup">कृपया प्रवेश गर्नुहोस् (Sign in to use administrative lookup).</Link></p>;
 if(!permitted)return <p>प्रशासनिक अधिकार चाहिन्छ (Administrative authority required).</p>;
 return <section className="max-w-3xl space-y-4"><h1 className="text-2xl font-bold">ठ्याक्कै ID खोज (Exact ID lookup)</h1><p>आफ्नो अधिकार क्षेत्रका अभिलेख खोज्नुहोस् (Find records within your current authority).</p>
 <form onSubmit={submit} className="space-y-3"><label className="block">अभिलेख प्रकार (Record type)<select disabled={busy} value={type} onChange={e=>{setType(e.target.value);setRecord(null);setError('');}} className="border rounded p-2 block"><option value="PERSON">व्यक्ति (Person)</option>{global&&<option value="USER">खाता (User account)</option>}<option value="CLAIM">दाबी (Claim request)</option><option value="CHANGE_REQUEST">परिवर्तन (Change request)</option></select></label>
 <label className="block">अभिलेख ID (Record ID)<input required disabled={busy} value={id} onChange={e=>{setId(e.target.value);setRecord(null);}} maxLength={36} pattern="[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}" className="border rounded p-2 w-full"/></label>
 <button disabled={busy} className="border rounded p-2">{busy?'खोज हुँदैछ (Searching)…':'खोज्नुहोस् (Find exact ID)'}</button></form>
 {error&&<p role="alert">{error}</p>}
 {record&&<section aria-label="Exact lookup result" className="border rounded p-4"><h2>{record.type} · {record.id}</h2>{record.type==='PERSON'&&<Link href={`/people/${encodeURIComponent(String(record.result.id||record.id))}`}>व्यक्ति खोल्नुहोस् (Open person)</Link>}<dl className="space-y-3">{(record.type==='USER'?[['स्थिति (Status)',record.result.isActive?'Active':'Inactive'],['निलम्बन (Suspension)',record.result.isSuspended?'Suspended':'Not suspended'],['फोन प्रमाणीकरण (Phone verification)',record.result.isPhoneVerified?'Verified':'Unverified'],['व्यक्ति ID (Person ID)',record.result.personId],['भूमिकाहरू (Roles)',(record.result.roles as Array<{role:string;branchId:string|null}>).map(r=>r.role.replaceAll('_',' ')+(r.branchId?' · '+r.branchId:'')).join('; ')]]:record.type==='PERSON'?[['नेपाली नाम (Nepali name)',record.result.primaryNameNepali],['अङ्ग्रेजी नाम (English name)',record.result.primaryNameEnglish],['शाखा (Branch)',record.result.branchName],['पुस्ता (Generation)',record.result.generation],['जीवन स्थिति (Living status)',record.result.livingStatus]]:[['अनुरोध स्थिति (Request status)',record.result.status],['व्यक्ति ID (Person ID)',record.result.targetPersonId],['अनुरोधकर्ता ID (Requester ID)',record.result.claimantUserId||record.result.requesterUserId],['विवरण / कारण (Description / reason)',record.result.relationshipDescription||record.result.reason],['संस्करण (Version)',record.result.version]]).map(([label,value])=><div key={String(label)}><dt className="font-semibold">{String(label)}</dt><dd className="whitespace-pre-wrap break-words">{String(value??'—')}</dd></div>)}</dl>{record.type==='CLAIM'&&<Link href="/claims">दाबी समीक्षा खोल्नुहोस् (Open claim reviews)</Link>}{record.type==='CHANGE_REQUEST'&&<Link href="/change-requests">परिवर्तन समीक्षा खोल्नुहोस् (Open change reviews)</Link>}</section>}
 </section>;
}
