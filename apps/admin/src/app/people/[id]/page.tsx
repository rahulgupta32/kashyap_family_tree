'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '../../../context/auth-context';
import { ApiClient } from '../../../lib/api-client';
import {
  PersonDetailDto,
  Gender,
  LivingStatus,
  PrivacyVisibility,
  ParentType,
  SpouseStatus,
} from '@kashyap/contracts';

export default function PersonProfilePage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const { accessToken, user } = useAuth();
  const token = accessToken;

  const [person, setPerson] = useState<PersonDetailDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Edit Modal
  const [showEditModal, setShowEditModal] = useState(false);
  const [editForm, setEditForm] = useState({
    firstNameNepali: '',
    lastNameNepali: '',
    firstNameEnglish: '',
    lastNameEnglish: '',
    gender: Gender.MALE,
    livingStatus: LivingStatus.LIVING,
    birthDateBs: '',
    deathDateBs: '',
    birthPlace: '',
    moolGhar: '',
    justificationReason: '',
  });
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Parent Link Modal
  const [showParentModal, setShowParentModal] = useState(false);
  const [parentSearchQuery, setParentSearchQuery] = useState('');
  const [parentSearchResults, setParentSearchResults] = useState<any[]>([]);
  const [selectedParentId, setSelectedParentId] = useState('');
  const [parentType, setParentType] = useState<ParentType>(ParentType.BIOLOGICAL);

  // Spouse Link Modal
  const [showSpouseModal, setShowSpouseModal] = useState(false);
  const [spouseSearchQuery, setSpouseSearchQuery] = useState('');
  const [spouseSearchResults, setSpouseSearchResults] = useState<any[]>([]);
  const [selectedSpouseId, setSelectedSpouseId] = useState('');
  const [spouseMarriageDateBs, setSpouseMarriageDateBs] = useState('');

  // Child Link Modal
  const [showChildModal, setShowChildModal] = useState(false);
  const [childSearchQuery, setChildSearchQuery] = useState('');
  const [childSearchResults, setChildSearchResults] = useState<any[]>([]);
  const [selectedChildId, setSelectedChildId] = useState('');

  // Archive Modal
  const [showArchiveModal, setShowArchiveModal] = useState(false);
  const [archiveReason, setArchiveReason] = useState('');
  const [archiving, setArchiving] = useState(false);

  const fetchPerson = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const data = await ApiClient.getPerson(id, token || undefined);
      setPerson(data);

      const neName = data.names.find((n) => n.language === 'ne');
      const enName = data.names.find((n) => n.language === 'en');

      setEditForm({
        firstNameNepali: neName?.firstName || data.primaryNameNepali,
        lastNameNepali: neName?.lastName || 'अधिकारी',
        firstNameEnglish: enName?.firstName || data.primaryNameEnglish || '',
        lastNameEnglish: enName?.lastName || 'Adhikari',
        gender: data.gender,
        livingStatus: data.livingStatus,
        birthDateBs: data.birthDateBs || '',
        deathDateBs: data.deathDateBs || '',
        birthPlace: data.birthPlace || '',
        moolGhar: data.moolGhar || '',
        justificationReason: '',
      });
    } catch (err: any) {
      setError(err.message || 'व्यक्ति विवरण लोड गर्न सकिएन');
    } finally {
      setLoading(false);
    }
  }, [id, token]);

  useEffect(() => {
    fetchPerson();
  }, [fetchPerson]);

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !person) return;
    if (!editForm.justificationReason.trim()) {
      setEditError('परिमार्जनको कारण (Justification Reason) अनिवार्य छ');
      return;
    }

    setSavingEdit(true);
    setEditError(null);
    try {
      await ApiClient.updatePerson(
        person.id,
        {
          names: [
            {
              language: 'ne',
              firstName: editForm.firstNameNepali,
              lastName: editForm.lastNameNepali,
              fullName: `${editForm.firstNameNepali} ${editForm.lastNameNepali}`.trim(),
              isPrimary: true,
            },
            ...(editForm.firstNameEnglish
              ? [
                  {
                    language: 'en' as const,
                    firstName: editForm.firstNameEnglish,
                    lastName: editForm.lastNameEnglish,
                    fullName: `${editForm.firstNameEnglish} ${editForm.lastNameEnglish}`.trim(),
                    isPrimary: false,
                  },
                ]
              : []),
          ],
          gender: editForm.gender,
          livingStatus: editForm.livingStatus,
          birthDateBs: editForm.birthDateBs || undefined,
          deathDateBs: editForm.deathDateBs || undefined,
          birthPlace: editForm.birthPlace || undefined,
          moolGhar: editForm.moolGhar || undefined,
          justificationReason: editForm.justificationReason.trim(),
          version: person.version || 1,
        },
        token,
      );
      setShowEditModal(false);
      fetchPerson();
    } catch (err: any) {
      setEditError(err.message || 'सम्पादन गर्न असफल भयो');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleArchive = async () => {
    if (!token || !person || !archiveReason.trim()) return;
    setArchiving(true);
    try {
      await ApiClient.archivePerson(
        person.id,
        {
          reason: archiveReason.trim(),
        },
        token,
      );
      router.push('/people');
    } catch (err: any) {
      alert(`Archive failed: ${err.message}`);
      setArchiving(false);
    }
  };

  const searchCandidateParents = async (q: string) => {
    setParentSearchQuery(q);
    if (q.trim().length >= 2) {
      const res = await ApiClient.searchPersons({ query: q.trim(), limit: 5 }, token || undefined);
      setParentSearchResults(res.items.filter((p) => p.id !== id));
    }
  };

  const handleAddParent = async () => {
    if (!token || !selectedParentId) return;
    try {
      await ApiClient.addParentLink(id, selectedParentId, parentType, token);
      setShowParentModal(false);
      setSelectedParentId('');
      fetchPerson();
    } catch (err: any) {
      alert(`Parent link failed: ${err.message}`);
    }
  };

  const handleRemoveParent = async (parentId: string) => {
    if (!token || !confirm('के तपाईं यो नाता हटाउन निश्चित हुनुहुन्छ?')) return;
    try {
      await ApiClient.removeParentLink(id, parentId, token);
      fetchPerson();
    } catch (err: any) {
      alert(`Remove parent failed: ${err.message}`);
    }
  };

  const searchCandidateSpouses = async (q: string) => {
    setSpouseSearchQuery(q);
    if (q.trim().length >= 2) {
      const res = await ApiClient.searchPersons({ query: q.trim(), limit: 5 }, token || undefined);
      setSpouseSearchResults(res.items.filter((p) => p.id !== id));
    }
  };

  const handleAddSpouse = async () => {
    if (!token || !selectedSpouseId) return;
    try {
      await ApiClient.addSpouseLink(
        id,
        selectedSpouseId,
        SpouseStatus.CURRENT,
        spouseMarriageDateBs || undefined,
        token,
      );
      setShowSpouseModal(false);
      setSelectedSpouseId('');
      fetchPerson();
    } catch (err: any) {
      alert(`Spouse link failed: ${err.message}`);
    }
  };

  const handleRemoveSpouse = async (spouseId: string) => {
    if (!token || !confirm('के तपाईं यो वैवाहिक नाता हटाउन निश्चित हुनुहुन्छ?')) return;
    try {
      await ApiClient.removeSpouseLink(id, spouseId, token);
      fetchPerson();
    } catch (err: any) {
      alert(`Remove spouse failed: ${err.message}`);
    }
  };

  const searchCandidateChildren = async (q: string) => {
    setChildSearchQuery(q);
    if (q.trim().length >= 2) {
      const res = await ApiClient.searchPersons({ query: q.trim(), limit: 5 }, token || undefined);
      setChildSearchResults(res.items.filter((p) => p.id !== id));
    }
  };

  const handleAddChild = async () => {
    if (!token || !selectedChildId) return;
    try {
      await ApiClient.addParentLink(selectedChildId, id, ParentType.BIOLOGICAL, token);
      setShowChildModal(false);
      setSelectedChildId('');
      fetchPerson();
    } catch (err: any) {
      alert(`Child link failed: ${err.message}`);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12 text-slate-500 text-sm">
        लोड हुँदैछ (Loading person details)...
      </div>
    );
  }

  if (error || !person) {
    return (
      <div className="p-6 bg-red-50 border border-red-200 text-red-700 rounded-xl">
        <p className="font-bold">त्रुटि (Error):</p>
        <p className="text-sm mt-1">{error || 'व्यक्ति फेला परेन'}</p>
        <Link href="/people" className="inline-block mt-4 text-xs font-semibold underline">
          ← वंशावली सूचीमा फर्कनुहोस्
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header breadcrumb & actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
            <Link href="/people" className="hover:underline">
              वंशावली सूची
            </Link>
            <span>/</span>
            <span>{person.primaryNameNepali}</span>
          </div>
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold text-slate-900">{person.primaryNameNepali}</h2>
            {person.primaryNameEnglish && (
              <span className="text-slate-500 text-base">({person.primaryNameEnglish})</span>
            )}
            <span
              className={`text-xs px-2.5 py-0.5 rounded-full font-bold ${
                person.livingStatus === LivingStatus.LIVING
                  ? 'bg-green-100 text-green-800'
                  : 'bg-slate-200 text-slate-700'
              }`}
            >
              {person.livingStatus === LivingStatus.LIVING ? 'जीवित' : 'दिवंगत'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href={`/tree?focus=${person.id}`}
            className="px-4 py-2 bg-saffron-50 hover:bg-saffron-100 text-saffron-800 text-sm font-semibold rounded-lg border border-saffron-200 shadow-sm transition"
          >
            रुखमा हेर्नुहोस् (View Tree)
          </Link>

          <button
            onClick={() => setShowEditModal(true)}
            className="px-4 py-2 bg-saffron-600 hover:bg-saffron-700 text-white text-sm font-semibold rounded-lg shadow-sm transition"
          >
            सम्पादन (Edit)
          </button>

          <button
            onClick={() => setShowArchiveModal(true)}
            className="px-3 py-2 bg-red-50 hover:bg-red-100 text-red-700 text-sm font-semibold rounded-lg border border-red-200 transition"
          >
            अभिलेख (Archive)
          </button>
        </div>
      </div>

      {/* Info Cards Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Basic Details */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
          <h3 className="text-base font-bold text-slate-800 border-b border-slate-100 pb-2">
            व्यक्तिगत विवरण (Personal Info)
          </h3>

          <div className="grid grid-cols-2 gap-4 text-xs">
            <div>
              <span className="text-slate-500">पहिचान आईडी (Canonical ID)</span>
              <p className="font-mono text-slate-800 mt-0.5 text-[11px] truncate">{person.id}</p>
            </div>
            <div>
              <span className="text-slate-500">शाखा (Branch)</span>
              <p className="font-semibold text-slate-800 mt-0.5">
                {person.branchName || '-'}
              </p>
            </div>
            <div>
              <span className="text-slate-500">पुस्ता (Generation)</span>
              <p className="font-semibold text-slate-800 mt-0.5">
                {person.generation ? `पुस्ता ${person.generation}` : 'अज्ञात'}
              </p>
            </div>
            <div>
              <span className="text-slate-500">लिङ्ग (Gender)</span>
              <p className="font-semibold text-slate-800 mt-0.5">
                {person.gender === Gender.MALE
                  ? 'पुरुष'
                  : person.gender === Gender.FEMALE
                  ? 'महिला'
                  : 'अन्य'}
              </p>
            </div>
            <div>
              <span className="text-slate-500">जन्म मिति (DOB BS)</span>
              <p className="font-semibold text-slate-800 mt-0.5">
                {person.birthDateBs || 'अभिलेख छैन'}
              </p>
            </div>
            <div>
              <span className="text-slate-500">मृत्यु मिति (DOD BS)</span>
              <p className="font-semibold text-slate-800 mt-0.5">
                {person.deathDateBs || '—'}
              </p>
            </div>
            <div>
              <span className="text-slate-500">जन्मस्थान (Birthplace)</span>
              <p className="font-semibold text-slate-800 mt-0.5">
                {person.birthPlace || '—'}
              </p>
            </div>
            <div>
              <span className="text-slate-500">मूलघर (Mool Ghar)</span>
              <p className="font-semibold text-slate-800 mt-0.5">
                {person.moolGhar || '—'}
              </p>
            </div>
            <div>
              <span className="text-slate-500">संस्करण (Version)</span>
              <p className="font-mono text-slate-800 mt-0.5">v{person.version || 1}</p>
            </div>
          </div>
        </div>

        {/* Middle Column: Parents & Spouses */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-6">
          {/* Parents */}
          <div>
            <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-3">
              <h3 className="text-base font-bold text-slate-800">अभिभावक (Parents)</h3>
              <button
                onClick={() => setShowParentModal(true)}
                className="text-xs font-semibold text-saffron-600 hover:text-saffron-700"
              >
                + नाता जोड्नुहोस्
              </button>
            </div>
            {person.parents.length === 0 ? (
              <p className="text-xs text-slate-400">कुनै अभिभावक जोडिएको छैन</p>
            ) : (
              <div className="space-y-2">
                {person.parents.map((p) => (
                  <div
                    key={p.id}
                    className="p-3 bg-slate-50 rounded-lg flex items-center justify-between border border-slate-100 text-xs"
                  >
                    <div>
                      <Link
                        href={`/people/${p.personId}`}
                        className="font-bold text-slate-800 hover:underline"
                      >
                        {p.person?.primaryNameNepali || p.personId}
                      </Link>
                      <div className="text-[11px] text-slate-500">
                        {p.person?.gender === Gender.MALE ? 'पिता (Father)' : 'आमा (Mother)'} • {p.parentType}
                      </div>
                    </div>
                    <button
                      onClick={() => handleRemoveParent(p.personId)}
                      className="text-red-500 hover:text-red-700 font-bold px-2 py-1"
                    >
                      हटाउनुहोस्
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Spouses */}
          <div>
            <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-3">
              <h3 className="text-base font-bold text-slate-800">दम्पती (Spouses)</h3>
              <button
                onClick={() => setShowSpouseModal(true)}
                className="text-xs font-semibold text-saffron-600 hover:text-saffron-700"
              >
                + पति/पत्नी जोड्नुहोस्
              </button>
            </div>
            {person.spouses.length === 0 ? (
              <p className="text-xs text-slate-400">कुनै दम्पती जोडिएको छैन</p>
            ) : (
              <div className="space-y-2">
                {person.spouses.map((s) => (
                  <div
                    key={s.id}
                    className="p-3 bg-slate-50 rounded-lg flex items-center justify-between border border-slate-100 text-xs"
                  >
                    <div>
                      <Link
                        href={`/people/${s.spousePersonId}`}
                        className="font-bold text-slate-800 hover:underline"
                      >
                        {s.person?.primaryNameNepali || s.spousePersonId}
                      </Link>
                      <div className="text-[11px] text-slate-500">
                        विवाह मिति: {s.marriageDateBs || 'अज्ञात'} • {s.status}
                      </div>
                    </div>
                    <button
                      onClick={() => handleRemoveSpouse(s.spousePersonId)}
                      className="text-red-500 hover:text-red-700 font-bold px-2 py-1"
                    >
                      हटाउनुहोस्
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Children */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <h3 className="text-base font-bold text-slate-800">
              सन्तानहरू (Children) ({person.children.length})
            </h3>
            <button
              onClick={() => setShowChildModal(true)}
              className="text-xs font-semibold text-saffron-600 hover:text-saffron-700"
            >
              + सन्तान जोड्नुहोस्
            </button>
          </div>

          {person.children.length === 0 ? (
            <p className="text-xs text-slate-400">कुनै सन्तान जोडिएको छैन</p>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {person.children.map((c) => (
                <div
                  key={c.id}
                  className="p-3 bg-slate-50 rounded-lg flex items-center justify-between border border-slate-100 text-xs"
                >
                  <div>
                    <Link
                      href={`/people/${c.personId}`}
                      className="font-bold text-slate-800 hover:underline"
                    >
                      {c.person?.primaryNameNepali || c.personId}
                    </Link>
                    <div className="text-[11px] text-slate-500">
                      {c.person?.gender === Gender.MALE ? 'छोरा (Son)' : 'छोरी (Daughter)'} • {c.person?.livingStatus}
                    </div>
                  </div>
                  <Link
                    href={`/people/${c.personId}`}
                    className="text-saffron-600 hover:text-saffron-700 font-semibold"
                  >
                    विवरण →
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Edit Person Modal */}
      {showEditModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 my-8">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <h3 className="text-lg font-bold text-slate-900">
                विवरण परिमार्जन (Edit Person Details)
              </h3>
              <button
                onClick={() => setShowEditModal(false)}
                className="text-slate-400 hover:text-slate-600 text-xl font-bold"
              >
                ✕
              </button>
            </div>

            {editError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg">
                {editError}
              </div>
            )}

            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    पहिलो नाम (नेपाली) *
                  </label>
                  <input
                    type="text"
                    required
                    value={editForm.firstNameNepali}
                    onChange={(e) => setEditForm({ ...editForm, firstNameNepali: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-saffron-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    थर (नेपाली) *
                  </label>
                  <input
                    type="text"
                    required
                    value={editForm.lastNameNepali}
                    onChange={(e) => setEditForm({ ...editForm, lastNameNepali: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-saffron-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    First Name (English)
                  </label>
                  <input
                    type="text"
                    value={editForm.firstNameEnglish}
                    onChange={(e) => setEditForm({ ...editForm, firstNameEnglish: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-saffron-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Last Name (English)
                  </label>
                  <input
                    type="text"
                    value={editForm.lastNameEnglish}
                    onChange={(e) => setEditForm({ ...editForm, lastNameEnglish: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-saffron-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    स्थिति (Living Status) *
                  </label>
                  <select
                    value={editForm.livingStatus}
                    onChange={(e) =>
                      setEditForm({ ...editForm, livingStatus: e.target.value as LivingStatus })
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-saffron-500"
                  >
                    <option value={LivingStatus.LIVING}>जीवित (Living)</option>
                    <option value={LivingStatus.DECEASED}>दिवंगत (Deceased)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    जन्म मिति (DOB BS)
                  </label>
                  <input
                    type="text"
                    placeholder="YYYY-MM-DD"
                    value={editForm.birthDateBs}
                    onChange={(e) => setEditForm({ ...editForm, birthDateBs: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-saffron-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    मृत्यु मिति (DOD BS)
                  </label>
                  <input
                    type="text"
                    placeholder="YYYY-MM-DD"
                    value={editForm.deathDateBs}
                    onChange={(e) => setEditForm({ ...editForm, deathDateBs: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-saffron-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    जन्मस्थान (Birth Place)
                  </label>
                  <input
                    type="text"
                    value={editForm.birthPlace}
                    onChange={(e) => setEditForm({ ...editForm, birthPlace: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-saffron-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    मूलघर (Mool Ghar)
                  </label>
                  <input
                    type="text"
                    value={editForm.moolGhar}
                    onChange={(e) => setEditForm({ ...editForm, moolGhar: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-saffron-500"
                  />
                </div>
              </div>

              {/* Justification Input - Mandatory by GEN-FR-011 / ADM-FR-005 */}
              <div className="pt-2 border-t border-slate-100">
                <label className="block text-xs font-bold text-amber-900 mb-1">
                  परिमार्जनको कारण / औचित्य (Justification Reason) *
                </label>
                <textarea
                  required
                  rows={3}
                  placeholder="उदा. नागरिकता प्रमाण अनुसार नाम र जन्ममिति सच्याइएको..."
                  value={editForm.justificationReason}
                  onChange={(e) =>
                    setEditForm({ ...editForm, justificationReason: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-amber-300 rounded-lg text-sm focus:ring-2 focus:ring-saffron-500"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="px-4 py-2 border border-slate-300 text-slate-700 text-sm font-semibold rounded-lg hover:bg-slate-100"
                >
                  रद्द गर्नुहोस् (Cancel)
                </button>
                <button
                  type="submit"
                  disabled={savingEdit}
                  className="px-5 py-2 bg-saffron-600 hover:bg-saffron-700 text-white text-sm font-semibold rounded-lg shadow transition disabled:opacity-50"
                >
                  {savingEdit ? 'परिमार्जन हुँदैछ...' : 'परिमार्जन सुरक्षित गर्नुहोस्'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Parent Modal */}
      {showParentModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <h3 className="text-base font-bold text-slate-900 mb-3">अभिभावक जोड्नुहोस्</h3>
            <input
              type="text"
              placeholder="पिता/आमाको नाम खोज्नुहोस्..."
              value={parentSearchQuery}
              onChange={(e) => searchCandidateParents(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm mb-3"
            />
            <div className="space-y-2 max-h-48 overflow-y-auto mb-4">
              {parentSearchResults.map((p) => (
                <label
                  key={p.id}
                  className={`block p-2 rounded border cursor-pointer text-xs ${
                    selectedParentId === p.id ? 'border-saffron-500 bg-saffron-50' : 'border-slate-200'
                  }`}
                >
                  <input
                    type="radio"
                    name="parent"
                    value={p.id}
                    checked={selectedParentId === p.id}
                    onChange={() => setSelectedParentId(p.id)}
                    className="mr-2"
                  />
                  <span className="font-bold">{p.primaryNameNepali}</span> ({p.primaryNameEnglish || 'N/A'})
                </label>
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowParentModal(false)}
                className="px-3 py-1.5 border rounded text-xs"
              >
                रद्द
              </button>
              <button
                onClick={handleAddParent}
                disabled={!selectedParentId}
                className="px-4 py-1.5 bg-saffron-600 text-white rounded text-xs font-semibold disabled:opacity-50"
              >
                जोड्नुहोस्
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Spouse Modal */}
      {showSpouseModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <h3 className="text-base font-bold text-slate-900 mb-3">पति/पत्नी जोड्नुहोस्</h3>
            <input
              type="text"
              placeholder="दम्पतीको नाम खोज्नुहोस्..."
              value={spouseSearchQuery}
              onChange={(e) => searchCandidateSpouses(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm mb-3"
            />
            <div className="space-y-2 max-h-40 overflow-y-auto mb-3">
              {spouseSearchResults.map((s) => (
                <label
                  key={s.id}
                  className={`block p-2 rounded border cursor-pointer text-xs ${
                    selectedSpouseId === s.id ? 'border-saffron-500 bg-saffron-50' : 'border-slate-200'
                  }`}
                >
                  <input
                    type="radio"
                    name="spouse"
                    value={s.id}
                    checked={selectedSpouseId === s.id}
                    onChange={() => setSelectedSpouseId(s.id)}
                    className="mr-2"
                  />
                  <span className="font-bold">{s.primaryNameNepali}</span>
                </label>
              ))}
            </div>
            <input
              type="text"
              placeholder="विवाह मिति वि.सं. (YYYY-MM-DD)"
              value={spouseMarriageDateBs}
              onChange={(e) => setSpouseMarriageDateBs(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs mb-4"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowSpouseModal(false)}
                className="px-3 py-1.5 border rounded text-xs"
              >
                रद्द
              </button>
              <button
                onClick={handleAddSpouse}
                disabled={!selectedSpouseId}
                className="px-4 py-1.5 bg-saffron-600 text-white rounded text-xs font-semibold disabled:opacity-50"
              >
                जोड्नुहोस्
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Child Modal */}
      {showChildModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <h3 className="text-base font-bold text-slate-900 mb-3">सन्तान जोड्नुहोस्</h3>
            <input
              type="text"
              placeholder="छोरा/छोरीको नाम खोज्नुहोस्..."
              value={childSearchQuery}
              onChange={(e) => searchCandidateChildren(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm mb-3"
            />
            <div className="space-y-2 max-h-48 overflow-y-auto mb-4">
              {childSearchResults.map((c) => (
                <label
                  key={c.id}
                  className={`block p-2 rounded border cursor-pointer text-xs ${
                    selectedChildId === c.id ? 'border-saffron-500 bg-saffron-50' : 'border-slate-200'
                  }`}
                >
                  <input
                    type="radio"
                    name="child"
                    value={c.id}
                    checked={selectedChildId === c.id}
                    onChange={() => setSelectedChildId(c.id)}
                    className="mr-2"
                  />
                  <span className="font-bold">{c.primaryNameNepali}</span> ({c.primaryNameEnglish || 'N/A'})
                </label>
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowChildModal(false)}
                className="px-3 py-1.5 border rounded text-xs"
              >
                रद्द
              </button>
              <button
                onClick={handleAddChild}
                disabled={!selectedChildId}
                className="px-4 py-1.5 bg-saffron-600 text-white rounded text-xs font-semibold disabled:opacity-50"
              >
                जोड्नुहोस्
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Archive Modal */}
      {showArchiveModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <h3 className="text-base font-bold text-red-900 mb-2">
              व्यक्ति अभिलेखिकरण (Archive Record)
            </h3>
            <p className="text-xs text-slate-600 mb-4">
              अभिलेख गरिएको व्यक्ति सक्रिय खोजी र सूचीबाट हटाइनेछ। यो कार्यका लागि औचित्य अनिवार्य छ।
            </p>
            <textarea
              required
              rows={3}
              placeholder="अभिलेखिकरणको कारण..."
              value={archiveReason}
              onChange={(e) => setArchiveReason(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs mb-4"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowArchiveModal(false)}
                className="px-3 py-1.5 border rounded text-xs"
              >
                रद्द
              </button>
              <button
                onClick={handleArchive}
                disabled={archiving || !archiveReason.trim()}
                className="px-4 py-1.5 bg-red-600 text-white rounded text-xs font-semibold disabled:opacity-50"
              >
                {archiving ? 'अभिलेख हुँदैछ...' : 'पुष्टि गर्नुहोस् (Archive)'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
