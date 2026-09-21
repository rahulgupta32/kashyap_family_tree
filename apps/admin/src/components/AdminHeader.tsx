'use client';

import React from 'react';
import Link from 'next/link';
import { useAuth } from '../context/auth-context';

export function AdminHeader() {
  const { user, logout, isAdmin } = useAuth();

  return (
    <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-8 shadow-sm">
      <div className="text-sm font-medium text-slate-600">
        केन्द्रीय प्रशासन कन्सोल (Central Administration Console)
      </div>

      <div className="flex items-center gap-4">
        {user ? (
          <>
            <div className="text-xs text-right">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-slate-800">
                  {user.roles.includes('SUPER_ADMIN' as any)
                    ? 'Super Admin'
                    : user.roles.includes('BRANCH_ADMIN' as any)
                    ? 'Branch Admin'
                    : 'User'}
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-green-100 text-green-800">
                  सक्रिय (Active)
                </span>
              </div>
              <p className="text-slate-500 font-mono mt-0.5">{user.phoneNumber}</p>
            </div>

            <button
              onClick={() => logout()}
              className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100 text-xs font-semibold transition"
            >
              लगआउट (Logout)
            </button>
          </>
        ) : (
          <Link
            href="/login"
            className="px-4 py-1.5 rounded-lg bg-saffron-600 hover:bg-saffron-700 text-white text-xs font-semibold transition"
          >
            लगइन गर्नुहोस् (Login)
          </Link>
        )}
      </div>
    </header>
  );
}
