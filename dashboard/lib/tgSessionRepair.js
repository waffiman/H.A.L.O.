/**
 * Telegram Web phone + code login for a cabinet.
 * State: tg_session_repair.json; code events: tg_session_repair_input.jsonl.
 * Worker runs in a short-lived `tg-repair` container (Playwright image), same pattern as X.
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execFileSync } from 'child_process';
import { APP_ROOT, HOST_APP_ROOT } from './env.js';
import { tenantPaths, ensureTenantRuntime } from './tenantRuntime.js';
import { waffiWorkspaceId } from './tenants.js';
import { readHostCycleLock, repairContainerRunning } from './sessionRepair.js';

const TG_REPAIR_NAME = 'tg-repair';
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

export function tgRepairContainerRunning() {
  return namedRunning(TG_REPAIR_NAME);
}

export function stopTgRepairWorker() {
  try {
    execFileSync('docker', ['rm', '-f', TG_REPAIR_NAME], { stdio: 'ignore', timeout: 30000 });
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
  if (tgRepairContainerRunning()) return;
  if (repairContainerRunning()) return;
  if (namedRunning('x-repair')) return;
  if (namedRunning('wa-repair')) return;
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

export function readTgRepairState(workspaceId = waffiWorkspaceId()) {
  try {
    const p = tenantPaths(workspaceId).tgRepairState;
    if (!p || !fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

function writeTgRepairState(workspaceId, patch = {}) {
  ensureTenantRuntime(workspaceId);
  const paths = tenantPaths(workspaceId);
  const prev = readTgRepairState(workspaceId) || {};
  const next = { ...prev, ...patch, workspaceId, updatedAt: new Date().toISOString() };
  fs.writeFileSync(paths.tgRepairState, JSON.stringify(next, null, 2));
  return next;
}

/** Reap finished container + resume agent when status is terminal. */
function reconcileTgRepair(workspaceId) {
  const st = readTgRepairState(workspaceId);
  if (!st) return;
  const status = st.status || '';
  if (!TERMINAL.has(status)) return;
  if (tgRepairContainerRunning()) stopTgRepairWorker();
  resumeAgentIfIdle();
}

export function tgSessionStatusView(workspaceId = waffiWorkspaceId()) {
  const paths = tenantPaths(workspaceId);
  reconcileTgRepair(workspaceId);
  // Auth is localStorage (storageState) on Web A — cookies alone are usually empty.
  let auth = { present: false, count: 0, kind: 'none' };
  try {
    const { tgAuthPresent } = awaitableTgAuth(paths);
    auth = tgAuthPresent;
  } catch {
    /* ignore */
  }
  let session = null;
  try {
    if (fs.existsSync(paths.tgSessionStatus)) {
      session = JSON.parse(fs.readFileSync(paths.tgSessionStatus, 'utf8'));
    }
  } catch {
    /* ignore */
  }
  const repair = readTgRepairState(workspaceId);
  const sessionOk = session?.ok === true && !session?.needsCookieRepair && auth.present;
  return {
    sessionOk,
    cookies: { present: auth.present, count: auth.count, kind: auth.kind },
    session,
    repair: repair
      ? {
          status: repair.status || null,
          phoneMasked: repair.phoneMasked || '',
          error: repair.error || null,
          updatedAt: repair.updatedAt || null,
        }
      : null,
  };
}

/** Resolve auth against cabinet paths (storageState + optional cookies). */
function awaitableTgAuth(paths) {
  let present = false;
  let count = 0;
  let kind = 'none';
  try {
    if (paths.tgStorageState && fs.existsSync(paths.tgStorageState)) {
      const state = JSON.parse(fs.readFileSync(paths.tgStorageState, 'utf8'));
      const origins = Array.isArray(state?.origins) ? state.origins : [];
      const re = /auth_key|user_auth|_auth|account\d+|dc\d+_auth/i;
      let keys = 0;
      for (const origin of origins) {
        for (const item of origin?.localStorage || []) {
          if (item?.value && re.test(String(item.name || ''))) {
            present = true;
            keys += 1;
          }
        }
      }
      if (present) {
        count = keys;
        kind = 'storage';
      }
    }
  } catch {
    /* ignore */
  }
  if (!present && paths.tgCookies && fs.existsSync(paths.tgCookies)) {
    try {
      const list = JSON.parse(fs.readFileSync(paths.tgCookies, 'utf8'));
      const arr = Array.isArray(list) ? list : [];
      present = arr.some((c) => (c.name === 'stel_token' || c.name === 'stel_ssid') && c.value);
      count = arr.length;
      kind = present ? 'cookies' : 'none';
    } catch {
      /* ignore */
    }
  }
  return { tgAuthPresent: { present, count, kind } };
}

/**
 * Start Telegram Web login: store phone, spawn worker, return status.
 */
export function startTgWebLogin(phone, workspaceId = waffiWorkspaceId()) {
  const raw = String(phone || '').replace(/[^\d+]/g, '').trim();
  if (raw.replace(/\D/g, '').length < 8) throw new Error('Enter a valid phone number with country code');
  const lock = readHostCycleLock();
  if (lock) {
    throw new Error(`Browser busy (${lock}) — wait for Stage A/B or repair to finish, then retry`);
  }
  if (repairContainerRunning()) {
    throw new Error('LinkedIn Sign in is running — finish or cancel it first');
  }
  if (namedRunning('x-repair')) {
    throw new Error('X Sign in is running — finish or cancel it first');
  }
  if (namedRunning('wa-repair')) {
    throw new Error('WhatsApp Sign in is running — finish or cancel it first');
  }
  if (tgRepairContainerRunning()) {
    throw new Error('Telegram Sign in already running — cancel it first or wait');
  }

  const ws = String(workspaceId || waffiWorkspaceId()).trim() || waffiWorkspaceId();
  ensureTenantRuntime(ws);
  const paths = tenantPaths(ws);
  const token = crypto.randomBytes(16).toString('hex');
  const digits = raw.startsWith('+') ? raw : `+${raw.replace(/\D/g, '')}`;
  const masked = digits.replace(/(\d{2})\d+(\d{2})$/, '$1••••$2');
  try {
    if (fs.existsSync(paths.tgRepairInput)) fs.unlinkSync(paths.tgRepairInput);
  } catch {
    /* ignore */
  }
  writeTgRepairState(ws, {
    token,
    status: 'starting',
    phone: digits,
    phoneMasked: masked,
    error: null,
    createdAt: new Date().toISOString(),
    containerId: null,
  });
  spawnTgWorker(ws);
  return tgSessionStatusView(ws);
}

export function submitTgLoginCode(code, workspaceId = waffiWorkspaceId()) {
  const ws = String(workspaceId || waffiWorkspaceId()).trim() || waffiWorkspaceId();
  const st = readTgRepairState(ws);
  if (!st?.token) throw new Error('Start with your phone number first');
  const digits = String(code || '').replace(/\D/g, '');
  if (digits.length < 4) throw new Error('Enter the code from Telegram');
  // Prefer host paths so the worker container (volume .:/app) sees the same file.
  const hostPaths = tenantPaths(ws, hostRoot());
  const inputPath = hostPaths.tgRepairInput || tenantPaths(ws).tgRepairInput;
  fs.appendFileSync(
    inputPath,
    `${JSON.stringify({ type: 'code', code: digits, at: new Date().toISOString() })}\n`
  );
  writeTgRepairState(ws, { status: 'code_submitted', error: null });
  return tgSessionStatusView(ws);
}

export function cancelTgWebLogin(workspaceId = waffiWorkspaceId()) {
  const ws = String(workspaceId || waffiWorkspaceId()).trim() || waffiWorkspaceId();
  writeTgRepairState(ws, {
    status: 'idle',
    error: null,
    phone: '',
    phoneMasked: '',
    token: null,
    containerId: null,
  });
  stopTgRepairWorker();
  resumeAgentIfIdle();
  return tgSessionStatusView(ws);
}

function spawnTgWorker(workspaceId) {
  const root = hostRoot();
  const workerHost = path.join(root, 'tgSessionRepairWorker.js');
  if (!fs.existsSync(workerHost)) {
    writeTgRepairState(workspaceId, {
      status: 'error',
      error: 'tgSessionRepairWorker.js missing on VPS — deploy the worker',
    });
    return;
  }

  const ws = String(workspaceId || waffiWorkspaceId()).trim() || waffiWorkspaceId();
  const isDefault = ws === waffiWorkspaceId();
  if (!isDefault) ensureTenantRuntime(ws);
  const paths = tenantPaths(ws, root);
  fs.mkdirSync(paths.tgSessionData, { recursive: true });

  try {
    execFileSync('docker', ['stop', 'linkedin-agent'], { stdio: 'ignore', timeout: 90000 });
  } catch {
    /* ignore */
  }
  stopTgRepairWorker();

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
    TG_REPAIR_STATE: toContainerPath(paths.tgRepairState, root),
    TG_REPAIR_INPUT: toContainerPath(paths.tgRepairInput, root),
    TG_COOKIES: toContainerPath(paths.tgCookies, root),
    TG_STORAGE_STATE: toContainerPath(paths.tgStorageState, root),
    TG_SESSION_STATUS: toContainerPath(paths.tgSessionStatus, root),
    TG_SESSION_DATA: toContainerPath(paths.tgSessionData, root),
  };

  const args = [
    'run',
    '-d',
    '--name',
    TG_REPAIR_NAME,
    '--env-file',
    path.join(root, '.env'),
    '-e',
    `WORKSPACE_ID=${ws}`,
    '-e',
    `TG_REPAIR_STATE=${envPaths.TG_REPAIR_STATE}`,
    '-e',
    `TG_REPAIR_INPUT=${envPaths.TG_REPAIR_INPUT}`,
    '-e',
    `TG_COOKIES=${envPaths.TG_COOKIES}`,
    '-e',
    `TG_STORAGE_STATE=${envPaths.TG_STORAGE_STATE}`,
    '-e',
    `TG_SESSION_STATUS=${envPaths.TG_SESSION_STATUS}`,
    '-e',
    `TG_SESSION_DATA=${envPaths.TG_SESSION_DATA}`,
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
    'Xvfb :99 -ac -screen 0 1280x1024x24 >/tmp/tg_xvfb.log 2>&1 & sleep 1; export DISPLAY=:99; exec node tgSessionRepairWorker.js'
  );

  try {
    const id = execFileSync('docker', args, { encoding: 'utf8' }).trim();
    writeTgRepairState(ws, {
      status: 'worker_spawned',
      containerId: id,
      error: null,
    });
  } catch (e) {
    writeTgRepairState(ws, {
      status: 'error',
      error: `Failed to start Telegram login worker: ${String(e.message || e).slice(0, 240)}`,
    });
    resumeAgentIfIdle();
  }
}
