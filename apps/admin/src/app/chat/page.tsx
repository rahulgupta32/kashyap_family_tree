'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../../context/auth-context';
import { PrivateGroupCreator, GroupManager } from './group-controls';
import { chatManagement, chatReceipts, chatOutboxLabels } from '@kashyap/localization';
import { BrowserChatOutbox, QueuedChatMessage } from '../../lib/chat-outbox';
import { ChatReports } from './report-controls';
import { ApiClient } from '../../lib/api-client';
interface Conversation {id:string;title:string;type:string;isParticipant:boolean;unreadCount:number}
interface Message {attachment?:{id:string;mimeType:string;byteSize:number;fileName:string}|null;id:string;senderUserId:string;content:string;sequence:number;isDeleted:boolean;readByUserIds:string[];deliveredToUserIds:string[]}
const API=process.env.NEXT_PUBLIC_API_URL||'http://127.0.0.1:3000';
export default function ChatPage(){
 const {accessToken,user,isLoading,refreshSession}=useAuth();
 const [conversations,setConversations]=useState<Conversation[]>([]),[selected,setSelected]=useState<Conversation|null>(null),[messages,setMessages]=useState<Message[]>([]);
 const [error,setError]=useState(''),[busy,setBusy]=useState(false),[text,setText]=useState(''),[query,setQuery]=useState(''),[people,setPeople]=useState<any[]>([]);
 const [managing,setManaging]=useState(false);
 const [attachment,setAttachment]=useState<{mimeType:string;dataBase64:string}|undefined>(),[attachmentName,setAttachmentName]=useState('');
 const fileInput=useRef<HTMLInputElement|null>(null);
 const composeContext=useRef('');composeContext.current=`${user?.id}:${selected?.id}`;
 const [readingFile,setReadingFile]=useState(false);
 useEffect(()=>{setAttachment(undefined);setAttachmentName('');if(fileInput.current)fileInput.current.value='';},[selected?.id,user?.id]);
 const [reporting,setReporting]=useState<string|null>(null),[reason,setReason]=useState(''),[notice,setNotice]=useState('');
 const [branches,setBranches]=useState<any[]>([]),[branch,setBranch]=useState(''),[groupTitle,setGroupTitle]=useState(''),[live,setLive]=useState(false),[typing,setTyping]=useState(false);
 const socket=useRef<WebSocket|null>(null),lastTyping=useRef(0);
 const outbox=useRef<BrowserChatOutbox|null>(null),[pending,setPending]=useState<QueuedChatMessage[]>([]);
 const refreshRef=useRef(refreshSession);refreshRef.current=refreshSession;
 useEffect(()=>{setSelected(null);setMessages([]);setText('');setConversations([]);setReporting(null);setReason('');setNotice('');setAttachment(undefined);setAttachmentName('');},[user?.id]);
 useEffect(()=>{
  if(!user||!accessToken||isLoading)return;let stopped=false;
  let queue:BrowserChatOutbox;try{queue=new BrowserChatOutbox({owner:user.id,api:API,getToken:()=>localStorage.getItem('kashyap_admin_access_token'),refresh:()=>refreshRef.current()});outbox.current=queue;}catch{setError(chatOutboxLabels.storage);return;}
  async function reload(){try{const rows=await queue.list();if(!stopped)setPending(rows);}catch(e){if(!stopped)setError(chatOutboxLabels.storage);}}
  async function tick(){try{await queue.pump();await reload();}catch(e){if(!stopped)setError(chatOutboxLabels.storage);}}
  const unsubscribe=queue.subscribe(()=>void reload()),timer=setInterval(()=>void tick(),2000);
  window.addEventListener('online',tick);document.addEventListener('visibilitychange',tick);void reload();void tick();
  return()=>{stopped=true;queue.stop();unsubscribe();clearInterval(timer);window.removeEventListener('online',tick);document.removeEventListener('visibilitychange',tick);if(outbox.current===queue)outbox.current=null;setPending([]);};
 },[user?.id,accessToken,isLoading]);
 const call=useCallback(async(path:string,method='GET',body?:unknown)=>{
  const response=await fetch(`${API}/chat${path}`,{method,headers:{'Content-Type':'application/json',Authorization:`Bearer ${accessToken}`},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const data=await response.json();if(!response.ok)throw new Error(data.message||'Chat request failed');return data;
 },[accessToken]);
 const load=useCallback(async()=>{if(!accessToken||isLoading)return;try{setConversations(await call('/conversations'));}catch(e){setError((e as Error).message);}},[call,accessToken,isLoading]);
 useEffect(()=>{void load();},[load]);
 useEffect(()=>{ApiClient.listBranches().then(setBranches).catch(()=>{});},[]);
 useEffect(()=>{
  if(!selected||!accessToken||isLoading)return;
  let stopped=false,timer:ReturnType<typeof setTimeout>,attempt=0,latestReceived=0;
  const acknowledgeRead=()=>{if(document.visibilityState==='visible'&&socket.current?.readyState===WebSocket.OPEN&&latestReceived>0)socket.current.send(JSON.stringify({type:'read',sequence:latestReceived}));};
  document.addEventListener('visibilitychange',acknowledgeRead);
  function connect(){
   const ws=new WebSocket(`${API.replace(/^http/,'ws')}/chat/socket`);socket.current=ws;
   ws.onopen=()=>ws.send(JSON.stringify({type:'auth',token:accessToken}));
   ws.onmessage=(event)=>{
    const data=JSON.parse(event.data);
    if(data.type==='authenticated'){ws.send(JSON.stringify({type:'subscribe',conversationId:selected!.id}));}
    if(data.type==='snapshot'&&data.conversationId===selected!.id){setLive(true);attempt=0;setMessages(previous=>Array.from(new Map([...previous,...data.messages].map(m=>[m.id,m])).values()).sort((a,b)=>a.sequence-b.sequence));setTyping(data.typingUserIds.length>0);if(data.messages.length){ws.send(JSON.stringify({type:'delivered',messageIds:data.messages.map((m:Message)=>m.id)}));latestReceived=data.messages.at(-1).sequence;acknowledgeRead();}}
   };
   ws.onclose=(event)=>{setLive(false);if(stopped)return;
    if(event.code===4401){void refreshSession();return;}
    if(event.code===4403){setError('Conversation access has ended. Refresh the list or sign in again.');return;}
    timer=setTimeout(connect,Math.min(30000,1000*2**attempt++));};
   ws.onerror=()=>ws.close();
  }
  connect();return()=>{stopped=true;document.removeEventListener('visibilitychange',acknowledgeRead);clearTimeout(timer);socket.current?.close();socket.current=null;};
 },[selected?.id,accessToken,isLoading,refreshSession]);
 async function action(work:()=>Promise<void>){setBusy(true);setError('');try{await work();await load();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 async function open(c:Conversation){setReporting(null);setReason('');setAttachment(undefined);setAttachmentName('');await action(async()=>{if(!c.isParticipant)await call(`/conversations/${c.id}/join`,'POST');setSelected({...c,isParticipant:true});setMessages(await call(`/conversations/${c.id}/messages`));});}
 async function send(){if(!selected||(!text.trim()&&!attachment)||!outbox.current)return;setBusy(true);setError('');try{await outbox.current.enqueue(selected.id,text.trim()||'संलग्न फाइल (Attachment)',attachment);setText('');setAttachment(undefined);setAttachmentName('');if(fileInput.current)fileInput.current.value='';void outbox.current.pump().catch(()=>setError(chatOutboxLabels.storage));}catch(e){setError(chatOutboxLabels.storage);}finally{setBusy(false);}}
 async function chooseFile(file?:File){const context=composeContext.current;setAttachment(undefined);setAttachmentName('');if(!file)return;setReadingFile(true);try{if(file.size>5*1024*1024||!['image/png','image/jpeg','image/webp','application/pdf'].includes(file.type))throw new Error('Choose PNG, JPEG, WebP or PDF up to 5 MB');const value=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onerror=()=>reject(new Error('Cannot read attachment'));reader.onload=()=>resolve((reader.result as string).split(',')[1]);reader.readAsDataURL(file);});if(composeContext.current!==context)return;setAttachment({mimeType:file.type,dataBase64:value});setAttachmentName(file.name);setError('');}catch(e){if(composeContext.current===context)setError((e as Error).message);}finally{setReadingFile(false);}}
 async function download(m:Message){if(!selected)return;const context=composeContext.current;await action(async()=>{const response=await fetch(`${API}/chat/conversations/${selected.id}/messages/${m.id}/attachment`,{headers:{Authorization:`Bearer ${accessToken}`},cache:'no-store'});if(!response.ok)throw new Error('Attachment unavailable');const blob=await response.blob();if(composeContext.current!==context)return;const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=m.attachment!.fileName;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});}
 async function queuedAction(row:QueuedChatMessage,discard:boolean){if(discard&&!confirm(chatOutboxLabels.discardNote))return;try{await outbox.current?.change(row.id,discard);void outbox.current?.pump().catch(()=>setError(chatOutboxLabels.storage));}catch(e){setError(chatOutboxLabels.storage);}}
 if(isLoading)return <p>लोड हुँदैछ…</p>;
 if(!accessToken)return <p>सन्देशका लागि प्रवेश गर्नुहोस् (Sign in for messaging).</p>;
 return <section className="space-y-4 max-w-6xl"><h1 className="text-2xl font-bold">सन्देश (Messages)</h1>
  {notice&&<p role="status">{notice}</p>}
  <ChatReports key={user?.id} call={call} roles={user?.roles||[]} download={async id=>{const response=await fetch(`${API}/chat/reports/${id}/attachment`,{headers:{Authorization:`Bearer ${accessToken}`},cache:'no-store'});if(!response.ok)throw new Error('Reported attachment unavailable');const url=URL.createObjectURL(await response.blob()),link=document.createElement('a');link.href=url;link.download='reported-attachment';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}}/>
  {reporting&&selected&&<form className="border rounded p-3 space-y-2" onSubmit={e=>{e.preventDefault();void action(async()=>{await call(`/conversations/${selected.id}/messages/${reporting}/report`,'POST',{reason});setReporting(null);setReason('');setNotice('उजुरी पठाइयो (Report submitted)');});}}><label>उजुरीको कारण (Report reason)<textarea required maxLength={1000} value={reason} onChange={e=>setReason(e.target.value)} className="block border p-2 w-full"/></label><p>यो सन्देश र कारण समीक्षकलाई पठाइनेछ (This message and reason will be shared with a moderator).</p><button disabled={busy}>पठाउनुहोस् (Submit report)</button><button type="button" onClick={()=>setReporting(null)}>रद्द (Cancel)</button></form>}
  {error&&<p role="alert" className="p-3 bg-red-50 text-red-800">{error}</p>}
  <div className="grid gap-4 md:grid-cols-[280px_1fr]"><aside className="border rounded-xl p-4 space-y-4">
   {pending.length>0&&<section aria-label="Queued messages" className="space-y-2"><h2 className="font-bold">{chatOutboxLabels.title}</h2>{pending.map(row=><div key={row.id} data-queued-id={row.id} className="border rounded p-2"><p className="break-words">{row.content}</p><p className="text-xs">{row.state==='failed'?chatOutboxLabels.failed:chatOutboxLabels.queued}</p><button onClick={()=>void queuedAction(row,false)}>{chatOutboxLabels.retry}</button><button onClick={()=>void queuedAction(row,true)}>{chatOutboxLabels.discard}</button></div>)}</section>}
   <PrivateGroupCreator token={accessToken} call={call} onCreated={async(c)=>{await open(c);}}/>
   <button className="border rounded px-3 py-2" onClick={()=>void load()}>Refresh conversations</button>
   {conversations.map(c=><button key={c.id} aria-pressed={selected?.id===c.id} onClick={()=>void open(c)} className="block text-left border rounded p-3 w-full">{c.title}<span className="block text-xs">{c.type} · {c.unreadCount} unread{c.isParticipant?'':' · Join'}</span></button>)}
   <form onSubmit={e=>{e.preventDefault();void action(async()=>{const result=await ApiClient.searchPersons({query},accessToken);setPeople(result.items);});}} className="space-y-2 border-t pt-3"><label>व्यक्ति खोज्नुहोस् (Find person)<input required value={query} onChange={e=>setQuery(e.target.value)} className="block border rounded p-2 w-full"/></label><button disabled={busy} className="border p-2 rounded">Search people</button></form>
   {people.map(p=><button key={p.id} disabled={busy} className="block text-left border rounded p-2 w-full" onClick={()=>void action(async()=>{const c=await call('/conversations','POST',{type:'DIRECT',personId:p.id});setSelected(c);setMessages(await call(`/conversations/${c.id}/messages`));setPeople([]);})}>{p.primaryNameNepali||p.primaryNameEnglish} · Message</button>)}
   {user?.roles.some(r=>['SUPER_ADMIN','CENTRAL_ADMIN','BRANCH_ADMIN'].includes(r))&&<form onSubmit={e=>{e.preventDefault();void action(async()=>{const c=await call('/conversations','POST',{type:'FAMILY_BRANCH',branchId:branch,title:groupTitle});setSelected(c);setMessages(await call(`/conversations/${c.id}/messages`));});}} className="space-y-2 border-t pt-3"><label>शाखा (Branch)<select aria-label="शाखा (Branch)" required value={branch} onChange={e=>setBranch(e.target.value)} className="block border p-2 w-full"><option value="">Select branch</option>{branches.map(b=><option key={b.id} value={b.id}>{b.nameNepali}</option>)}</select></label><label>समूह शीर्षक (Group title)<input required maxLength={150} value={groupTitle} onChange={e=>setGroupTitle(e.target.value)} className="block border p-2 w-full"/></label><button disabled={busy} className="border rounded p-2">Create branch group</button></form>}
  </aside><div className="border rounded-xl p-4 space-y-3">{selected?<>
   <header className="flex flex-wrap justify-between gap-3"><h2 className="font-bold">{selected.title}</h2><span role="status">{live?'Live':'Connecting…'}</span><button className="border rounded px-2" onClick={()=>void action(async()=>{await call(`/conversations/${selected.id}/leave`,'POST');setSelected(null);setMessages([]);})}>Leave conversation</button>{selected.type!=='DIRECT'&&<button onClick={()=>setManaging(true)}>{chatManagement.info}</button>}{selected.type==='DIRECT'&&<button className="border rounded px-2" onClick={()=>{if(confirm('Block direct messages from this person?'))void action(async()=>{await call(`/conversations/${selected.id}/block`,'POST');setSelected(null);});}}>Block</button>}</header>
   {messages.length>=100&&<button onClick={()=>void action(async()=>{const older=await call(`/conversations/${selected.id}/messages?before=${messages[0].sequence}`);setMessages(previous=>[...older,...previous]);})}>Load earlier messages</button>}
   <ol aria-label="Message history" className="space-y-3 min-h-64 max-h-[55vh] overflow-y-auto">{messages.map(m=><li key={m.id} className={`p-3 rounded-lg ${m.senderUserId===user?.id?'bg-amber-50 ml-8':'bg-slate-50 mr-8'}`}><p className="text-xs">{m.senderUserId===user?.id?'You':'Member'}</p><p className="whitespace-pre-wrap break-words">{m.isDeleted?'Message removed':m.content}</p>{m.attachment&&!m.isDeleted&&<button disabled={busy} onClick={()=>void download(m)}>डाउनलोड (Download attachment) · {Math.ceil(m.attachment.byteSize/1024)} KB</button>}{m.senderUserId===user?.id&&!m.isDeleted&&<div className="flex gap-3 text-xs"><span>{m.readByUserIds.some(id=>id!==user.id)?chatReceipts.read:(m.deliveredToUserIds||[]).some(id=>id!==user.id)?chatReceipts.delivered:chatReceipts.sent}</span><button onClick={()=>void action(async()=>{await call(`/conversations/${selected.id}/messages/${m.id}`,'DELETE');setMessages(await call(`/conversations/${selected.id}/messages`));})}>Remove message</button></div>}{!m.isDeleted&&m.senderUserId!==user?.id&&<button disabled={busy} onClick={()=>{setReporting(m.id);setReason('');setNotice('');}}>उजुरी (Report message)</button>}</li>)}</ol>
   {typing&&<p aria-live="polite" className="text-sm">Someone is typing…</p>}
   <label>संलग्न फाइल (Attachment, max 5 MB)<input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp,application/pdf" disabled={busy} onChange={e=>void chooseFile(e.target.files?.[0])}/></label>{attachmentName&&<p>{attachmentName}<button onClick={()=>{setAttachment(undefined);setAttachmentName('');if(fileInput.current)fileInput.current.value='';}}>हटाउनुहोस् (Clear attachment)</button></p>}
   <form onSubmit={e=>{e.preventDefault();void send();}} className="flex items-end gap-3"><label className="grow">सन्देश (Your message)<textarea required={!attachment} maxLength={4000} value={text} onChange={e=>{setText(e.target.value);if(socket.current?.readyState===WebSocket.OPEN&&Date.now()-lastTyping.current>1500){socket.current.send(JSON.stringify({type:'typing'}));lastTyping.current=Date.now();}}} className="block border rounded p-2 w-full"/></label><button disabled={busy||readingFile||(!text.trim()&&!attachment)} className="bg-slate-900 text-white rounded p-3">पठाउनुहोस् (Send)</button></form>
  </>:<p>कुराकानी चयन गर्नुहोस् (Select or create a conversation).</p>}</div></div>{managing&&selected&&<GroupManager id={selected.id} token={accessToken} call={call} onClose={()=>setManaging(false)} onChanged={info=>{setSelected(current=>current&&current.id===info.id?{...current,title:info.title}:current);void load();}}/>}</section>;
}
