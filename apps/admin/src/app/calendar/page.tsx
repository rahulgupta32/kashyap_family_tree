'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/auth-context';
import { ApiClient } from '../../lib/api-client';
import { CalendarEventDetailDto, EventAudienceScope } from '@kashyap/contracts';

export default function CalendarAdminPage() {
  const { accessToken } = useAuth();
  const [events, setEvents] = useState<CalendarEventDetailDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    eventType: 'KUL_PUJA',
    audienceScope: EventAudienceScope.COMMUNITY,
    solarDate: '',
    tithiYearBs: 2083,
    tithiMonthBs: 1,
    tithiPaksha: 'SHUKLA',
    tithiNumber: 1,
  });
  const [actionLoading, setActionLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    loadEvents();
  }, [accessToken]);

  async function loadEvents() {
    if (!accessToken) return;
    setLoading(true);
    try {
      const data = await ApiClient.listCalendarEvents(accessToken);
      setEvents(data);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
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
        tithiYearBs: Number(formData.tithiYearBs),
        tithiMonthBs: Number(formData.tithiMonthBs),
        tithiPaksha: formData.tithiPaksha,
        tithiNumber: Number(formData.tithiNumber),
      };
      if (formData.solarDate) {
        payload.solarDate = formData.solarDate;
      }
      await ApiClient.createCalendarEvent(accessToken, payload);
      setMessage({ type: 'success', text: 'वार्षिक कार्यक्रम सफलतापूर्वक सिर्जना भयो ।' });
      setShowCreateModal(false);
      setFormData({
        title: '',
        description: '',
        eventType: 'KUL_PUJA',
        audienceScope: EventAudienceScope.COMMUNITY,
        solarDate: '',
        tithiYearBs: 2083,
        tithiMonthBs: 1,
        tithiPaksha: 'SHUKLA',
        tithiNumber: 1,
      });
      await loadEvents();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setActionLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">कुल क्यालेन्डर तथा चाडपर्व (Kinship Observances Calendar)</h1>
          <p className="text-sm text-slate-500">विक्रम संवत् २०००-२०९० तथा तिथि अनुसारका कुल पूजा, श्राद्ध र सभा सम्मेलन</p>
        </div>
        <button
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
            <div key={ev.id} className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4 hover:border-indigo-200 transition">
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
                {ev.solarDate ? (
                  <div><span className="text-slate-400">मिति (BS):</span> <span className="font-semibold text-slate-800">{ev.solarDate}</span></div>
                ) : (
                  <div><span className="text-slate-400">मिति प्रकार:</span> <span className="font-semibold text-indigo-600">तिथि मात्र (Tithi Only)</span></div>
                )}
                {ev.tithiYearBs && (
                  <div><span className="text-slate-400">तिथि:</span> <span className="font-semibold text-slate-800">वि.सं. {ev.tithiYearBs} महिना {ev.tithiMonthBs} ({ev.tithiPaksha} {ev.tithiNumber})</span></div>
                )}
                {ev.location && (
                  <div><span className="text-slate-400">स्थान:</span> <span className="text-slate-700">{ev.location}</span></div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <form onSubmit={handleCreate} className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl border border-slate-100">
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

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">सौर मिति (BS Date - Optional for Tithi events)</label>
              <input
                value={formData.solarDate}
                onChange={(e) => setFormData({ ...formData, solarDate: e.target.value })}
                placeholder="2083-08-15 (खाली राखेमा तिथि मात्र मानिनेछ)"
                className="w-full text-xs p-2.5 border border-slate-200 rounded-lg"
              />
            </div>

            <div className="grid grid-cols-4 gap-2 bg-slate-50 p-3 rounded-lg border border-slate-100 text-xs">
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
                disabled={actionLoading}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold"
              >
                सिर्जना गर्नुहोस् (Save)
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
