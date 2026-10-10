'use client';
import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../context/auth-context';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:3000';
function destination(){const next=new URLSearchParams(window.location.search).get('next');return next==='/cultural'||next==='/lookup'||next==='/branches'||next==='/imports'?next:'/';}

export default function VerificationPage() {
  const { accessToken, isLoading } = useAuth();
  const router = useRouter();
  const epoch = useRef(0);
  const tokenRef = useRef(accessToken); tokenRef.current = accessToken;
  const [status, setStatus] = useState<{ enrolled: boolean; required: boolean; verified: boolean; eligible: boolean } | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [recovery, setRecovery] = useState(false);
  const [replacement, setReplacement] = useState(false);
  const [codes, setCodes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    epoch.current++; setBusy(false);
    setRecovery(false); setReplacement(false); setStatus(null); setSecret(null); setCodes([]); setCode(''); setError('');
    if (isLoading) return;
    if (!accessToken) { router.replace(destination()==='/'?'/login':`/login?next=${destination()}`); return; }
    const controller = new AbortController();
    fetch(`${API}/auth/mfa/status`, { headers: { Authorization: `Bearer ${accessToken}` }, credentials: 'include', cache: 'no-store', signal: controller.signal })
      .then(async response => { const data = await response.json(); if (!response.ok) throw new Error(data.message || 'Unable to load verification'); return data; })
      .then(data => { if (controller.signal.aborted) return; setStatus(data); if ((!data.required || data.verified) && !(window.location.search === '?setup=1' && data.eligible)) router.replace(destination()); })
      .catch(e => { if (!controller.signal.aborted) setError(e.message); });
    return () => { epoch.current++; controller.abort(); };
  }, [accessToken, isLoading, router]);
  async function submit(operation: string) {
    if (!accessToken || busy) return;
    const token = accessToken; const generation = epoch.current; setBusy(true); setError('');
    try {
      const response = await fetch(`${API}/auth/mfa/${operation}`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, credentials: 'include', cache: 'no-store', body: JSON.stringify(operation === 'enroll' ? {} : { code }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.message || 'Verification failed');
      if (generation !== epoch.current || tokenRef.current !== token) return;
      if (operation === 'enroll' || operation === 'replace/start') { setSecret(data.secret); setReplacement(operation === 'replace/start'); setCode(''); }
      else if (data.recoveryCodes) { setCodes(data.recoveryCodes); setSecret(null); setReplacement(false); setCode(''); }
      else router.replace(destination());
    } catch (e: any) { if (generation === epoch.current && tokenRef.current === token) setError(e.message || 'Verification failed'); }
    finally { if (generation === epoch.current && tokenRef.current === token) setBusy(false); }
  }
  return <main className="mx-auto max-w-xl p-6 space-y-4">
    <h1 className="text-2xl font-bold">सुरक्षा प्रमाणीकरण (Security verification)</h1>
    <p>Enter the code from your authenticator app. Your phone login is required first.</p>
    {error && <p role="alert">{error}</p>}
    {!status && !error && <p>Loading verification…</p>}
    {codes.length > 0 ? <section className="space-y-3">
      <h2 className="font-semibold">Save your recovery codes</h2>
      <p>These codes are shown once. Keep them offline in a safe place. Each code can be used once after phone login. If you lose the authenticator and all codes, access cannot be recovered through phone login alone.</p>
      <ul>{codes.map(value => <li key={value}><code>{value}</code></li>)}</ul>
      <button onClick={() => { setCodes([]); router.replace(destination()); }}>I saved the codes — continue</button>
    </section> : status && <section className="space-y-3">
      {!status.enrolled && !secret && <button disabled={busy} onClick={() => submit('enroll')}>Set up authenticator</button>}
      {secret && <div><p>In your authenticator app, add a time-based account named Kashyap. Enter this setup key:</p><code className="break-all">{secret}</code><p>Setup expires after 10 minutes. Keep this key private.</p><button disabled={busy} onClick={() => { setSecret(null); setCode(''); if (replacement) setReplacement(false); else void submit('enroll'); }}>Restart expired setup</button></div>}
      {(status.enrolled || secret) && <form onSubmit={event => { event.preventDefault(); void submit(secret ? replacement ? 'replace/confirm' : 'confirm' : status.verified ? 'recovery-codes/renew' : recovery ? 'recover' : 'verify'); }}>
        {status.verified && !secret && <p>Enter a fresh code from your current authenticator. Renewal or replacement invalidates old recovery codes and signs out other sessions.</p>}
        <label htmlFor="verification-code">{recovery ? 'Recovery code' : 'Authenticator code'}</label>
        <input id="verification-code" className="block border p-2 w-full" value={code} onChange={event => setCode(event.target.value)} autoComplete="off" inputMode={recovery ? 'text' : 'numeric'} maxLength={recovery ? 32 : 6} />
        <button className="mt-3" disabled={busy || !(recovery ? /^[a-f0-9]{32}$/ : /^\d{6}$/).test(code)} type="submit">{busy ? 'Verifying…' : status.verified && !secret ? 'Renew recovery codes' : 'Verify'}</button>
        {status.verified && !secret && <button type="button" disabled={busy || !/^\d{6}$/.test(code)} onClick={() => submit('replace/start')}>Replace authenticator</button>}
      </form>}
      {status.enrolled && !status.verified && !secret && <button disabled={busy} onClick={() => { setRecovery(!recovery); setCode(''); }}>{recovery ? 'Use authenticator' : 'Use a recovery code'}</button>}
    </section>}
  </main>;
}
