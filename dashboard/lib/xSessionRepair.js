/**
 * X Sign in — isolated from LinkedIn sessionRepair.js.
 * Separate state, container, and Chromium profile. Never writes LI cookies.
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execFileSync } from 'child_process';
import { APP_ROOT, HOST_APP_ROOT } from './env.js';
import { tenantPaths, ensureTenantRuntime } from './tenantRuntime.js';
import { waffiWorkspaceId } from './tenants.js';
import { preemptForStageR, readHostCycleLock, agentContainerRunning } from './sessionRepair.js';

function hostAppRoot() {
  return HOST_APP_ROOT || APP_ROOT;
}

export function xRepairStatePath(root = APP_ROOT) {
  return path.join(root, 'x_session_repair.json');
}

export function xRepairInputPath(root = APP_ROOT) {
  return path.join(root, 'x_session_repair_input.jsonl');
}

export function readXRepairState(root = APP_ROOT) {
  try {
    const p = xRepairStatePath(root);
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

export function writeXRepairState(patch = {}, root = APP_ROOT) {
  const prev = readXRepairState(root) || {};
  const next = { ...prev, ...patch, updatedAt: new Date().toISOString() };
  fs.writeFileSync(xRepairStatePath(root), JSON.stringify(next, null, 2));
  return next;
}

export function xRepairContainerRunning() {
  try {
    const out = execFileSync('docker', ['ps', '-q', '-f', 'name=^x-repair$'], {
      encoding: 'utf8',
      timeout: 15000,
    }).trim();
    return !!out;
  } catch {
    return false;
  }
}

export function stopXRepairWorker() {
  try {
    execFileSync('docker', ['rm', '-f', 'x-repair'], { stdio: 'ignore' });
  } catch {
    /* ignore */
  }
}

export function appendXRepairInput(token, event, root = APP_ROOT) {
  const st = readXRepairState(root);
  if (!st || st.token !== token) throw new Error('Invalid X repair token');
  fs.appendFileSync(
    xRepairInputPath(root),
    `${JSON.stringify({ ...event, at: new Date().toISOString() })}\n`
  );
  return { ok: true };
}

function issueXRepairToken(reason = 'dashboard_login') {
  const token = crypto.randomBytes(24).toString('hex');
  writeXRepairState({
    token,
    status: 'awaiting_user',
    reason,
    createdAt: new Date().toISOString(),
    workerPid: null,
    containerId: null,
    error: null,
    authTokenCaptured: false,
    challengeKind: null,
  });
  try {
    if (fs.existsSync(xRepairInputPath())) fs.unlinkSync(xRepairInputPath());
  } catch {
    /* ignore */
  }
  return token;
}

export function startDashboardXLogin(username, password, workspaceId = 'default') {
  const user = String(username || '').trim();
  const pass = String(password || '');
  const ws = String(workspaceId || waffiWorkspaceId()).trim() || waffiWorkspaceId();
  if (!user || !pass) throw new Error('Username and password are required');

  stopXRepairWorker();
  const lock = readHostCycleLock();
  if (lock && lock !== 'R') {
    preemptForStageR();
  } else if (agentContainerRunning()) {
    preemptForStageR();
  }

  const token = issueXRepairToken('dashboard_x_login');
  writeXRepairState({
    status: 'awaiting_user',
    lastSignInError: null,
    error: null,
    challengeKind: null,
    workspaceId: ws,
  });
  const started = startXRepairWorkerSync(token, ws);
  appendXRepairInput(token, { type: 'signin', username: user, password: pass });
  return {
    ok: true,
    token,
    started,
    workspaceId: ws,
    state: readXRepairState(),
  };
}

export function startXRepairWorkerSync(token, workspaceId = 'default') {
  const st = readXRepairState();
  if (!st || st.token !== token) throw new Error('Invalid X repair token');
  if (
    (st.status === 'running' || st.status === 'starting' || st.status === 'awaiting_user') &&
    xRepairContainerRunning()
  ) {
    return { ok: true, already: true, state: st };
  }

  const ws = String(workspaceId || st.workspaceId || waffiWorkspaceId()).trim() || waffiWorkspaceId();
  writeXRepairState({ status: 'starting', error: null, containerId: null, workspaceId: ws });

  const root = hostAppRoot();
  const name = 'x-repair';
  try {
    execFileSync('docker', ['stop', 'linkedin-agent'], { stdio: 'ignore', timeout: 90000 });
  } catch {
    /* ignore */
  }
  try {
    execFileSync('docker', ['rm', '-f', name], { stdio: 'ignore' });
  } catch {
    /* ignore */
  }

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

  const isDefault = ws === waffiWorkspaceId();
  if (!isDefault) ensureTenantRuntime(ws);
  const paths = tenantPaths(ws, root);
  fs.mkdirSync(paths.xSessionRepairData, { recursive: true });

  const args = [
    'run',
    '-d',
    '--name',
    name,
    '--env-file',
    path.join(root, '.env'),
    '-e',
    `REPAIR_TOKEN=${token}`,
    '-e',
    'X_REPAIR_MODE=1',
    '-e',
    `WORKSPACE_ID=${ws}`,
    '-v',
    `${root}:/app`,
    '-v',
    `${paths.xSessionRepairData}:/app/session_data_x_repair`,
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
    'node',
    'xSessionRepairWorker.js'
  );

  try {
    const id = execFileSync('docker', args, { encoding: 'utf8' }).trim();
    writeXRepairState({
      status: 'running',
      containerId: id,
      startedAt: new Date().toISOString(),
      workspaceId: ws,
    });
    return { ok: true, containerId: id, workspaceId: ws };
  } catch (e) {
    writeXRepairState({ status: 'error', error: String(e.message || e) });
    throw e;
  }
}

export function forceStopXRepair(reason = 'user_cancel') {
  stopXRepairWorker();
  writeXRepairState({ status: 'cancelled', error: reason, containerId: null });
  return { ok: true, stopped: true, reason };
}
