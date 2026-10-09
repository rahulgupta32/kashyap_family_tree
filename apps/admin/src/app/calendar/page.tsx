'use client';

import { GenealogyAudience } from './genealogy-audience';
import { CalendarPeriod } from './period';
import { RecurringReminders } from './recurring-reminders';
import { CalendarBrowse } from './browse';
import { calendarManagement } from '@kashyap/localization';
import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { useAuth } from '../../context/auth-context';
import { ApiClient } from '../../lib/api-client';
import { CalendarEventDetailDto, EventAudienceScope, GenealogyAudienceSelection } from '@kashyap/contracts';

const label=(key: keyof typeof calendarManagement.en)=>`${calendarManagement.ne[key]} (${calendarManagement.en[key]})`;

export default function CalendarAdminPage() {
  const { accessToken, user, isLoading: sessionLoading } = useAuth();
  const [events, setEvents] = useState<CalendarEventDetailDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [formData, setFormData] = useState({
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
  const tokenRef=useRef(accessToken);tokenRef.current=accessToken;
  useEffect(()=>{setDerivedPreview(null);setPreviewKey(null);},[selection,formData.audienceScope,formData.branchId]);
  // Token rotation invalidates previews, but must not dismiss a form belonging
  // to the same account. Account/authority changes still clear private state.
  const authorityKey=user?.roles?.slice().sort().join(',');
  useEffect(()=>{setDerivedPreview(null);setPreviewKey(null);},[accessToken]);
  useLayoutEffect(()=>{setShowCreateModal(false);setDerivedEnabled(false);setSelection(undefined);setDerivedPreview(null);setInvitees([]);setCandidates([]);setPreviewKey(null);},[user?.id,authorityKey]);
  const [editing, setEditing] = useState<CalendarEventDetailDto | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [cancelReason, setCancelReason] = useState('');
  const [history, setHistory] = useState<any[]>([]);
  const [actionLoading, setActionLoading] = useState(false);
  const [rsvpPending, setRsvpPending] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    loadEvents();
    ApiClient.listBranches().then(setBranches).catch(()=>setBranches([]));
  }, [accessToken]);

  async function loadEvents() {
    if (!accessToken) return;
    setLoading(true);
    try {
      const data = await ApiClient.listCalendarEvents(accessToken);
      if(tokenRef.current!==accessToken)return;
      setEvents(data);
    } catch (err: any) {
      if(tokenRef.current!==accessToken)return;
      setMessage({ type: 'error', text: err.message });
    } finally {
      if(tokenRef.current===accessToken)setLoading(false);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!accessToken) return;
    setActionLoading(true);
    setMessage(null);
    try {
      const payload: any = {
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
        payload.startsAt = new Date(startsAt).toISOString();
        payload.reminderOffsets = reminder ? [60] : [];
        delete payload.tithiYearBs; delete payload.tithiMonthBs; delete payload.tithiPaksha; delete payload.tithiNumber;
      }
      if(derivedEnabled){
        if(!selection)throw new Error('आमन्त्रित समूह छान्नुहोस् (Choose an invitation audience)');
        payload.audienceSelection=selection;
        const key=JSON.stringify({selection,scope:formData.audienceScope,branch:payload.branchId??null});
        if(!derivedPreview||derivedPreview.key!==key||new Date(derivedPreview.expiresAt).getTime()<=Date.now()){
          const result=await ApiClient.calendarRequest(accessToken,'events/preview','POST',{audienceSelection:selection,audienceScope:formData.audienceScope,...(payload.branchId?{branchId:payload.branchId}:{})});
          if(tokenRef.current!==accessToken)return;setDerivedPreview({...result,key});return;
        }
        payload.audiencePreviewId=derivedPreview.previewId;
      }else payload.invitedUserIds = invitees;
      const key = JSON.stringify({ids:invitees,scope:formData.audienceScope,branch:formData.branchId});
      if (!derivedEnabled && invitees.length && previewKey !== key) {
        await ApiClient.calendarRequest(accessToken,'events/preview','POST',{invitedUserIds:invitees,audienceScope:formData.audienceScope,...(formData.audienceScope===EventAudienceScope.BRANCH?{branchId:formData.branchId}:{})});
        if(tokenRef.current!==accessToken)return;setPreviewKey(key); return;
      }
      if (dateMode === 'BS' && formData.solarDate) {
        payload.solarDate = formData.solarDate;
      }
      await ApiClient.createCalendarEvent(accessToken, payload);
      if(tokenRef.current!==accessToken)return;
      setDerivedPreview(null);setDerivedEnabled(false);setSelection(undefined);
      setMessage({ type: 'success', text: 'वार्षिक कार्यक्रम सफलतापूर्वक सिर्जना भयो ।' });
      setShowCreateModal(false);setInvitees([]);setCandidates([]);setPreviewKey(null);setStartsAt('');setReminder(false);setDateMode('BS');
      setFormData({
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
      await loadEvents();
    } catch (err: any) {
      if(tokenRef.current!==accessToken)return;setDerivedPreview(null);setPreviewKey(null);
      setMessage({ type: 'error', text: err.message });
    } finally {
      setActionLoading(false);
    }
  }

  async function handleRsvp(id: string, response: 'GOING' | 'MAYBE' | 'DECLINED') {
    if (!accessToken) return;
    setRsvpPending(id);
    setMessage(null);
    try {
      await ApiClient.rsvpCalendarEvent(accessToken, id, response);
      await loadEvents();
      setMessage({ type: 'success', text: 'उपस्थिति सुरक्षित गरियो (RSVP saved)' });
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message });
    } finally {
      setRsvpPending(null);
    }
  }

  async function searchMembers() {
    if(!accessToken)return;
    setActionLoading(true);
    try {setCandidates(await ApiClient.calendarRequest(accessToken,`invitees?${new URLSearchParams({q:search,audienceScope:formData.audienceScope,...(formData.audienceScope===EventAudienceScope.BRANCH?{branchId:formData.branchId}:{})})}`));}
    catch(error:any){setMessage({type:'error',text:error.message});}
    finally{setActionLoading(false);}
  }
  async function manage(cancel=false) {
    if(!accessToken||!editing)return;
    setActionLoading(true);setMessage(null);
    try {
      await ApiClient.calendarRequest(accessToken,`events/${editing.id}${cancel?'/cancel':''}`,cancel?'POST':'PATCH',
        cancel?{version:editing.version,reason:cancelReason}:{version:editing.version,title:editTitle});
      setEditing(null);await loadEvents();
    }catch(error:any){setMessage({type:'error',text:error.message});}
    finally{setActionLoading(false);}
  }

  return (
    <div className="space-y-6">
      <RecurringReminders events={events}/>
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">कुल क्यालेन्डर तथा चाडपर्व (Kinship Observances Calendar)</h1>
          <p className="text-sm text-slate-500">विक्रम संवत् २०००-२०९० तथा तिथि अनुसारका कुल पूजा, श्राद्ध र सभा सम्मेलन</p>
        </div>
        <button
          disabled={sessionLoading || !accessToken || loading}
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-semibold transition shadow-sm"
        >
          + नयाँ कार्यक्रम थप्नुहोस् (Create Event)
        </button>
      </div>

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
                {ev.startsAt && <div>{label('time')}: {new Date(ev.startsAt).toLocaleString()}</div>}
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
              {ev.canManage && ev.lifecycleState !== 'CANCELLED' && <button type="button" onClick={async()=>{
                setEditing(ev);setEditTitle(ev.title);setCancelReason('');setHistory([]);
                try{if(accessToken)setHistory(await ApiClient.calendarRequest(accessToken,`events/${ev.id}/history`));}
                catch(error:any){setMessage({type:'error',text:error.message});}
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
          <label>Title<input aria-label="Event title" value={editTitle} onChange={e=>setEditTitle(e.target.value)} className="block border p-2 w-full" /></label>
          <button disabled={actionLoading} onClick={()=>manage()}>{label('save')}</button>
          <label>{label('reason')}<input aria-label={label('reason')} value={cancelReason} onChange={e=>setCancelReason(e.target.value)} className="block border p-2 w-full" /></label>
          <button disabled={actionLoading||cancelReason.trim().length<5} onClick={()=>manage(true)}>{label('cancel')}</button>
          <p>Revisions: {history.map(r=>r.version).join(', ')}</p>
          {history.filter(r=>r.audienceEvidence).map(r=><p key={r.version}>संस्करण (Revision) {r.version}: {r.audienceEvidence.basis.selection.type} · {r.audienceEvidence.basis.recipients.length} आमन्त्रित खाताहरू (recipient accounts)</p>)}
          <button onClick={()=>setEditing(null)}>{label('close')}</button>
        </div>
      </div>}
      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <form onSubmit={handleCreate} aria-label="Create event" role="dialog" aria-modal="true" className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-6 space-y-4 shadow-2xl border border-slate-100">
            <fieldset disabled={actionLoading} className="space-y-4">
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
              <label className="block text-sm">{label('time')}<input aria-label={label('time')} type="datetime-local" required value={startsAt} onChange={e=>setStartsAt(e.target.value)} className="block border p-2 w-full" /></label>
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
            <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 text-xs text-slate-500 hover:text-slate-700"
              >
                रद्द गर्नुहोस्
              </button>
              <button
                type="submit"
                disabled={actionLoading||(derivedEnabled&&(!selection||derivedPreview?.recipientCount===0))}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold"
              >
                {derivedEnabled?(derivedPreview?label('confirm'):label('preview')):invitees.length ? (previewKey === JSON.stringify({ids:invitees,scope:formData.audienceScope,branch:formData.branchId}) ? label('confirm') : label('preview')) : 'सिर्जना गर्नुहोस् (Save)'}
              </button>
            </div>
            </fieldset>
          </form>
        </div>
      )}
    </div>
  );
}
