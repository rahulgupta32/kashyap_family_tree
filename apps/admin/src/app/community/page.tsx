'use client';
import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../../context/auth-context';
import { ApiClient } from '../../lib/api-client';

interface Media { assetId:string; mimeType:string; fileName:string }
interface Locality { district:string;municipality:string }
interface Sharing { localityVisibility:string;contactVisibility:string;contactConsent:boolean }
interface Post { canViewReports?:boolean;canEscalate?:boolean;escalated?:boolean; locality?:Locality;contactPhone?:string;sharing?:Sharing; media?:Media; id:string; title:string; content:string; category:string; moderationStatus:string; version:number; createdAt:string; likesCount:number; isLiked:boolean; commentsCount:number; canModerate:boolean; canDelete:boolean; canAppeal:boolean; moderationOutcome?:{decision:string;notes:string}; appealReason?:string; canEdit:boolean; canViewRevisions:boolean; reportsCount?:number }
interface Revision { locality?:Locality;localityVisibility?:string;contactVisibility?:string; media?:Media[]; version:number; title:string; content:string; category:string; reason:string; createdAt:string }
interface Decision { version:number; decision:string; notes:string; createdAt:string; appeal?:{reason:string;status:string;createdAt:string;resolvedAt:string|null} }
interface DecisionPage { items:Decision[]; nextBeforeVersion:number|null }
interface Evidence { sequence:string;reason:string;status:string;reportedVersion?:number|null;submittedVersion?:number;reviewNotes?:string|null;createdAt:string;resolvedAt:string|null }
interface CasePage { version:number;reports:{items:Evidence[];nextBefore:string|null};escalations:{items:Evidence[];nextBefore:string|null} }
interface Comment { id:string; content:string; parentCommentId?:string }
export default function CommunityPage(){
 const {accessToken,user,isLoading}=useAuth();
 const session=useRef(accessToken);session.current=accessToken;
 const [posts,setPosts]=useState<Post[]>([]),[branches,setBranches]=useState<any[]>([]),[queue,setQueue]=useState(false);
 const [title,setTitle]=useState(''),[content,setContent]=useState(''),[category,setCategory]=useState('DISCUSSION'),[branch,setBranch]=useState('');
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [open,setOpen]=useState<string|null>(null),[comments,setComments]=useState<Comment[]>([]),[comment,setComment]=useState('');
 const [review,setReview]=useState<Post|null>(null),[notes,setNotes]=useState(''),[report,setReport]=useState<Post|null>(null);
 const [editing,setEditing]=useState<Post|null>(null),[editTitle,setEditTitle]=useState(''),[editContent,setEditContent]=useState(''),[editReason,setEditReason]=useState('');
 const [history,setHistory]=useState<Post|null>(null),[revisions,setRevisions]=useState<Revision[]>([]),[historyPage,setHistoryPage]=useState(1);
 const [decisionPost,setDecisionPost]=useState<Post|null>(null),[decisionPage,setDecisionPage]=useState<DecisionPage>({items:[],nextBeforeVersion:null});
 const [casePost,setCasePost]=useState<Post|null>(null),[casePage,setCasePage]=useState<CasePage|null>(null),[caseCursor,setCaseCursor]=useState({report:'',escalation:''});
 async function loadCase(p:Post,report='',escalation=''){await action(async()=>{setCasePage(await ApiClient.community<CasePage>(`/posts/${p.id}/reports?${new URLSearchParams({...report?{before:report}:{},...escalation?{beforeEscalation:escalation}:{}})}`,accessToken!));setCaseCursor({report,escalation});setCasePost(p);});}
 const [mediaPost,setMediaPost]=useState<Post|null>(null),[image,setImage]=useState<File|null>(null),[imageReason,setImageReason]=useState(''),[uploadBody,setUploadBody]=useState<any>(null);
 const [sharingPost,setSharingPost]=useState<Post|null>(null),[district,setDistrict]=useState(''),[municipality,setMunicipality]=useState(''),[shareLocality,setShareLocality]=useState(false),[shareContact,setShareContact]=useState(false),[sharingReason,setSharingReason]=useState('');
 async function downloadImage(postId:string,m:Media,variant='display'){await action(async()=>{const token=accessToken!;const blob=await ApiClient.communityImage(postId,m.assetId,token,variant);if(session.current!==token)return;const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=variant==='original'?m.fileName:'community-display.webp';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});}
 const load=useCallback(async()=>{if(!accessToken)return;try{setPosts(await ApiClient.community<Post[]>(`/posts?queue=${queue}`,accessToken));setError('');}catch(e){setError((e as Error).message);}},[accessToken,queue]);
 useEffect(()=>{void load();},[load]);
 useEffect(()=>{ApiClient.listBranches().then(setBranches).catch(()=>setBranches([]));},[]);
 async function action(work:()=>Promise<void>){setBusy(true);setError('');setNotice('');try{await work();await load();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 async function submit(e:FormEvent){e.preventDefault();if(!accessToken)return;await action(async()=>{await ApiClient.community('/posts',accessToken,'POST',{title,content,category,...(branch?{branchId:branch}:{})});setTitle('');setContent('');setNotice('समीक्षाका लागि पठाइयो (Submitted for independent moderation).');});}
 async function showComments(p:Post){if(!accessToken)return;await action(async()=>{setComments(await ApiClient.community<Comment[]>(`/posts/${p.id}/comments`,accessToken));setOpen(p.id);});}
 if(isLoading)return <p>लोड हुँदैछ…</p>;
 if(!accessToken)return <p>समुदाय हेर्न कृपया प्रवेश गर्नुहोस् (Sign in to view the community).</p>;
 return <section className="max-w-4xl space-y-5">
  <header><h1 className="text-2xl font-bold">समुदाय (Community)</h1><p className="text-slate-600">परिवारका समाचार र छलफल (Family news and discussions)</p></header>
  {error&&<p role="alert" className="rounded bg-red-50 p-3 text-red-800">{error}</p>}
  {notice&&<p role="status" className="rounded bg-green-50 p-3 text-green-800">{notice}</p>}
  <form onSubmit={submit} className="rounded-xl border bg-white p-5 space-y-3" aria-label="Create community post">
   <label className="block">शीर्षक (Title)<input required maxLength={180} value={title} onChange={e=>setTitle(e.target.value)} className="block border rounded p-2 w-full"/></label>
   <label className="block">सन्देश (Message)<textarea required maxLength={10000} value={content} onChange={e=>setContent(e.target.value)} className="block border rounded p-2 w-full" rows={4}/></label>
   <div className="flex flex-wrap gap-4"><label>प्रकार (Category)<select value={category} onChange={e=>setCategory(e.target.value)} className="block border rounded p-2">
    <option value="DISCUSSION">छलफल (Discussion)</option><option value="ANNOUNCEMENT">सूचना (Announcement)</option><option value="RITUAL">परम्परा (Tradition)</option><option value="ACHIEVEMENT">उपलब्धि (Achievement)</option><option value="MISSING_PERSON">हराएको व्यक्ति (Missing person)</option><option value="PROPERTY_ROOM">घर / कोठा उपलब्धता (Property / room)</option><option value="ASSISTANCE">सहयोग अनुरोध (Assistance)</option><option value="COMMUNITY_PROGRAM">सामुदायिक कार्यक्रम (Community program)</option>
   </select></label><label>दायरा (Audience)<select value={branch} onChange={e=>setBranch(e.target.value)} className="block border rounded p-2"><option value="">समुदाय (Community)</option>{branches.map(b=><option key={b.id} value={b.id}>{b.name_nepali||b.nameNepali||b.code}</option>)}</select></label></div>
   <button disabled={busy} className="rounded bg-slate-900 text-white px-4 py-2">समीक्षामा पठाउनुहोस् (Submit for review)</button>
  </form>
  <div className="flex gap-3"><button onClick={()=>setQueue(false)} aria-pressed={!queue} className="border rounded px-3 py-2">समाचार (Feed)</button>
   {user?.roles.some(r=>['SUPER_ADMIN','CENTRAL_ADMIN','BRANCH_ADMIN','COMMUNITY_MODERATOR'].includes(r))&&<button onClick={()=>setQueue(true)} aria-pressed={queue} className="border rounded px-3 py-2">समीक्षा (Moderation queue)</button>}
   <button onClick={()=>void load()} className="border rounded px-3 py-2">रिफ्रेस (Refresh)</button></div>
  {!posts.length&&<p>कुनै पोस्ट छैन (No posts yet).</p>}
  {posts.map(p=><article key={p.id} aria-label={p.title} className="rounded-xl border bg-white p-5 space-y-3">
   <div className="flex justify-between gap-3"><h2 className="font-bold text-lg">{p.title}</h2><span className="text-xs">{p.moderationStatus}</span></div>
   <p className="whitespace-pre-wrap break-words">{p.content}</p><p className="text-xs text-slate-500">{new Date(p.createdAt).toLocaleString()} · {p.category}</p>
   {p.moderationOutcome&&<p>Moderation: {p.moderationOutcome.decision} · {p.moderationOutcome.notes}</p>}
   {p.locality&&<p>स्थान (Approximate locality): {p.locality.district} · {p.locality.municipality}</p>}
   {p.contactPhone&&<p>सम्पर्क (Shared contact): {p.contactPhone}</p>}
   {p.escalated&&<p>Escalated: awaiting independent central review.</p>}
   {p.appealReason&&<p>Appeal: {p.appealReason}</p>}
   <div className="flex flex-wrap gap-3">
    {p.canAppeal&&<button disabled={busy} className="border rounded px-3 py-1" onClick={()=>{const reason=window.prompt('अपिलको कारण (Appeal reason, at least 5 characters)');if(reason)void action(async()=>{await ApiClient.community(`/posts/${p.id}/appeal`,accessToken,'POST',{version:p.version,reason});setNotice('Appeal submitted for independent review.');});}}>अपिल (Appeal)</button>}
    {p.moderationStatus==='PUBLISHED'&&<><button disabled={busy} aria-pressed={p.isLiked} onClick={()=>void action(async()=>{await ApiClient.community(`/posts/${p.id}/like`,accessToken,'PUT',{liked:!p.isLiked});})} className="border rounded px-3 py-1">मन पर्‍यो (Like) · {p.likesCount}</button><button disabled={busy} onClick={()=>void showComments(p)} className="border rounded px-3 py-1">टिप्पणी (Comments) · {p.commentsCount}</button><button disabled={busy} onClick={()=>{setReport(p);setNotes('');}} className="border rounded px-3 py-1">रिपोर्ट (Report)</button></>}
    {p.canModerate&&p.moderationStatus==='PENDING'&&<button disabled={busy} onClick={()=>{setReview(p);setNotes('');}} className="border rounded px-3 py-1">समीक्षा गर्नुहोस् (Review)</button>}
    {p.canViewReports&&<button disabled={busy} onClick={()=>void loadCase(p)} className="border rounded px-3 py-1">रिपोर्ट प्रमाण (Report evidence)</button>}
    {p.canEscalate&&<button disabled={busy} onClick={()=>{const reason=window.prompt('Escalation reason (at least 5 characters)');if(reason)void action(async()=>{await ApiClient.community(`/posts/${p.id}/escalate`,accessToken,'POST',{version:p.version,reason});setNotice('Escalated for independent central review.');});}} className="border rounded px-3 py-1">केन्द्रीय समीक्षा (Escalate to central)</button>}
    {p.canEdit&&<button disabled={busy} onClick={()=>{setEditing(p);setEditTitle(p.title);setEditContent(p.content);setEditReason('');}} className="border rounded px-3 py-1">सम्पादन (Edit)</button>}
    {p.canViewRevisions&&<button disabled={busy} onClick={()=>void action(async()=>{setRevisions(await ApiClient.community<Revision[]>(`/posts/${p.id}/revisions`,accessToken));setHistoryPage(1);setHistory(p);})} className="border rounded px-3 py-1">संस्करण इतिहास (Revision history)</button>}
    {p.canViewRevisions&&<button disabled={busy} onClick={()=>void action(async()=>{setDecisionPage(await ApiClient.community<DecisionPage>(`/posts/${p.id}/moderation-history`,accessToken));setDecisionPost(p);})} className="border rounded px-3 py-1">समीक्षा इतिहास (Moderation history)</button>}
    {p.media&&<button disabled={busy} onClick={()=>void downloadImage(p.id,p.media!)} className="border rounded px-3 py-1">तस्बिर हेर्नुहोस् (Download image)</button>}
    {p.media&&p.canViewRevisions&&<button disabled={busy} onClick={()=>void downloadImage(p.id,p.media!,'original')} className="border rounded px-3 py-1">Original image</button>}
    {p.media&&p.canEdit&&<><button disabled={busy} onClick={()=>void action(async()=>{await ApiClient.community(`/posts/${p.id}/media/${p.media!.assetId}/retry`,accessToken,'POST');setNotice('Image processing scheduled.');})} className="border rounded px-3 py-1">Retry image processing</button><button disabled={busy} onClick={()=>{const reason=window.prompt('Image removal reason (at least 5 characters)');if(reason)void action(async()=>{await ApiClient.community(`/posts/${p.id}/media`,accessToken,'DELETE',{version:p.version,reason});});}} className="border rounded px-3 py-1">Remove image</button></>}
    {!p.media&&p.canEdit&&<button disabled={busy} onClick={()=>{setMediaPost(p);setImage(null);setImageReason('');setUploadBody(null);}} className="border rounded px-3 py-1">तस्बिर थप्नुहोस् (Add image)</button>}
    {p.canEdit&&<button disabled={busy} onClick={()=>{setSharingPost(p);setDistrict(p.locality?.district||'');setMunicipality(p.locality?.municipality||'');setShareLocality(p.sharing?.localityVisibility==='VERIFIED_COMMUNITY');setShareContact(p.sharing?.contactConsent===true);setSharingReason('');}} className="border rounded px-3 py-1">स्थान / सम्पर्क गोपनीयता (Location/contact sharing)</button>}
    {p.canDelete&&<button disabled={busy} onClick={()=>{if(window.confirm('यो पोस्ट हटाउने? (Remove this post?)'))void action(async()=>{await ApiClient.community(`/posts/${p.id}`,accessToken,'DELETE');});}} className="border rounded px-3 py-1">हटाउनुहोस् (Remove)</button>}
   </div>
   {open===p.id&&<div className="border-t pt-3 space-y-2"><ul>{comments.map(c=><li key={c.id} className="border-b py-2 whitespace-pre-wrap">{c.parentCommentId?'↳ ':''}{c.content}</li>)}</ul><form onSubmit={e=>{e.preventDefault();void action(async()=>{await ApiClient.community(`/posts/${p.id}/comments`,accessToken,'POST',{content:comment});setComment('');setComments(await ApiClient.community<Comment[]>(`/posts/${p.id}/comments`,accessToken));});}}><label>टिप्पणी (Your comment)<textarea required maxLength={2000} value={comment} onChange={e=>setComment(e.target.value)} className="block w-full rounded border p-2"/></label><button disabled={busy} className="border rounded px-3 py-2 mt-2">पठाउनुहोस् (Send comment)</button></form></div>}
  </article>)}
  {sharingPost&&<div role="dialog" aria-modal="true" aria-label="Community location and contact sharing" className="fixed inset-0 bg-black/40 flex items-center justify-center p-5 z-50"><form className="bg-white rounded-xl p-6 max-w-lg w-full space-y-3" onSubmit={e=>{e.preventDefault();void action(async()=>{await ApiClient.community(`/posts/${sharingPost.id}/sharing`,accessToken,'PUT',{version:sharingPost.version,reason:sharingReason,locality:district.trim()||municipality.trim()?{district,municipality}:null,localityVisibility:shareLocality?'VERIFIED_COMMUNITY':'PRIVATE',contactVisibility:shareContact?'VERIFIED_COMMUNITY':'PRIVATE',contactConsent:shareContact});setSharingPost(null);setNotice('Sharing changes submitted for independent review.');});}}>
   <h2>स्थान / सम्पर्क गोपनीयता (Location/contact sharing)</h2>{error&&<p role="alert">{error}</p>}
   <p>Use district and municipality names only. Do not enter a street address, house number or coordinates. Private locality is visible only to you and scoped moderators.</p>
   <label className="block">जिल्ला (District)<input aria-label="Community district" maxLength={80} value={district} onChange={e=>setDistrict(e.target.value)} className="block border rounded p-2 w-full"/></label>
   <label className="block">नगरपालिका (Municipality)<input aria-label="Community municipality" maxLength={80} value={municipality} onChange={e=>setMunicipality(e.target.value)} className="block border rounded p-2 w-full"/></label>
   <label className="block"><input type="checkbox" checked={shareLocality} onChange={e=>setShareLocality(e.target.checked)}/> Share approximate locality with verified post readers</label>
   <label className="block"><input type="checkbox" checked={shareContact} onChange={e=>setShareContact(e.target.checked)}/> I consent to share my verified phone with verified post readers</label>
   <p>Location/contact sharing also requires the corresponding current profile address/contact setting to allow the verified community, an active account and an established adult profile. Numbers are never copied into revision history. Changes require independent review.</p>
   <label className="block">कारण (Sharing change reason)<textarea aria-label="Sharing change reason" required minLength={5} maxLength={1000} value={sharingReason} onChange={e=>setSharingReason(e.target.value)} className="block border rounded p-2 w-full"/></label>
   <button disabled={busy||sharingReason.trim().length<5} className="border rounded p-2">Save sharing for review</button><button type="button" disabled={busy} onClick={()=>setSharingPost(null)} className="border rounded p-2">Cancel sharing changes</button>
  </form></div>}
  {mediaPost&&<div role="dialog" aria-modal="true" aria-label="Add community image" className="fixed inset-0 bg-black/40 flex items-center justify-center p-5 z-50"><form className="bg-white rounded-xl p-6 max-w-lg w-full space-y-3" onSubmit={e=>{e.preventDefault();void action(async()=>{
    let body=uploadBody;if(!body){if(!image||image.size>5*1024*1024||!['image/png','image/jpeg','image/webp'].includes(image.type))throw new Error('Choose PNG, JPEG or WebP up to 5 MB');
      const dataBase64=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(new Error('Unable to read image'));reader.readAsDataURL(image);});
      body={version:mediaPost.version,reason:imageReason,clientUploadId:crypto.randomUUID(),mimeType:image.type,dataBase64};setUploadBody(body);
    }
    await ApiClient.community(`/posts/${mediaPost.id}/media`,accessToken,'POST',body);setMediaPost(null);setNotice('Image submitted for independent review.');
   });}}><h2>Add community image</h2>{error&&<p role="alert">{error}</p>}<p>PNG, JPEG or WebP, up to 5 MB. Image changes require independent review. Feed downloads remove image metadata.</p>
   <label>Image<input aria-label="Community image file" type="file" accept="image/png,image/jpeg,image/webp" disabled={busy||!!uploadBody} onChange={e=>setImage(e.target.files?.[0]||null)}/></label>
   <label>Image change reason<textarea aria-label="Image change reason" required minLength={5} maxLength={1000} disabled={busy||!!uploadBody} value={imageReason} onChange={e=>setImageReason(e.target.value)}/></label>
   <button disabled={busy||(!uploadBody&&(!image||imageReason.trim().length<5))} className="border rounded p-2">{uploadBody?'Retry image upload':'Submit image for review'}</button><button type="button" disabled={busy} onClick={()=>setMediaPost(null)} className="border rounded p-2">Cancel image upload</button>
  </form></div>}
  {editing&&<div role="dialog" aria-modal="true" aria-label="Edit community post" className="fixed inset-0 bg-black/40 flex items-center justify-center p-5 z-50"><form className="bg-white rounded-xl p-6 max-w-lg w-full space-y-3" onSubmit={e=>{e.preventDefault();void action(async()=>{await ApiClient.community(`/posts/${editing.id}`,accessToken,'PUT',{title:editTitle,content:editContent,category:editing.category,version:editing.version,reason:editReason});setEditing(null);setNotice('Changes submitted for independent moderation.');});}}>
   <h2 className="font-bold">सम्पादन (Edit post)</h2><p>Changes require independent review before publication.</p>
   <label className="block">Title<input required maxLength={180} value={editTitle} onChange={e=>setEditTitle(e.target.value)} className="block border rounded w-full p-2"/></label>
   <label className="block">Message<textarea aria-label="Edit message" required maxLength={10000} value={editContent} onChange={e=>setEditContent(e.target.value)} className="block border rounded w-full p-2"/></label>
   <label className="block">Edit reason<textarea required minLength={5} maxLength={1000} value={editReason} onChange={e=>setEditReason(e.target.value)} className="block border rounded w-full p-2"/></label>
   <button disabled={busy||editReason.trim().length<5} className="border rounded p-2">Save for review</button><button type="button" disabled={busy} onClick={()=>setEditing(null)} className="border rounded p-2">Cancel</button>
  </form></div>}
  {history&&<div role="dialog" aria-modal="true" aria-label="Community revision history" className="fixed inset-0 bg-black/40 flex items-center justify-center p-5 z-50"><div className="bg-white rounded-xl p-6 max-w-lg w-full max-h-[85vh] overflow-auto space-y-3"><h2 className="font-bold">संस्करण इतिहास (Revision history)</h2>
   <p>Content versions are retained for review. Older edits before history was enabled are unavailable.</p>
   {revisions.map(r=><section key={r.version} className="border rounded p-3"><h3 className="font-bold">Version {r.version} · {r.title}</h3><p className="whitespace-pre-wrap break-words">{r.content}</p><p>{r.category} · {new Date(r.createdAt).toLocaleString()}</p><p>Reason: {r.reason}</p>{r.locality&&<p>Locality: {r.locality.district} · {r.locality.municipality} · {r.localityVisibility}</p>}<p>Contact sharing: {r.contactVisibility}</p>{r.media?.map(m=><button key={m.assetId} disabled={busy} onClick={()=>void downloadImage(history.id,m)} className="border rounded p-2">Revision image</button>)}</section>)}
   <button disabled={busy||historyPage===1} onClick={()=>void action(async()=>{setRevisions(await ApiClient.community<Revision[]>(`/posts/${history.id}/revisions?page=${historyPage-1}`,accessToken));setHistoryPage(historyPage-1);})} className="border rounded p-2">Newer versions</button>
   <button disabled={busy||revisions.length<50} onClick={()=>void action(async()=>{setRevisions(await ApiClient.community<Revision[]>(`/posts/${history.id}/revisions?page=${historyPage+1}`,accessToken));setHistoryPage(historyPage+1);})} className="border rounded p-2">Older versions</button>
   <button disabled={busy} onClick={()=>setHistory(null)} className="border rounded p-2">Close history</button>
  </div></div>}
  {decisionPost&&<div role="dialog" aria-modal="true" aria-label="Community moderation history" className="fixed inset-0 bg-black/40 flex items-center justify-center p-5 z-50"><div className="bg-white rounded-xl p-6 max-w-lg w-full max-h-[85vh] overflow-auto space-y-3">
   <h2 className="font-bold">समीक्षा इतिहास (Moderation history)</h2>
   {!decisionPage.items.length&&<p>No recorded decisions.</p>}
   {decisionPage.items.map(d=><section key={d.version} className="border rounded p-3"><h3>Version {d.version} · {d.decision}</h3><p className="whitespace-pre-wrap break-words">{d.notes}</p><p>{new Date(d.createdAt).toLocaleString()}</p>{d.appeal&&<div><p>Appeal: {d.appeal.status}</p><p className="whitespace-pre-wrap break-words">{d.appeal.reason}</p><p>{new Date(d.appeal.createdAt).toLocaleString()}{d.appeal.resolvedAt&&` · ${new Date(d.appeal.resolvedAt).toLocaleString()}`}</p></div>}</section>)}
   <button disabled={busy} onClick={()=>void action(async()=>setDecisionPage(await ApiClient.community<DecisionPage>(`/posts/${decisionPost.id}/moderation-history`,accessToken)))} className="border rounded p-2">Latest decisions</button>
   <button disabled={busy||decisionPage.nextBeforeVersion===null} onClick={()=>void action(async()=>setDecisionPage(await ApiClient.community<DecisionPage>(`/posts/${decisionPost.id}/moderation-history?beforeVersion=${decisionPage.nextBeforeVersion}`,accessToken)))} className="border rounded p-2">Older decisions</button>
   <button disabled={busy} onClick={()=>setDecisionPost(null)} className="border rounded p-2">Close moderation history</button>
  </div></div>}
  {casePost&&casePage&&<div role="dialog" aria-modal="true" aria-label="Community report evidence" className="fixed inset-0 bg-black/40 flex items-center justify-center p-5 z-50"><div className="bg-white rounded-xl p-6 max-w-lg w-full max-h-[85vh] overflow-auto space-y-3">
   <h2>रिपोर्ट प्रमाण (Report evidence)</h2>{error&&<p role="alert">{error}</p>}<p>Current post version: {casePage.version}. Reporter identities are private. Earlier reports may concern an older content version; inspect revision and moderation history before deciding.</p>
   <h3>Reports</h3>{!casePage.reports.items.length&&<p>No recorded reports.</p>}
   {casePage.reports.items.map(r=><section key={r.sequence} className="border rounded p-3"><p>{r.status} · Reported version: {r.reportedVersion??'Unavailable for historical report'}</p><p className="whitespace-pre-wrap break-words">{r.reason}</p><p>{new Date(r.createdAt).toLocaleString()}</p>{r.reviewNotes&&<p>Resolution: {r.reviewNotes}</p>}</section>)}
   <button disabled={busy||!casePage.reports.nextBefore} onClick={()=>void loadCase(casePost,casePage.reports.nextBefore!,caseCursor.escalation)} className="border rounded p-2">Older reports</button>
   <h3>Central escalations</h3>{!casePage.escalations.items.length&&<p>No recorded escalations.</p>}
   {casePage.escalations.items.map(r=><section key={r.sequence} className="border rounded p-3"><p>{r.status} · Submitted version: {r.submittedVersion}</p><p className="whitespace-pre-wrap break-words">{r.reason}</p><p>{new Date(r.createdAt).toLocaleString()}</p></section>)}
   <button disabled={busy||!casePage.escalations.nextBefore} onClick={()=>void loadCase(casePost,caseCursor.report,casePage.escalations.nextBefore!)} className="border rounded p-2">Older escalations</button>
   <button disabled={busy} onClick={()=>void loadCase(casePost)} className="border rounded p-2">Latest evidence</button><button disabled={busy} onClick={()=>setCasePost(null)} className="border rounded p-2">Close report evidence</button>
  </div></div>}
  {(review||report)&&<div role="dialog" aria-modal="true" aria-label={review?'Review community post':'Report community post'} className="fixed inset-0 bg-black/40 flex items-center justify-center p-5 z-50"><div className="bg-white rounded-xl p-6 max-w-lg w-full space-y-3"><h2 className="font-bold">{(review||report)?.title}</h2><label>कारण / टिप्पणी (Reason / notes)<textarea value={notes} onChange={e=>setNotes(e.target.value)} minLength={5} maxLength={1000} className="block border rounded w-full p-2"/></label><div className="flex gap-3">
   {review?(['PUBLISHED','REJECTED'] as const).map(decision=><button key={decision} disabled={busy||notes.trim().length<5} className="border rounded p-2" onClick={()=>void action(async()=>{await ApiClient.community(`/posts/${review.id}/moderate`,accessToken,'POST',{decision,notes,version:review.version});setReview(null);})}>{decision==='PUBLISHED'?'प्रकाशित (Publish)':'अस्वीकृत (Reject)'}</button>):<button disabled={busy||notes.trim().length<5} className="border rounded p-2" onClick={()=>void action(async()=>{await ApiClient.community(`/posts/${report!.id}/flag`,accessToken,'POST',{reason:notes});setReport(null);})}>रिपोर्ट पठाउनुहोस् (Submit report)</button>}
   <button disabled={busy} onClick={()=>{setReview(null);setReport(null);}} className="border rounded p-2">रद्द (Cancel)</button></div></div></div>}
 </section>;
}
