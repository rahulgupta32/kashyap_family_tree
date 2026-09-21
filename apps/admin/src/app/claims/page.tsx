'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/auth-context';
import { ApiClient } from '../../lib/api-client';
import { ClaimDetailDto, ClaimStatus } from '@kashyap/contracts';

export default function ClaimsAdminPage() {
  const { accessToken, hasRole, isLoading } = useAuth();
  const loadVersion = useRef(0);
  const [claims, setClaims] = useState<ClaimDetailDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [activeClaim, setActiveClaim] = useState<ClaimDetailDto | null>(null);
  const [reviewNotes, setReviewNotes] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [downloadingAsset, setDownloadingAsset] = useState<string | null>(null);
  const [evidenceError, setEvidenceError] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (!isLoading) void loadClaims();
    return () => { loadVersion.current += 1; };
  }, [accessToken, selectedStatus, isLoading]);

  async function loadClaims() {
    if (!accessToken || isLoading) return;
    const requestVersion = ++loadVersion.current;
    setLoading(true);
    try {
      const data = await ApiClient.listClaims(
        accessToken,
        selectedStatus === 'ALL' ? undefined : { status: selectedStatus },
      );
      if (requestVersion === loadVersion.current) setClaims(data);
    } catch (err: any) {
      if (requestVersion === loadVersion.current) setMessage({ type: 'error', text: err.message });
    } finally {
      if (requestVersion === loadVersion.current) setLoading(false);
    }
  }

  async function handleTier1(decision: 'VOUCHED' | 'REJECTED' | 'CORRECTION_REQUESTED') {
    if (!activeClaim || !accessToken) return;
    setActionLoading(true);
    setMessage(null);
    try {
      await ApiClient.tier1Review(accessToken, activeClaim.id, { decision, notes: reviewNotes });
      setMessage({ type: 'success', text: `Tier 1 review recorded: ${decision}` });
      setActiveClaim(null);
      setReviewNotes('');
      await loadClaims();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setActionLoading(false);
    }
  }

  async function handleTier2(decision: 'APPROVED' | 'REJECTED' | 'CORRECTION_REQUESTED') {
    if (!activeClaim || !accessToken) return;
    setActionLoading(true);
    setMessage(null);
    try {
      await ApiClient.tier2Review(accessToken, activeClaim.id, { decision, notes: reviewNotes });
      setMessage({ type: 'success', text: `Tier 2 adjudication recorded: ${decision}` });
      setActiveClaim(null);
      setReviewNotes('');
      await loadClaims();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setActionLoading(false);
    }
  }

  async function downloadEvidence(assetId: string) {
    if (!accessToken) return;
    setDownloadingAsset(assetId);
    setEvidenceError(null);
    try {
      const blob = await ApiClient.downloadClaimEvidence(accessToken, assetId);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `claim-evidence-${assetId}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error: any) {
      setEvidenceError(error.message);
    } finally {
      setDownloadingAsset(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">दाबी प्रमाणीकरण लाम (Profile Claims Queue)</h1>
          <p className="text-sm text-slate-500">२-तह प्रमाणीकरण: पहिलो तह सिफारिस (Vouch) र दोस्रो तह अन्तिम स्वीकृति (Approval)</p>
        </div>
        <button
          onClick={() => loadClaims()}
          className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm font-medium transition"
        >
          रिफ्रेस गर्नुहोस् (Refresh)
        </button>
      </div>

      {message && (
        <div className={`p-4 rounded-lg text-sm font-medium ${message.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-800 border border-rose-200'}`}>
          {message.text}
        </div>
      )}

      {/* Filter Tabs */}
      <div className="flex gap-2 border-b border-slate-200 pb-2">
        {['ALL', 'PENDING_TIER1', 'PENDING_TIER2', 'APPROVED', 'DISPUTED', 'CORRECTION_REQUESTED'].map((st) => (
          <button
            key={st}
            onClick={() => setSelectedStatus(st)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${selectedStatus === st ? 'bg-indigo-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
          >
            {st}
          </button>
        ))}
      </div>

      {/* Claims Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-600 uppercase text-xs border-b border-slate-200">
              <tr>
                <th className="px-4 py-3">लक्ष्य व्यक्ति (Target Person)</th>
                <th className="px-4 py-3">दाबीकर्ता फोन (Claimant)</th>
                <th className="px-4 py-3">नाता सम्बन्ध (Relationship)</th>
                <th className="px-4 py-3">स्थिति (Status)</th>
                <th className="px-4 py-3">कार्यवाही (Actions)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-400">लोड हुँदैछ (Loading claims)...</td>
                </tr>
              ) : claims.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-400">कुनै दाबी फेला परेन (No claims found in this state).</td>
                </tr>
              ) : (
                claims.map((claim) => (
                  <tr key={claim.id} className="hover:bg-slate-50 transition">
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">{claim.targetPerson.primaryNameNepali}</div>
                      <div className="text-xs text-slate-400">{claim.targetPerson.primaryNameEnglish} • {claim.targetPerson.branchName}</div>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-600">
                      {claim.claimantPhoneNumber}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600 max-w-xs truncate">
                      {claim.relationshipDescription || 'पारिवारिक सम्बन्ध'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${
                        claim.status === 'APPROVED' ? 'bg-emerald-100 text-emerald-800' :
                        claim.status === 'DISPUTED' ? 'bg-rose-100 text-rose-800' :
                        claim.status === 'PENDING_TIER2' ? 'bg-blue-100 text-blue-800' :
                        'bg-amber-100 text-amber-800'
                      }`}>
                        {claim.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => setActiveClaim(claim)}
                        className="px-3 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded text-xs font-medium transition"
                      >
                        समीक्षा गर्नुहोस् (Review)
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Review Modal */}
      {activeClaim && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 space-y-6 shadow-2xl border border-slate-100">
            <div className="flex justify-between items-start border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900">दाबी विवरण तथा समीक्षा (Claim Review)</h3>
                <p className="text-xs text-slate-500">ID: {activeClaim.id}</p>
              </div>
              <button
                onClick={() => setActiveClaim(null)}
                className="text-slate-400 hover:text-slate-600 text-xl font-bold"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4 text-xs bg-slate-50 p-4 rounded-xl">
              <div>
                <span className="text-slate-400 block">लक्ष्य व्यक्ति:</span>
                <span className="font-semibold text-slate-800 text-sm">{activeClaim.targetPerson.primaryNameNepali} ({activeClaim.targetPerson.primaryNameEnglish})</span>
              </div>
              <div>
                <span className="text-slate-400 block">शाखा:</span>
                <span className="font-semibold text-slate-800">{activeClaim.targetPerson.branchName}</span>
              </div>
              <div>
                <span className="text-slate-400 block">दाबीकर्ता फोन:</span>
                <span className="font-mono text-slate-800">{activeClaim.claimantPhoneNumber}</span>
              </div>
              <div>
                <span className="text-slate-400 block">हालको स्थिति:</span>
                <span className="font-bold text-indigo-600">{activeClaim.status}</span>
              </div>
              <div className="col-span-2">
                <span className="text-slate-400 block">सम्बन्ध विवरण:</span>
                <span className="text-slate-700">{activeClaim.relationshipDescription || 'उपलब्ध छैन'}</span>
              </div>
            </div>

            {/* Evidence Attachments */}
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">संलग्न प्रमाणहरू (Evidence Attachments)</h4>
              {(!activeClaim.evidenceAttachments || activeClaim.evidenceAttachments.length === 0) ? (
                <p className="text-xs text-slate-400 italic">कुनै कागजात संलग्न छैन वा गोप्य राखिएको छ ।</p>
              ) : (
                <div className="space-y-2">
                  {activeClaim.evidenceAttachments.map((ev) => (
                    <div key={ev.id} className="flex items-center justify-between p-2 bg-slate-50 rounded-lg text-xs border border-slate-200">
                      <div>
                        <span className="font-semibold text-slate-800">{ev.documentType}</span>
                        {ev.description && <span className="text-slate-500 ml-2">— {ev.description}</span>}
                      </div>
                      {ev.mediaAssetId && (
                        <button
                          type="button"
                          onClick={() => downloadEvidence(ev.mediaAssetId)}
                          disabled={downloadingAsset !== null}
                          className="px-2 py-1 bg-indigo-50 text-indigo-700 rounded hover:bg-indigo-100 font-medium"
                        >
                          {downloadingAsset === ev.mediaAssetId ? 'डाउनलोड हुँदैछ…' : 'प्रमाण डाउनलोड (Download evidence)'}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Review Decision Controls */}
            {evidenceError && <p role="alert" className="text-sm text-rose-700">{evidenceError}</p>}
            <div className="space-y-3">
              <label className="block text-xs font-medium text-slate-700">
                समीक्षा टिप्पणी (Reviewer Notes):
              </label>
              <textarea
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                placeholder="प्रमाणीकरण वा अस्वीकृतिको कारण उल्लेख गर्नुहोस्..."
                className="w-full text-xs p-3 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                rows={2}
              />
            </div>

            <div className="flex justify-between items-center pt-2 border-t border-slate-100">
              <div className="flex gap-2">
                {activeClaim.status === 'PENDING_TIER1' && (
                  <>
                    <button
                      onClick={() => handleTier1('VOUCHED')}
                      disabled={actionLoading}
                      className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-medium transition"
                    >
                      तह १ सिफारिस गर्नुहोस् (Vouch)
                    </button>
                    <button
                      onClick={() => handleTier1('CORRECTION_REQUESTED')}
                      disabled={actionLoading}
                      className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-medium transition"
                    >
                      संशोधन माग (Need Correction)
                    </button>
                    <button
                      onClick={() => handleTier1('REJECTED')}
                      disabled={actionLoading}
                      className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-medium transition"
                    >
                      अस्वीकार (Reject)
                    </button>
                  </>
                )}

                {activeClaim.status === 'PENDING_TIER2' && (
                  <>
                    <button
                      onClick={() => handleTier2('APPROVED')}
                      disabled={actionLoading}
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-medium transition"
                    >
                      तह २ अन्तिम स्वीकृति (Approve & Link)
                    </button>
                    <button
                      onClick={() => handleTier2('REJECTED')}
                      disabled={actionLoading}
                      className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-medium transition"
                    >
                      अस्वीकार (Reject)
                    </button>
                  </>
                )}
              </div>

              <button
                onClick={() => setActiveClaim(null)}
                className="px-4 py-1.5 text-xs text-slate-500 hover:text-slate-700"
              >
                बन्द गर्नुहोस् (Close)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
