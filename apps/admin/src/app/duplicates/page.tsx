'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useAuth } from '../../context/auth-context';
import { ApiClient } from '../../lib/api-client';
import {
  DuplicateCandidateDto,
  DuplicateCandidateStatus,
  DuplicateCompareDto,
} from '@kashyap/contracts';

export default function DuplicatesPage() {
  const { accessToken } = useAuth();
  const token = accessToken;

  const [candidates, setCandidates] = useState<DuplicateCandidateDto[]>([]);
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState<string>(DuplicateCandidateStatus.DETECTED);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Compare & Merge Modal
  const [activeCandidate, setActiveCandidate] = useState<DuplicateCandidateDto | null>(null);
  const [comparison, setComparison] = useState<DuplicateCompareDto | null>(null);
  const [loadingCompare, setLoadingCompare] = useState(false);

  // Merge State
  const [survivingPersonId, setSurvivingPersonId] = useState<string>('');
  const [fieldOverrides, setFieldOverrides] = useState<Record<string, any>>({});
  const [justificationReason, setJustificationReason] = useState<string>('');
  const [merging, setMerging] = useState(false);
  const [mergeError, setMergeError] = useState<string | null>(null);

  // Dismiss State
  const [dismissReason, setDismissReason] = useState('');
  const [dismissing, setDismissing] = useState(false);

  const fetchCandidates = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await ApiClient.listDuplicateCandidates(
        {
          status: (statusFilter as DuplicateCandidateStatus) || undefined,
          page,
          limit: 15,
        },
        token,
      );
      setCandidates(res.items);
      setTotal(res.total);
    } catch (err: any) {
      setError(err.message || 'दोहोरिएको सूची लोड गर्न सकिएन');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, page, token]);

  useEffect(() => {
    fetchCandidates();
  }, [fetchCandidates]);

  const openCompareModal = async (c: DuplicateCandidateDto) => {
    setActiveCandidate(c);
    setLoadingCompare(true);
    setMergeError(null);
    setSurvivingPersonId(c.personAId);
    setFieldOverrides({});
    setJustificationReason('');

    try {
      const comp = await ApiClient.compareDuplicates(c.personAId, c.personBId, c.id, token || undefined);
      setComparison(comp);
    } catch (err: any) {
      setMergeError(err.message || 'तुलना विवरण लोड गर्न सकिएन');
    } finally {
      setLoadingCompare(false);
    }
  };

  const handleDismiss = async () => {
    if (!token || !activeCandidate) return;
    setDismissing(true);
    try {
      await ApiClient.resolveCandidate(
        activeCandidate.id,
        {
          status: DuplicateCandidateStatus.NOT_A_DUPLICATE,
          notes: dismissReason || 'प्रशासकद्वारा दोहोरिएको होइन भनी पुष्टि गरिएको',
        },
        token,
      );
      setActiveCandidate(null);
      setComparison(null);
      fetchCandidates();
    } catch (err: any) {
      alert(`Dismiss failed: ${err.message}`);
    } finally {
      setDismissing(false);
    }
  };

  const handleExecuteMerge = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !activeCandidate || !comparison) return;
    if (!justificationReason.trim()) {
      setMergeError('एकीकरणको औचित्य / कारण (Justification Reason) अनिवार्य छ');
      return;
    }

    const absorbedPersonId =
      survivingPersonId === comparison.personA.id ? comparison.personB.id : comparison.personA.id;
    const survivingPerson =
      survivingPersonId === comparison.personA.id ? comparison.personA : comparison.personB;
    const absorbedPerson =
      survivingPersonId === comparison.personA.id ? comparison.personB : comparison.personA;

    setMerging(true);
    setMergeError(null);

    try {
      await ApiClient.mergePersons(
        {
          survivingPersonId,
          mergedPersonId: absorbedPersonId,
          justificationReason: justificationReason.trim(),
          survivingPersonVersion: survivingPerson.version,
          mergedPersonVersion: absorbedPerson.version,
          fieldResolutions: fieldOverrides,
        },
        token,
      );
      setActiveCandidate(null);
      setComparison(null);
      fetchCandidates();
      alert('दुई रेकर्डहरू सफलतापूर्वक एकीकृत (Merged) गरियो।');
    } catch (err: any) {
      setMergeError(err.message || 'एकीकरण गर्न असफल भयो');
    } finally {
      setMerging(false);
    }
  };

  const bothClaimed = Boolean(comparison?.personA?.isClaimed && comparison?.personB?.isClaimed);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">
            दोहोरिएको रेकर्ड व्यवस्थापन (Duplicate Resolution & Merge)
          </h2>
          <p className="text-sm text-slate-500">
            एउटै व्यक्तिको दोहोरो दर्ता समीक्षा, तुलना तथा कश्यप कुल वंशावली एकीकरण
          </p>
        </div>

        {/* Filter by status */}
        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-saffron-500 bg-white"
          >
            <option value={DuplicateCandidateStatus.DETECTED}>समीक्षा बाँकी (Pending Review)</option>
            <option value={DuplicateCandidateStatus.MERGED}>एकीकृत गरिएको (Merged)</option>
            <option value={DuplicateCandidateStatus.NOT_A_DUPLICATE}>
              खारेज गरिएको (Dismissed)
            </option>
          </select>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">
          {error}
        </div>
      )}

      {/* Candidates List */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
          <thead className="bg-slate-50 text-slate-600 font-semibold">
            <tr>
              <th className="px-4 py-3">व्यक्ति १ (Person A)</th>
              <th className="px-4 py-3">व्यक्ति २ (Person B)</th>
              <th className="px-4 py-3">समानता अङ्क (Score)</th>
              <th className="px-4 py-3">पहिचान कारण (Reason)</th>
              <th className="px-4 py-3">स्थिति (Status)</th>
              <th className="px-4 py-3 text-right">कार्य (Action)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                  लोड हुँदैछ (Loading duplicates)...
                </td>
              </tr>
            ) : candidates.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                  कुनै दोहोरिएको उम्मेदवार छैन (No candidates found).
                </td>
              </tr>
            ) : (
              candidates.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50 transition">
                  <td className="px-4 py-3">
                    <div className="font-bold text-slate-900">
                      {c.personA?.primaryNameNepali || c.personAId}
                    </div>
                    <div className="text-xs text-slate-500">
                      {c.personA?.primaryNameEnglish || 'N/A'}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-bold text-slate-900">
                      {c.personB?.primaryNameNepali || c.personBId}
                    </div>
                    <div className="text-xs text-slate-500">
                      {c.personB?.primaryNameEnglish || 'N/A'}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                        c.confidenceScore >= 0.9
                          ? 'bg-red-100 text-red-800'
                          : c.confidenceScore >= 0.75
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-blue-100 text-blue-800'
                      }`}
                    >
                      {Math.round(c.confidenceScore * 100)}%
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600">
                    {c.detectionSignals?.reasons?.join(', ') || 'समान नाम तथा शाखा'}
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-slate-100 text-slate-700">
                      {c.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => openCompareModal(c)}
                      className="px-3 py-1 bg-saffron-600 hover:bg-saffron-700 text-white text-xs font-semibold rounded-lg shadow-sm"
                    >
                      तुलना र एकीकरण (Compare & Merge)
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Side-by-Side Comparison & Merge Modal */}
      {activeCandidate && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-4xl w-full p-6 shadow-2xl border border-slate-200 my-8">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  दोहोरिएको रेकर्ड तुलना तथा एकीकरण (Duplicate Comparison & Governed Merge)
                </h3>
                <p className="text-xs text-slate-500">
                  समानता स्कोर: <strong>{Math.round(activeCandidate.confidenceScore * 100)}%</strong> •{' '}
                  {activeCandidate.detectionSignals?.reasons?.join(', ') || 'सम्भावित दोहोरो रेकर्ड'}
                </p>
              </div>
              <button
                onClick={() => {
                  setActiveCandidate(null);
                  setComparison(null);
                }}
                className="text-slate-400 hover:text-slate-600 text-xl font-bold"
              >
                ✕
              </button>
            </div>

            {loadingCompare ? (
              <div className="py-12 text-center text-slate-500 text-sm">
                तुलना लोड हुँदैछ (Loading comparison data)...
              </div>
            ) : comparison ? (
              <div className="space-y-6">
                {/* Claim Conflict Banner */}
                {bothClaimed && (
                  <div className="p-4 bg-red-100 border border-red-300 text-red-900 rounded-xl text-xs font-semibold">
                    ⛔ दुवै प्रोफाइलहरू छुट्टाछुट्टै जीवित प्रयोगकर्ता खातासँग जोडिएका (Claimed) छन्।
                    सुरक्षा तथा पहिचान नियम अनुसार दुई फरक प्रयोगकर्ता जोडिएका प्रोफाइलहरू सोझै एकीकरण गर्न मिल्दैन (CANNOT_MERGE_CLAIMED_PERSONS)।
                  </div>
                )}

                {mergeError && (
                  <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg">
                    {mergeError}
                  </div>
                )}

                {/* Primary Surviving Record Selector */}
                <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl">
                  <label className="block text-xs font-bold text-amber-900 mb-2">
                    सुरक्षित रहने मुख्य रेकर्ड छान्नुहोस् (Select Primary Surviving Person):
                  </label>
                  <div className="grid grid-cols-2 gap-4">
                    <label
                      className={`p-3 rounded-lg border-2 cursor-pointer flex items-center gap-3 bg-white ${
                        survivingPersonId === comparison.personA.id
                          ? 'border-saffron-600 bg-saffron-50/40'
                          : 'border-slate-200'
                      }`}
                    >
                      <input
                        type="radio"
                        name="surviving"
                        value={comparison.personA.id}
                        checked={survivingPersonId === comparison.personA.id}
                        onChange={() => setSurvivingPersonId(comparison.personA.id)}
                      />
                      <div>
                        <p className="font-bold text-xs text-slate-900">
                          {comparison.personA.primaryNameNepali} (रेकर्ड क)
                        </p>
                        <p className="text-[11px] text-slate-500 font-mono">{comparison.personA.id}</p>
                      </div>
                    </label>

                    <label
                      className={`p-3 rounded-lg border-2 cursor-pointer flex items-center gap-3 bg-white ${
                        survivingPersonId === comparison.personB.id
                          ? 'border-saffron-600 bg-saffron-50/40'
                          : 'border-slate-200'
                      }`}
                    >
                      <input
                        type="radio"
                        name="surviving"
                        value={comparison.personB.id}
                        checked={survivingPersonId === comparison.personB.id}
                        onChange={() => setSurvivingPersonId(comparison.personB.id)}
                      />
                      <div>
                        <p className="font-bold text-xs text-slate-900">
                          {comparison.personB.primaryNameNepali} (रेकर्ड ख)
                        </p>
                        <p className="text-[11px] text-slate-500 font-mono">{comparison.personB.id}</p>
                      </div>
                    </label>
                  </div>
                </div>

                {/* Side-by-Side Table */}
                <div className="border border-slate-200 rounded-xl overflow-hidden text-xs">
                  <table className="min-w-full divide-y divide-slate-200">
                    <thead className="bg-slate-50 text-slate-700">
                      <tr>
                        <th className="px-4 py-2.5 font-bold w-1/4">विवरण (Field)</th>
                        <th className="px-4 py-2.5 font-bold w-3/8 text-blue-900">
                          रेकर्ड क (Person A)
                        </th>
                        <th className="px-4 py-2.5 font-bold w-3/8 text-green-900">
                          रेकर्ड ख (Person B)
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      <tr>
                        <td className="px-4 py-2 font-semibold text-slate-500">नाम (Nepali)</td>
                        <td className="px-4 py-2 font-bold text-slate-900">
                          {comparison.personA.primaryNameNepali}
                        </td>
                        <td className="px-4 py-2 font-bold text-slate-900">
                          {comparison.personB.primaryNameNepali}
                        </td>
                      </tr>
                      <tr>
                        <td className="px-4 py-2 font-semibold text-slate-500">Name (English)</td>
                        <td className="px-4 py-2 text-slate-700">
                          {comparison.personA.primaryNameEnglish || '—'}
                        </td>
                        <td className="px-4 py-2 text-slate-700">
                          {comparison.personB.primaryNameEnglish || '—'}
                        </td>
                      </tr>
                      <tr>
                        <td className="px-4 py-2 font-semibold text-slate-500">शाखा (Branch)</td>
                        <td className="px-4 py-2 text-slate-700">
                          {comparison.personA.branchName || '—'}
                        </td>
                        <td className="px-4 py-2 text-slate-700">
                          {comparison.personB.branchName || '—'}
                        </td>
                      </tr>
                      <tr>
                        <td className="px-4 py-2 font-semibold text-slate-500">पुस्ता (Generation)</td>
                        <td className="px-4 py-2 text-slate-700">
                          {comparison.personA.generation ? `G${comparison.personA.generation}` : '—'}
                        </td>
                        <td className="px-4 py-2 text-slate-700">
                          {comparison.personB.generation ? `G${comparison.personB.generation}` : '—'}
                        </td>
                      </tr>
                      <tr>
                        <td className="px-4 py-2 font-semibold text-slate-500">जन्म मिति (DOB BS)</td>
                        <td className="px-4 py-2 text-slate-700">
                          {comparison.personA.birthDateBs || '—'}
                        </td>
                        <td className="px-4 py-2 text-slate-700">
                          {comparison.personB.birthDateBs || '—'}
                        </td>
                      </tr>
                      <tr>
                        <td className="px-4 py-2 font-semibold text-slate-500">खाता दाबी (Claimed)</td>
                        <td className="px-4 py-2">
                          {comparison.personA.isClaimed ? (
                            <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-800 font-bold">
                              Claimed
                            </span>
                          ) : (
                            <span className="text-slate-400">Unclaimed</span>
                          )}
                        </td>
                        <td className="px-4 py-2">
                          {comparison.personB.isClaimed ? (
                            <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-800 font-bold">
                              Claimed
                            </span>
                          ) : (
                            <span className="text-slate-400">Unclaimed</span>
                          )}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Justification Form */}
                <form onSubmit={handleExecuteMerge} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-amber-900 mb-1">
                      एकीकरणको औचित्य / प्रशासनिक निर्णय (Merge Justification) *
                    </label>
                    <textarea
                      required
                      rows={2}
                      placeholder="उदा. दुवै रेकर्ड एउटै व्यक्ति (राम प्रसाद अधिकारी) को भएको शाखा समितिबाट प्रमाणित भएकोले एकीकरण गरिएको..."
                      value={justificationReason}
                      onChange={(e) => setJustificationReason(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-saffron-500"
                    />
                  </div>

                  <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={handleDismiss}
                      disabled={dismissing}
                      className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg"
                    >
                      दोहोरिएको होइन (Dismiss Candidate)
                    </button>

                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setActiveCandidate(null);
                          setComparison(null);
                        }}
                        className="px-4 py-2 border border-slate-300 text-slate-700 text-xs font-semibold rounded-lg"
                      >
                        बन्द गर्नुहोस्
                      </button>
                      <button
                        type="submit"
                        disabled={merging || bothClaimed}
                        className="px-5 py-2 bg-saffron-600 hover:bg-saffron-700 text-white text-xs font-bold rounded-lg shadow disabled:opacity-50"
                      >
                        {merging ? 'एकीकरण हुँदैछ...' : 'एकीकरण पुष्टि गर्नुहोस् (Execute Merge)'}
                      </button>
                    </div>
                  </div>
                </form>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
