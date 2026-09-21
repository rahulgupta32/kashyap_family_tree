'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/auth-context';
import { ApiClient } from '../../lib/api-client';
import { UpdateProfileDto, PrivacySettingsDto, VisibilityScope } from '@kashyap/contracts';

export default function ProfileAdminPage() {
  const { user, accessToken, refreshSession, isLoading } = useAuth();
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [profileForm, setProfileForm] = useState<UpdateProfileDto>({
    occupation: '',
    education: '',
    biography: '',
    currentAddress: '',
  });
  const [privacy, setPrivacy] = useState<PrivacySettingsDto>({
    profileVisibility: 'VERIFIED_COMMUNITY',
    contactVisibility: 'IMMEDIATE_FAMILY',
    addressVisibility: 'PRIVATE',
  });

  const [preferences, setPreferences] = useState({
    pushEnabled: true,
    smsEnabled: true,
    emailEnabled: false,
    familyEventsEnabled: true,
    juthoAlertsEnabled: true,
    communityPostsEnabled: false,
  });

  useEffect(() => {
    if (isLoading) return;
    loadProfile();
  }, [accessToken, isLoading]);

  async function loadProfile() {
    if (isLoading || !accessToken) return;

    setLoading(true);
    try {
      const data = await ApiClient.getProfile(accessToken);
      setProfile(data);
      const p = data?.person || data?.personDetail || data;
      if (p) {
        setProfileForm({
          occupation: p.occupation || '',
          education: p.education || '',
          biography: p.biography || '',
          currentAddress: p.currentAddress || p.current_address || '',
        });
      }
      if (data.privacySettings) {
        setPrivacy(data.privacySettings);
      }
      if (data.preferences) {
        setPreferences(data.preferences);
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  }

  async function saveProfile() {
    const activeToken = accessToken || (typeof window !== 'undefined' ? localStorage.getItem('kashyap_admin_access_token') : null);
    if (!activeToken) return;
    setSaving(true);
    setMessage(null);
    try {
      const updated = await ApiClient.updateProfile(activeToken, profileForm);
      if (updated?.person) {
        setProfile(updated);
        setProfileForm({
          occupation: updated.person.occupation || '',
          education: updated.person.education || '',
          biography: updated.person.biography || '',
          currentAddress: updated.person.currentAddress || updated.person.current_address || '',
        });
      }
      setMessage({ type: 'success', text: 'व्यक्तिगत विवरण सफलतापूर्वक सुरक्षित गरियो ।' });
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setSaving(false);
    }
  }
  async function savePrivacy() {
    const activeToken = accessToken || (typeof window !== 'undefined' ? localStorage.getItem('kashyap_admin_access_token') : null);
    if (!activeToken) return;
    setSaving(true);
    setMessage(null);
    try {
      await ApiClient.updatePrivacySettings(activeToken, privacy);
      setMessage({ type: 'success', text: 'गोपनीयता सेटिङहरू सफलतापूर्वक अद्यावधिक गरियो ।' });
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setSaving(false);
    }
  }

  async function savePreferences() {
    const activeToken = accessToken || (typeof window !== 'undefined' ? localStorage.getItem('kashyap_admin_access_token') : null);
    if (!activeToken) return;
    setSaving(true);
    setMessage(null);
    try {
      await ApiClient.updateNotificationPreferences(activeToken, preferences);
      setMessage({ type: 'success', text: 'सूचना प्राथमिकताहरू सफलतापूर्वक सुरक्षित गरियो ।' });
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="text-center py-12 text-slate-400 text-sm">लोड हुँदैछ...</div>;
  }

  return (
    <div className="max-w-4xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">मेरो प्रोफाइल तथा गोपनीयता (Profile & Privacy Settings)</h1>
        <p className="text-sm text-slate-500">व्यक्तिगत विवरण, गोपनीयता दायरा र सूचना प्राथमिकताहरूको स्व-व्यवस्थापन</p>
      </div>

      {message && (
        <div className={`p-4 rounded-lg text-sm font-medium ${message.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-800 border border-rose-200'}`}>
          {message.text}
        </div>
      )}

      {/* Identity Card */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm flex items-center gap-6">
        <div className="w-16 h-16 rounded-full bg-saffron-100 text-saffron-700 flex items-center justify-center font-bold text-2xl border-2 border-saffron-300">
          क
        </div>
        <div>
          <h2 className="text-lg font-bold text-slate-900">{profile?.person?.primaryNameNepali || user?.id || 'प्रयोगकर्ता'}</h2>
          <p className="text-xs text-slate-500">{profile?.phoneNumber || user?.phoneNumber} • भूमिका: {user?.roles?.join(', ') || 'ADMIN'}</p>
          <p className="text-xs text-emerald-600 font-semibold mt-1">✓ आधिकारिक प्रमाणीकृत सदस्य (Verified Lineage)</p>
        </div>
      </div>

      {/* Profile Details Form Section */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-6">
        <div className="border-b border-slate-100 pb-3">
          <h3 className="text-base font-bold text-slate-900">व्यक्तिगत विवरण (Personal Details)</h3>
          <p className="text-xs text-slate-500">पेशा, शिक्षा, जीवनी तथा हालको बसोबासको विवरण अद्यावधिक गर्नुहोस्</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">हालको ठेगाना (Current Address)</label>
            <input
              type="text"
              value={profileForm.currentAddress || ''}
              onChange={(e) => setProfileForm({ ...profileForm, currentAddress: e.target.value })}
              placeholder="उदा: पोखरा-१५, कास्की"
              className="w-full text-xs p-2.5 border border-slate-200 rounded-lg"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">पेशा / व्यवसाय (Occupation)</label>
            <input
              type="text"
              value={profileForm.occupation || ''}
              onChange={(e) => setProfileForm({ ...profileForm, occupation: e.target.value })}
              placeholder="उदा: इन्जिनियर / प्राध्यापक / कृषक"
              className="w-full text-xs p-2.5 border border-slate-200 rounded-lg"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">शैक्षिक योग्यता (Education)</label>
            <input
              type="text"
              value={profileForm.education || ''}
              onChange={(e) => setProfileForm({ ...profileForm, education: e.target.value })}
              placeholder="उदा: स्नातकोत्तर (M.Sc.)"
              className="w-full text-xs p-2.5 border border-slate-200 rounded-lg"
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-xs font-semibold text-slate-700 mb-1">जीवनी / परिचय (Biography)</label>
            <textarea
              value={profileForm.biography || ''}
              onChange={(e) => setProfileForm({ ...profileForm, biography: e.target.value })}
              rows={3}
              placeholder="आफ्नो संक्षिप्त परिचय वा योगदान उल्लेख गर्नुहोस्..."
              className="w-full text-xs p-2.5 border border-slate-200 rounded-lg"
            />
          </div>
        </div>

        <div className="flex justify-end">
          <button
            onClick={saveProfile}
            disabled={saving}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold transition"
          >
            विवरण सुरक्षित गर्नुहोस् (Save Profile)
          </button>
        </div>
      </div>
      {/* Privacy Controls Section */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-6">
        <div className="border-b border-slate-100 pb-3">
          <h3 className="text-base font-bold text-slate-900">गोपनीयता नियन्त्रण (Granular Privacy Scope)</h3>
          <p className="text-xs text-slate-500">तपाईंको फोन नम्बर, ठेगाना र विवरण कसले हेर्न पाउने छनौट गर्नुहोस्</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-2">प्रोफाइल दृश्यता (Profile Visibility)</label>
            <select
              value={privacy.profileVisibility}
              onChange={(e) => setPrivacy({ ...privacy, profileVisibility: e.target.value as VisibilityScope })}
              className="w-full text-xs p-2.5 border border-slate-200 rounded-lg"
            >
              <option value="PUBLIC">सार्वजनिक (PUBLIC)</option>
              <option value="VERIFIED_COMMUNITY">प्रमाणीकृत समुदाय (VERIFIED_COMMUNITY)</option>
              <option value="IMMEDIATE_FAMILY">नजिकको परिवार (IMMEDIATE_FAMILY)</option>
              <option value="PRIVATE">गोप्य (PRIVATE)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-2">सम्पर्क फोन नम्बर (Contact Phone)</label>
            <select
              value={privacy.contactVisibility}
              onChange={(e) => setPrivacy({ ...privacy, contactVisibility: e.target.value as VisibilityScope })}
              className="w-full text-xs p-2.5 border border-slate-200 rounded-lg"
            >
              <option value="PUBLIC">सार्वजनिक (PUBLIC)</option>
              <option value="VERIFIED_COMMUNITY">प्रमाणीकृत समुदाय (VERIFIED_COMMUNITY)</option>
              <option value="IMMEDIATE_FAMILY">नजिकको परिवार (IMMEDIATE_FAMILY)</option>
              <option value="PRIVATE">गोप्य (PRIVATE)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-2">ठेगाना दृश्यता (Address Visibility)</label>
            <select
              value={privacy.addressVisibility}
              onChange={(e) => setPrivacy({ ...privacy, addressVisibility: e.target.value as VisibilityScope })}
              className="w-full text-xs p-2.5 border border-slate-200 rounded-lg"
            >
              <option value="PUBLIC">सार्वजनिक (PUBLIC)</option>
              <option value="VERIFIED_COMMUNITY">प्रमाणीकृत समुदाय (VERIFIED_COMMUNITY)</option>
              <option value="IMMEDIATE_FAMILY">नजिकको परिवार (IMMEDIATE_FAMILY)</option>
              <option value="PRIVATE">गोप्य (PRIVATE)</option>
            </select>
          </div>
        </div>

        <div className="flex justify-end">
          <button
            onClick={savePrivacy}
            disabled={saving}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold transition"
          >
            गोपनीयता सुरक्षित गर्नुहोस् (Save Privacy)
          </button>
        </div>
      </div>

      {/* Notification Preferences Section */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-6">
        <div className="border-b border-slate-100 pb-3">
          <h3 className="text-base font-bold text-slate-900">सूचना प्राथमिकताहरू (Notification Channels)</h3>
          <p className="text-xs text-slate-500">कुन माध्यमबाट सन्देश प्राप्त गर्ने छनौट गर्नुहोस्</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <label className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg cursor-pointer">
            <input
              type="checkbox"
              checked={preferences.pushEnabled}
              onChange={(e) => setPreferences({ ...preferences, pushEnabled: e.target.checked })}
              className="rounded text-indigo-600 focus:ring-indigo-500"
            />
            <div>
              <div className="font-semibold text-slate-800">मोबाइल पुश सूचना (Push Notifications)</div>
              <div className="text-slate-500">एपमा तत्काल अलर्ट प्राप्त गर्नुहोस्</div>
            </div>
          </label>

          <label className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg cursor-pointer">
            <input
              type="checkbox"
              checked={preferences.smsEnabled}
              onChange={(e) => setPreferences({ ...preferences, smsEnabled: e.target.checked })}
              className="rounded text-indigo-600 focus:ring-indigo-500"
            />
            <div>
              <div className="font-semibold text-slate-800">एसएमएस सूचना (SMS Notifications)</div>
              <div className="text-slate-500">महत्वपूर्ण दाबी र जुठो सूचना मोबाइलमा</div>
            </div>
          </label>

          <label className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg cursor-pointer">
            <input
              type="checkbox"
              checked={preferences.juthoAlertsEnabled}
              onChange={(e) => setPreferences({ ...preferences, juthoAlertsEnabled: e.target.checked })}
              className="rounded text-indigo-600 focus:ring-indigo-500"
            />
            <div>
              <div className="font-semibold text-slate-800">जुठो/सुतक सतर्कता (Jutho Alerts)</div>
              <div className="text-slate-500">गोत्र तथा पुस्ता अनुसारका संस्कार सूचना</div>
            </div>
          </label>

          <label className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg cursor-pointer">
            <input
              type="checkbox"
              checked={preferences.familyEventsEnabled}
              onChange={(e) => setPreferences({ ...preferences, familyEventsEnabled: e.target.checked })}
              className="rounded text-indigo-600 focus:ring-indigo-500"
            />
            <div>
              <div className="font-semibold text-slate-800">पारिवारिक क्यालेन्डर कार्यक्रम (Calendar Events)</div>
              <div className="text-slate-500">कुल पूजा तथा भेला सम्बन्धी निम्तो</div>
            </div>
          </label>
        </div>

        <div className="flex justify-end">
          <button
            onClick={savePreferences}
            disabled={saving}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold transition"
          >
            प्राथमिकताहरू सुरक्षित गर्नुहोस् (Save Preferences)
          </button>
        </div>
      </div>
    </div>
  );
}
