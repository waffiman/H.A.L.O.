/**
 * WhatsApp Web phone + code login for a cabinet.
 * State: tg_session_repair.json; code events: tg_session_repair_input.jsonl.
 * Worker runs in a short-lived `wa-repair` container (Playwright image), same pattern as X.
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execFileSync } from 'child_process';
import { APP_ROOT, HOST_APP_ROOT } from './env.js';
import { tenantPaths, ensureTenantRuntime } from './tenantRuntime.js';
import { waffiWorkspaceId } from './tenants.js';
import { readHostCycleLock, repairContainerRunning } from './sessionRepair.js';

const WA_REPAIR_NAME = 'wa-repair';
const TERMINAL = new Set(['done', 'error', 'cancelled', 'needs_2fa', 'idle']);

function hostRoot() {
  return HOST_APP_ROOT || APP_ROOT;
}

function namedRunning(name) {
  try {
    const out = execFileSync('docker', ['ps', '-q', '-f', `name=^${name}$`], {
      encoding: 'utf8',
      timeout: 15000,
    }).trim();
    return !!out;
  } catch {
    return false;
  }
}

export function waRepairContainerRunning() {
  return namedRunning(WA_REPAIR_NAME);
}

export function stopWaRepairWorker() {
  try {
    execFileSync('docker', ['rm', '-f', WA_REPAIR_NAME], { stdio: 'ignore', timeout: 30000 });
  } catch {
    /* ignore */
  }
}

function startLinkedInAgent() {
  const root = hostRoot();
  const compose = path.join(root, 'docker-compose.ionos.yml');
  try {
    execFileSync(
      'docker',
      ['compose', '-f', compose, '--project-directory', root, 'start', 'linkedin-agent'],
      { encoding: 'utf8', timeout: 120000, stdio: ['ignore', 'pipe', 'pipe'] }
    );
    return { ok: true };
  } catch {
    try {
      execFileSync('docker', ['start', 'linkedin-agent'], {
        encoding: 'utf8',
        timeout: 60000,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      return { ok: true };
    } catch (e) {
      return { ok: false, error: String(e.message || e).slice(0, 200) };
    }
  }
}

/** After phone login finishes (or cancel), bring the scheduler back. */
function resumeAgentIfIdle() {
  if (waRepairContainerRunning()) return;
  if (repairContainerRunning()) return;
  if (namedRunning('x-repair')) return;
  if (namedRunning('tg-repair')) return;
  try {
    startLinkedInAgent();
  } catch {
    /* ignore */
  }
}

/**
 * Map host path under HOST_APP_ROOT → /app… inside the repair container.
 */
function toContainerPath(hostPath, root) {
  const p = String(hostPath || '').replace(/\\/g, '/');
  const r = String(root || '').replace(/\\/g, '/').replace(/\/$/, '');
  if (p.startsWith(r + '/') || p === r) return `/app${p.slice(r.length)}` || '/app';
  // Dashboard APP_ROOT (/app-data/…) is the same host tree.
  if (p.startsWith('/app-data/')) return `/app${p.slice('/app-data'.length)}`;
  return p;
}

export function readWaRepairState(workspaceId = waffiWorkspaceId()) {
  try {
    const p = tenantPaths(workspaceId).waRepairState;
    if (!p || !fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

function writeWaRepairState(workspaceId, patch = {}) {
  ensureTenantRuntime(workspaceId);
  const paths = tenantPaths(workspaceId);
  const prev = readWaRepairState(workspaceId) || {};
  const next = { ...prev, ...patch, workspaceId, updatedAt: new Date().toISOString() };
  fs.writeFileSync(paths.waRepairState, JSON.stringify(next, null, 2));
  return next;
}

/** Reap finished container + resume agent when status is terminal. */
function reconcileWaRepair(workspaceId) {
  const st = readWaRepairState(workspaceId);
  if (!st) return;
  const status = st.status || '';
  if (!TERMINAL.has(status)) return;
  if (waRepairContainerRunning()) stopWaRepairWorker();
  resumeAgentIfIdle();
}

export function waSessionStatusView(workspaceId = waffiWorkspaceId()) {
  const paths = tenantPaths(workspaceId);
  reconcileWaRepair(workspaceId);
  // Auth is localStorage (storageState) on Web A — cookies alone are usually empty.
  let auth = { present: false, count: 0, kind: 'none' };
  try {
    const { waAuthPresent } = awaitableWaAuth(paths);
    auth = waAuthPresent;
  } catch {
    /* ignore */
  }
  let session = null;
  try {
    if (fs.existsSync(paths.waSessionStatus)) {
      session = JSON.parse(fs.readFileSync(paths.waSessionStatus, 'utf8'));
    }
  } catch {
    /* ignore */
  }
  const repair = readWaRepairState(workspaceId);
  const sessionOk = session?.ok === true && !session?.needsCookieRepair && (auth.present || Boolean(paths.waSessionData && fs.existsSync(paths.waSessionData)));
  return {
    sessionOk,
    cookies: { present: auth.present, count: auth.count, kind: auth.kind },
    session,
    repair: repair
      ? {
          status: repair.status || null,
          phoneMasked: repair.phoneMasked || '',
          linkCode: repair.linkCode || '',
          qrDataUrl: repair.qrDataUrl || '',
          preferPhoneCode: Boolean(repair.preferPhoneCode),
          error: repair.error || null,
          updatedAt: repair.updatedAt || null,
        }
      : null,
  };
}

/** Resolve auth against cabinet paths (storageState + optional cookies). */
function awaitableWaAuth(paths) {
  let present = false;
  let count = 0;
  let kind = 'none';
  try {
    if (paths.waSessionStatus && fs.existsSync(paths.waSessionStatus)) {
      const session = JSON.parse(fs.readFileSync(paths.waSessionStatus, 'utf8'));
      if (session?.ok === true && !session?.needsCookieRepair && paths.waSessionData && fs.existsSync(paths.waSessionData)) {
        present = true;
        count = 1;
        kind = 'profile';
      }
    }
  } catch {
    /* ignore */
  }
  if (!present && paths.waStorageState && fs.existsSync(paths.waStorageState)) {
    try {
      const state = JSON.parse(fs.readFileSync(paths.waStorageState, 'utf8'));
      const origins = Array.isArray(state?.origins) ? state.origins : [];
      let n = 0;
      for (const o of origins) {
        if (/whatsapp/i.test(String(o?.origin || ''))) n += (o.localStorage || []).length;
      }
      if (n > 0) {
        present = true;
        count = n;
        kind = 'storage';
      }
    } catch {
      /* ignore */
    }
  }
  return { waAuthPresent: { present, count, kind } };
}

/**
 * Start WhatsApp Web login: store phone, spawn worker, return status.
 */
export function startWaWebLogin(phone, workspaceId = waffiWorkspaceId()) {
  const raw = String(phone || '').replace(/[^\d+]/g, '').trim();
  if (raw.replace(/\D/g, '').length < 8) throw new Error('Enter a valid phone number with country code');
  const lock = readHostCycleLock();
  if (lock) {
    throw new Error(`Browser busy (${lock}) — wait for Stage A/B or repair to finish, then retry`);
  }
  if (repairContainerRunning()) {
    throw new Error('LinkedIn Sign in is running — finish or cancel it first');
  }
  if (namedRunning('tg-repair')) {
    throw new Error('Telegram Sign in is running — finish or cancel it first');
  }
  if (namedRunning('x-repair')) {
    throw new Error('X Sign in is running — finish or cancel it first');
  }
  if (waRepairContainerRunning()) {
    throw new Error('WhatsApp Sign in already running — cancel it first or wait');
  }

  const ws = String(workspaceId || waffiWorkspaceId()).trim() || waffiWorkspaceId();
  ensureTenantRuntime(ws);
  const paths = tenantPaths(ws);
  const token = crypto.randomBytes(16).toString('hex');
  const digits = raw.startsWith('+') ? raw : `+${raw.replace(/\D/g, '')}`;
  const masked = digits.replace(/(\d{2})\d+(\d{2})$/, '$1••••$2');
  try {
    if (fs.existsSync(paths.waRepairInput)) fs.unlinkSync(paths.waRepairInput);
  } catch {
    /* ignore */
  }
  writeWaRepairState(ws, {
    token,
    status: 'starting',
    phone: digits,
    phoneMasked: masked,
    linkCode: '',
    qrDataUrl: '',
    preferPhoneCode: false,
    error: null,
    createdAt: new Date().toISOString(),
    containerId: null,
  });
  spawnWaWorker(ws);
  return waSessionStatusView(ws);
}

/** Switch from QR modal to phone linking-code flow (worker watches preferPhoneCode). */
export function requestWaPhoneLinkCode(workspaceId = waffiWorkspaceId()) {
  const ws = String(workspaceId || waffiWorkspaceId()).trim() || waffiWorkspaceId();
  const st = readWaRepairState(ws);
  if (!st?.token) throw new Error('Start WhatsApp login first');
  if (!String(st.phone || '').trim()) throw new Error('Phone number missing — cancel and start again');
  if (st.status === 'awaiting_code' || st.status === 'enter_phone') return waSessionStatusView(ws);
  if (['done', 'error', 'cancelled', 'idle'].includes(String(st.status || ''))) {
    throw new Error('WhatsApp login is not active — press Continue again');
  }
  writeWaRepairState(ws, { preferPhoneCode: true, error: null });
  return waSessionStatusView(ws);
}

export function submitWaLoginCode(code, workspaceId = waffiWorkspaceId()) {
  const ws = String(workspaceId || waffiWorkspaceId()).trim() || waffiWorkspaceId();
  const st = readWaRepairState(ws);
  if (!st?.token) throw new Error('Start with your phone number first');
  const digits = String(code || '').replace(/\D/g, '');
  if (digits.length < 4) throw new Error('Enter the code from WhatsApp');
  // Prefer host paths so the worker container (volume .:/app) sees the same file.
  const hostPaths = tenantPaths(ws, hostRoot());
  const inputPath = hostPaths.waRepairInput || tenantPaths(ws).waRepairInput;
  fs.appendFileSync(
    inputPath,
    `${JSON.stringify({ type: 'code', code: digits, at: new Date().toISOString() })}\n`
  );
  writeWaRepairState(ws, { status: 'code_submitted', error: null });
  return waSessionStatusView(ws);
}

export function cancelWaWebLogin(workspaceId = waffiWorkspaceId()) {
  const ws = String(workspaceId || waffiWorkspaceId()).trim() || waffiWorkspaceId();
  writeWaRepairState(ws, {
    status: 'idle',
    error: null,
    phone: '',
    phoneMasked: '',
    linkCode: '',
    qrDataUrl: '',
    preferPhoneCode: false,
    token: null,
    containerId: null,
  });
  stopWaRepairWorker();
  resumeAgentIfIdle();
  return waSessionStatusView(ws);
}

function spawnWaWorker(workspaceId) {
  const root = hostRoot();
  const workerHost = path.join(root, 'waSessionRepairWorker.js');
  if (!fs.existsSync(workerHost)) {
    writeWaRepairState(workspaceId, {
      status: 'error',
      error: 'waSessionRepairWorker.js missing on VPS — deploy the worker',
    });
    return;
  }

  const ws = String(workspaceId || waffiWorkspaceId()).trim() || waffiWorkspaceId();
  const isDefault = ws === waffiWorkspaceId();
  if (!isDefault) ensureTenantRuntime(ws);
  const paths = tenantPaths(ws, root);
  fs.mkdirSync(paths.waSessionData, { recursive: true });

  try {
    execFileSync('docker', ['stop', 'linkedin-agent'], { stdio: 'ignore', timeout: 90000 });
  } catch {
    /* ignore */
  }
  stopWaRepairWorker();

  let nmVol = null;
  try {
    const mounts = execFileSync(
      'docker',
      ['inspect', 'linkedin-agent', '--format', '{{range .Mounts}}{{.Destination}}|{{.Name}}\n{{end}}'],
      { encoding: 'utf8' }
    );
    for (const line of mounts.split('\n')) {
      const [dest, vol] = line.trim().split('|');
      if (dest?.replace(/\/$/, '') === '/app/node_modules' && vol) {
        nmVol = vol;
        break;
      }
    }
  } catch {
    /* ignore */
  }

  const envPaths = {
    WA_REPAIR_STATE: toContainerPath(paths.waRepairState, root),
    WA_REPAIR_INPUT: toContainerPath(paths.waRepairInput, root),
    WA_COOKIES: toContainerPath(paths.waCookies, root),
    WA_STORAGE_STATE: toContainerPath(paths.waStorageState, root),
    WA_SESSION_STATUS: toContainerPath(paths.waSessionStatus, root),
    WA_SESSION_DATA: toContainerPath(paths.waSessionData, root),
  };

  const args = [
    'run',
    '-d',
    '--name',
    WA_REPAIR_NAME,
    '--env-file',
    path.join(root, '.env'),
    '-e',
    `WORKSPACE_ID=${ws}`,
    '-e',
    `WA_REPAIR_STATE=${envPaths.WA_REPAIR_STATE}`,
    '-e',
    `WA_REPAIR_INPUT=${envPaths.WA_REPAIR_INPUT}`,
    '-e',
    `WA_COOKIES=${envPaths.WA_COOKIES}`,
    '-e',
    `WA_STORAGE_STATE=${envPaths.WA_STORAGE_STATE}`,
    '-e',
    `WA_SESSION_STATUS=${envPaths.WA_SESSION_STATUS}`,
    '-e',
    `WA_SESSION_DATA=${envPaths.WA_SESSION_DATA}`,
    '-v',
    `${root}:/app`,
  ];
  if (!isDefault) {
    args.push('-e', `TENANT_DATA_ROOT=/app/halo-tenants/${ws}`);
  }
  if (nmVol) args.push('-v', `${nmVol}:/app/node_modules`);
  args.push(
    '--shm-size=2gb',
    '-w',
    '/app',
    'cold-outreach-agent-linkedin-agent',
    'sh',
    '-c',
    'Xvfb :99 -ac -screen 0 1280x1024x24 >/tmp/wa_xvfb.log 2>&1 & sleep 1; export DISPLAY=:99; exec node waSessionRepairWorker.js'
  );

  try {
    const id = execFileSync('docker', args, { encoding: 'utf8' }).trim();
    writeWaRepairState(ws, {
      status: 'worker_spawned',
      containerId: id,
      error: null,
    });
  } catch (e) {
    writeWaRepairState(ws, {
      status: 'error',
      error: `Failed to start WhatsApp login worker: ${String(e.message || e).slice(0, 240)}`,
    });
    resumeAgentIfIdle();
  }
}
