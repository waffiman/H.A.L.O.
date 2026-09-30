import { DEFAULT_API_BASE, STORAGE_KEYS } from './config.js';

/** Session cookies we actually need — full jar is huge and stalls Cloudflare tunnels. */
const LINKEDIN_COOKIE_NAMES = new Set([
  'li_at',
  'li_a',
  'JSESSIONID',
  'liap',
  'li_rm',
  'bcookie',
  'bscookie',
]);
const X_COOKIE_NAMES = new Set([
  'auth_token',
  'ct0',
  'twid',
  'kdt',
  'auth_multi',
]);

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || typeof msg !== 'object') return false;
  if (msg.type === 'extractCookies') {
    extractCookies(msg.platform)
      .then((data) => sendResponse({ ok: true, ...data }))
      .catch((e) => sendResponse({ ok: false, error: e.message || String(e) }));
    return true;
  }
  if (msg.type === 'getDefaults') {
    sendResponse({ ok: true, defaultApiBase: DEFAULT_API_BASE, storageKeys: STORAGE_KEYS });
    return false;
  }
  return false;
});

async function extractCookies(platform) {
  if (platform === 'linkedin') {
    const all = await chrome.cookies.getAll({ domain: 'linkedin.com' });
    const liAt = all.find((c) => c.name === 'li_at');
    if (!liAt?.value) throw new Error('li_at not found — open linkedin.com while signed in');
    const cookies = all.filter((c) => LINKEDIN_COOKIE_NAMES.has(c.name)).map(chromeCookieToExport);
    return {
      platform: 'linkedin',
      cookies,
      liAt: liAt.value,
      hasSession: true,
    };
  }
  if (platform === 'x' || platform === 'twitter') {
    const fromX = await chrome.cookies.getAll({ domain: 'x.com' });
    const fromTw = await chrome.cookies.getAll({ domain: 'twitter.com' });
    const all = [...fromX, ...fromTw];
    const auth = all.find((c) => c.name === 'auth_token');
    const ct0 = all.find((c) => c.name === 'ct0');
    if (!auth?.value) throw new Error('auth_token not found — open x.com while signed in');
    const cookies = all.filter((c) => X_COOKIE_NAMES.has(c.name)).map(chromeCookieToExport);
    return {
      platform: 'x',
      cookies,
      authToken: auth.value,
      ct0: ct0?.value || '',
      hasSession: true,
    };
  }
  throw new Error('Unsupported platform');
}

function chromeCookieToExport(c) {
  return {
    domain: c.domain,
    name: c.name,
    value: c.value,
    path: c.path || '/',
    secure: Boolean(c.secure),
    httpOnly: Boolean(c.httpOnly),
    expirationDate: c.expirationDate || Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 180,
    sameSite:
      c.sameSite === 'no_restriction'
        ? 'no_restriction'
        : c.sameSite === 'lax'
          ? 'lax'
          : c.sameSite === 'strict'
            ? 'strict'
            : 'no_restriction',
  };
}
