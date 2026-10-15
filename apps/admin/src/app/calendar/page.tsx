'use client';

import { GenealogyAudience } from './genealogy-audience';
import { CalendarPeriod } from './period';
import { RecurringReminders } from './recurring-reminders';
import { CalendarBrowse } from './browse';
import { nepalWallTimeToUtc, formatNepalInstant } from '@kashyap/localization';
import { calendarManagement } from '@kashyap/localization';
import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { useAuth } from '../../context/auth-context';
import { ApiClient } from '../../lib/api-client';
import { CalendarEventDetailDto, EventAudienceScope, GenealogyAudienceSelection } from '@kashyap/contracts';

const calendarApiBase=process.env.NEXT_PUBLIC_API_URL||'http://127.0.0.1:3000';
const pendingCreateStorageKey='kashyap_calendar_pending_create';
type PendingCreate={creationKey:string;payload?:any};

const label=(key: keyof typeof calendarManagement.en)=>`${calendarManagement.ne[key]} (${calendarManagement.en[key]})`;

const initialCalendarForm=()=>({
    title: '',
    description: '',
    eventType: 'KUL_PUJA',
    audienceScope: EventAudienceScope.COMMUNITY,
    solarDate: '',
    branchId: '',
    tithiYearBs: 2083,
    tithiMonthBs: 1,
    tithiPaksha: 'SHUKLA',
    tithiNumber: 1,
  });

export default function CalendarAdminPage() {
  const { accessToken, user, isLoading: sessionLoading } = useAuth();
  const authorityKey=user?.roles?.slice().sort().join(',');
  const [events, setEvents] = useState<CalendarEventDetailDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [pendingCreate,setPendingCreate]=useState<PendingCreate|null>(null);
  const pendingCreateRef=useRef<PendingCreate|null>(null);
  const createBusyRef=useRef<object|null>(null);
  const ownerScope=JSON.stringify([user?.id,authorityKey]);
  const ownerScopeRef=useRef(ownerScope);ownerScopeRef.current=ownerScope;
  const [formData, setFormData] = useState(initialCalendarForm);
  const [branches,setBranches] = useState<any[]>([]);
  const [dateMode, setDateMode] = useState<'BS'|'AD'>('BS');
  const [startsAt, setStartsAt] = useState('');
  const [reminder, setReminder] = useState(false);
  const [search, setSearch] = useState('');
  const [candidates, setCandidates] = useState<any[]>([]);
  const [invitees, setInvitees] = useState<string[]>([]);
  const [previewKey, setPreviewKey] = useState<string | null>(null);
  const [derivedEnabled,setDerivedEnabled]=useState(false);
  const [selection,setSelection]=useState<GenealogyAudienceSelection|undefined>();
  const [derivedPreview,setDerivedPreview]=useState<any>(null);
  const requestScope=JSON.stringify([user?.id,authorityKey,accessToken]);
  const requestScopeRef=useRef(requestScope);requestScopeRef.current=requestScope;
  const eventListSequence=useRef(0);
  useEffect(()=>{setDerivedPreview(null);setPreviewKey(null);},[selection,formData.audienceScope,formData.branchId]);
  // Token rotation invalidates previews, but must not dismiss a form belonging
  // to the same account. Account/authority changes still clear private state.
  useEffect(()=>{setDerivedPreview(null);setPreviewKey(null);},[accessToken]);
  const [editing, setEditing] = useState<CalendarEventDetailDto | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription,setEditDescription]=useState('');
  const [editLocation,setEditLocation]=useState('');
  const [blockedEdits,setBlockedEdits]=useState<Set<string>>(()=>new Set());
  const manageBusyRef=useRef<object|null>(null);
  const editOrdinary=!!editing && ['GENERAL_EVENT','COMMUNITY_MEETING'].includes(editing.eventType) && !editing.recurrenceRuleId;
  const [editStart, setEditStart] = useState('');
  const [editTimeChanged, setEditTimeChanged] = useState(false);
  const editCanReschedule=!!editing?.startsAt && !editing.recurrenceRuleId && ['GENERAL_EVENT','COMMUNITY_MEETING'].includes(editing.eventType);
  const [cancelReason, setCancelReason] = useState('');
  const [history, setHistory] = useState<any[]>([]);
  const [actionLoading, setActionLoading] = useState(false);
  const [rsvpPending, setRsvpPending] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useLayoutEffect(()=>{
    pendingCreateRef.current=null;setPendingCreate(null);createBusyRef.current=null;manageBusyRef.current=null;setBlockedEdits(new Set());setEditDescription('');setEditLocation('');
    setShowCreateModal(false);setFormData(initialCalendarForm());setDateMode('BS');setStartsAt('');setReminder(false);setSearch('');
    setDerivedEnabled(false);setSelection(undefined);setDerivedPreview(null);setInvitees([]);setCandidates([]);setPreviewKey(null);
    setEvents([]);setEditing(null);setEditTitle('');setEditStart('');setEditTimeChanged(false);setCancelReason('');setHistory([]);setMessage(null);setActionLoading(false);setRsvpPending(null);
    if(sessionLoading)return;
    try {
      const saved=sessionStorage.getItem(pendingCreateStorageKey);
      if(saved && user?.id){
        const value=JSON.parse(saved);
        if(value.owner===user.id && value.server===calendarApiBase && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value.creationKey)){
          const pending={creationKey:value.creationKey};pendingCreateRef.current=pending;setPendingCreate(pending);
        }else sessionStorage.removeItem(pendingCreateStorageKey);
      }else if(!user?.id)sessionStorage.removeItem(pendingCreateStorageKey);
    }catch { /* Storage failure blocks submission below; no private payload is stored. */ }
  },[user?.id,authorityKey,sessionLoading]);

  useEffect(() => {
    loadEvents();
    ApiClient.listBranches().then(setBranches).catch(()=>setBranches([]));
  }, [accessToken,user?.id,authorityKey]);

  async function loadEvents() {
    if (!accessToken) return;
    const sequence=++eventListSequence.current;
    const mayUnblock=!manageBusyRef.current;
    setLoading(true);
    try {
      const data = await ApiClient.listCalendarEvents(accessToken);
      if(requestScopeRef.current!==requestScope||eventListSequence.current!==sequence)return;
      setEvents(data);if(mayUnblock)setBlockedEdits(new Set());
    } catch (err: any) {
      if(requestScopeRef.current!==requestScope||eventListSequence.current!==sequence)return;
      setMessage({ type: 'error', text: err.message });
    } finally {
      if(requestScopeRef.current===requestScope&&eventListSequence.current===sequence)setLoading(false);
    }
  }

  function rememberCreate(pending:PendingCreate){
    if(!user?.id)throw new Error('Active account required');
    // Only recovery metadata is stored. Private titles/audiences stay in memory.
    sessionStorage.setItem(pendingCreateStorageKey,JSON.stringify({owner:user.id,server:calendarApiBase,creationKey:pending.creationKey}));
  }
  async function finishCreate(text:string){
    // Clear storage first: failure retains the original key for safe recovery.
    sessionStorage.removeItem(pendingCreateStorageKey);
    pendingCreateRef.current=null;setPendingCreate(null);
    setDerivedPreview(null);setDerivedEnabled(false);setSelection(undefined);
    setMessage({type:'success',text});setShowCreateModal(false);setInvitees([]);setCandidates([]);setPreviewKey(null);setStartsAt('');setReminder(false);setDateMode('BS');setFormData(initialCalendarForm());
    await loadEvents();
  }
  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if(!accessToken||!user?.id||sessionLoading||createBusyRef.current)return;
    const task={};createBusyRef.current=task;
    setActionLoading(true);setMessage(null);
    try {
      let payload:any=pendingCreateRef.current?.payload;
      if(pendingCreateRef.current&&!payload)throw new Error('Recover or close the pending creation before starting again');
      if(!payload){
        payload = {
        title: formData.title,
        description: formData.description || undefined,
        eventType: formData.eventType,
        audienceScope: formData.audienceScope,
        ...(formData.audienceScope === EventAudienceScope.BRANCH ? {branchId:formData.branchId} : {}),
        tithiYearBs: Number(formData.tithiYearBs),
        tithiMonthBs: Number(formData.tithiMonthBs),
        tithiPaksha: formData.tithiPaksha,
        tithiNumber: Number(formData.tithiNumber),
      };
      if (dateMode === 'AD') {
        payload.startsAt = nepalWallTimeToUtc(startsAt);
        payload.reminderOffsets = reminder ? [60] : [];
        delete payload.tithiYearBs; delete payload.tithiMonthBs; delete payload.tithiPaksha; delete payload.tithiNumber;
      }
      if(derivedEnabled){
        if(!selection)throw new Error('आमन्त्रित समूह छान्नुहोस् (Choose an invitation audience)');
        payload.audienceSelection=selection;
        const key=JSON.stringify({selection,scope:formData.audienceScope,branch:payload.branchId??null});
        if(!derivedPreview||derivedPreview.key!==key||new Date(derivedPreview.expiresAt).getTime()<=Date.now()){
          const result=await ApiClient.calendarRequest(accessToken,'events/preview','POST',{audienceSelection:selection,audienceScope:formData.audienceScope,...(payload.branchId?{branchId:payload.branchId}:{})});
          if(requestScopeRef.current!==requestScope)return;setDerivedPreview({...result,key});return;
        }
        payload.audiencePreviewId=derivedPreview.previewId;
      }else payload.invitedUserIds = invitees;
      const key = JSON.stringify({ids:invitees,scope:formData.audienceScope,branch:formData.branchId});
      if (!derivedEnabled && invitees.length && previewKey !== key) {
        await ApiClient.calendarRequest(accessToken,'events/preview','POST',{invitedUserIds:invitees,audienceScope:formData.audienceScope,...(formData.audienceScope===EventAudienceScope.BRANCH?{branchId:formData.branchId}:{})});
        if(requestScopeRef.current!==requestScope)return;setPreviewKey(key); return;
      }
      if (dateMode === 'BS' && formData.solarDate) {
        payload.solarDate = formData.solarDate;
      }
        const pending={creationKey:crypto.randomUUID(),payload:JSON.parse(JSON.stringify(payload))};
        pendingCreateRef.current=pending;setPendingCreate(pending);
      }
      const pending=pendingCreateRef.current!;
      rememberCreate(pending);
      const result=await ApiClient.createCalendarEvent(accessToken,{...pending.payload,creationKey:pending.creationKey});
      if(requestScopeRef.current!==requestScope)return;
      if(!result||typeof result.id!=='string')throw new Error('Unconfirmed creation');
      await finishCreate('कार्यक्रम सुरक्षित गरियो (Event saved)');
    }catch(err:any){
      if(requestScopeRef.current!==requestScope)return;
      if(!pendingCreateRef.current){setDerivedPreview(null);setPreviewKey(null);}
      setMessage({type:'error',text:pendingCreateRef.current?'पुष्टि भएन; उही कार्यक्रम पुनः प्रयास वा जाँच गर्नुहोस्। (Not confirmed; retry or recover the same creation.)':err.message});
    }finally{
      if(createBusyRef.current===task){createBusyRef.current=null;if(ownerScopeRef.current===ownerScope)setActionLoading(false);}
    }
  }
  async function resolvePendingCreate(){
    const pending=pendingCreateRef.current;
    if(!pending||!accessToken||!user?.id||sessionLoading||createBusyRef.current)return;
    const task={};createBusyRef.current=task;setActionLoading(true);setMessage(null);
    try{
      rememberCreate(pending);
      const result=await ApiClient.calendarRequest(accessToken,'events/creation-resolution','POST',{...pending.payload,creationKey:pending.creationKey});
      if(requestScopeRef.current!==requestScope)return;
      if(!result||!['CREATED','ABANDONED'].includes(result.outcome)||(result.outcome==='CREATED'&&typeof result.eventId!=='string'))throw new Error('Unconfirmed resolution');
      await finishCreate(result.outcome==='CREATED'?'पहिले सुरक्षित कार्यक्रम भेटियो (Existing event recovered)':'कार्यक्रम बनेको छैन; अब नयाँ सुरु गर्न सक्नुहुन्छ (No event created; you can start again)');
    }catch{
      if(requestScopeRef.current===requestScope)setMessage({type:'error',text:'पुष्टि भएन; बाँकी सिर्जना कायम छ। (Resolution not confirmed; pending creation retained.)'});
    }finally{
      if(createBusyRef.current===task){createBusyRef.current=null;if(ownerScopeRef.current===ownerScope)setActionLoading(false);}
    }
  }

  async function handleRsvp(id: string, response: 'GOING' | 'MAYBE' | 'DECLINED') {
    if (!accessToken) return;
    setRsvpPending(id);
    setMessage(null);
    try {
      await ApiClient.rsvpCalendarEvent(accessToken, id, response);
      if(requestScopeRef.current!==requestScope)return;
      await loadEvents();
      if(requestScopeRef.current!==requestScope)return;
      setMessage({ type: 'success', text: 'उपस्थिति सुरक्षित गरियो (RSVP saved)' });
    } catch (error: any) {
      if(requestScopeRef.current!==requestScope)return;
      setMessage({ type: 'error', text: error.message });
    } finally {
      if(requestScopeRef.current===requestScope)setRsvpPending(null);
    }
  }

  async function searchMembers() {
    if(!accessToken)return;
    setActionLoading(true);
    try {const found=await ApiClient.calendarRequest(accessToken,`invitees?${new URLSearchParams({q:search,audienceScope:formData.audienceScope,...(formData.audienceScope===EventAudienceScope.BRANCH?{branchId:formData.branchId}:{})})}`);if(requestScopeRef.current!==requestScope)return;setCandidates(found);}
    catch(error:any){if(requestScopeRef.current===requestScope)setMessage({type:'error',text:error.message});}
    finally{if(requestScopeRef.current===requestScope)setActionLoading(false);}
  }
  async function manage(cancel=false) {
    if(requestScopeRef.current!==requestScope||!accessToken||!editing||manageBusyRef.current||blockedEdits.has(editing.id))return;
    let payload:any;
    try {
      if(cancel){
        if(cancelReason.trim().length<5||cancelReason.trim().length>1000)throw new Error('Cancellation reason must contain 5–1000 characters');
        payload={version:editing.version,reason:cancelReason.trim()};
      }else{
        if(!editTitle.trim()||editTitle.trim().length>255|| (editOrdinary && (editDescription.trim().length>10000||editLocation.trim().length>255)))
          throw new Error('शीर्षक 1–255, विवरण 10000 र स्थान 255 अक्षरसम्म (Title 1–255; details up to 10000; venue up to 255 characters)');
        payload={version:editing.version,title:editTitle.trim(),
          ...(editOrdinary?{description:editDescription.trim(),location:editLocation.trim()}:{}),
          ...(editCanReschedule && editTimeChanged?{startsAt:nepalWallTimeToUtc(editStart)}:{})};
      }
    }catch(error:any){setMessage({type:'error',text:error.message});return;}
    const operation={};manageBusyRef.current=operation;eventListSequence.current++;
    setActionLoading(true);setMessage(null);
    try {
      await ApiClient.calendarRequest(accessToken,`events/${editing.id}${cancel?'/cancel':''}`,cancel?'POST':'PATCH',payload);
      if(requestScopeRef.current!==requestScope)return;setEditing(null);await loadEvents();
    }catch{
      if(requestScopeRef.current===requestScope){
        setBlockedEdits(old=>new Set(old).add(editing.id));
        setMessage({type:'error',text:'परिवर्तन पुष्टि भएन; पुनः लोड गर्नुहोस् (Change unconfirmed; reload before editing again)'});
      }
    }finally{
      if(manageBusyRef.current===operation)manageBusyRef.current=null;
      if(requestScopeRef.current===requestScope)setActionLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <button type="button" disabled={actionLoading} onClick={()=>loadEvents()}>कार्यक्रम पुनः लोड (Reload events)</button>
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">कुल क्यालेन्डर तथा चाडपर्व (Kinship Observances Calendar)</h1>
          <p className="text-sm text-slate-500">विक्रम संवत् २०००-२०९० तथा तिथि अनुसारका कुल पूजा, श्राद्ध र सभा सम्मेलन</p>
        </div>
        <button
          disabled={sessionLoading || !accessToken || !user}
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-semibold transition shadow-sm"
        >
          + नयाँ कार्यक्रम थप्नुहोस् (Create Event)
        </button>
      </div>

      <RecurringReminders events={events}/>

      {message && (
        <div className={`p-4 rounded-lg text-sm font-medium ${message.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-800 border border-rose-200'}`}>
          {message.text}
        </div>
      )}

      {accessToken&&<CalendarPeriod token={accessToken}/>}
      {accessToken&&<details><summary className="cursor-pointer">सबै कार्यक्रम हेर्नुहोस् (Browse all calendar events)</summary><CalendarBrowse token={accessToken}/></details>}
      <p className="text-sm">The management list shows up to 100 events. Use Browse all calendar events to reach earlier records.</p>
      {/* Events Grid */}
      {loading ? (
        <div className="text-center py-12 text-slate-400 text-sm">कार्यक्रमहरू लोड हुँदैछन्...</div>
      ) : events.length === 0 ? (
        <div className="bg-white rounded-xl p-12 text-center border border-slate-200 text-slate-400 text-sm">
          कुनै कार्यक्रम फेला परेन । नयाँ कार्यक्रम थप्न माथिको बटन थिच्नुहोस् ।
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {events.map((ev) => (
            <article key={ev.id} aria-label={ev.title} className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4 hover:border-indigo-200 transition">
              <div className="flex justify-between items-start">
                <span className="px-2 py-0.5 rounded text-xs font-bold bg-amber-100 text-amber-800">
                  {ev.eventType}
                </span>
                <span className="text-xs font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                  {ev.audienceScope}
                </span>
              </div>

              <div>
                <h3 className="font-bold text-base text-slate-900">{ev.title}</h3>
                {ev.description && <p className="text-xs text-slate-500 mt-1 line-clamp-2">{ev.description}</p>}
              </div>

              <div className="text-xs space-y-1 bg-slate-50 p-3 rounded-lg border border-slate-100">
                {ev.startsAt && <div>{label('time')}: {formatNepalInstant(ev.startsAt)}</div>}
                {ev.solarDate ? (
                  <div><span className="text-slate-400">मिति (BS):</span> <span className="font-semibold text-slate-800">{ev.solarDate}</span></div>
                ) : (
                  <div><span className="text-slate-400">मिति प्रकार:</span> <span className="font-semibold text-indigo-600">{ev.startsAt ? label('ad') : 'तिथि मात्र (Tithi Only)'}</span></div>
                )}
                {ev.tithiYearBs && (
                  <div><span className="text-slate-400">तिथि:</span> <span className="font-semibold text-slate-800">वि.सं. {ev.tithiYearBs} महिना {ev.tithiMonthBs} ({ev.tithiPaksha} {ev.tithiNumber})</span></div>
                )}
                {ev.location && (
                  <div><span className="text-slate-400">स्थान:</span> <span className="text-slate-700">{ev.location}</span></div>
                )}
              </div>
              {ev.lifecycleState === 'CANCELLED' && <p role="status">{label('cancelled')}</p>}
              {ev.rsvpCounts && <p>{label('attendance')}: {ev.rsvpCounts.going} Going · {ev.rsvpCounts.maybe} Maybe · {ev.rsvpCounts.declined} Declined</p>}
              {ev.canManage && ev.lifecycleState !== 'CANCELLED' && <button type="button" disabled={actionLoading||blockedEdits.has(ev.id)} onClick={async()=>{
                setEditing(ev);setEditDescription(ev.description??'');setEditLocation(ev.location??'');setEditTitle(ev.title);setEditStart(ev.startsAt?formatNepalInstant(ev.startsAt).slice(0,16).replace(' ','T'):'');setEditTimeChanged(false);setCancelReason('');setHistory([]);
                try{if(accessToken){const revisions=await ApiClient.calendarRequest(accessToken,`events/${ev.id}/history`);if(requestScopeRef.current===requestScope)setHistory(revisions);}}
                catch(error:any){if(requestScopeRef.current===requestScope)setMessage({type:'error',text:error.message});}
              }}>{label('edit')}</button>}
              <div className="flex flex-wrap gap-2" aria-label="Attendance response">
                {(['GOING', 'MAYBE', 'DECLINED'] as const).map((response) => (
                  <button key={response} type="button" aria-pressed={ev.myRsvp === response}
                    disabled={rsvpPending !== null || ev.lifecycleState === 'CANCELLED'}
                    onClick={() => handleRsvp(ev.id, response)}
                    className={`px-3 py-1.5 rounded text-xs font-semibold disabled:opacity-50 ${ev.myRsvp === response ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-700'}`}>
                    {response === 'GOING' ? 'जानेछु (Going)' : response === 'MAYBE' ? 'सम्भवतः (Maybe)' : 'जान्न (Decline)'}
                  </button>
                ))}
              </div>
            </article>
          ))}
        </div>
      )}

      {editing && <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
        <div role="dialog" aria-modal="true" aria-label={label('edit')} className="bg-white max-w-lg w-full p-6 space-y-4 rounded-xl">
          <h2>{label('edit')}</h2>
          <label>Title<input aria-label="Event title" disabled={actionLoading} value={editTitle} onChange={e=>setEditTitle(e.target.value)} className="block border p-2 w-full" /></label>
          {editOrdinary && <>
            <label>विवरण (Details)<textarea aria-label="Event details" disabled={actionLoading} value={editDescription} onChange={e=>setEditDescription(e.target.value)} /></label>
            <label>स्थान (Venue)<input aria-label="Event venue" disabled={actionLoading} value={editLocation} onChange={e=>setEditLocation(e.target.value)} /></label>
          </>}
          {editCanReschedule && <label>सुरु समय (Start · Nepal UTC+05:45)<input aria-label="Event start · Nepal UTC+05:45" type="datetime-local" value={editStart} disabled={actionLoading} onChange={e=>{setEditStart(e.target.value);setEditTimeChanged(true);}} /></label>}
          <button disabled={actionLoading||blockedEdits.has(editing.id)} onClick={()=>manage()}>{label('save')}</button>
          <label>{label('reason')}<input aria-label={label('reason')} value={cancelReason} onChange={e=>setCancelReason(e.target.value)} className="block border p-2 w-full" /></label>
          <button disabled={actionLoading||blockedEdits.has(editing.id)||cancelReason.trim().length<5} onClick={()=>manage(true)}>{label('cancel')}</button>
          <p>Revisions: {history.map(r=>r.version).join(', ')}</p>
          {history.filter(r=>r.audienceEvidence).map(r=><p key={r.version}>संस्करण (Revision) {r.version}: {r.audienceEvidence.basis.selection.type} · {r.audienceEvidence.basis.recipients.length} आमन्त्रित खाताहरू (recipient accounts)</p>)}
          {blockedEdits.has(editing.id) && <button disabled={actionLoading} onClick={async()=>{setEditing(null);await loadEvents();}}>बन्द गरी पुनः लोड (Close and reload events)</button>}
          <button disabled={actionLoading} onClick={()=>setEditing(null)}>{label('close')}</button>
        </div>
      </div>}
      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <form onSubmit={handleCreate} aria-label="Create event" role="dialog" aria-modal="true" className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-6 space-y-4 shadow-2xl border border-slate-100">
            <fieldset disabled={actionLoading||!!pendingCreate} className="space-y-4">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h3 className="text-lg font-bold text-slate-900">नयाँ क्यालेन्डर कार्यक्रम</h3>
              <button type="button" onClick={() => setShowCreateModal(false)} className="text-slate-400 hover:text-slate-600 font-bold">✕</button>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">कार्यक्रमको शीर्षक (Title)*</label>
              <input
                required
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="उदा: कुल पूजा २०८३"
                className="w-full text-xs p-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">प्रकार (Event Type)*</label>
                <select
                  value={formData.eventType}
                  onChange={(e) => setFormData({ ...formData, eventType: e.target.value })}
                  className="w-full text-xs p-2.5 border border-slate-200 rounded-lg"
                >
                  <option value="KUL_PUJA">कुल पूजा (Kul Puja)</option>
                  <option value="SHRADDHA">श्राद्ध (Shraddha)</option>
                  <option value="GENERAL_EVENT">वार्षिक भेला (Gathering)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">पहुँच दायरा (Audience Scope)*</label>
                <select
                  value={formData.audienceScope}
                  onChange={(e) => setFormData({ ...formData, audienceScope: e.target.value as any })}
                  className="w-full text-xs p-2.5 border border-slate-200 rounded-lg"
                >
                  <option value={EventAudienceScope.COMMUNITY}>समुदाय (COMMUNITY)</option>
                  <option value={EventAudienceScope.BRANCH}>शाखा (BRANCH)</option>
                  <option value={EventAudienceScope.FAMILY}>परिवार (FAMILY)</option>
                  <option value={EventAudienceScope.PUBLIC}>सार्वजनिक (PUBLIC)</option>
                  <option value={EventAudienceScope.PRIVATE}>निजी (PRIVATE)</option>
                </select>
              </div>
            </div>

            {formData.audienceScope === EventAudienceScope.BRANCH && <label className="block text-sm">Branch
              <select required value={formData.branchId} onChange={e=>setFormData({...formData,branchId:e.target.value})}>
                <option value="">Select branch</option>{branches.map(b=><option key={b.id} value={b.id}>{b.nameNepali} / {b.nameEnglish}</option>)}
              </select>
            </label>}
            <label className="block text-sm">{label('dateMode')}
              <select aria-label={label('dateMode')} value={dateMode} onChange={e=>setDateMode(e.target.value as 'BS'|'AD')}>
                <option value="BS">{label('bs')}</option><option value="AD">{label('ad')}</option>
              </select>
            </label>
            {dateMode === 'AD' && <div className="space-y-2">
              <label className="block text-sm">{label('time')} · नेपाल समय (Nepal UTC+05:45)<input aria-label={`${label('time')} · Nepal UTC+05:45`} type="datetime-local" required value={startsAt} onChange={e=>setStartsAt(e.target.value)} className="block border p-2 w-full" /></label>
              <label><input type="checkbox" checked={reminder} onChange={e=>setReminder(e.target.checked)} /> {label('oneHour')}</label>
              <p className="text-xs text-slate-500">{label('schedulingNote')}</p>
            </div>}
            <div hidden={dateMode !== 'BS'}>
              <label className="block text-xs font-medium text-slate-700 mb-1">सौर मिति (BS Date - Optional for Tithi events)</label>
              <input
                value={formData.solarDate}
                onChange={(e) => setFormData({ ...formData, solarDate: e.target.value })}
                placeholder="2083-08-15 (खाली राखेमा तिथि मात्र मानिनेछ)"
                className="w-full text-xs p-2.5 border border-slate-200 rounded-lg"
              />
            </div>

            <div style={{display:dateMode === 'BS' ? 'grid' : 'none'}} className="grid grid-cols-4 gap-2 bg-slate-50 p-3 rounded-lg border border-slate-100 text-xs">
              <div>
                <label className="block text-slate-500 mb-1">वर्ष (BS)</label>
                <input
                  type="number"
                  min={2000}
                  max={2090}
                  value={formData.tithiYearBs}
                  onChange={(e) => setFormData({ ...formData, tithiYearBs: Number(e.target.value) })}
                  className="w-full p-2 border border-slate-200 rounded"
                />
              </div>
              <div>
                <label className="block text-slate-500 mb-1">महिना (१-१२)</label>
                <input
                  type="number"
                  min={1}
                  max={12}
                  value={formData.tithiMonthBs}
                  onChange={(e) => setFormData({ ...formData, tithiMonthBs: Number(e.target.value) })}
                  className="w-full p-2 border border-slate-200 rounded"
                />
              </div>
              <div>
                <label className="block text-slate-500 mb-1">पक्ष</label>
                <select
                  value={formData.tithiPaksha}
                  onChange={(e) => setFormData({ ...formData, tithiPaksha: e.target.value })}
                  className="w-full p-2 border border-slate-200 rounded"
                >
                  <option value="SHUKLA">शुक्ल</option>
                  <option value="KRISHNA">कृष्ण</option>
                </select>
              </div>
              <div>
                <label className="block text-slate-500 mb-1">तिथि (१-१५)</label>
                <input
                  type="number"
                  min={1}
                  max={15}
                  value={formData.tithiNumber}
                  onChange={(e) => setFormData({ ...formData, tithiNumber: Number(e.target.value) })}
                  className="w-full p-2 border border-slate-200 rounded"
                />
              </div>
            </div>

            {accessToken&&<GenealogyAudience token={accessToken} branches={branches} onChange={(value,enabled)=>{setSelection(value);setDerivedEnabled(enabled);setDerivedPreview(null);}}/>}
            {!derivedEnabled&&<fieldset className="space-y-2 border p-3 rounded"><legend>{label('invitees')}</legend>
              <label>{label('search')}<input aria-label={label('search')} value={search} onChange={e=>setSearch(e.target.value)} className="block border p-2 w-full" /></label>
              <button type="button" disabled={actionLoading||search.trim().length<2} onClick={searchMembers}>{label('search')}</button>
              {candidates.map(member=><label key={member.userId} className="block text-sm"><input type="checkbox" checked={invitees.includes(member.userId)} onChange={e=>{
                setInvitees(ids=>e.target.checked?[...ids,member.userId]:ids.filter(id=>id!==member.userId));setPreviewKey(null);
              }} /> {member.name}</label>)}
              <p role="status">{label('count')}: {invitees.length}</p>
            </fieldset>}
            {derivedPreview&&<section aria-label="Genealogy recipient preview" className="border p-3 space-y-2"><p role="status">आमन्त्रित खाताहरू (Recipient accounts): {derivedPreview.recipientCount}</p><p>म्याद (Expires): {new Date(derivedPreview.expiresAt).toLocaleString()}</p><button type="button" onClick={()=>setDerivedPreview(null)}>फेरि पूर्वावलोकन (Preview again)</button>{derivedPreview.recipients.map((r:any)=><p key={r.userId}>{r.name}</p>)}</section>}
            </fieldset>
            {pendingCreate&&<p role="status">बाँकी सिर्जना सुरक्षित रूपमा जाँच्नुहोस्। (Recover the pending creation before starting another event.)</p>}
            <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
              {pendingCreate&&<button type="button" disabled={actionLoading} onClick={resolvePendingCreate}>बाँकी सिर्जना जाँच वा बन्द (Recover or close pending creation)</button>}
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                disabled={actionLoading}
                className="px-4 py-2 text-xs text-slate-500 hover:text-slate-700"
              >
                रद्द गर्नुहोस्
              </button>
              <button
                type="submit"
                disabled={actionLoading||!!(pendingCreate&&!pendingCreate.payload)||(!pendingCreate&&derivedEnabled&&(!selection||derivedPreview?.recipientCount===0))}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold"
              >
                {pendingCreate?'पुनः प्रयास (Retry creation)':derivedEnabled?(derivedPreview?label('confirm'):label('preview')):invitees.length ? (previewKey === JSON.stringify({ids:invitees,scope:formData.audienceScope,branch:formData.branchId}) ? label('confirm') : label('preview')) : 'सिर्जना गर्नुहोस् (Save)'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
