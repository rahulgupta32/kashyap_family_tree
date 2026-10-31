// Configuration is trusted, but private payloads must never follow a redirect
// or cross a plaintext production transport boundary.
export function notificationGatewayUrl(value: string | undefined, production: boolean): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || (production && url.protocol !== 'https:')
      || url.username || url.password || url.hash) throw new Error();
    return url.href;
  } catch {
    throw new Error('NOTIFICATION_DELIVERY_UNAVAILABLE');
  }
}
