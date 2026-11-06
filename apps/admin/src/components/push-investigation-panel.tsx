'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Role } from '@kashyap/contracts';
import { useAuth } from '../context/auth-context';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:3000';
const uuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const dispatchStates = ['PENDING', 'PROCESSING', 'FAILED', 'RECONCILIATION_REQUIRED', 'SENT', 'SKIPPED'];
const attemptStates = ['PLANNED', 'SENDING', 'ACCEPTED', 'INVALID_TOKEN', 'REJECTED', 'UNKNOWN', 'SKIPPED'];
const observationStates = ['ACCEPTED', 'INVALID_TOKEN', 'REJECTED', 'UNKNOWN', 'SKIPPED'];
const unavailable = 'पुश समीक्षा उपलब्ध छैन। हालको अधिकार र प्रमाणक जाँच गर्नुहोस्। Push investigation is unavailable; verify current authority and authenticator.';

interface Dispatch { id: string; deliveryStatus: string; createdAt: string }
interface Page { items: Dispatch[]; nextCursor: string | null }
interface Attempt { id: string; status: string; effectiveOutcome: string; recordedOutcome: string | null; observationRecorded: boolean; claimExpired: boolean }
interface Detail extends Dispatch { attempts: Attempt[] }
const object = (value: unknown): Record<string, unknown> | null => value !== null && typeof value === 'object' && !Array.isArray(value)
  ? value as Record<string, unknown> : null;
const date = (value: unknown): value is string => typeof value === 'string' && value.length <= 32 && Number.isFinite(Date.parse(value));
function dispatch(value: unknown): Dispatch | null {
  const row = object(value);
  return row && typeof row.id === 'string' && uuid.test(row.id) && typeof row.deliveryStatus === 'string' &&
    dispatchStates.includes(row.deliveryStatus) && date(row.createdAt)
    ? { id: row.id, deliveryStatus: row.deliveryStatus, createdAt: row.createdAt } : null;
}
function parsePage(value: unknown): Page | null {
  const row = object(value);
  if (!row || row.acceptanceOnly !== true || !Array.isArray(row.items) || row.items.length > 50 ||
      !(row.nextCursor === null || (typeof row.nextCursor === 'string' &&
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z\|[0-9a-f-]{36}$/i.test(row.nextCursor)))) return null;
  const items = row.items.map(dispatch);
  if (items.some(item => !item) || new Set(items.map(item => item?.id)).size !== items.length) return null;
  return { items: items as Dispatch[], nextCursor: row.nextCursor as string | null };
}
function parseDetail(value: unknown, id: string): Detail | null {
  const row = object(value), parent = dispatch(value);
  if (!row || !parent || parent.id !== id || row.acceptanceOnly !== true || !Array.isArray(row.attempts) || row.attempts.length > 50) return null;
  const attempts: Attempt[] = [];
  for (const value of row.attempts) {
    const a = object(value);
    if (!a || typeof a.id !== 'string' || !uuid.test(a.id) || typeof a.status !== 'string' ||
        !attemptStates.includes(a.status) || !(a.recordedOutcome === null ||
          (typeof a.recordedOutcome === 'string' && observationStates.includes(a.recordedOutcome))) ||
        typeof a.observationRecorded !== 'boolean' || a.observationRecorded !== (a.recordedOutcome !== null) ||
        typeof a.claimExpired !== 'boolean' || (a.claimExpired && a.status !== 'SENDING') ||
        a.effectiveOutcome !== (a.status === 'UNKNOWN' && a.recordedOutcome !== null ? a.recordedOutcome : a.status)) return null;
    attempts.push({ id: a.id, status: a.status, recordedOutcome: a.recordedOutcome as string | null,
      effectiveOutcome: a.effectiveOutcome as string, observationRecorded: a.observationRecorded, claimExpired: a.claimExpired });
  }
  return new Set(attempts.map(a => a.id)).size === attempts.length ? { ...parent, attempts } : null;
}

export function PushInvestigationPanel() {
  const { user, accessToken, isLoading } = useAuth();
  const allowed = !!user?.roles.includes(Role.SUPER_ADMIN);
  const [page, setPage] = useState<Page | null>(null), [detail, setDetail] = useState<Detail | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const active = useRef<AbortController | null>(null);
  const load = useCallback(async (cursor?: string) => {
    active.current?.abort();
    if (!allowed || !accessToken || isLoading) return;
    const controller = new AbortController(); active.current = controller;
    setBusy(true); setError(''); setPage(null); setDetail(null);
    try {
      const r = await fetch(`${API}/audit/delivery/pushes${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`,
        { headers: { Authorization: `Bearer ${accessToken}` }, cache: 'no-store', signal: controller.signal });
      if (!r.ok) throw new Error();
      const result = parsePage(await r.json()); if (!result) throw new Error();
      if (!controller.signal.aborted) setPage(result);
    } catch { if (!controller.signal.aborted) { setPage(null); setDetail(null); setError(unavailable); } }
    finally { if (!controller.signal.aborted) setBusy(false); }
  }, [allowed, accessToken, isLoading]);
  useEffect(() => {
    setPage(null); setDetail(null); setError(''); setBusy(false); void load();
    return () => { active.current?.abort(); };
  }, [load, user?.id]);
  async function inspect(id: string) {
    if (busy || !allowed || !accessToken || !uuid.test(id)) return;
    active.current?.abort(); const controller = new AbortController(); active.current = controller;
    setBusy(true); setDetail(null); setError('');
    try {
      const r = await fetch(`${API}/audit/delivery/pushes/${id}`,
        { headers: { Authorization: `Bearer ${accessToken}` }, cache: 'no-store', signal: controller.signal });
      if (!r.ok) throw new Error(); const result = parseDetail(await r.json(), id); if (!result) throw new Error();
      if (!controller.signal.aborted) setDetail(result);
    } catch { if (!controller.signal.aborted) { setPage(null); setDetail(null); setError(unavailable); } }
    finally { if (!controller.signal.aborted) setBusy(false); }
  }
  if (!allowed || !accessToken || isLoading) return null;
  return <section aria-labelledby="push-investigation-heading" className="space-y-3 rounded border p-4" aria-busy={busy}>
    <h2 id="push-investigation-heading" className="text-lg font-semibold">रोकिएका पुश समीक्षा (Held push investigation)</h2>
    <p>हालको Super Admin अधिकार र प्रमाणक आवश्यक छ। Current Super Admin authority and authenticator verification are required.</p>
    <a href="/mfa" className="underline">प्रमाणक जाँच (Verify authenticator)</a>{' '}
    <button type="button" disabled={busy} onClick={() => void load()} className="rounded border p-2">पुश समीक्षा ताजा गर्नुहोस् (Refresh push investigation)</button>
    <p>यो समीक्षा पढ्न मात्र हो; अनिश्चित सूचना फेरि पठाइँदैन। Read-only investigation; uncertain notifications are not resent.</p>
    <p>प्रदायक स्वीकृति उपकरणमा प्राप्त भएको प्रमाण होइन। Provider acceptance does not confirm device delivery.</p>
    {error ? <p role="alert">{error}</p> : null}
    {page ? <>
      {!page.items.length ? <p>यस दृश्यमा समीक्षाका लागि पुश छैन। No push dispatches require review in this view.</p> : null}
      <ul className="space-y-2">{page.items.map(item => <li key={item.id} className="break-all">
        {item.id} · {item.deliveryStatus} · {new Date(item.createdAt).toLocaleString()}{' '}
        <button type="button" disabled={busy} onClick={() => void inspect(item.id)}
          aria-label={`Inspect push dispatch ${item.id}`} className="rounded border p-2">नतिजा हेर्नुहोस् (Inspect outcomes)</button>
      </li>)}</ul>
      {page.nextCursor ? <button type="button" disabled={busy} onClick={() => void load(page.nextCursor!)}
        className="rounded border p-2">अर्को पृष्ठ (Next review page)</button> : null}
    </> : null}
    {detail ? <section aria-labelledby="push-dispatch-heading" className="space-y-2 border-t pt-3">
      <h3 id="push-dispatch-heading" className="font-semibold">प्रेषण नतिजा (Dispatch outcomes)</h3>
      <p className="break-all">{detail.id} · {detail.deliveryStatus}</p>
      {!detail.attempts.length ? <p>उपकरण प्रयास अभिलेख छैन। No retained device attempts; no provider result is inferred.</p> : null}
      <ul className="space-y-2">{detail.attempts.map(a => <li key={a.id} className="break-all">
        {a.id} · अवस्था (State): {a.status} · हाल व्याख्या (Effective outcome): {a.effectiveOutcome}{' '}
        · प्रदायक अभिलेख (Recorded provider outcome): {a.recordedOutcome || 'अभिलेख छैन (Not recorded)'}
        {a.claimExpired ? <span> · प्रदायक दाबी म्याद सकिएको (Provider claim expired)</span> : null}
      </li>)}</ul>
    </section> : null}
  </section>;
}
