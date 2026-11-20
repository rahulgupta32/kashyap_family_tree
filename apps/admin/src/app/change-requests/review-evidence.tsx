import { useLayoutEffect, useRef, useState } from 'react';
import { ApiClient } from '../../lib/api-client';

interface EvidenceAsset {
  id: string;
  mimeType: string;
}

export function ReviewEvidence({ requestId, token }: { requestId: string; token: string }) {
  const lifetime = useRef<AbortController | null>(null);
  const busy = useRef(false);
  const [assets, setAssets] = useState<EvidenceAsset[] | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [unavailable, setUnavailable] = useState(false);

  useLayoutEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller;
    async function load() {
      try {
        const response = await ApiClient.changeRequestEvidence(token, requestId, controller.signal);
        const files: EvidenceAsset[] = await response.json();
        if (!controller.signal.aborted) setAssets(files);
      } catch {
        if (!controller.signal.aborted) setUnavailable(true);
      }
    }
    void load();
    return () => controller.abort();
  }, [requestId, token]);

  async function download(asset: EvidenceAsset) {
    const signal = lifetime.current?.signal;
    if (!signal || signal.aborted || busy.current) return;
    busy.current = true;
    setDownloading(true);
    setUnavailable(false);
    try {
      const response = await ApiClient.changeRequestEvidence(token, requestId, signal, asset.id);
      const blob = await response.blob();
      if (signal.aborted) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const extensions: Record<string, string> = {
        'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp',
      };
      link.download = `request-evidence-${asset.id}${extensions[asset.mimeType] ?? ''}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      if (!signal.aborted) setUnavailable(true);
    } finally {
      busy.current = false;
      if (!signal.aborted) setDownloading(false);
    }
  }

  return (
    <section className="space-y-2 text-sm">
      <h4 className="font-semibold">निजी प्रमाण (Private evidence)</h4>
      {unavailable && <p role="status">प्रमाण उपलब्ध छैन (Evidence unavailable)</p>}
      {!unavailable && !assets && <p role="status">लोड हुँदैछ (Loading evidence)</p>}
      {assets?.length === 0 && <p>प्रमाण संलग्न छैन (No available attachments)</p>}
      {assets?.map((asset, index) => (
        <button key={asset.id} type="button" disabled={downloading} onClick={() => void download(asset)}
          className="mr-2 rounded border px-2 py-1 text-indigo-700 disabled:opacity-50">
          प्रमाण डाउनलोड (Download evidence) {index + 1}
        </button>
      ))}
    </section>
  );
}
