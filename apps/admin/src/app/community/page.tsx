'use client';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../context/auth-context';
import { ApiClient } from '../../lib/api-client';

interface Post { id:string; title:string; content:string; category:string; moderationStatus:string; version:number; createdAt:string; likesCount:number; isLiked:boolean; commentsCount:number; canModerate:boolean; canDelete:boolean; reportsCount?:number }
interface Comment { id:string; content:string; parentCommentId?:string }
export default function CommunityPage(){
 const {accessToken,user,isLoading}=useAuth();
 const [posts,setPosts]=useState<Post[]>([]),[branches,setBranches]=useState<any[]>([]),[queue,setQueue]=useState(false);
 const [title,setTitle]=useState(''),[content,setContent]=useState(''),[category,setCategory]=useState('DISCUSSION'),[branch,setBranch]=useState('');
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [open,setOpen]=useState<string|null>(null),[comments,setComments]=useState<Comment[]>([]),[comment,setComment]=useState('');
 const [review,setReview]=useState<Post|null>(null),[notes,setNotes]=useState(''),[report,setReport]=useState<Post|null>(null);
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
    <option value="DISCUSSION">छलफल (Discussion)</option><option value="ANNOUNCEMENT">सूचना (Announcement)</option><option value="RITUAL">परम्परा (Tradition)</option><option value="ACHIEVEMENT">उपलब्धि (Achievement)</option>
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
   <div className="flex flex-wrap gap-3">
    {p.moderationStatus==='PUBLISHED'&&<><button disabled={busy} aria-pressed={p.isLiked} onClick={()=>void action(async()=>{await ApiClient.community(`/posts/${p.id}/like`,accessToken,'PUT',{liked:!p.isLiked});})} className="border rounded px-3 py-1">मन पर्‍यो (Like) · {p.likesCount}</button><button disabled={busy} onClick={()=>void showComments(p)} className="border rounded px-3 py-1">टिप्पणी (Comments) · {p.commentsCount}</button><button disabled={busy} onClick={()=>{setReport(p);setNotes('');}} className="border rounded px-3 py-1">रिपोर्ट (Report)</button></>}
    {p.canModerate&&p.moderationStatus==='PENDING'&&<button disabled={busy} onClick={()=>{setReview(p);setNotes('');}} className="border rounded px-3 py-1">समीक्षा गर्नुहोस् (Review)</button>}
    {p.canDelete&&<button disabled={busy} onClick={()=>{if(window.confirm('यो पोस्ट हटाउने? (Remove this post?)'))void action(async()=>{await ApiClient.community(`/posts/${p.id}`,accessToken,'DELETE');});}} className="border rounded px-3 py-1">हटाउनुहोस् (Remove)</button>}
   </div>
   {open===p.id&&<div className="border-t pt-3 space-y-2"><ul>{comments.map(c=><li key={c.id} className="border-b py-2 whitespace-pre-wrap">{c.parentCommentId?'↳ ':''}{c.content}</li>)}</ul><form onSubmit={e=>{e.preventDefault();void action(async()=>{await ApiClient.community(`/posts/${p.id}/comments`,accessToken,'POST',{content:comment});setComment('');setComments(await ApiClient.community<Comment[]>(`/posts/${p.id}/comments`,accessToken));});}}><label>टिप्पणी (Your comment)<textarea required maxLength={2000} value={comment} onChange={e=>setComment(e.target.value)} className="block w-full rounded border p-2"/></label><button disabled={busy} className="border rounded px-3 py-2 mt-2">पठाउनुहोस् (Send comment)</button></form></div>}
  </article>)}
  {(review||report)&&<div role="dialog" aria-modal="true" aria-label={review?'Review community post':'Report community post'} className="fixed inset-0 bg-black/40 flex items-center justify-center p-5 z-50"><div className="bg-white rounded-xl p-6 max-w-lg w-full space-y-3"><h2 className="font-bold">{(review||report)?.title}</h2><label>कारण / टिप्पणी (Reason / notes)<textarea value={notes} onChange={e=>setNotes(e.target.value)} minLength={5} maxLength={1000} className="block border rounded w-full p-2"/></label><div className="flex gap-3">
   {review?(['PUBLISHED','REJECTED'] as const).map(decision=><button key={decision} disabled={busy||notes.trim().length<5} className="border rounded p-2" onClick={()=>void action(async()=>{await ApiClient.community(`/posts/${review.id}/moderate`,accessToken,'POST',{decision,notes,version:review.version});setReview(null);})}>{decision==='PUBLISHED'?'प्रकाशित (Publish)':'अस्वीकृत (Reject)'}</button>):<button disabled={busy||notes.trim().length<5} className="border rounded p-2" onClick={()=>void action(async()=>{await ApiClient.community(`/posts/${report!.id}/flag`,accessToken,'POST',{reason:notes});setReport(null);})}>रिपोर्ट पठाउनुहोस् (Submit report)</button>}
   <button disabled={busy} onClick={()=>{setReview(null);setReport(null);}} className="border rounded p-2">रद्द (Cancel)</button></div></div></div>}
 </section>;
}
