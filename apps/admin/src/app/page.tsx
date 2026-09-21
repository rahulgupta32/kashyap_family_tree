'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../context/auth-context';

export default function AdminDashboard() {
  const router = useRouter();
  const { user, isLoading, isAdmin } = useAuth();

  useEffect(() => {
    if (!isLoading && (!user || !isAdmin)) {
      router.push('/login');
    }
  }, [isLoading, user, isAdmin, router]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12 text-slate-500 text-sm">
        लोड हुँदैछ (Loading)...
      </div>
    );
  }

  if (!user || !isAdmin) {
    return null;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-800">ड्यासवोर्ड सारांश (Executive Dashboard)</h2>
        <p className="text-sm text-slate-500">कश्यप अधिकारी वंशावली प्लेटफर्म — प्रणाली स्थिति तथा प्रशासनिक कार्यहरू</p>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <p className="text-sm font-medium text-slate-500">कुल व्यक्ति संख्या (Persons)</p>
          <p className="text-3xl font-bold text-slate-900 mt-2">1,248</p>
          <p className="text-xs text-green-600 mt-1">↑ 4 पुस्ताहरू अभिलेखबद्ध</p>
        </div>

        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <p className="text-sm font-medium text-slate-500">दाबी प्रमाणीकरण (Pending Claims)</p>
          <p className="text-3xl font-bold text-amber-600 mt-2">14</p>
          <p className="text-xs text-slate-500 mt-1">समीक्षाको पर्खाइमा</p>
        </div>

        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <p className="text-sm font-medium text-slate-500">परिमार्जन अनुरोध (Change Requests)</p>
          <p className="text-3xl font-bold text-blue-600 mt-2">8</p>
          <p className="text-xs text-slate-500 mt-1">नाता तथा विवरण सच्याउने</p>
        </div>

        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <p className="text-sm font-medium text-slate-500">अपरिवर्तनीय अडिट (Audit Entries)</p>
          <p className="text-3xl font-bold text-slate-700 mt-2">3,492</p>
          <p className="text-xs text-slate-400 mt-1">SHA-256 Hash Chained</p>
        </div>
      </div>

      {/* Open Gates Governance Box */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-amber-900">धार्मिक तथा आधिकारिक स्वीकृति आवश्यक (Open Authority Gates)</h3>
            <p className="text-sm text-amber-700 mt-1">
              नाता/साइनो र जुठो नियमहरू हाल इन्जिनमा सुरक्षित छन् र आधिकारिक धार्मिक प्रतिनिधिद्वारा हस्ताक्षर (Sign-off) भएपछि मात्र सक्रिय हुनेछन् (HG-002, HG-003)।
            </p>
          </div>
          <span className="px-3 py-1 bg-amber-200 text-amber-900 rounded-lg text-xs font-semibold">
            Authority Controlled
          </span>
        </div>
      </div>

      {/* Recent Activity / Queues */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
          <h3 className="font-bold text-slate-800 text-base mb-4">हालैका प्रोफाइल दाबीहरू (Recent Verification Claims)</h3>
          <div className="divide-y divide-slate-100">
            <div className="py-3 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-800">दिनेश अधिकारी (कास्की)</p>
                <p className="text-xs text-slate-500">दाबीकर्ता: 9841000001 (नागरिकता प्रमाण संलग्न)</p>
              </div>
              <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                SUBMITTED
              </span>
            </div>
            <div className="py-3 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-800">सुरेश अधिकारी (कास्की)</p>
                <p className="text-xs text-slate-500">दाबीकर्ता: 9841000002 (जन्मदर्ता संलग्न)</p>
              </div>
              <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                SUBMITTED
              </span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
          <h3 className="font-bold text-slate-800 text-base mb-4">अडिट ट्रेल सारांश (Recent Append-Only Logs)</h3>
          <div className="divide-y divide-slate-100 font-mono text-xs">
            <div className="py-2.5 flex items-center justify-between text-slate-600">
              <span>[CLAIM_SUBMIT] person:p-401</span>
              <span className="text-slate-400">hash: e3b0c442...</span>
            </div>
            <div className="py-2.5 flex items-center justify-between text-slate-600">
              <span>[LOGIN] user:u-admin (9841000099)</span>
              <span className="text-slate-400">hash: 8f434346...</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
