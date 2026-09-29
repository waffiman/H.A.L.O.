import { DEFAULT_API_BASE, STORAGE_KEYS } from './config.js';

const $ = (id) => document.getElementById(id);

let state = {
  apiBase: DEFAULT_API_BASE,
  sessionToken: '',
  email: '',
  platform: null,
};

init().catch((e) => setStatus('login-status', e.message || String(e), 'err'));

async function init() {
  const stored = await chrome.storage.local.get([
    STORAGE_KEYS.apiBase,
    STORAGE_KEYS.sessionToken,
    STORAGE_KEYS.lastEmail,
  ]);
  state.apiBase = String(stored[STORAGE_KEYS.apiBase] || DEFAULT_API_BASE).replace(/\/$/, '');
  state.sessionToken = String(stored[STORAGE_KEYS.sessionToken] || '');
  state.email = String(stored[STORAGE_KEYS.lastEmail] || '');
  if ($('api-base')) $('api-base').value = state.apiBase;
  if ($('api-base-login')) $('api-base-login').value = state.apiBase;
  if (state.email && $('email')) $('email').value = state.email;

  $('btn-login').onclick = onLogin;
  $('btn-logout').onclick = onLogout;
  $('btn-sync').onclick = onSync;

  const me = await probeMe();
  if (me?.ok) showMain(me);
  else showLogin();
  await refreshPlatform();
}

function showLogin() {
  $('screen-login').classList.remove('hidden');
  $('screen-main').classList.add('hidden');
}

function showMain(me) {
  $('screen-login').classList.add('hidden');
  $('screen-main').classList.remove('hidden');
  state.email = me?.tenant?.email || state.email || '';
  if ($('account-email')) $('account-email').value = state.email;
}

async function apiBase() {
  const fromUi = ($('api-base')?.value || $('api-base-login')?.value || state.apiBase || '').trim();
  state.apiBase = fromUi.replace(/\/$/, '') || DEFAULT_API_BASE;
  if ($('api-base')) $('api-base').value = state.apiBase;
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
  setStatus('login-status', '…');
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
    if (!token) throw new Error('No sessionToken — update HALO dashboard');
    state.sessionToken = token;
    state.email = data.tenant?.email || email;
    await chrome.storage.local.set({
      [STORAGE_KEYS.sessionToken]: token,
      [STORAGE_KEYS.lastEmail]: state.email,
    });
    $('password').value = '';
    showMain(data);
    await refreshPlatform();
    setStatus('sync-status', 'Ready', 'ok');
  } catch (e) {
    setStatus('login-status', e.message || String(e), 'err');
  }
}

async function onLogout() {
  state.sessionToken = '';
  await chrome.storage.local.remove([STORAGE_KEYS.sessionToken]);
  showLogin();
  setStatus('login-status', '');
}

async function refreshPlatform() {
  const syncBtn = $('btn-sync');
  const hint = $('platform-hint');
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const url = tab?.url || '';

  let platform = null;
  if (/linkedin\.com/i.test(url)) platform = 'linkedin';
  else if (/(^|\.)x\.com/i.test(url) || /twitter\.com/i.test(url)) platform = 'x';
  state.platform = platform;

  if (!platform) {
    syncBtn.textContent = 'Sync session';
    syncBtn.disabled = true;
    hint.textContent = 'Open LinkedIn or X';
    return;
  }

  const label = platform === 'linkedin' ? 'Sync LinkedIn' : 'Sync X';
  syncBtn.textContent = label;
  hint.textContent = platform === 'linkedin' ? 'LinkedIn tab' : 'X tab';

  const extracted = await chrome.runtime.sendMessage({ type: 'extractCookies', platform });
  const authed = Boolean(state.sessionToken) || (await probeMe())?.ok;
  if (!extracted?.ok) {
    syncBtn.disabled = true;
    hint.textContent = 'Sign in on this site first';
    return;
  }
  if (!authed) {
    syncBtn.disabled = true;
    hint.textContent = 'Sign in to HALO first';
    return;
  }
  syncBtn.disabled = false;
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
    if (!extracted?.ok) throw new Error(extracted?.error || 'No cookies');

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
      throw new Error('Session expired — sign in again');
    }
    if (!res.ok || !data.ok) throw new Error(data.error || 'Sync failed');

    const stamp = data.lastSyncedAt || new Date().toISOString();
    await chrome.storage.local.set({ [STORAGE_KEYS.lastSynced]: stamp });
    setStatus('sync-status', 'Synced', 'ok');
  } catch (e) {
    setStatus('sync-status', e.message || String(e), 'err');
  } finally {
    await refreshPlatform();
  }
}

function setStatus(id, text, kind = '') {
  const el = $(id);
  if (!el) return;
  el.textContent = text || '';
  el.classList.remove('ok', 'err');
  if (kind) el.classList.add(kind);
}
