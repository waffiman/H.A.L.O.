/**
 * Infer outreach channel from a CRM Link. No DB column — host only.
 * Phase 1: helper only. Do not change listByStatus / createLead yet.
 */

export function channelFromUrl(url = '') {
  const u = String(url || '').trim().toLowerCase();
  if (!u) return null;
  if (u.includes('linkedin.com')) return 'linkedin';
  if (u.includes('x.com') || u.includes('twitter.com')) return 'x';
  return null;
}

export function xHandleFromUrl(url = '') {
  const raw = String(url || '').trim();
  if (!raw) return null;
  const m = raw.match(/(?:x\.com|twitter\.com)\/@?([A-Za-z0-9_]{1,15})(?:[/?#]|$)/i);
  if (!m) return null;
  const handle = m[1];
  if (/^(i|intent|home|explore|search|messages|settings|compose|login|tos|privacy)$/i.test(handle)) {
    return null;
  }
  return handle;
}

export function canonicalXProfileUrl(urlOrHandle = '') {
  const handle =
    xHandleFromUrl(urlOrHandle) ||
    String(urlOrHandle || '')
      .replace(/^@/, '')
      .replace(/^\/+|\/+$/g, '');
  if (!handle || !/^[A-Za-z0-9_]{1,15}$/.test(handle)) return null;
  if (/^(i|intent|home|explore|search|messages|settings|compose|login)$/i.test(handle)) return null;
  return `https://x.com/${handle}`;
}

export function isXCookieDomain(domain = '') {
  const d = String(domain || '').toLowerCase().replace(/^\./, '');
  return d === 'x.com' || d.endsWith('.x.com') || d === 'twitter.com' || d.endsWith('.twitter.com');
}
