'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../../context/auth-context';
import { ApiClient } from '../../lib/api-client';
interface Conversation {id:string;title:string;type:string;isParticipant:boolean;unreadCount:number}
interface Message {id:string;senderUserId:string;content:string;sequence:number;isDeleted:boolean;readByUserIds:string[]}
const API=process.env.NEXT_PUBLIC_API_URL||'http://127.0.0.1:3000';
export default function ChatPage(){
 const {accessToken,user,isLoading,refreshSession}=useAuth();
 const [conversations,setConversations]=useState<Conversation[]>([]),[selected,setSelected]=useState<Conversation|null>(null),[messages,setMessages]=useState<Message[]>([]);
 const [error,setError]=useState(''),[busy,setBusy]=useState(false),[text,setText]=useState(''),[query,setQuery]=useState(''),[people,setPeople]=useState<any[]>([]);
 const [branches,setBranches]=useState<any[]>([]),[branch,setBranch]=useState(''),[groupTitle,setGroupTitle]=useState(''),[live,setLive]=useState(false),[typing,setTyping]=useState(false);
 const socket=useRef<WebSocket|null>(null),retry=useRef<{content:string;id:string}|null>(null),lastTyping=useRef(0);
 const call=useCallback(async(path:string,method='GET',body?:unknown)=>{
  const response=await fetch(`${API}/chat${path}`,{method,headers:{'Content-Type':'application/json',Authorization:`Bearer ${accessToken}`},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const data=await response.json();if(!response.ok)throw new Error(data.message||'Chat request failed');return data;
 },[accessToken]);
 const load=useCallback(async()=>{if(!accessToken||isLoading)return;try{setConversations(await call('/conversations'));}catch(e){setError((e as Error).message);}},[call,accessToken,isLoading]);
 useEffect(()=>{void load();},[load]);
 useEffect(()=>{ApiClient.listBranches().then(setBranches).catch(()=>{});},[]);
 useEffect(()=>{
  if(!selected||!accessToken||isLoading)return;
  let stopped=false,timer:ReturnType<typeof setTimeout>,attempt=0;
  function connect(){
   const ws=new WebSocket(`${API.replace(/^http/,'ws')}/chat/socket`);socket.current=ws;
   ws.onopen=()=>ws.send(JSON.stringify({type:'auth',token:accessToken}));
   ws.onmessage=(event)=>{
    const data=JSON.parse(event.data);
    if(data.type==='authenticated'){ws.send(JSON.stringify({type:'subscribe',conversationId:selected!.id}));}
    if(data.type==='snapshot'&&data.conversationId===selected!.id){setLive(true);attempt=0;setMessages(previous=>Array.from(new Map([...previous,...data.messages].map(m=>[m.id,m])).values()).sort((a,b)=>a.sequence-b.sequence));setTyping(data.typingUserIds.length>0);const latest=data.messages.at(-1)?.sequence;if(latest)ws.send(JSON.stringify({type:'read',sequence:latest}));}
   };
   ws.onclose=(event)=>{setLive(false);if(stopped)return;
    if(event.code===4401){void refreshSession();return;}
    if(event.code===4403){setError('Conversation access has ended. Refresh the list or sign in again.');return;}
    timer=setTimeout(connect,Math.min(30000,1000*2**attempt++));};
   ws.onerror=()=>ws.close();
  }
  connect();return()=>{stopped=true;clearTimeout(timer);socket.current?.close();socket.current=null;};
 },[selected?.id,accessToken,isLoading,refreshSession]);
 async function action(work:()=>Promise<void>){setBusy(true);setError('');try{await work();await load();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 async function open(c:Conversation){await action(async()=>{if(!c.isParticipant)await call(`/conversations/${c.id}/join`,'POST');setSelected({...c,isParticipant:true});setMessages(await call(`/conversations/${c.id}/messages`));});}
 async function send(){if(!selected||!text.trim())return;await action(async()=>{const content=text.trim();if(retry.current?.content!==content)retry.current={content,id:crypto.randomUUID()};await call(`/conversations/${selected.id}/messages`,'POST',{content,clientMessageId:retry.current.id});retry.current=null;setText('');setMessages(await call(`/conversations/${selected.id}/messages`));});}
 if(isLoading)return <p>लोड हुँदैछ…</p>;
 if(!accessToken)return <p>सन्देशका लागि प्रवेश गर्नुहोस् (Sign in for messaging).</p>;
 return <section className="space-y-4 max-w-6xl"><h1 className="text-2xl font-bold">सन्देश (Messages)</h1>
  {error&&<p role="alert" className="p-3 bg-red-50 text-red-800">{error}</p>}
  <div className="grid gap-4 md:grid-cols-[280px_1fr]"><aside className="border rounded-xl p-4 space-y-4">
   <button className="border rounded px-3 py-2" onClick={()=>void load()}>Refresh conversations</button>
   {conversations.map(c=><button key={c.id} aria-pressed={selected?.id===c.id} onClick={()=>void open(c)} className="block text-left border rounded p-3 w-full">{c.title}<span className="block text-xs">{c.type} · {c.unreadCount} unread{c.isParticipant?'':' · Join'}</span></button>)}
   <form onSubmit={e=>{e.preventDefault();void action(async()=>{const result=await ApiClient.searchPersons({query},accessToken);setPeople(result.items);});}} className="space-y-2 border-t pt-3"><label>व्यक्ति खोज्नुहोस् (Find person)<input required value={query} onChange={e=>setQuery(e.target.value)} className="block border rounded p-2 w-full"/></label><button disabled={busy} className="border p-2 rounded">Search people</button></form>
   {people.map(p=><button key={p.id} disabled={busy} className="block text-left border rounded p-2 w-full" onClick={()=>void action(async()=>{const c=await call('/conversations','POST',{type:'DIRECT',personId:p.id});setSelected(c);setMessages(await call(`/conversations/${c.id}/messages`));setPeople([]);})}>{p.primaryNameNepali||p.primaryNameEnglish} · Message</button>)}
   {user?.roles.some(r=>['SUPER_ADMIN','CENTRAL_ADMIN','BRANCH_ADMIN'].includes(r))&&<form onSubmit={e=>{e.preventDefault();void action(async()=>{const c=await call('/conversations','POST',{type:'FAMILY_BRANCH',branchId:branch,title:groupTitle});setSelected(c);setMessages(await call(`/conversations/${c.id}/messages`));});}} className="space-y-2 border-t pt-3"><label>शाखा (Branch)<select required value={branch} onChange={e=>setBranch(e.target.value)} className="block border p-2 w-full"><option value="">Select branch</option>{branches.map(b=><option key={b.id} value={b.id}>{b.nameNepali}</option>)}</select></label><label>समूह शीर्षक (Group title)<input required maxLength={150} value={groupTitle} onChange={e=>setGroupTitle(e.target.value)} className="block border p-2 w-full"/></label><button disabled={busy} className="border rounded p-2">Create branch group</button></form>}
  </aside><div className="border rounded-xl p-4 space-y-3">{selected?<>
   <header className="flex flex-wrap justify-between gap-3"><h2 className="font-bold">{selected.title}</h2><span role="status">{live?'Live':'Connecting…'}</span><button className="border rounded px-2" onClick={()=>void action(async()=>{await call(`/conversations/${selected.id}/leave`,'POST');setSelected(null);setMessages([]);})}>Leave conversation</button>{selected.type==='DIRECT'&&<button className="border rounded px-2" onClick={()=>{if(confirm('Block direct messages from this person?'))void action(async()=>{await call(`/conversations/${selected.id}/block`,'POST');setSelected(null);});}}>Block</button>}</header>
   {messages.length>=100&&<button onClick={()=>void action(async()=>{const older=await call(`/conversations/${selected.id}/messages?before=${messages[0].sequence}`);setMessages(previous=>[...older,...previous]);})}>Load earlier messages</button>}
   <ol aria-label="Message history" className="space-y-3 min-h-64 max-h-[55vh] overflow-y-auto">{messages.map(m=><li key={m.id} className={`p-3 rounded-lg ${m.senderUserId===user?.id?'bg-amber-50 ml-8':'bg-slate-50 mr-8'}`}><p className="text-xs">{m.senderUserId===user?.id?'You':'Member'}</p><p className="whitespace-pre-wrap break-words">{m.isDeleted?'Message removed':m.content}</p>{m.senderUserId===user?.id&&!m.isDeleted&&<div className="flex gap-3 text-xs"><span>{m.readByUserIds.some(id=>id!==user.id)?'Read':'Sent'}</span><button onClick={()=>void action(async()=>{await call(`/conversations/${selected.id}/messages/${m.id}`,'DELETE');setMessages(await call(`/conversations/${selected.id}/messages`));})}>Remove message</button></div>}</li>)}</ol>
   {typing&&<p aria-live="polite" className="text-sm">Someone is typing…</p>}
   <form onSubmit={e=>{e.preventDefault();void send();}} className="flex items-end gap-3"><label className="grow">सन्देश (Your message)<textarea required maxLength={4000} value={text} onChange={e=>{setText(e.target.value);if(socket.current?.readyState===WebSocket.OPEN&&Date.now()-lastTyping.current>1500){socket.current.send(JSON.stringify({type:'typing'}));lastTyping.current=Date.now();}}} className="block border rounded p-2 w-full"/></label><button disabled={busy||!text.trim()} className="bg-slate-900 text-white rounded p-3">पठाउनुहोस् (Send)</button></form>
  </>:<p>कुराकानी चयन गर्नुहोस् (Select or create a conversation).</p>}</div></div></section>;
}
