'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/auth-context';
import { ApiClient } from '../../lib/api-client';
import { ChangeRequestDetailDto, ChangeRequestStatus } from '@kashyap/contracts';

export default function ChangeRequestsAdminPage() {
  const { accessToken } = useAuth();
  const [requests, setRequests] = useState<ChangeRequestDetailDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedStatus, setSelectedStatus] = useState<string>('PENDING');
  const [activeRequest, setActiveRequest] = useState<ChangeRequestDetailDto | null>(null);
  const [reviewNotes, setReviewNotes] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    loadRequests();
  }, [accessToken, selectedStatus]);

  async function loadRequests() {
    if (!accessToken) return;
    setLoading(true);
    try {
      const data = await ApiClient.listChangeRequests(
        accessToken,
        selectedStatus === 'ALL' ? undefined : { status: selectedStatus },
      );
      setRequests(data);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  }

  async function handleReview(status: 'APPROVED' | 'REJECTED') {
    if (!activeRequest || !accessToken) return;
    setActionLoading(true);
    setMessage(null);
    try {
      await ApiClient.reviewChangeRequest(accessToken, activeRequest.id, { status, reviewNotes });
      setMessage({ type: 'success', text: `Change request ${status.toLowerCase()} successfully` });
      setActiveRequest(null);
      setReviewNotes('');
      await loadRequests();
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
          <h1 className="text-2xl font-bold text-slate-900">वंशावली परिमार्जन अनुरोधहरू (Change Requests)</h1>
          <p className="text-sm text-slate-500">अभिलेख शुद्धता, द्वन्द्व व्यवस्थापन र संस्करण नियन्त्रण (Visual Diff View)</p>
        </div>
        <button
          onClick={() => loadRequests()}
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

      {/* Status Filter Tabs */}
      <div className="flex gap-2 border-b border-slate-200 pb-2">
        {['ALL', 'PENDING', 'APPROVED', 'REJECTED', 'CONFLICT_DETECTED'].map((st) => (
          <button
            key={st}
            onClick={() => setSelectedStatus(st)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${selectedStatus === st ? 'bg-indigo-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
          >
            {st}
          </button>
        ))}
      </div>

      {/* Requests Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-600 uppercase text-xs border-b border-slate-200">
              <tr>
                <th className="px-4 py-3">प्रकार (Type)</th>
                <th className="px-4 py-3">लक्ष्य व्यक्ति (Target Person)</th>
                <th className="px-4 py-3">कारण (Reason)</th>
                <th className="px-4 py-3">आधार संस्करण (Base Ver)</th>
                <th className="px-4 py-3">स्थिति (Status)</th>
                <th className="px-4 py-3">कार्यवाही (Actions)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-400">अनुरोधहरू लोड हुँदैछन्...</td>
                </tr>
              ) : requests.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-400">कुनै परिमार्जन अनुरोध फेला परेन ।</td>
                </tr>
              ) : (
                requests.map((req) => (
                  <tr key={req.id} className="hover:bg-slate-50 transition">
                    <td className="px-4 py-3 font-semibold text-xs text-indigo-700">
                      {req.type}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-800">
                      {req.currentSnapshot?.primaryNameNepali ? `${req.currentSnapshot.primaryNameNepali} (${req.currentSnapshot.primaryNameEnglish || ''})` : (req.targetPersonId || 'नयाँ व्यक्ति प्रविष्टि')}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600 max-w-xs truncate">
                      {req.reason}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">
                      v{req.baseVersion}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${
                        req.status === 'APPROVED' ? 'bg-emerald-100 text-emerald-800' :
                        req.status === 'CONFLICT_DETECTED' ? 'bg-rose-100 text-rose-800 font-bold' :
                        req.status === 'REJECTED' ? 'bg-slate-100 text-slate-600' :
                        'bg-amber-100 text-amber-800'
                      }`}>
                        {req.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => setActiveRequest(req)}
                        className="px-3 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded text-xs font-medium transition"
                      >
                        तुलनात्मक भिन्नता (Visual Diff)
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Visual Diff & Review Modal */}
      {activeRequest && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-3xl w-full p-6 space-y-6 shadow-2xl border border-slate-100 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-start border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900">तुलनात्मक भिन्नता समीक्षा (Visual Diff Review)</h3>
                <p className="text-xs text-slate-500">Type: {activeRequest.type} • Target: {activeRequest.currentSnapshot?.primaryNameNepali || activeRequest.targetPersonId || 'New'}</p>
              </div>
              <button onClick={() => setActiveRequest(null)} className="text-slate-400 hover:text-slate-600 text-xl font-bold">✕</button>
            </div>

            {/* Visual Diff Table */}
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">परिवर्तन गरिएका क्षेत्रहरू (Field Changes)</h4>
              {(!activeRequest.visualDiff?.fields || activeRequest.visualDiff.fields.length === 0) ? (
                <p className="text-xs text-slate-400 italic">कुनै प्रत्यक्ष भिन्नता उपलब्ध छैन ।</p>
              ) : (
                <div className="border border-slate-200 rounded-xl overflow-hidden text-xs">
                  <table className="w-full text-left">
                    <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                      <tr>
                        <th className="p-3">फाँट (Field)</th>
                        <th className="p-3 bg-rose-50 text-rose-800">हालको अभिलेख (Current Value)</th>
                        <th className="p-3 bg-emerald-50 text-emerald-800">प्रस्तावित नयाँ (Proposed Value)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-mono">
                      {activeRequest.visualDiff.fields.map((f: any, idx: number) => (
                        <tr key={idx}>
                          <td className="p-3 font-semibold text-slate-700">{f.field}</td>
                          <td className="p-3 bg-rose-50/50 text-rose-700">{JSON.stringify(f.oldValue ?? null)}</td>
                          <td className="p-3 bg-emerald-50/50 text-emerald-700 font-bold">{JSON.stringify(f.newValue ?? null)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Conflict Warning if detected */}
            {activeRequest.status === 'CONFLICT_DETECTED' && (
              <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs">
                <span className="font-bold">⚠️ संस्करण द्वन्द्व (Version Conflict):</span> यो अनुरोध आधार संस्करण v{activeRequest.baseVersion} मा गरिएको थियो, तर मूल अभिलेख परिमार्जन भइसकेको छ । समीक्षा गर्दा ध्यान दिनुहोस् ।
              </div>
            )}

            {/* Review Notes */}
            <div className="space-y-2">
              <label className="block text-xs font-medium text-slate-700">समीक्षा टिप्पणी (Review Notes):</label>
              <textarea
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                placeholder="स्वीकृति वा अस्वीकृतिको आधार उल्लेख गर्नुहोस्..."
                className="w-full text-xs p-3 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                rows={2}
              />
            </div>

            {/* Review Buttons */}
            <div className="flex justify-between items-center pt-2 border-t border-slate-100">
              <div className="flex gap-2">
                {activeRequest.status === 'PENDING' && (
                  <>
                    <button
                      onClick={() => handleReview('APPROVED')}
                      disabled={actionLoading}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold transition"
                    >
                      स्वीकृत तथा वंशावलीमा गाभ्नुहोस् (Approve & Merge)
                    </button>
                    <button
                      onClick={() => handleReview('REJECTED')}
                      disabled={actionLoading}
                      className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-semibold transition"
                    >
                      अस्वीकार गर्नुहोस् (Reject)
                    </button>
                  </>
                )}
              </div>
              <button onClick={() => setActiveRequest(null)} className="px-4 py-2 text-xs text-slate-500 hover:text-slate-700">
                बन्द गर्नुहोस् (Close)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
