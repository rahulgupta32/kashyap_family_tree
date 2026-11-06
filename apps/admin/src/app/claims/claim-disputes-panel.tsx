'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ClaimDisputeDetailDto, ResolveClaimDisputeDto } from '@kashyap/contracts';
import { ApiClient } from '../../lib/api-client';

export default function ClaimDisputesPanel({ claimId, token, accountId, onResolved }: {
  claimId: string; token: string; accountId: string; onResolved: () => void;
}) {
  const scope = JSON.stringify([claimId, token, accountId]);
  const currentScope = useRef(scope);
  currentScope.current = scope;
  const revision = useRef(0);
  const busy = useRef(false);
  const [loadedScope, setLoadedScope] = useState('');
  const [disputes, setDisputes] = useState<ClaimDisputeDetailDto[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const [reload, setReload] = useState(0);

  useLayoutEffect(() => {
    currentScope.current = scope;
    revision.current++;
    busy.current = false;
    setLoadedScope(''); setDisputes([]); setNotes({}); setError(false); setSaving(false);
    return () => { currentScope.current = ''; revision.current++; };
  }, [scope]);

  useEffect(() => {
    const request = ++revision.current;
    setLoading(true); setLoadedScope(''); setDisputes([]); setError(false);
    ApiClient.listClaimDisputes(token, claimId).then(data => {
      if (currentScope.current !== scope || revision.current !== request) return;
      setDisputes(data); setLoadedScope(scope);
    }).catch(() => {
      if (currentScope.current === scope && revision.current === request) setError(true);
    }).finally(() => {
      if (currentScope.current === scope && revision.current === request) setLoading(false);
    });
    return () => { revision.current++; };
  }, [scope, token, claimId, reload]);

  async function resolve(dispute: ClaimDisputeDetailDto, decision: ResolveClaimDisputeDto['decision']) {
    const reason = (notes[dispute.id] || '').trim();
    if (currentScope.current !== scope || loadedScope !== scope || busy.current || !reason || reason.length > 4000) return;
    busy.current = true; setSaving(true); setError(false);
    try {
      await ApiClient.resolveDispute(token, dispute.id, { decision, notes: reason });
      if (currentScope.current !== scope) return;
      // The parent replaces the entire claim context with a fresh authorized read.
      onResolved();
    } catch (_) {
      if (currentScope.current !== scope) return;
      // A lost response may have committed. Never offer a second decision until re-read.
      setLoadedScope(''); setDisputes([]); setNotes({}); setError(true);
    } finally {
      if (currentScope.current === scope) { busy.current = false; setSaving(false); }
    }
  }

  return <section aria-label="दाबी विवाद (Claim disputes)" className="space-y-3 border-t pt-3">
    <h4 className="font-semibold">दाबी विवाद (Claim disputes)</h4>
    <p className="text-xs">दाबीकर्ता वा विवादकर्ता आफ्नै निर्णयकर्ता हुन सक्दैन। (Claimants and disputants must recuse themselves.)</p>
    {loading && <p role="status">लोड हुँदैछ (Loading disputes)…</p>}
    {error && <p role="alert">विवाद कार्य पुष्टि भएन; पुनः लोड गर्नुहोस्। (Dispute action unconfirmed; reload before retry.)</p>}
    <button type="button" disabled={loading || saving} onClick={() => setReload(value => value + 1)}
      className="px-3 py-2 border rounded">विवाद पुनः लोड (Reload disputes)</button>
    {loadedScope === scope && !disputes.length && <p>विवाद छैन (No disputes).</p>}
    {loadedScope === scope && disputes.map(dispute => <article key={dispute.id} className="space-y-2 border rounded p-3">
      <p className="whitespace-pre-wrap break-words">{dispute.reason}</p>
      <p>स्थिति (Status): {dispute.status}</p>
      {dispute.resolutionNotes && <p className="whitespace-pre-wrap break-words">{dispute.resolutionNotes}</p>}
      {dispute.status === 'OPEN' && <>
        <label className="block" htmlFor={`dispute-notes-${dispute.id}`}>विवाद निर्णयको कारण (Dispute resolution reason)</label>
        <textarea id={`dispute-notes-${dispute.id}`} maxLength={4000} value={notes[dispute.id] || ''}
          disabled={saving} onChange={event => setNotes(value => ({ ...value, [dispute.id]: event.target.value }))}
          className="w-full border rounded p-2" />
        <p className="text-xs">विवाद स्वीकार्दा दाबी खारेज हुन्छ र सोही खाताको व्यक्ति सम्बन्ध हट्छ। वंशावली मेटिँदैन। (Upholding supersedes the claim and unlinks its account; genealogy is retained.)</p>
        <div className="flex gap-2">
          <button type="button" disabled={saving || !(notes[dispute.id] || '').trim()} onClick={() => resolve(dispute, 'DISMISSED')}
            className="px-3 py-2 border rounded">विवाद खारेज (Dismiss dispute)</button>
          <button type="button" disabled={saving || !(notes[dispute.id] || '').trim()} onClick={() => resolve(dispute, 'RESOLVED')}
            className="px-3 py-2 border rounded">विवाद स्वीकार (Uphold dispute)</button>
        </div>
      </>}
    </article>)}
  </section>;
}
