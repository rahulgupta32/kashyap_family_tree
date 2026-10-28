'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { RuleType } from '@kashyap/contracts';
import { useAuth } from '../../../context/auth-context';
import { ApiClient } from '../../../lib/api-client';

type Proposal = {
  id: string; ruleType: RuleType; pathCode: string; nepaliTerm: string; englishTerm: string;
  descriptionNepali?: string; proposedByUserId: string; rationale: string;
  status: 'PROPOSED' | 'REVIEWED' | 'APPROVED' | 'REJECTED';
  reviewerUserId?: string; reviewerNotes?: string; seniorAuthorityUserId?: string;
  authorityComments?: string; createdAt: string; reviewedAt?: string; approvedAt?: string;
};
type ProposalPage = { items: Proposal[]; nextBefore: string | null };
type DecisionEvent = { sequence: string; action: string; actorId: string; fromStatus: string | null;
  toStatus: string; reason: string; createdAt: string };
const empty = { ruleType: RuleType.NATA_SAINO, pathCode: '', nepaliTerm: '', englishTerm: '', descriptionNepali: '', rationale: '' };
const unavailable = 'कार्य पुष्टि भएन। हालको सूची पुनः लोड गरी जाँच्नुहोस्। (Action unconfirmed. Reload current proposals and check before another action.)';

export default function RuleProposalsPage() {
  const { accessToken, user, isLoading } = useAuth();
  const scope = JSON.stringify([accessToken, user, isLoading]);
  const currentScope = useRef(scope); currentScope.current = scope;
  const version = useRef(0), operation = useRef<object | null>(null);
  const [loadedScope, setLoadedScope] = useState('');
  const [catalog, setCatalog] = useState<ProposalPage>({ items: [], nextBefore: null });
  const [selected, setSelected] = useState<Proposal | null>(null);
  const [history, setHistory] = useState<DecisionEvent[]>([]);
  const [form, setForm] = useState(empty), [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false), [unconfirmed, setUnconfirmed] = useState(false);
  const [error, setError] = useState(''), [message, setMessage] = useState('');
  const authenticated = !!accessToken && !!user?.id && !isLoading;
  const current = () => currentScope.current === scope && authenticated;
  const valid = (stamp: number, work: object) => current() && version.current === stamp && operation.current === work;

  useLayoutEffect(() => {
    currentScope.current = scope;
    version.current++; operation.current = null;
    setLoadedScope(''); setCatalog({ items: [], nextBefore: null }); setSelected(null); setHistory([]);
    setForm(empty); setNotes(''); setBusy(false); setUnconfirmed(false); setError(''); setMessage('');
    return () => { currentScope.current = ''; version.current++; operation.current = null; };
  }, [scope]);

  // A private read failure may mean authority was revoked. Remove prior private
  // data; no stale selection can authorize another decision after that failure.
  function clearPrivate() {
    setLoadedScope(''); setCatalog({ items: [], nextBefore: null }); setSelected(null); setHistory([]); setNotes('');
  }
  async function read(id?: string, before?: string) {
    if (!current() || operation.current || !accessToken) return;
    const work = {}; operation.current = work;
    const stamp = ++version.current;
    setBusy(true); setError(''); setMessage(''); setSelected(null); setHistory([]); setNotes('');
    if (!before) { setLoadedScope(''); setCatalog({ items: [], nextBefore: null }); }
    try {
      const [page, result] = await Promise.all([
        ApiClient.culturalRuleProposals<ProposalPage>(before ? `?before=${encodeURIComponent(before)}` : '', accessToken),
        id ? Promise.all([
          ApiClient.culturalRuleProposals<Proposal>(`/${encodeURIComponent(id)}`, accessToken),
          ApiClient.culturalRuleProposals<DecisionEvent[]>(`/${encodeURIComponent(id)}/history`, accessToken),
        ]) : Promise.resolve(null),
      ]);
      if (!valid(stamp, work)) return;
      setCatalog(old => before ? { items: [...old.items, ...page.items], nextBefore: page.nextBefore } : page);
      setLoadedScope(scope); setSelected(result?.[0] ?? null); setHistory(result?.[1] ?? []); setUnconfirmed(false);
    } catch {
      if (valid(stamp, work)) { clearPrivate(); setUnconfirmed(true); setError(unavailable); }
    } finally {
      if (valid(stamp, work)) { operation.current = null; setBusy(false); }
    }
  }

  useEffect(() => { if (authenticated) void read(); }, [scope]);

  async function mutate(kind: 'PROPOSE' | 'ENDORSE' | 'DECLINE' | 'APPROVE' | 'REJECT') {
    if (!current() || !accessToken || !user?.id || operation.current || unconfirmed || loadedScope !== scope) return;
    const detail = selected;
    const note = notes.trim();
    if (kind !== 'PROPOSE' && (!detail || !note || note.length > 4000)) return;
    if ((kind === 'ENDORSE' || kind === 'DECLINE') &&
        (detail?.status !== 'PROPOSED' || detail.proposedByUserId === user.id)) return;
    if ((kind === 'APPROVE' || kind === 'REJECT') &&
        (detail?.status !== 'REVIEWED' || [detail.proposedByUserId, detail.reviewerUserId].includes(user.id))) return;
    const draft = { ...form };
    if (kind === 'PROPOSE' && (!draft.pathCode.trim() || !draft.nepaliTerm.trim() || !draft.englishTerm.trim() || !draft.rationale.trim())) return;
    const work = {}; operation.current = work;
    const stamp = ++version.current;
    setBusy(true); setError(''); setMessage(''); setSelected(null); setHistory([]);
    try {
      const result = kind === 'PROPOSE'
        ? await ApiClient.culturalRuleProposals<Proposal>('', accessToken, 'POST', {
          ruleType: draft.ruleType, pathCode: draft.pathCode.trim(), nepaliTerm: draft.nepaliTerm.trim(),
          englishTerm: draft.englishTerm.trim(), ...(draft.descriptionNepali.trim() ? { descriptionNepali: draft.descriptionNepali.trim() } : {}),
          proposedByUserId: user.id, rationale: draft.rationale.trim(),
        })
        : await ApiClient.culturalRuleProposals<Proposal>(kind === 'ENDORSE' || kind === 'DECLINE' ? '/review' : '/decide', accessToken, 'POST',
          kind === 'ENDORSE' || kind === 'DECLINE'
            ? { ruleId: detail!.id, reviewerUserId: user.id, reviewerNotes: note, isEndorsed: kind === 'ENDORSE' }
            : { ruleId: detail!.id, seniorAuthorityUserId: user.id, authorityComments: note, decision: kind === 'APPROVE' ? 'APPROVED' : 'REJECTED' });
      if (!valid(stamp, work)) return;
      if (!result || typeof result.id !== 'string' || !result.id) throw new Error('Unconfirmed result');
      const [page, fresh, events] = await Promise.all([
        ApiClient.culturalRuleProposals<ProposalPage>('', accessToken),
        ApiClient.culturalRuleProposals<Proposal>(`/${encodeURIComponent(result.id)}`, accessToken),
        ApiClient.culturalRuleProposals<DecisionEvent[]>(`/${encodeURIComponent(result.id)}/history`, accessToken),
      ]);
      if (!valid(stamp, work)) return;
      setCatalog(page); setLoadedScope(scope); setSelected(fresh); setHistory(events); setNotes('');
      if (kind === 'PROPOSE') setForm(empty);
      setMessage('प्रस्ताव अभिलेख पुनः जाँचियो (Proposal record reloaded). नियम सक्रिय भएका छैनन् (Rules have not been activated).');
    } catch {
      if (valid(stamp, work)) { clearPrivate(); setUnconfirmed(true); setError(unavailable); }
    } finally {
      if (valid(stamp, work)) { operation.current = null; setBusy(false); }
    }
  }

  function propose(event: FormEvent) { event.preventDefault(); void mutate('PROPOSE'); }
  if (isLoading) return <p>लोड हुँदैछ (Loading)…</p>;
  if (!authenticated) return <p><Link href="/login">प्रवेश गर्नुहोस् (Sign in)</Link></p>;
  const ready = loadedScope === scope && !busy && !unconfirmed;
  const detail = loadedScope === scope ? selected : null;
  const canRequestReview = ready && detail?.status === 'PROPOSED' && detail.proposedByUserId !== user!.id;
  const canRequestDecision = ready && detail?.status === 'REVIEWED' && ![detail.proposedByUserId, detail.reviewerUserId].includes(user!.id);
  const field = (key: 'pathCode' | 'nepaliTerm' | 'englishTerm' | 'descriptionNepali' | 'rationale', label: string, maximum: number, required = true) =>
    <label className="block" key={key}>{label}<textarea className="block border rounded p-2 w-full" rows={key === 'rationale' || key === 'descriptionNepali' ? 3 : 1}
      disabled={!ready} maxLength={maximum} required={required} value={form[key]} onChange={event => { if (current()) setForm({ ...form, [key]: event.target.value }); }} /></label>;
  return <section className="max-w-4xl space-y-5">
    <h1 className="text-2xl font-bold">सांस्कृतिक नियम प्रस्ताव (Cultural rule proposals)</h1>
    <Link href="/cultural">संस्कृति तथा इतिहासमा फर्कनुहोस् (Back to culture and history)</Link>
    <p>निजी प्रस्ताव र निर्णय अभिलेख मात्र। स्वीकृतिले सक्रिय नियम वा HG स्वीकृति बदल्दैन। (Private proposal and decision records only. Approval does not activate rules or change HG gates.)</p>
    <p>समीक्षा र अन्तिम निर्णयका लागि हालको स्पष्ट सांस्कृतिक जिम्मेवारी तथा ताजा authenticator प्रमाणीकरण चाहिन्छ। Super Admin भूमिकाले यो अधिकार दिँदैन। (Review and final decisions require a current explicit cultural authority assignment and a fresh authenticator-verified session. Super Admin alone grants no cultural authority.)</p>
    <p><Link href="/mfa">Authenticator प्रमाणीकरण (Authenticator verification)</Link> · प्रत्येक अनुरोधमा सर्भरले हालको अधिकार जाँच्छ (The server checks current authority on every request).</p>
    {error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}
    {busy && <p role="status">लोड हुँदैछ (Loading)…</p>}
    <button type="button" disabled={busy} onClick={() => void read()}>हालका प्रस्ताव पुनः लोड (Reload current proposals)</button>
    <form aria-label="New rule proposal" onSubmit={propose} className="border rounded p-4 space-y-3">
      <h2 className="font-bold">नयाँ प्रस्ताव (New proposal)</h2>
      <p>प्रस्तावक: हाल प्रवेश गरेको खाता (Proposer: current signed-in account).</p>
      <label className="block">नियम प्रकार (Rule type)<select className="block border p-2" disabled={!ready} value={form.ruleType}
        onChange={event => { if (current() && Object.values(RuleType).includes(event.target.value as RuleType)) setForm({ ...form, ruleType: event.target.value as RuleType }); }}>
        {Object.values(RuleType).map(type => <option key={type} value={type}>{type}</option>)}
      </select></label>
      {field('pathCode', 'सम्बन्ध पथ (Path code)', 200)}{field('nepaliTerm', 'नेपाली शब्द (Nepali term)', 500)}
      {field('englishTerm', 'अङ्ग्रेजी शब्द (English term)', 500)}{field('descriptionNepali', 'नेपाली विवरण (Nepali description)', 4000, false)}
      {field('rationale', 'कारण र स्रोत (Rationale and source)', 4000)}
      <button disabled={!ready} className="border rounded p-2">प्रस्ताव अभिलेख गर्नुहोस् (Record proposal)</button>
    </form>
    <section aria-label="Private proposals" className="space-y-3"><h2 className="font-bold">हेर्न मिल्ने प्रस्ताव (Accessible proposals)</h2>
      {loadedScope === scope && catalog.items.length === 0 && <p>हेर्न मिल्ने प्रस्ताव छैन (No accessible proposals).</p>}
      {loadedScope === scope && catalog.items.map(proposal => <article key={proposal.id} className="border rounded p-3">
        <h3>{proposal.nepaliTerm} · {proposal.englishTerm}</h3><p>{proposal.ruleType} · {proposal.pathCode} · {proposal.status}</p>
        <button disabled={busy} onClick={() => void read(proposal.id)}>विवरण र निर्णय इतिहास (Details and decision history)</button>
      </article>)}
      {loadedScope === scope && catalog.nextBefore && <button disabled={busy} onClick={() => void read(undefined, catalog.nextBefore!)}>पुराना प्रस्ताव (Older proposals)</button>}
    </section>
    {detail && <section aria-label="Selected rule proposal" className="border rounded p-4 space-y-3">
      <h2 className="font-bold">प्रस्ताव विवरण (Proposal details)</h2>
      <p>{detail.id} · {detail.status} · {detail.ruleType} · {detail.pathCode}</p>
      <p>{detail.nepaliTerm} · {detail.englishTerm}</p>
      {detail.descriptionNepali && <p className="whitespace-pre-wrap break-words">{detail.descriptionNepali}</p>}
      <p className="whitespace-pre-wrap break-words">{detail.rationale}</p>
      <p>प्रस्तावक (Proposer): {detail.proposedByUserId} · {detail.createdAt}</p>
      {detail.reviewerUserId && <p className="whitespace-pre-wrap break-words">समीक्षक (Reviewer): {detail.reviewerUserId} · {detail.reviewedAt} · {detail.reviewerNotes}</p>}
      {detail.seniorAuthorityUserId && <p className="whitespace-pre-wrap break-words">अन्तिम निर्णयकर्ता (Final decision actor): {detail.seniorAuthorityUserId} · {detail.approvedAt} · {detail.authorityComments}</p>}
      <section aria-label="Proposal decision history"><h3 className="font-bold">निर्णय इतिहास (Decision history)</h3>
        {history.map(event => <p key={event.sequence} className="whitespace-pre-wrap break-words">#{event.sequence} · {event.action} · {event.fromStatus ?? '—'} → {event.toStatus} · {event.actorId} · {event.createdAt} · {event.reason}</p>)}
      </section>
      {(canRequestReview || canRequestDecision) && <div className="space-y-2">
        <p>यो अनुरोध मात्र हो; तोकिएको जिम्मेवारी र सत्रको सर्भर जाँचपछि मात्र निर्णय हुन्छ। (These requests succeed only after server checks of assigned duty and session.)</p>
        <label className="block">निर्णय टिप्पणी (Decision notes)<textarea className="block border rounded p-2 w-full" maxLength={4000} value={notes}
          onChange={event => { if (current()) setNotes(event.target.value); }} /></label>
        {canRequestReview && <><button disabled={!notes.trim() || busy} onClick={() => void mutate('ENDORSE')}>समीक्षा समर्थन अनुरोध (Request review endorsement)</button>{' '}
          <button disabled={!notes.trim() || busy} onClick={() => void mutate('DECLINE')}>समीक्षा अस्वीकार अनुरोध (Request review rejection)</button></>}
        {canRequestDecision && <><button disabled={!notes.trim() || busy} onClick={() => void mutate('APPROVE')}>अन्तिम स्वीकृति अनुरोध (Request final approval)</button>{' '}
          <button disabled={!notes.trim() || busy} onClick={() => void mutate('REJECT')}>अन्तिम अस्वीकार अनुरोध (Request final rejection)</button></>}
      </div>}
    </section>}
  </section>;
}
