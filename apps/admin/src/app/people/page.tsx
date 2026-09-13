'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useAuth } from '../../context/auth-context';
import { ApiClient } from '../../lib/api-client';
import {
  PersonSearchItemDto,
  Gender,
  LivingStatus,
  PrivacyVisibility,
} from '@kashyap/contracts';

export default function PeoplePage() {
  const { accessToken } = useAuth();
  const token = accessToken;

  // Search & Filter state
  const [query, setQuery] = useState('');
  const [branchId, setBranchId] = useState('');
  const [generation, setGeneration] = useState<string>('');
  const [livingStatus, setLivingStatus] = useState<string>('');
  const [gender, setGender] = useState<string>('');
  const [page, setPage] = useState(1);
  const [limit] = useState(15);

  // Data state
  const [items, setItems] = useState<PersonSearchItemDto[]>([]);
  const [total, setTotal] = useState(0);
  const [branches, setBranches] = useState<Array<{ id: string; nameNepali: string; nameEnglish: string; code: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Add Person Modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState({
    firstNameNepali: '',
    lastNameNepali: 'अधिकारी',
    firstNameEnglish: '',
    lastNameEnglish: 'Adhikari',
    gender: Gender.MALE,
    livingStatus: LivingStatus.LIVING,
    branchId: '',
    generation: 4,
    birthDateBs: '',
    justificationReason: '',
    privacyVisibility: PrivacyVisibility.PUBLIC,
    allowDuplicateOverride: false,
  });
  const [duplicateWarnings, setDuplicateWarnings] = useState<any[]>([]);
  const [evaluatingDuplicates, setEvaluatingDuplicates] = useState(false);
  const [creatingPerson, setCreatingPerson] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  // Export state
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    ApiClient.listBranches()
      .then((b) => {
        setBranches(b);
        if (b.length > 0 && !addForm.branchId) {
          setAddForm((prev) => ({ ...prev, branchId: b[0].id }));
        }
      })
      .catch((err) => console.error('Failed to load branches', err));
  }, []);

  const fetchPersons = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await ApiClient.searchPersons(
        {
          query: query.trim() || undefined,
          branchId: branchId || undefined,
          generation: generation ? parseInt(generation, 10) : undefined,
          livingStatus: (livingStatus as LivingStatus) || undefined,
          gender: (gender as Gender) || undefined,
          page,
          limit,
        },
        token || undefined,
      );
      setItems(res.items);
      setTotal(res.total);
    } catch (err: any) {
      setError(err.message || 'व्यक्तिहरूको सूची लोड गर्न सकिएन');
    } finally {
      setLoading(false);
    }
  }, [query, branchId, generation, livingStatus, gender, page, limit, token]);

  useEffect(() => {
    fetchPersons();
  }, [fetchPersons]);

  // Debounced duplicate evaluation
  useEffect(() => {
    if (!showAddModal || (!addForm.firstNameNepali && !addForm.firstNameEnglish)) {
      setDuplicateWarnings([]);
      return;
    }

    const timer = setTimeout(async () => {
      if (!token) return;
      setEvaluatingDuplicates(true);
      try {
        const matches = await ApiClient.evaluateDuplicates(
          {
            names: [
              {
                language: 'ne',
                firstName: addForm.firstNameNepali,
                lastName: addForm.lastNameNepali,
                fullName: `${addForm.firstNameNepali} ${addForm.lastNameNepali}`.trim(),
                isPrimary: true,
              },
              ...(addForm.firstNameEnglish
                ? [
                    {
                      language: 'en' as const,
                      firstName: addForm.firstNameEnglish,
                      lastName: addForm.lastNameEnglish,
                      fullName: `${addForm.firstNameEnglish} ${addForm.lastNameEnglish}`.trim(),
                      isPrimary: false,
                    },
                  ]
                : []),
            ],
            branchId: addForm.branchId || undefined,
            gender: addForm.gender,
            generation: addForm.generation,
          },
          token,
        );
        setDuplicateWarnings(matches);
      } catch {
        // Silently ignore evaluation errors
      } finally {
        setEvaluatingDuplicates(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [
    showAddModal,
    addForm.firstNameNepali,
    addForm.lastNameNepali,
    addForm.firstNameEnglish,
    addForm.lastNameEnglish,
    addForm.branchId,
    addForm.gender,
    addForm.generation,
    token,
  ]);

  const handleCreatePerson = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    if (!addForm.justificationReason.trim()) {
      setModalError('दर्ताको औचित्य (Justification Reason) अनिवार्य छ');
      return;
    }
    setCreatingPerson(true);
    setModalError(null);

    try {
      await ApiClient.createPerson(
        {
          names: [
            {
              language: 'ne',
              firstName: addForm.firstNameNepali,
              lastName: addForm.lastNameNepali,
              fullName: `${addForm.firstNameNepali} ${addForm.lastNameNepali}`.trim(),
              isPrimary: true,
            },
            ...(addForm.firstNameEnglish
              ? [
                  {
                    language: 'en' as const,
                    firstName: addForm.firstNameEnglish,
                    lastName: addForm.lastNameEnglish,
                    fullName: `${addForm.firstNameEnglish} ${addForm.lastNameEnglish}`.trim(),
                    isPrimary: false,
                  },
                ]
              : []),
          ],
          gender: addForm.gender,
          livingStatus: addForm.livingStatus,
          branchId: addForm.branchId,
          generation: addForm.generation,
          birthDateBs: addForm.birthDateBs || undefined,
          justificationReason: addForm.justificationReason.trim(),
          allowDuplicateOverride: addForm.allowDuplicateOverride,
          dobVisibility: addForm.privacyVisibility,
          phoneVisibility: addForm.privacyVisibility,
          addressVisibility: addForm.privacyVisibility,
        },
        token,
      );
      setShowAddModal(false);
      setAddForm({
        firstNameNepali: '',
        lastNameNepali: 'अधिकारी',
        firstNameEnglish: '',
        lastNameEnglish: 'Adhikari',
        gender: Gender.MALE,
        livingStatus: LivingStatus.LIVING,
        branchId: branches[0]?.id || '',
        generation: 4,
        birthDateBs: '',
        justificationReason: '',
        privacyVisibility: PrivacyVisibility.PUBLIC,
        allowDuplicateOverride: false,
      });
      fetchPersons();
    } catch (err: any) {
      setModalError(err.message || 'व्यक्ति सिर्जना गर्न असफल भयो');
    } finally {
      setCreatingPerson(false);
    }
  };

  const handleExport = async (format: 'json' | 'csv') => {
    if (!token) return;
    setExporting(true);
    try {
      const res = await ApiClient.exportGenealogy(
        {
          branchId: branchId || undefined,
          format,
        },
        token,
      );

      const content =
        format === 'json'
          ? JSON.stringify(res, null, 2)
          : [
              'id,primaryNameNepali,primaryNameEnglish,branchId,generation,livingStatus',
              ...(res.persons || []).map(
                (p: any) =>
                  `"${p.id}","${p.primaryNameNepali || ''}","${p.primaryNameEnglish || ''}","${
                    p.branchId || ''
                  }","${p.generation || ''}","${p.livingStatus || ''}"`,
              ),
            ].join('\n');
      const mime = format === 'json' ? 'application/json' : 'text/csv;charset=utf-8;';
      const blob = new Blob([content], { type: mime });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `genealogy_export_${Date.now()}.${format}`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err: any) {
      alert(`Export failed: ${err.message}`);
    } finally {
      setExporting(false);
    }
  };

  const totalPages = Math.ceil(total / limit) || 1;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">वंशावली सूची (People Directory)</h2>
          <p className="text-sm text-slate-500">
            कश्यप अधिकारी कुलका सदस्यहरूको द्वैभाषिक खोजी, दर्ता तथा विवरण व्यवस्थापन
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex rounded-lg border border-slate-300 bg-white overflow-hidden shadow-sm">
            <button
              onClick={() => handleExport('json')}
              disabled={exporting}
              className="px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 border-r border-slate-200"
            >
              Export JSON
            </button>
            <button
              onClick={() => handleExport('csv')}
              disabled={exporting}
              className="px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
            >
              Export CSV
            </button>
          </div>

          <button
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2 bg-saffron-600 hover:bg-saffron-700 text-white text-sm font-semibold rounded-lg shadow-sm transition flex items-center gap-2"
          >
            <span>+</span> नयाँ व्यक्ति थप्नुहोस् (Add Person)
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div className="lg:col-span-2">
            <label className="block text-xs font-medium text-slate-700 mb-1">
              द्वैभाषिक खोज (Bilingual Search)
            </label>
            <input
              type="text"
              placeholder="नाम वा ठेगाना (Nepali / English)..."
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-saffron-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">शाखा (Branch)</label>
            <select
              value={branchId}
              onChange={(e) => {
                setBranchId(e.target.value);
                setPage(1);
              }}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-saffron-500"
            >
              <option value="">सबै शाखाहरू (All Branches)</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.nameNepali} ({b.nameEnglish})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">पुस्ता (Generation)</label>
            <input
              type="number"
              placeholder="उदा. 4"
              value={generation}
              onChange={(e) => {
                setGeneration(e.target.value);
                setPage(1);
              }}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-saffron-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">स्थिति (Living Status)</label>
            <select
              value={livingStatus}
              onChange={(e) => {
                setLivingStatus(e.target.value);
                setPage(1);
              }}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-saffron-500"
            >
              <option value="">सबै (All)</option>
              <option value={LivingStatus.LIVING}>जीवित (Living)</option>
              <option value={LivingStatus.DECEASED}>दिवंगत (Deceased)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">
          {error}
        </div>
      )}

      {/* Directory Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
            <thead className="bg-slate-50 text-slate-600 font-semibold">
              <tr>
                <th className="px-4 py-3">नाम (Full Name)</th>
                <th className="px-4 py-3">शाखा (Branch)</th>
                <th className="px-4 py-3">पुस्ता (Gen)</th>
                <th className="px-4 py-3">लिङ्ग (Gender)</th>
                <th className="px-4 py-3">स्थिति (Status)</th>
                <th className="px-4 py-3 text-right">कार्यहरू (Actions)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                    विवरण लोड हुँदैछ (Loading)...
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                    कुनै व्यक्ति फेला परेन (No persons found).
                  </td>
                </tr>
              ) : (
                items.map((person) => (
                  <tr key={person.id} className="hover:bg-slate-50 transition">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-slate-900">{person.primaryNameNepali}</div>
                      {person.primaryNameEnglish && (
                        <div className="text-xs text-slate-500">{person.primaryNameEnglish}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {person.branchName || '-'}
                    </td>
                    <td className="px-4 py-3 text-slate-700 font-mono">
                      {person.generation ? `G${person.generation}` : '-'}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-medium">
                        {person.gender === Gender.MALE
                          ? 'पुरुष (M)'
                          : person.gender === Gender.FEMALE
                          ? 'महिला (F)'
                          : 'अन्य'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          person.livingStatus === LivingStatus.LIVING
                            ? 'bg-green-100 text-green-800'
                            : 'bg-slate-200 text-slate-700'
                        }`}
                      >
                        {person.livingStatus === LivingStatus.LIVING ? 'जीवित' : 'दिवंगत'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right space-x-2">
                      <Link
                        href={`/people/${person.id}`}
                        className="px-2.5 py-1 text-xs font-semibold rounded bg-slate-100 hover:bg-slate-200 text-slate-800 transition"
                      >
                        विवरण (Profile)
                      </Link>
                      <Link
                        href={`/tree?focus=${person.id}`}
                        className="px-2.5 py-1 text-xs font-semibold rounded bg-saffron-50 hover:bg-saffron-100 text-saffron-800 transition"
                      >
                        रुखमा हेर्नुहोस् (Tree)
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-600">
          <div>
            कुल <strong>{total}</strong> जना मध्ये <strong>{(page - 1) * limit + 1}</strong> देखि{' '}
            <strong>{Math.min(page * limit, total)}</strong> सम्म
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="px-3 py-1 bg-white border border-slate-300 rounded font-medium disabled:opacity-50 hover:bg-slate-100"
            >
              अघिल्लो (Prev)
            </button>
            <span className="font-semibold">
              {page} / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="px-3 py-1 bg-white border border-slate-300 rounded font-medium disabled:opacity-50 hover:bg-slate-100"
            >
              पछिल्लो (Next)
            </button>
          </div>
        </div>
      </div>

      {/* Add Person Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 my-8">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <h3 className="text-lg font-bold text-slate-900">
                नयाँ व्यक्ति दर्ता (Register New Person)
              </h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-slate-600 text-xl font-bold"
              >
                ✕
              </button>
            </div>

            {modalError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg">
                {modalError}
              </div>
            )}

            {/* Live Duplicate Warning Box */}
            {duplicateWarnings.length > 0 && (
              <div className="mb-4 p-4 bg-amber-50 border border-amber-300 rounded-xl">
                <div className="flex items-center gap-2 text-amber-900 font-bold text-xs mb-2">
                  <span className="text-base">⚠️</span>
                  <span>सम्भावित दोहोरिएको रेकर्ड भेटियो (Potential Duplicates Detected):</span>
                </div>
                <div className="space-y-2 max-h-36 overflow-y-auto">
                  {duplicateWarnings.map((m, idx) => (
                    <div
                      key={idx}
                      className="bg-white p-2.5 rounded-lg border border-amber-200 text-xs flex items-center justify-between"
                    >
                      <div>
                        <span className="font-bold text-slate-800">{m.person?.primaryNameNepali}</span>{' '}
                        <span className="text-slate-500">({m.person?.primaryNameEnglish || 'N/A'})</span>
                        <div className="text-[11px] text-slate-600">
                          शाखा: {m.person?.branchName || '-'} | पुस्ता: G{m.person?.generation || '?'}
                        </div>
                      </div>
                      <span className="px-2 py-0.5 rounded font-bold bg-amber-100 text-amber-900 text-[11px]">
                        {Math.round((m.score || 0) * 100)}% Match
                      </span>
                    </div>
                  ))}
                </div>
                <label className="flex items-center gap-2 text-xs font-semibold text-amber-950 cursor-pointer pt-2 border-t border-amber-200 mt-2">
                  <input
                    type="checkbox"
                    checked={addForm.allowDuplicateOverride}
                    onChange={(e) => setAddForm({ ...addForm, allowDuplicateOverride: e.target.checked })}
                    className="rounded text-saffron-600 focus:ring-saffron-500"
                  />
                  <span>म पुष्टि गर्दछु कि यो फरक व्यक्ति हो (Allow Duplicate Override)</span>
                </label>
              </div>
            )}

            <form onSubmit={handleCreatePerson} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    पहिलो नाम (नेपाली) *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="उदा. राम प्रसाद"
                    value={addForm.firstNameNepali}
                    onChange={(e) => setAddForm({ ...addForm, firstNameNepali: e.target.value })}
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
                    value={addForm.lastNameNepali}
                    onChange={(e) => setAddForm({ ...addForm, lastNameNepali: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-saffron-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    First Name (English)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Ram Prasad"
                    value={addForm.firstNameEnglish}
                    onChange={(e) => setAddForm({ ...addForm, firstNameEnglish: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-saffron-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Last Name (English)
                  </label>
                  <input
                    type="text"
                    value={addForm.lastNameEnglish}
                    onChange={(e) => setAddForm({ ...addForm, lastNameEnglish: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-saffron-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">लिङ्ग (Gender) *</label>
                  <select
                    value={addForm.gender}
                    onChange={(e) => setAddForm({ ...addForm, gender: e.target.value as Gender })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-saffron-500"
                  >
                    <option value={Gender.MALE}>पुरुष (Male)</option>
                    <option value={Gender.FEMALE}>महिला (Female)</option>
                    <option value={Gender.OTHER}>अन्य (Other)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">शाखा (Branch) *</label>
                  <select
                    required
                    value={addForm.branchId}
                    onChange={(e) => setAddForm({ ...addForm, branchId: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-saffron-500"
                  >
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.nameNepali} ({b.nameEnglish})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">पुस्ता (Generation) *</label>
                  <input
                    type="number"
                    required
                    value={addForm.generation}
                    onChange={(e) => setAddForm({ ...addForm, generation: parseInt(e.target.value, 10) || 1 })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-saffron-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    जन्म मिति वि.सं. (DOB BS)
                  </label>
                  <input
                    type="text"
                    placeholder="YYYY-MM-DD (उदा. 2045-04-12)"
                    value={addForm.birthDateBs}
                    onChange={(e) => setAddForm({ ...addForm, birthDateBs: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-saffron-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-amber-900 mb-1">
                  दर्ताको औचित्य / प्रशासनिक निर्णय (Justification Reason) *
                </label>
                <textarea
                  required
                  rows={2}
                  placeholder="उदा. स्थानीय शाखा वंशावली संकलन विवरण अनुसार दर्ता गरिएको..."
                  value={addForm.justificationReason}
                  onChange={(e) => setAddForm({ ...addForm, justificationReason: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-saffron-500"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 border border-slate-300 text-slate-700 text-sm font-semibold rounded-lg hover:bg-slate-100"
                >
                  रद्द गर्नुहोस् (Cancel)
                </button>
                <button
                  type="submit"
                  disabled={creatingPerson}
                  className="px-5 py-2 bg-saffron-600 hover:bg-saffron-700 text-white text-sm font-semibold rounded-lg shadow transition disabled:opacity-50"
                >
                  {creatingPerson ? 'दर्ता हुँदैछ...' : 'सुरक्षित गर्नुहोस् (Save Person)'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
