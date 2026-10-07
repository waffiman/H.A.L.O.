/**
 * Classify profile URLs into sub-links. Does not fetch them.
 * The same kind list is mirrored in dashboard/public/app.js for the card icons.
 */

const EXTRA_LINK_CAP = 12;

const HOST_KIND = [
  ['telegram', /^(t\.me|telegram\.me|telegram\.org)$/],
  ['x', /^(x\.com|twitter\.com)$/],
  ['linkedin', /(^|\.)linkedin\.com$/],
  ['instagram', /(^|\.)instagram\.com$/],
  ['facebook', /^(facebook\.com|fb\.com|fb\.me)$/],
  ['github', /^(github\.com)$/],
  ['youtube', /^(youtube\.com|youtu\.be)$/],
  ['tiktok', /(^|\.)tiktok\.com$/],
  ['medium', /(^|\.)medium\.com$/],
  ['discord', /^(discord\.com|discord\.gg)$/],
  ['whatsapp', /^(wa\.me|whatsapp\.com|api\.whatsapp\.com)$/],
];

export function linkKind(url = '') {
  const host = hostOf(url);
  if (!host) return 'website';
  for (const [kind, re] of HOST_KIND) {
    if (re.test(host)) return kind;
  }
  return 'website';
}

function hostOf(url) {
  const abs = absoluteUrl(url);
  if (!abs) return '';
  try {
    return new URL(abs).hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return '';
  }
}

export function absoluteUrl(raw) {
  const text = String(raw || '').trim();
  if (!text) return '';
  const withScheme = /^https?:\/\//i.test(text) ? text : '';
  const bare = !withScheme && /^[a-z0-9.-]+\.[a-z]{2,}(?:[/?#].*)?$/i.test(text) ? `https://${text}` : '';
  const candidate = (withScheme || bare).replace(/[),.;]+$/, '');
  if (!candidate) return '';
  try {
    const u = new URL(candidate);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return '';
    return u.toString();
  } catch {
    return '';
  }
}

function urlsInText(text) {
  const raw = String(text || '');
  const found = raw.match(/https?:\/\/[^\s<>"')\]]+/gi) || [];
  const whole = absoluteUrl(raw);
  if (whole && !/\s/.test(raw)) found.push(whole);
  return found;
}

function dedupeKey(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./i, '').toLowerCase();
    const path = u.pathname.replace(/\/$/, '').toLowerCase();
    return `${host}${path}${u.search.toLowerCase()}`;
  } catch {
    return String(url || '').toLowerCase();
  }
}

function sameProfile(url, canonical) {
  const a = absoluteUrl(url);
  const b = absoluteUrl(canonical);
  if (!a || !b) return false;
  if (a.replace(/\/$/, '').toLowerCase() === b.replace(/\/$/, '').toLowerCase()) return true;
  const ah = hostOf(a);
  const bh = hostOf(b);
  if ((ah === 'x.com' || ah === 'twitter.com') && (bh === 'x.com' || bh === 'twitter.com')) {
    const ha = a.split('/').filter(Boolean).pop()?.split('?')[0]?.toLowerCase();
    const hb = b.split('/').filter(Boolean).pop()?.split('?')[0]?.toLowerCase();
    return Boolean(ha && hb && ha === hb);
  }
  if (ah.endsWith('linkedin.com') && bh.endsWith('linkedin.com')) {
    const sa = (a.match(/linkedin\.com\/in\/([^/?#]+)/i) || [])[1];
    const sb = (b.match(/linkedin\.com\/in\/([^/?#]+)/i) || [])[1];
    if (sa && sb) return sa.toLowerCase() === sb.toLowerCase();
  }
  return false;
}

/** @returns {{ url: string, kind: string }[]} */
export function collectExtraLinks(candidates, canonicalUrl) {
  const out = [];
  const seen = new Set();
  const list = Array.isArray(candidates) ? candidates : [];
  for (const item of list) {
    const bits = typeof item === 'string' ? urlsInText(item) : urlsInText(item?.url || item?.expanded_url || '');
    for (const bit of bits) {
      const url = absoluteUrl(bit);
      if (!url || sameProfile(url, canonicalUrl)) continue;
      const key = dedupeKey(url);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ url: url.slice(0, 400), kind: linkKind(url) });
      if (out.length >= EXTRA_LINK_CAP) return out;
    }
  }
  return out;
}

export function normalizeExtraLinks(value) {
  const list = Array.isArray(value) ? value : [];
  return collectExtraLinks(
    list.map((item) => (typeof item === 'string' ? item : item?.url)),
    ''
  );
}
