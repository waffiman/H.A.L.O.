import { DEFAULT_API_BASE, STORAGE_KEYS } from './config.js';

const $ = (id) => document.getElementById(id);

let state = {
  apiBase: DEFAULT_API_BASE,
  sessionToken: '',
  email: '',
  platform: null,
  canSync: false,
};

init().catch((e) => {
  setStatus('login-status', e.message || String(e), 'err');
});

async function init() {
  const stored = await chrome.storage.local.get([
    STORAGE_KEYS.apiBase,
    STORAGE_KEYS.sessionToken,
    STORAGE_KEYS.lastSynced,
    STORAGE_KEYS.lastEmail,
  ]);
  state.apiBase = String(stored[STORAGE_KEYS.apiBase] || DEFAULT_API_BASE).replace(/\/$/, '');
  state.sessionToken = String(stored[STORAGE_KEYS.sessionToken] || '');
  state.email = String(stored[STORAGE_KEYS.lastEmail] || '');
  $('api-base').value = state.apiBase;
  $('api-base-login').value = state.apiBase;
  if (state.email) $('email').value = state.email;
  renderLastSynced(stored[STORAGE_KEYS.lastSynced]);

  $('btn-login').onclick = onLogin;
  $('btn-logout').onclick = onLogout;
  $('btn-sync').onclick = onSync;
  $('btn-save-api').onclick = saveApiBase;

  const me = await probeMe();
  if (me?.ok) {
    showMain(me);
  } else {
    showLogin();
  }
  await refreshPlatform();
}

function showLogin() {
  $('screen-login').classList.remove('hidden');
  $('screen-main').classList.add('hidden');
}

function showMain(me) {
  $('screen-login').classList.add('hidden');
  $('screen-main').classList.remove('hidden');
  const email = me?.tenant?.email || state.email || 'Connected';
  $('account-email').textContent = email;
  state.email = email;
}

async function apiBase() {
  const fromUi = ($('api-base')?.value || $('api-base-login')?.value || state.apiBase || '').trim();
  state.apiBase = fromUi.replace(/\/$/, '') || DEFAULT_API_BASE;
  return state.apiBase;
}

function authHeaders() {
  const h = { 'Content-Type': 'application/json' };
  if (state.sessionToken) h.Authorization = `Bearer ${state.sessionToken}`;
  return h;
}

async function probeMe() {
  try {
    const base = await apiBase();
    const res = await fetch(`${base}/api/auth/me`, {
      method: 'GET',
      headers: authHeaders(),
      credentials: 'include',
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function onLogin() {
  setStatus('login-status', 'Signing in…');
  try {
    const email = $('email').value.trim();
    const password = $('password').value;
    const base = ($('api-base-login').value || DEFAULT_API_BASE).trim().replace(/\/$/, '');
    if (!email || !password) throw new Error('Email and password required');
    state.apiBase = base;
    await chrome.storage.local.set({ [STORAGE_KEYS.apiBase]: base });

    const res = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) throw new Error(data.error || data.message || 'Login failed');
    const token = data.sessionToken || '';
    if (!token) throw new Error('Login ok but no sessionToken — update the HALO dashboard');
    state.sessionToken = token;
    state.email = data.tenant?.email || email;
    await chrome.storage.local.set({
      [STORAGE_KEYS.sessionToken]: token,
      [STORAGE_KEYS.lastEmail]: state.email,
    });
    $('password').value = '';
    showMain(data);
    await refreshPlatform();
    setStatus('sync-status', 'Signed in to HALO.', 'ok');
  } catch (e) {
    setStatus('login-status', e.message || String(e), 'err');
  }
}

async function onLogout() {
  state.sessionToken = '';
  await chrome.storage.local.remove([STORAGE_KEYS.sessionToken]);
  showLogin();
  setStatus('login-status', 'Logged out of the extension.');
}

async function saveApiBase() {
  const base = ($('api-base').value || '').trim().replace(/\/$/, '');
  if (!base) return;
  state.apiBase = base;
  await chrome.storage.local.set({ [STORAGE_KEYS.apiBase]: base });
  setStatus('sync-status', 'API URL saved. Re-check account…');
  const me = await probeMe();
  if (me?.ok) showMain(me);
  else {
    showLogin();
    $('api-base-login').value = base;
  }
}

async function refreshPlatform() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const url = tab?.url || '';
  const card = $('platform-card');
  const label = $('platform-label');
  const hint = $('platform-hint');
  const syncBtn = $('btn-sync');

  let platform = null;
  if (/linkedin\.com/i.test(url)) platform = 'linkedin';
  else if (/(^|\.)x\.com/i.test(url) || /twitter\.com/i.test(url)) platform = 'x';

  state.platform = platform;
  card.classList.remove('is-ready', 'is-warn');

  if (!platform) {
    label.textContent = 'Not LinkedIn / X';
    hint.textContent = 'Open linkedin.com or x.com while signed in, then open this popup again.';
    card.classList.add('is-warn');
    syncBtn.disabled = true;
    state.canSync = false;
    return;
  }

  label.textContent = platform === 'linkedin' ? 'LinkedIn' : 'X (Twitter)';
  hint.textContent = 'Checking session cookie…';

  const extracted = await chrome.runtime.sendMessage({ type: 'extractCookies', platform });
  if (!extracted?.ok) {
    hint.textContent = extracted?.error || 'Session cookie missing — sign in on this site first.';
    card.classList.add('is-warn');
    syncBtn.disabled = true;
    state.canSync = false;
    return;
  }

  hint.textContent =
    platform === 'linkedin'
      ? 'li_at found. Sync will send LinkedIn cookies to your HALO cabinet.'
      : 'auth_token found. Sync will send X cookies to your HALO cabinet.';
  card.classList.add('is-ready');
  const authed = Boolean(state.sessionToken) || (await probeMe())?.ok;
  syncBtn.disabled = !authed;
  state.canSync = Boolean(authed);
  if (!authed) {
    hint.textContent += ' Sign in to HALO above first.';
  }
}

async function onSync() {
  if (!state.platform) return;
  setStatus('sync-status', 'Syncing…');
  $('btn-sync').disabled = true;
  try {
    const extracted = await chrome.runtime.sendMessage({
      type: 'extractCookies',
      platform: state.platform,
    });
    if (!extracted?.ok) throw new Error(extracted?.error || 'Could not read cookies');

    const base = await apiBase();
    const res = await fetch(`${base}/api/extension/sync-session`, {
      method: 'POST',
      headers: authHeaders(),
      credentials: 'include',
      body: JSON.stringify({
        platform: state.platform,
        cookies: extracted.cookies,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) {
      await onLogout();
      throw new Error('HALO session expired — sign in again');
    }
    if (!res.ok || !data.ok) throw new Error(data.error || 'Sync failed');

    const stamp = data.lastSyncedAt || new Date().toISOString();
    await chrome.storage.local.set({ [STORAGE_KEYS.lastSynced]: stamp });
    renderLastSynced(stamp);
    setStatus(
      'sync-status',
      `Synced ${data.platform || state.platform} · ${data.count || extracted.cookies.length} cookies`,
      'ok'
    );
  } catch (e) {
    setStatus('sync-status', e.message || String(e), 'err');
  } finally {
    await refreshPlatform();
  }
}

function renderLastSynced(iso) {
  const el = $('last-synced');
  if (!iso) {
    el.textContent = '';
    return;
  }
  const d = new Date(iso);
  el.textContent = Number.isNaN(d.getTime())
    ? `Last synced: ${iso}`
    : `Last synced: ${d.toLocaleString()}`;
}

function setStatus(id, text, kind = '') {
  const el = $(id);
  if (!el) return;
  el.textContent = text || '';
  el.classList.remove('ok', 'err');
  if (kind) el.classList.add(kind);
}
