/**
 * On-demand LinkedIn session repair via remote Chromium (screenshot remote control).
 * User opens /linkedin/repair?token=…, logs in there; worker harvests li_at into cookies.json.
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function appRoot() {
  return process.env.APP_ROOT || process.env.HOST_APP_ROOT || path.resolve(__dirname, '..');
}

function hostAppRoot() {
  return process.env.HOST_APP_ROOT || '/root/cold-outreach-agent';
}

export function repairStatePath(root = appRoot()) {
  return path.join(root, 'session_repair.json');
}

export function repairFramePath(root = appRoot()) {
  return path.join(root, 'session_repair_frame.jpg');
}

export function repairInputPath(root = appRoot()) {
  return path.join(root, 'session_repair_input.jsonl');
}

/** True when linkedin-repair container is actually running (not just stale JSON state). */
export function repairContainerRunning(root = hostAppRoot()) {
  try {
    const out = execFileSync(
      'docker',
      ['ps', '-q', '-f', 'name=^linkedin-repair$'],
      { encoding: 'utf8', timeout: 15000 }
    ).trim();
    return !!out;
  } catch {
    return false;
  }
}

export function readRepairState(root = appRoot()) {
  try {
    const p = repairStatePath(root);
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

export function writeRepairState(patch, root = appRoot()) {
  const prev = readRepairState(root) || {};
  const next = { ...prev, ...patch, updatedAt: new Date().toISOString() };
  fs.writeFileSync(repairStatePath(root), JSON.stringify(next, null, 2));
  return next;
}

export function dashboardPublicUrl() {
  return (
    process.env.DASHBOARD_PUBLIC_URL ||
    process.env.PUBLIC_DASHBOARD_URL ||
    'https://temporarily-olympics-pilot-kathy.trycloudflare.com'
  )
    .trim()
    .replace(/\/+$/, '');
}

/** In-dashboard LinkedIn Sign in (preferred over standalone /linkedin/repair). */
export function linkedInDashboardUrl() {
  return `${dashboardPublicUrl()}/?page=linkedin`;
}

export function issueRepairToken(reason = 'session_dead') {
  const token = crypto.randomBytes(24).toString('hex');
  writeRepairState({
    token,
    status: 'awaiting_user',
    reason,
    createdAt: new Date().toISOString(),
    workerPid: null,
    containerId: null,
    error: null,
    liAtCaptured: false,
  });
  try {
    if (fs.existsSync(repairInputPath())) fs.unlinkSync(repairInputPath());
  } catch {
    /* ignore */
  }
  return {
    token,
    url: linkedInDashboardUrl(),
    repairUrl: `${dashboardPublicUrl()}/repair.html?token=${token}`,
  };
}

export function repairUrlForToken(token) {
  // Prefer dashboard LinkedIn page for human-facing links (Telegram, etc.)
  return linkedInDashboardUrl();
}

/** Optional screenshot remote-control page (challenge / pin). */
export function repairRemoteUrlForToken(token) {
  if (!token) return null;
  return `${dashboardPublicUrl()}/repair.html?token=${token}`;
}

/** Reuse active token for 6h, else mint a new one. */
export function ensureActiveRepairLink(reason = 'session_dead') {
  const st = readRepairState();
  const ageMs = st?.createdAt ? Date.now() - Date.parse(st.createdAt) : Infinity;
  const containerUp = repairContainerRunning();
  if (
    st?.token &&
    !st.liAtCaptured &&
    Number.isFinite(ageMs) &&
    ageMs < 6 * 60 * 60 * 1000
  ) {
    if (st.status === 'credential_error') {
      writeRepairState({ status: 'awaiting_user', error: null });
      return {
        token: st.token,
        url: linkedInDashboardUrl(),
        repairUrl: repairRemoteUrlForToken(st.token),
        reused: true,
      };
    }
    if (st.status === 'running' || st.status === 'starting') {
      if (containerUp) {
        return {
          token: st.token,
          url: linkedInDashboardUrl(),
          repairUrl: repairRemoteUrlForToken(st.token),
          reused: true,
        };
      }
      writeRepairState({ status: 'awaiting_user', containerId: null, error: null });
      return {
        token: st.token,
        url: linkedInDashboardUrl(),
        repairUrl: repairRemoteUrlForToken(st.token),
        reused: true,
        stale: true,
      };
    }
    if (st.status === 'awaiting_user' || st.status === 'error' || st.status === 'timeout') {
      if (st.status === 'error' || st.status === 'timeout') {
        writeRepairState({ status: 'awaiting_user', error: null });
      }
      return {
        token: st.token,
        url: linkedInDashboardUrl(),
        repairUrl: repairRemoteUrlForToken(st.token),
        reused: true,
      };
    }
  }
  return { ...issueRepairToken(reason), reused: false };
}

/** True when a connect one-shot container is running on the host. */
export function connectOneShotRunning() {
  try {
    const out = execFileSync(
      'docker',
      ['ps', '-q', '-f', 'name=connect-test'],
      { encoding: 'utf8', timeout: 15000 }
    ).trim();
    return !!out;
  } catch {
    return false;
  }
}

/** Read cycle.lock owner if held and not stale (3h). */
export function readHostCycleLock(root = hostAppRoot()) {
  try {
    const p = path.join(root, 'cycle.lock');
    if (!fs.existsSync(p)) return null;
    const file = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (!file?.owner) return null;
    const sinceMs = Date.parse(file.since || '') || 0;
    if (sinceMs && Date.now() - sinceMs > 3 * 60 * 60 * 1000) return null;
    return file.owner;
  } catch {
    return null;
  }
}

/** Drop stale Stage R lock when repair container is not running (killed mid-harvest). */
export function clearStaleRepairLock(root = hostAppRoot()) {
  const owner = readHostCycleLock(root);
  if (owner !== 'R') return false;
  if (repairContainerRunning()) return false;
  try {
    fs.unlinkSync(path.join(root, 'cycle.lock'));
    return true;
  } catch {
    return false;
  }
}

/** One Chromium automation at a time — repair/login must not overlap connect or Stage A/B. */
export function assertSingleAutomation(root = hostAppRoot()) {
  clearStaleRepairLock(root);
  const owner = readHostCycleLock(root);
  if (owner) {
    throw new Error(`Another automation is running (Stage ${owner}). Wait until it finishes.`);
  }
  if (connectOneShotRunning()) {
    throw new Error('Connect one-shot is still running. Wait until it finishes.');
  }
}

/**
 * Dashboard LinkedIn Session tile: start remote Chromium login with email/password.
 */
export function startDashboardLinkedInLogin(username, password) {
  const user = String(username || '').trim();
  const pass = String(password || '');
  if (!user || !pass) throw new Error('Email/phone and password are required');

  const prev = readRepairState();
  // Retry after wrong password / failed repair — free Stage R and restart Chromium.
  if (
    prev &&
    (prev.status === 'credential_error' ||
      prev.status === 'error' ||
      prev.status === 'timeout' ||
      (prev.lastSignInError && /wrong email or password/i.test(prev.lastSignInError)))
  ) {
    stopRepairWorker();
    clearStaleRepairLock();
    // If lock still held by R with a dead/zombie container, clear it.
    const owner = readHostCycleLock();
    if (owner === 'R' && !repairContainerRunning()) {
      try {
        fs.unlinkSync(path.join(hostAppRoot(), 'cycle.lock'));
      } catch {
        /* ignore */
      }
    }
  }

  assertSingleAutomation();
  const link = ensureActiveRepairLink('dashboard_login');
  // Always start/restart worker for a fresh sign-in attempt (do not append into a stuck jar).
  if (repairContainerRunning()) {
    stopRepairWorker();
    try {
      execFileSync('docker', ['rm', '-f', 'linkedin-repair'], { stdio: 'ignore', timeout: 30000 });
    } catch {
      /* ignore */
    }
  }
  writeRepairState({
    status: 'awaiting_user',
    lastSignInError: null,
    error: null,
    credentialErrorAt: null,
  });
  const started = startRepairWorkerSync(link.token);
  appendRepairInput(link.token, { type: 'signin', username: user, password: pass });
  return {
    ok: true,
    token: link.token,
    url: link.url,
    repairUrl: link.repairUrl || repairRemoteUrlForToken(link.token),
    reused: link.reused,
    started,
    state: readRepairState(),
  };
}

export function startRepairWorkerSync(token) {
  const st = readRepairState();
  if (!st || st.token !== token) throw new Error('Invalid repair token');
  assertSingleAutomation();
  const containerUp = repairContainerRunning();
  if ((st.status === 'running' || st.status === 'starting') && containerUp) {
    return { ok: true, already: true, state: st };
  }
  writeRepairState({ status: 'starting', error: null, containerId: null });

  const root = hostAppRoot();
  const name = 'linkedin-repair';
  // Stop agent first — shared session_data mount + parallel Chromium burns li_at,
  // and a running agent locks profile files so the harvest wipe fails.
  try {
    execFileSync('docker', ['stop', 'linkedin-agent'], { stdio: 'ignore', timeout: 60000 });
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
    'REPAIR_MODE=1',
    // Dashboard email/password login always starts clean — never reuse a dead repair jar.
    '-e',
    'REPAIR_FORCE_FRESH=1',
    '-v',
    `${root}:/app`,
    '-v',
    `${root}/session_data:/app/session_data`,
  ];
  if (nmVol) args.push('-v', `${nmVol}:/app/node_modules`);
  args.push(
    '--shm-size=2gb',
    '-w',
    '/app',
    'cold-outreach-agent-linkedin-agent',
    'node',
    'sessionRepairWorker.js'
  );

  try {
    const id = execFileSync('docker', args, { encoding: 'utf8' }).trim();
    writeRepairState({ status: 'running', containerId: id, startedAt: new Date().toISOString() });
    return { ok: true, containerId: id };
  } catch (e) {
    writeRepairState({ status: 'error', error: String(e.message || e) });
    throw e;
  }
}

export function appendRepairInput(token, event) {
  const st = readRepairState();
  if (!st || st.token !== token) throw new Error('Invalid repair token');
  fs.appendFileSync(repairInputPath(), `${JSON.stringify({ ...event, at: new Date().toISOString() })}\n`);
  return { ok: true };
}

export function stopRepairWorker() {
  try {
    execFileSync('docker', ['rm', '-f', 'linkedin-repair'], { stdio: 'ignore' });
  } catch {
    /* ignore */
  }
}
