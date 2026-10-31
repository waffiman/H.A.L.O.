/**
 * Infer outreach channel from a CRM Link. No DB column — host only.
 * listByStatus keeps linkedin.com, x.com / twitter.com, and instagram.com.
 * LinkedIn createLead stays LinkedIn-only; X/IG inserts go through createXLead / createIgLead.
 */

export function channelFromUrl(url = '') {
  const u = String(url || '').trim().toLowerCase();
  if (!u) return null;
  if (u.includes('linkedin.com')) return 'linkedin';
  if (u.includes('x.com') || u.includes('twitter.com')) return 'x';
  if (u.includes('instagram.com')) return 'instagram';
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

export function instagramHandleFromUrl(url = '') {
  const raw = String(url || '').trim();
  if (!raw) return null;
  const m = raw.match(/(?:instagram\.com)\/(?:@)?([A-Za-z0-9._]{1,30})(?:[/?#]|$)/i);
  if (!m) {
    const bare = raw.replace(/^@/, '').trim();
    if (/^[A-Za-z0-9._]{1,30}$/.test(bare)) return bare;
    return null;
  }
  const handle = m[1];
  if (
    /^(p|reel|reels|stories|explore|accounts|direct|about|developer|legal|privacy|nametag)$/i.test(
      handle
    )
  ) {
    return null;
  }
  return handle;
}

export function canonicalInstagramProfileUrl(urlOrHandle = '') {
  const handle =
    instagramHandleFromUrl(urlOrHandle) ||
    String(urlOrHandle || '')
      .replace(/^@/, '')
      .replace(/^\/+|\/+$/g, '');
  if (!handle || !/^[A-Za-z0-9._]{1,30}$/.test(handle)) return null;
  if (
    /^(p|reel|reels|stories|explore|accounts|direct|about|developer|legal|privacy|nametag)$/i.test(
      handle
    )
  ) {
    return null;
  }
  return `https://www.instagram.com/${handle}/`;
}

export function isInstagramCookieDomain(domain = '') {
  const d = String(domain || '').toLowerCase().replace(/^\./, '');
  return d === 'instagram.com' || d.endsWith('.instagram.com');
}
