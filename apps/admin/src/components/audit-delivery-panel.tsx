'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Role } from '@kashyap/contracts';
import { useAuth } from '../context/auth-context';
import { AuditRecoveryPanel } from './audit-recovery-panel';
import { PushInvestigationPanel } from './push-investigation-panel';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:3000';
const pushMetrics = [
  ['pendingDispatches','बाँकी पुश (Pending push dispatches)'],
  ['processingDispatches','प्रक्रियामा (Processing push dispatches)'],
  ['failedDispatches','असफल पुश (Failed push dispatches)'],
  ['heldDispatches','समीक्षाका लागि रोकिएको (Held push dispatches)'],
  ['plannedDevices','प्रतीक्षामा रहेका उपकरण (Planned devices)'],
  ['inFlightDevices','प्रदायक अनुरोध जारी (In-flight device requests)'],
  ['expiredClaims','म्याद सकिएका दाबी (Expired provider claims)'],
  ['unknownDevices','नतिजा अनिश्चित (Unknown device outcomes)'],
  ['rejectedDevices','प्रदायकले अस्वीकार गरेको (Rejected device requests)'],
  ['confirmedDevicesAwaitingReconciliation','नतिजा मिलान बाँकी (Confirmed devices awaiting reconciliation)'],
  ['oldestHeldDispatchAgeSeconds','पुरानो रोकिएको पुश उमेर, सेकेन्ड (Oldest held push age, seconds)'],
  ['oldestUnresolvedDeviceAgeSeconds','पुरानो अनिर्णीत उपकरण उमेर, सेकेन्ड (Oldest unresolved device age, seconds)'],
] as const;
type PushSummary = {acceptanceOnly:true} & Record<typeof pushMetrics[number][0],number>;
function pushSummary(value:unknown):PushSummary|null {
  if (!value || typeof value!=='object') return null;
  const data=value as Record<string,unknown>;
  if (data.acceptanceOnly!==true || pushMetrics.some(([key])=>typeof data[key]!=='number' ||
    !Number.isFinite(data[key]) || (data[key] as number)<0 ||
    (!key.endsWith('Seconds') && !Number.isSafeInteger(data[key])))) return null;
  return data as PushSummary;
}
interface NotificationWorkerStatus {scope:string;lifecycle:string;inFlight:boolean;lastCompletedAt:string|null;lastFailureAt:string|null;lastFailureCodes:string[]}
function notificationWorker(value:unknown):NotificationWorkerStatus|null {
  if (!value || typeof value!=='object') return null;
  const data=value as Record<string,unknown>;
  if (data.scope!=='THIS_API_PROCESS' || !['STARTING','RUNNING','TEST_DISABLED','STOPPED'].includes(data.lifecycle as string) ||
    typeof data.inFlight!=='boolean' || !['lastCompletedAt','lastFailureAt'].every(key=>data[key]===null ||
      (typeof data[key]==='string' && Number.isFinite(Date.parse(data[key] as string)))) ||
    !Array.isArray(data.lastFailureCodes) || data.lastFailureCodes.length>3 || data.lastFailureCodes.some(code=>
      !['PUSH_TOKEN_RETENTION_UNAVAILABLE','PUSH_PROVIDER_RECONCILIATION_UNAVAILABLE','NOTIFICATION_WORKER_UNAVAILABLE'].includes(code))) return null;
  return data as unknown as NotificationWorkerStatus;
}
interface DeliveryStatus {
  backlog: { pending: number; due: number; delayed: number; failed: number; exhausted: number;
    oldestPendingAgeSeconds: number; oldestDueAgeSeconds: number; unresolvedOtpAttempts: number; pushProvider?:unknown };
  worker: { scope: string; lifecycle: string; inFlight: boolean; intervalSeconds: number; batchSize: number;
    lastStartedAt: string | null; lastCompletedAt: string | null; lastFailureAt: string | null;
    lastResult: { processed: number; failed: number } | null };
  generatedAt: string;
  notificationWorker?:unknown;
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
  const push=pushSummary(data?.backlog.pushProvider);
  const notification=notificationWorker(data?.notificationWorker);
  return <><section aria-labelledby="audit-delivery-heading" className="space-y-3 rounded border p-4">
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
      <section aria-labelledby="push-provider-heading" className="space-y-3 border-t pt-4">
        <h3 id="push-provider-heading" className="text-lg font-semibold">पुश प्रदायक अवस्था (Push provider status)</h3>
        {push ? <>
          <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {pushMetrics.map(([key,label])=><div key={key}><dt>{label}</dt><dd className="text-xl font-semibold">{Math.floor(push[key])}</dd></div>)}
          </dl>
          {(push.heldDispatches>0 || push.expiredClaims>0 || push.unknownDevices>0 || push.rejectedDevices>0) &&
            <p role="alert">पुश नतिजा समीक्षा आवश्यक छ। Push outcomes require review. Uncertain requests remain held; refreshing this view does not resend notifications.</p>}
          <p>प्रदायक स्वीकृति उपकरणमा प्राप्त भएको प्रमाण होइन। Provider acceptance does not confirm delivery to a device.</p>
        </> : <p role="alert">पुश अवस्था उपलब्ध छैन। Push status is unavailable; no healthy state is inferred.</p>}
        {notification ? <>
          <p>सूचना कार्यकर्ता, यो प्रक्रिया (Notification worker, this API process): {notification.lifecycle}{notification.inFlight?' · processing':''}.
            {' '}Last completed notification cycle: {notification.lastCompletedAt || 'No completed cycle recorded'}.</p>
          <p>Last failed notification cycle: {notification.lastFailureAt || 'None recorded'}.</p>
          {!!notification.lastFailureCodes.length && <p role="alert">Notification cycle unavailable: {notification.lastFailureCodes.join(', ')}. Follow the approved incident process.</p>}
        </> : <p>Notification worker status is unavailable.</p>}
        <p className="text-sm">Counts cover open push dispatches across all API processes. Worker activity describes this process only. Incident routing and reviewed provider recovery still require operational configuration.</p>
      </section>
    </>}
  </section><PushInvestigationPanel key={`push-${user?.id}`} /><AuditRecoveryPanel key={user?.id} /></>;
}
