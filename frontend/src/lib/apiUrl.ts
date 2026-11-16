// Only service-relative API paths may receive the user's Bearer token.
export function resolveApiUrl(path: string): string {
  const parsed = new URL(path, 'https://api-path.invalid');
  if (!path.startsWith('/api/v1/') || path.includes('\\') ||
      parsed.origin !== 'https://api-path.invalid' || !parsed.pathname.startsWith('/api/v1/') ||
      /%(?:2e|2f|5c)/i.test(parsed.pathname) || parsed.hash) {
    throw new Error('Invalid API path');
  }
  const base = typeof window === 'undefined' ? '' : String(window.ULEVELP_CONFIG?.apiBaseUrl || '').trim();
  if (!base) return path;
  const url = new URL(base);
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('Invalid API origin');
  }
  return url.origin + path;
}
