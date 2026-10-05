import { DEFAULT_API_BASE, STORAGE_KEYS } from './config.js';

const $ = (id) => document.getElementById(id);
const FETCH_MS = 45000;
const PENDING_KEY = 'halo_pending_platform';

const PLATFORM_URL = {
  linkedin: 'https://www.linkedin.com/',
  x: 'https://x.com/',
};

let state = {
  apiBase: DEFAULT_API_BASE,
  sessionToken: '',
  email: '',
  platform: null,
  channelActive: { linkedin: false, x: false },
  forceResync: false,
};

init().catch((e) => {
  showLogin();
  setStatus('login-status', e.message || String(e), 'err');
});

async function init() {
  const stored = await chrome.storage.local.get([
    STORAGE_KEYS.sessionToken,
    STORAGE_KEYS.lastEmail,
    PENDING_KEY,
  ]);
  state.apiBase = DEFAULT_API_BASE.replace(/\/$/, '');
  state.sessionToken = String(stored[STORAGE_KEYS.sessionToken] || '');
  state.email = String(stored[STORAGE_KEYS.lastEmail] || '');
  await chrome.storage.local.set({ [STORAGE_KEYS.apiBase]: state.apiBase });

  if (state.email && $('email')) $('email').value = state.email;

  $('btn-login').onclick = onLogin;
  $('btn-logout').onclick = onLogout;
  $('btn-logout-pick').onclick = onLogout;
  $('btn-sync').onclick = onSync;
  bindPasswordToggle();
  $('btn-resync').onclick = () => {
    state.forceResync = true;
    setSyncMode('ready');
    refreshSyncReady().catch(() => {});
  };
  $('btn-pick-linkedin').onclick = () => onPick('linkedin');
  $('btn-pick-x').onclick = () => onPick('x');
  $('btn-back-pick').onclick = onBackToPick;

  showLogin();
  const me = state.sessionToken ? await probeMe() : null;
  if (!me?.ok) {
    showLogin();
    return;
  }
  state.email = me?.tenant?.email || state.email || '';
  await refreshChannelStatus().catch(() => {});

  const pending =
    stored[PENDING_KEY] === 'linkedin' || stored[PENDING_KEY] === 'x' ? stored[PENDING_KEY] : null;
  const tabPlatform = await detectTabPlatform();
  // Prefer explicit user choice (pending) over the previous tab — avoids stuck X UI after picking LinkedIn.
  if (pending) await showSyncScreen(pending);
  else if (tabPlatform) await showSyncScreen(tabPlatform);
  else showPick();
}

function bindPasswordToggle() {
  const btn = $('btn-pass-toggle');
  const input = $('password');
  if (!btn || !input) return;
  const open = btn.querySelector('.eye-open');
  const off = btn.querySelector('.eye-off');
  btn.onclick = () => {
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    if (open) open.hidden = show;
    if (off) off.hidden = !show;
    btn.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
    btn.title = show ? 'Hide password' : 'Show password';
  };
}

function hideAllScreens() {
  for (const id of ['screen-login', 'screen-pick', 'screen-sync']) {
    $(id)?.classList.add('hidden');
  }
}

function reveal(id) {
  hideAllScreens();
  $(id)?.classList.remove('hidden');
}

function showLogin() {
  reveal('screen-login');
}

function showPick() {
  state.platform = null;
  state.forceResync = false;
  reveal('screen-pick');
  paintPickActive();
}

function paintPickActive() {
  const li = $('pick-active-linkedin');
  const x = $('pick-active-x');
  if (li) li.classList.toggle('hidden', !state.channelActive.linkedin);
  if (x) x.classList.toggle('hidden', !state.channelActive.x);
}

async function showSyncScreen(platform) {
  state.platform = platform;
  state.forceResync = false;
  reveal('screen-sync');
  const name = platform === 'linkedin' ? 'LinkedIn' : 'X';
  if ($('sync-badge')) $('sync-badge').textContent = name;
  if ($('sync-lead')) {
    $('sync-lead').textContent =
      `Make sure you are logged into your ${name} account in this tab, then press Synchronize.`;
  }
  const syncBtn = $('btn-sync');
  if (syncBtn) {
    syncBtn.textContent = platform === 'linkedin' ? 'Synchronize LinkedIn' : 'Synchronize X';
  }
  if ($('active-title')) $('active-title').textContent = 'Active';
  if ($('active-sub')) $('active-sub').textContent = `${name} session linked to HALO`;
  setStatus('sync-status', '');
  await refreshSyncReady().catch(() => {});
}

async function onPick(platform) {
  // Update UI first — tab navigation often closes the popup immediately after.
  await chrome.storage.local.set({ [PENDING_KEY]: platform });
  await showSyncScreen(platform);
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id != null) {
      await chrome.tabs.update(tab.id, { url: PLATFORM_URL[platform] });
    }
  } catch {
    /* ignore */
  }
}

async function onBackToPick() {
  await chrome.storage.local.remove(PENDING_KEY);
  showPick();
}

function authHeaders() {
  const h = { 'Content-Type': 'application/json' };
  if (state.sessionToken) h.Authorization = `Bearer ${state.sessionToken}`;
  return h;
}

async function fetchJson(url, opts = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_MS);
  try {
    const res = await fetch(url, { ...opts, signal: ctrl.signal });
    const data = await res.json().catch(() => ({}));
    return { res, data };
  } finally {
    clearTimeout(t);
  }
}

async function probeMe() {
  try {
    const { res, data } = await fetchJson(`${state.apiBase}/api/auth/me`, {
      method: 'GET',
      headers: authHeaders(),
      credentials: 'include',
    });
    if (!res.ok) return null;
    return data;
  } catch {
    return null;
  }
}

async function refreshChannelStatus() {
  try {
    const { res, data } = await fetchJson(`${state.apiBase}/api/extension/session-status`, {
      method: 'GET',
      headers: authHeaders(),
      credentials: 'include',
    });
    if (res.ok && data?.ok) {
      state.channelActive = {
        linkedin: Boolean(data.linkedin?.active),
        x: Boolean(data.x?.active),
      };
      paintPickActive();
      return state.channelActive;
    }
  } catch {
    /* fall through */
  }
  // Fallback for dashboards that don't have session-status yet
  try {
    const { res, data } = await fetchJson(`${state.apiBase}/api/settings`, {
      method: 'GET',
      headers: authHeaders(),
      credentials: 'include',
    });
    if (res.ok) {
      state.channelActive = {
        linkedin: Boolean(data.linkedinSessionOk),
        x: Boolean(data.xSessionOk),
      };
      paintPickActive();
    }
  } catch {
    /* ignore */
  }
  return state.channelActive;
}

function setSyncMode(mode) {
  const syncBtn = $('btn-sync');
  const active = $('sync-active');
  const resync = $('btn-resync');
  const lead = $('sync-lead');
  if (!syncBtn || !active || !resync) return;

  if (mode === 'active') {
    syncBtn.classList.add('hidden');
    syncBtn.disabled = true;
    active.classList.remove('hidden');
    resync.classList.remove('hidden');
    if (lead) lead.classList.add('hidden');
    setStatus('sync-status', '');
    return;
  }

  active.classList.add('hidden');
  resync.classList.add('hidden');
  syncBtn.classList.remove('hidden');
  if (lead) lead.classList.remove('hidden');
}

function setLoginBusy(busy) {
  const btn = $('btn-login');
  if (!btn) return;
  const label = btn.querySelector('.btn-label');
  const spin = btn.querySelector('.btn-spin');
  btn.disabled = busy;
  btn.classList.toggle('is-loading', busy);
  if (label) label.hidden = busy;
  if (spin) spin.hidden = !busy;
}

async function onLogin() {
  setLoginBusy(true);
  setStatus('login-status', '');
  try {
    const email = $('email').value.trim();
    const password = $('password').value;
    if (!email || !password) throw new Error('Email and password required');

    const { res, data } = await fetchJson(`${state.apiBase}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok || !data.ok) throw new Error(data.error || data.message || 'Login failed');
    const token = data.sessionToken || '';
    if (!token) throw new Error('No sessionToken — update HALO dashboard');
    state.sessionToken = token;
    state.email = data.tenant?.email || email;
    await chrome.storage.local.set({
      [STORAGE_KEYS.sessionToken]: token,
      [STORAGE_KEYS.lastEmail]: state.email,
      [STORAGE_KEYS.apiBase]: state.apiBase,
    });
    $('password').value = '';
    await refreshChannelStatus().catch(() => {});

    const tabPlatform = await detectTabPlatform();
    if (tabPlatform) await showSyncScreen(tabPlatform);
    else showPick();
  } catch (e) {
    const msg = e.name === 'AbortError' ? 'HALO API timeout' : (e.message || String(e));
    setStatus('login-status', msg, 'err');
  } finally {
    setLoginBusy(false);
  }
}

async function onLogout() {
  state.sessionToken = '';
  state.platform = null;
  state.forceResync = false;
  await chrome.storage.local.remove([STORAGE_KEYS.sessionToken, PENDING_KEY]);
  showLogin();
  setStatus('login-status', '');
}

async function detectTabPlatform() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const url = tab?.url || '';
    if (/linkedin\.com/i.test(url)) return 'linkedin';
    if (/(\/|\.)x\.com/i.test(url) || /twitter\.com/i.test(url)) return 'x';
  } catch {
    /* ignore */
  }
  return null;
}

async function refreshSyncReady() {
  const syncBtn = $('btn-sync');
  if (!syncBtn || !state.platform) return;

  await refreshChannelStatus().catch(() => {});
  const isActive = Boolean(state.channelActive[state.platform]);
  if (isActive && !state.forceResync) {
    setSyncMode('active');
    return;
  }
  setSyncMode('ready');

  const tabPlatform = await detectTabPlatform();
  // Do NOT rewrite the chosen platform from the old tab while navigation is in flight.
  if (!tabPlatform) {
    syncBtn.disabled = true;
    setStatus('sync-status', 'Waiting for the site to finish loading…');
    return;
  }
  if (tabPlatform !== state.platform) {
    syncBtn.disabled = true;
    const want = state.platform === 'linkedin' ? 'LinkedIn' : 'X';
    setStatus('sync-status', `Open the ${want} tab, then try again`);
    return;
  }

  const extracted = await chrome.runtime.sendMessage({ type: 'extractCookies', platform: state.platform });
  if (!extracted?.ok) {
    syncBtn.disabled = true;
    setStatus('sync-status', 'Sign in on this site first, then Synchronize', 'err');
    return;
  }
  if (!state.sessionToken) {
    syncBtn.disabled = true;
    setStatus('sync-status', 'Sign in to HALO first', 'err');
    return;
  }
  syncBtn.disabled = false;
  setStatus('sync-status', 'Ready', 'ok');
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
    if (!extracted?.ok) throw new Error(extracted?.error || 'No cookies — sign in on the site first');

    const body =
      state.platform === 'x'
        ? {
            platform: 'x',
            authToken: extracted.authToken,
            ct0: extracted.ct0 || '',
            cookies: extracted.cookies,
          }
        : {
            platform: 'linkedin',
            liAt: extracted.liAt,
            cookies: extracted.cookies,
          };
    const { res, data } = await fetchJson(`${state.apiBase}/api/extension/sync-session`, {
      method: 'POST',
      headers: authHeaders(),
      credentials: 'include',
      body: JSON.stringify(body),
    });
    if (res.status === 404) {
      throw new Error('API missing — redeploy outreach-dashboard with /api/extension/sync-session');
    }
    if (res.status === 401) {
      await onLogout();
      throw new Error('Session expired — sign in again');
    }
    if (!res.ok || !data.ok) throw new Error(data.error || 'Sync failed');

    const stamp = data.lastSyncedAt || new Date().toISOString();
    await chrome.storage.local.set({ [STORAGE_KEYS.lastSynced]: stamp });
    await chrome.storage.local.remove(PENDING_KEY);
    state.forceResync = false;
    state.channelActive[state.platform] = true;
    setStatus('sync-status', 'Synced', 'ok');
    setSyncMode('active');
  } catch (e) {
    const msg = e.name === 'AbortError' ? 'HALO API timeout' : (e.message || String(e));
    setStatus('sync-status', msg, 'err');
    await refreshSyncReady().catch(() => {});
  }
}

function setStatus(id, text, kind = '') {
  const el = $(id);
  if (!el) return;
  el.textContent = text || '';
  el.classList.remove('ok', 'err');
  if (kind) el.classList.add(kind);
}
