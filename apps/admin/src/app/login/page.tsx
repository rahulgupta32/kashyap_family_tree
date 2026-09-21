'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Role } from '@kashyap/contracts';
import { ApiClient } from '../../lib/api-client';
import { useAuth } from '../../context/auth-context';

export default function LoginPage() {
  const router = useRouter();
  const { login, user, isAdmin } = useAuth();

  const [step, setStep] = useState<'PHONE' | 'OTP' | 'ACCESS_DENIED'>('PHONE');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpSessionId, setOtpSessionId] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pendingUserPhone, setPendingUserPhone] = useState<string | null>(null);

  // If already logged in as admin, redirect to dashboard
  useEffect(() => {
    if (user && isAdmin) {
      router.push('/');
    }
  }, [user, isAdmin, router]);

  // Cooldown countdown timer
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => {
      setCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const res = await ApiClient.requestOtp({ phoneNumber });
      setOtpSessionId(res.otpSessionId);
      setCooldown(res.cooldownSeconds || 60);
      setStep('OTP');
    } catch (err: any) {
      setError(err.message || 'OTP अनुरोध असफल भयो (Failed to request OTP)');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const session = await ApiClient.verifyOtp({
        otpSessionId,
        code: otpCode,
        deviceInfo: {
          deviceId: 'web-browser',
          platform: 'web',
          appVersion: '1.0.0',
        },
      });

      const hasAdminPrivilege =
        session.user.roles.includes(Role.SUPER_ADMIN) ||
        session.user.roles.includes(Role.BRANCH_ADMIN);

      if (!hasAdminPrivilege) {
        setPendingUserPhone(session.user.phoneNumber);
        setStep('ACCESS_DENIED');
        return;
      }

      login(session);
      router.push('/');
    } catch (err: any) {
      setError(err.message || 'ओटिपी प्रमाणीकरण असफल भयो (Verification failed)');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResendOtp = async () => {
    if (cooldown > 0 || isSubmitting) return;
    setError(null);
    setIsSubmitting(true);

    try {
      const res = await ApiClient.requestOtp({ phoneNumber });
      setOtpSessionId(res.otpSessionId);
      setCooldown(res.cooldownSeconds || 60);
    } catch (err: any) {
      setError(err.message || 'ओटिपी पुन: पठाउन सकिएन');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col justify-center items-center p-4">
      {/* Brand Header */}
      <div className="mb-8 text-center">
        <div className="w-16 h-16 rounded-full bg-saffron-600 text-white text-2xl font-bold flex items-center justify-center mx-auto shadow-md mb-3">
          क
        </div>
        <h1 className="text-2xl font-bold text-slate-800">कश्यप अधिकारी वंशावली</h1>
        <p className="text-sm text-slate-500 mt-1">प्रशासनिक पोर्टल (Central Administration Portal)</p>
      </div>

      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-200 p-8">
        {error && (
          <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
            <p className="font-semibold">त्रुटि (Error):</p>
            <p>{error}</p>
          </div>
        )}

        {step === 'PHONE' && (
          <form onSubmit={handleRequestOtp} className="space-y-6">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                मोबाइल नम्बर (Mobile Number)
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400 text-sm font-medium">
                  +977
                </span>
                <input
                  type="tel"
                  required
                  placeholder="98XXXXXXXX"
                  value={phoneNumber.replace(/^\+977/, '')}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  className="w-full pl-16 pr-4 py-3 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-saffron-500 focus:border-transparent text-slate-900 font-mono text-base"
                />
              </div>
              <p className="text-xs text-slate-400 mt-2">
                नेपालको १०-अंकीय मोबाइल नम्बर प्रविष्ट गर्नुहोस् (९८ वा ९७ बाट सुरु भएको)।
              </p>
            </div>

            <button
              type="submit"
              disabled={isSubmitting || !phoneNumber.trim()}
              className="w-full py-3 px-4 bg-saffron-600 hover:bg-saffron-700 text-white font-bold rounded-xl shadow transition duration-150 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
            >
              {isSubmitting ? 'पठाउँदै... (Sending...)' : 'ओटिपी कोड पठाउनुहोस् (Send OTP)'}
            </button>
          </form>
        )}

        {step === 'OTP' && (
          <form onSubmit={handleVerifyOtp} className="space-y-6">
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="text-sm font-semibold text-slate-700">
                  प्रमाणीकरण कोड (Verification OTP)
                </label>
                <button
                  type="button"
                  onClick={() => setStep('PHONE')}
                  className="text-xs text-saffron-600 hover:underline"
                >
                  नम्बर परिवर्तन गर्नुहोस् (Change)
                </button>
              </div>

              <input
                type="text"
                required
                maxLength={6}
                placeholder="6-अंकको कोड"
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                className="w-full px-4 py-3 text-center tracking-widest text-2xl font-bold rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-saffron-500 focus:border-transparent text-slate-900 font-mono"
              />
              <p className="text-xs text-slate-400 mt-2 text-center">
                {phoneNumber} मा पठाइएको ६ अंकको कोड प्रविष्ट गर्नुहोस्।
              </p>
            </div>

            <button
              type="submit"
              disabled={isSubmitting || otpCode.length !== 6}
              className="w-full py-3 px-4 bg-saffron-600 hover:bg-saffron-700 text-white font-bold rounded-xl shadow transition duration-150 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
            >
              {isSubmitting ? 'प्रमाणीकरण हुँदैछ...' : 'प्रवेश गर्नुहोस् (Verify & Log In)'}
            </button>

            <div className="text-center pt-2">
              <button
                type="button"
                onClick={handleResendOtp}
                disabled={cooldown > 0 || isSubmitting}
                className="text-xs font-semibold text-slate-600 hover:text-saffron-600 disabled:text-slate-400 disabled:cursor-not-allowed"
              >
                {cooldown > 0
                  ? `पुन: पठाउनुहोस् (${cooldown} सेकेन्ड)`
                  : 'कोड आएन? पुन: पठाउनुहोस् (Resend OTP)'}
              </button>
            </div>
          </form>
        )}

        {step === 'ACCESS_DENIED' && (
          <div className="space-y-6 text-center">
            <div className="w-12 h-12 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center mx-auto text-xl font-bold">
              !
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-800">
                पहुँच अस्वीकृत (Access Denied)
              </h2>
              <p className="text-sm text-slate-600 mt-2">
                मोबाइल नम्बर <span className="font-mono font-bold text-slate-800">{pendingUserPhone}</span> लाई कुनै पनि प्रशासनिक भूमिका (Super Admin वा Branch Admin) प्रदान गरिएको छैन।
              </p>
              <p className="text-xs text-slate-500 mt-3">
                प्रशासनिक पहुँच प्राप्त गर्नका लागि केन्द्रीय प्रशासकसँग सम्पर्क गर्नुहोस्।
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                setStep('PHONE');
                setOtpCode('');
                setPendingUserPhone(null);
              }}
              className="w-full py-3 px-4 bg-slate-800 hover:bg-slate-900 text-white font-semibold rounded-xl text-sm transition"
            >
              अन्य नम्बरबाट प्रयास गर्नुहोस् (Try Another Account)
            </button>
          </div>
        )}
      </div>

      <div className="mt-8 text-center text-xs text-slate-400">
        <p>सुरक्षित केन्द्रीय प्रमाणीकरण (PostgreSQL & Redis Session Enforced)</p>
        <p className="mt-1">Kashyap Adhikari Family Tree Governance — Release 1.0</p>
      </div>
    </div>
  );
}
