'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Role } from '@kashyap/contracts';
import { useAuth } from '../context/auth-context';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:3000';
interface DeliveryStatus {
  backlog: { pending: number; due: number; delayed: number; failed: number; exhausted: number;
    oldestPendingAgeSeconds: number; oldestDueAgeSeconds: number; unresolvedOtpAttempts: number };
  worker: { scope: string; lifecycle: string; inFlight: boolean; intervalSeconds: number; batchSize: number;
    lastStartedAt: string | null; lastCompletedAt: string | null; lastFailureAt: string | null;
    lastResult: { processed: number; failed: number } | null };
  generatedAt: string;
}

export function AuditDeliveryPanel() {
  const { accessToken, isLoading, user } = useAuth();
  const allowed = !!user?.roles.some(role => role === Role.SUPER_ADMIN || role === Role.CENTRAL_ADMIN);
  const [data, setData] = useState<DeliveryStatus | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const active = useRef<AbortController | null>(null);
  const load = useCallback(async () => {
    active.current?.abort();
    if (!accessToken || isLoading || !allowed) return;
    const controller = new AbortController();
    active.current = controller;
    setBusy(true); setError(''); setData(null);
    try {
      const response = await fetch(`${API}/audit/delivery`, {
        headers: { Authorization: `Bearer ${accessToken}` }, cache: 'no-store', signal: controller.signal,
      });
      if (!response.ok) throw new Error('अडिट वितरण अवस्था उपलब्ध छैन। Audit delivery status is unavailable.');
      const result: DeliveryStatus = await response.json();
      if (!controller.signal.aborted) setData(result);
    } catch (failure) {
      if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : 'Audit delivery status is unavailable.');
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }, [accessToken, isLoading, allowed]);
  useEffect(() => {
    setData(null); setError(''); setBusy(false);
    void load();
    return () => { active.current?.abort(); };
  }, [load]);
  if (!allowed || isLoading || !accessToken) return null;
  return <section aria-labelledby="audit-delivery-heading" className="space-y-3 rounded border p-4">
    <h2 id="audit-delivery-heading" className="text-lg font-semibold">अडिट वितरण (Audit delivery)</h2>
    <button type="button" disabled={busy} onClick={() => void load()} className="rounded border p-2">
      {busy ? 'जाँच हुँदैछ… Checking…' : 'अवस्था ताजा गर्नुहोस् (Refresh delivery status)'}
    </button>
    {error && <p role="alert">{error}</p>}
    {data && <>
      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {([
          ['बाँकी (Pending)', data.backlog.pending], ['अहिले योग्य (Due)', data.backlog.due],
          ['प्रतीक्षामा (Delayed)', data.backlog.delayed], ['असफल (Failed)', data.backlog.failed],
          ['पुनः प्रयास सीमा पुगेको (Exhausted)', data.backlog.exhausted],
          ['पुरानो बाँकी उमेर, सेकेन्ड (Oldest pending age, seconds)', Math.floor(data.backlog.oldestPendingAgeSeconds)],
          ['पुरानो योग्य उमेर, सेकेन्ड (Oldest due age, seconds)', Math.floor(data.backlog.oldestDueAgeSeconds)],
          ['नतिजा नपाइएको OTP प्रयास (Unresolved OTP attempts)', data.backlog.unresolvedOtpAttempts],
        ] as [string, number][]).map(([label, value]) => <div key={label}><dt>{label}</dt><dd className="text-xl font-semibold">{value}</dd></div>)}
      </dl>
      <p>यो API प्रक्रियाको अवस्था (This API process): {data.worker.lifecycle}{data.worker.inFlight ? ' · processing' : ''}.
        {' '}Last completed cycle: {data.worker.lastCompletedAt || 'No completed cycle recorded'}.</p>
      <p>Last failed cycle: {data.worker.lastFailureAt || 'None recorded'}.
        {' '}Last batch: {data.worker.lastResult ? `${data.worker.lastResult.processed} processed, ${data.worker.lastResult.failed} failed` : 'Not recorded'}.</p>
      <p className="text-sm">Snapshot: {new Date(data.generatedAt).toLocaleString()}. Refresh to check again.
        {' '}Queue counts cover all API processes; worker activity describes this process only.</p>
      {(data.backlog.exhausted > 0 || data.backlog.unresolvedOtpAttempts > 0) &&
        <p role="alert">समीक्षा आवश्यक छ। Review retained evidence through the approved incident process. Exhausted events are retained; automatic delivery has stopped. OTP attempts without a recorded outcome for ten minutes are shown for investigation.</p>}
      <p className="text-sm">These counts support investigation. Alert routing, fleet monitoring and governed recovery still require operational configuration.</p>
    </>}
  </section>;
}
