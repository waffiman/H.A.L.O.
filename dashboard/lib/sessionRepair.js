/**
 * On-demand LinkedIn session repair via remote Chromium (screenshot remote control).
 * User opens /linkedin/repair?token=…, logs in there; worker harvests li_at into cookies.json.
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import { ensureTenantRuntime } from './tenantRuntime.js';
import { waffiWorkspaceId } from './tenants.js';

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

export function repairCaptchaDir(root = appRoot()) {
  return path.join(root, 'session_repair_captcha');
}

export function repairCaptchaTilePath(index, root = appRoot()) {
  return path.join(repairCaptchaDir(root), `tile_${Number(index)}.jpg`);
}

export function repairCaptchaChallengePath(root = appRoot()) {
  return path.join(repairCaptchaDir(root), 'challenge.jpg');
}

export function repairInputPath(root = appRoot()) {
  return path.join(root, 'session_repair_input.jsonl');
}

export function repairResumePath(root = hostAppRoot()) {
  return path.join(root, 'stage_r_resume.json');
}

/** True when linkedin-agent container is up. */
export function agentContainerRunning() {
  try {
    const out = execFileSync(
      'docker',
      ['ps', '-q', '-f', 'name=^linkedin-agent$'],
      { encoding: 'utf8', timeout: 15000 }
    ).trim();
    return !!out;
  } catch {
    return false;
  }
}

function readResumePlan(root = hostAppRoot()) {
  try {
    const p = repairResumePath(root);
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

function writeResumePlan(plan, root = hostAppRoot()) {
  fs.writeFileSync(repairResumePath(root), JSON.stringify(plan, null, 2));
  return plan;
}

function clearResumePlan(root = hostAppRoot()) {
  try {
    fs.unlinkSync(repairResumePath(root));
  } catch {
    /* ignore */
  }
}

function writeForceRunOnce({ runStageA, runStageB, reason }, root = hostAppRoot()) {
  const payload = {
    reason: reason || 'stage_r_resume',
    requestedAt: new Date().toISOString(),
    runStageA: !!runStageA,
    runStageB: !!runStageB,
  };
  fs.writeFileSync(path.join(root, 'force_run_once.json'), JSON.stringify(payload, null, 2));
  return payload;
}

function startLinkedInAgent(root = hostAppRoot()) {
  const compose = path.join(root, 'docker-compose.ionos.yml');
  try {
    execFileSync(
      'docker',
      ['compose', '-f', compose, '--project-directory', root, 'start', 'linkedin-agent'],
      { encoding: 'utf8', timeout: 120000, stdio: ['ignore', 'pipe', 'pipe'] }
    );
    return { ok: true, method: 'compose_start' };
  } catch (e1) {
    try {
      execFileSync('docker', ['start', 'linkedin-agent'], {
        encoding: 'utf8',
        timeout: 60000,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      return { ok: true, method: 'docker_start' };
    } catch (e2) {
      return {
        ok: false,
        error: String(e2.message || e1.message || e2).slice(0, 300),
      };
    }
  }
}

/**
 * Stage R has highest priority: stop A/B/Brain/C Chromium work, clear cycle.lock,
 * remember what to resume after login. CRM progress is durable — "resume" = re-run
 * the interrupted stage(s) via force_run_once once the agent is back.
 */
export function preemptForStageR(root = hostAppRoot()) {
  sweepStaleRepairState(root);
  const owner = readHostCycleLock(root);
  const agentWasRunning = agentContainerRunning();
  const connectUp = connectOneShotRunning();
  const prev = readResumePlan(root);

  const plan = {
    agentWasRunning: !!(agentWasRunning || prev?.agentWasRunning),
    preemptedOwner: owner || prev?.preemptedOwner || (connectUp ? 'C' : null),
    runStageA: owner === 'A' || !!prev?.runStageA,
    runStageB: owner === 'B' || !!prev?.runStageB,
    createdAt: prev?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  writeResumePlan(plan, root);

  if (connectUp) {
    try {
      execFileSync('docker', ['rm', '-f', 'connect-test'], { stdio: 'ignore', timeout: 30000 });
    } catch {
      /* ignore */
    }
    // Legacy / one-shot names
    try {
      const ids = execFileSync(
        'docker',
        ['ps', '-aq', '--filter', 'name=connect-test'],
        { encoding: 'utf8', timeout: 15000 }
      )
        .trim()
        .split(/\s+/)
        .filter(Boolean);
      for (const id of ids) {
        try {
          execFileSync('docker', ['rm', '-f', id], { stdio: 'ignore', timeout: 30000 });
        } catch {
          /* ignore */
        }
      }
    } catch {
      /* ignore */
    }
  }

  if (agentWasRunning) {
    console.log(`[stage-r] preempting Stage ${owner || 'idle'} — stopping linkedin-agent`);
    try {
      execFileSync('docker', ['stop', 'linkedin-agent'], { stdio: 'ignore', timeout: 90000 });
    } catch {
      /* ignore */
    }
  }

  // Drop lock even if agent already exited mid-cycle
  try {
    fs.unlinkSync(path.join(root, 'cycle.lock'));
  } catch {
    /* ignore */
  }
  clearStaleRepairLock(root);

  return plan;
}

/**
 * After Stage R finishes: restart agent and force the interrupted stage(s).
 * Safe to call from status polls; no-ops if nothing pending or repair still up.
 */
export function maybeResumeAgentAfterRepair(root = hostAppRoot()) {
  const plan = readResumePlan(root);
  if (!plan) return { resumed: false };
  if (repairContainerRunning(root)) return { resumed: false, reason: 'repair_running' };
  if (namedContainerRunning('x-repair')) return { resumed: false, reason: 'x_repair_running' };

  const st = readRepairState(root);
  const status = st?.status || 'idle';
  const captured = !!(st?.liAtCaptured || status === 'captured');
  const failedTerminal = ['timeout', 'error', 'credential_error', 'idle'].includes(status);
  // Prefer resume after success; also after hard failure once repair container is gone.
  if (!captured && !failedTerminal) {
    return { resumed: false, reason: 'repair_not_finished' };
  }
  if (!captured && (status === 'running' || status === 'starting' || status === 'awaiting_user')) {
    return { resumed: false, reason: 'repair_not_finished' };
  }

  clearResumePlan(root);

  let force = null;
  if (captured && (plan.runStageA || plan.runStageB)) {
    force = writeForceRunOnce(
      {
        runStageA: !!plan.runStageA,
        runStageB: !!plan.runStageB,
        reason: `stage_r_resume_after_${plan.preemptedOwner || 'repair'}`,
      },
      root
    );
  }

  // Always bring the scheduler back if we stopped it for Sign in.
  if (!plan.agentWasRunning && !force) {
    return { resumed: false, reason: 'nothing_to_resume', plan };
  }

  const started = startLinkedInAgent(root);
  console.log(
    `[stage-r] resume agent ok=${started.ok} forceA=${!!force?.runStageA} forceB=${!!force?.runStageB} preempted=${plan.preemptedOwner}`
  );
  return {
    resumed: !!started.ok,
    started,
    force,
    plan,
  };
}

/** True when linkedin-repair container is actually running (not just stale JSON state). */
function namedContainerRunning(name) {
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

export function repairContainerRunning(root = hostAppRoot()) {
  return namedContainerRunning('linkedin-repair');
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
    signInUsername: null,
    lastSignInAt: null,
    uiMode: null,
    emailUpdateAttempted: false,
    emailUpdateStatus: null,
    lastFillError: null,
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

/**
 * Reuse a live repair token briefly; never recycle multi-hour zombies (Danylo-style Stage R).
 * Callers that need a clean Sign-in should prefer issueRepairToken / forceFresh.
 */
export function ensureActiveRepairLink(reason = 'session_dead', { forceFresh = false } = {}) {
  sweepStaleRepairState();
  clearStaleRepairLock();
  if (forceFresh) {
    stopRepairWorker();
    clearStaleRepairLock();
    return { ...issueRepairToken(reason), reused: false };
  }
  const st = readRepairState();
  const ageMs = st?.createdAt ? Date.now() - Date.parse(st.createdAt) : Infinity;
  const updatedMs = st?.updatedAt ? Date.now() - Date.parse(st.updatedAt) : Infinity;
  const containerUp = repairContainerRunning();
  const reuseMaxMs = 45 * 60 * 1000; // 45m — not 6h
  if (
    st?.token &&
    !st.liAtCaptured &&
    Number.isFinite(ageMs) &&
    ageMs < reuseMaxMs &&
    Number.isFinite(updatedMs) &&
    updatedMs < reuseMaxMs
  ) {
    if (st.status === 'credential_error') {
      // Fresh Chromium for wrong-password retries
      return { ...issueRepairToken(reason), reused: false };
    }
    if ((st.status === 'running' || st.status === 'starting') && containerUp) {
      return {
        token: st.token,
        url: linkedInDashboardUrl(),
        repairUrl: repairRemoteUrlForToken(st.token),
        reused: true,
      };
    }
    // Dead container or awaiting_user without a live worker → mint new
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

/**
 * Hard-stop Stage R: kill container, drop lock, idle state.
 * Call on every new Sign in and when user abandons / times out.
 */
export function forceStopStageR(reason = 'force_stop', root = hostAppRoot()) {
  stopRepairWorker();
  try {
    execFileSync('docker', ['rm', '-f', 'linkedin-repair'], { stdio: 'ignore', timeout: 30000 });
  } catch {
    /* ignore */
  }
  try {
    fs.unlinkSync(path.join(root, 'cycle.lock'));
  } catch {
    /* ignore */
  }
  clearStaleRepairLock(root);
  writeRepairState(
    {
      status: 'idle',
      token: null,
      error: null,
      containerId: null,
      challengeKind: null,
      captchaPhase: 'none',
      captchaTileCount: 0,
      liAtCaptured: false,
      sweptAt: new Date().toISOString(),
      sweptReason: reason,
    },
    root
  );
  return { ok: true, reason };
}

/**
 * End zombie Stage R sessions (container dead / timed out / idle too long).
 * Danylo-style stucks: awaiting_user for days with no container.
 */
export function sweepStaleRepairState(root = hostAppRoot()) {
  const st = readRepairState(root);
  if (!st) return { swept: false };
  if (st.liAtCaptured || st.status === 'idle' || st.status === 'captured') {
    if (!repairContainerRunning(root)) clearStaleRepairLock(root);
    return { swept: false };
  }

  const containerUp = repairContainerRunning(root);
  const updatedMs = st.updatedAt ? Date.parse(st.updatedAt) : 0;
  const startedMs = st.startedAt
    ? Date.parse(st.startedAt)
    : st.createdAt
      ? Date.parse(st.createdAt)
      : 0;
  const ageUpdated = Number.isFinite(updatedMs) ? Date.now() - updatedMs : Infinity;
  const ageStarted = Number.isFinite(startedMs) ? Date.now() - startedMs : Infinity;
  const softMaxMs = Number(process.env.REPAIR_TIMEOUT_MS || 12 * 60 * 1000); // 12m default
  const hardMaxMs = softMaxMs + 60 * 1000;
  const idleMaxMs = 8 * 60 * 1000; // 8m without updates → dead

  // Terminal statuses with no live container → idle immediately (don't leave "timeout" blocking Sign in).
  if (
    !containerUp &&
    (st.status === 'timeout' ||
      st.status === 'error' ||
      st.status === 'credential_error' ||
      (typeof st.error === 'string' && /Another automation is running/i.test(st.error)))
  ) {
    clearStaleRepairLock(root);
    writeRepairState(
      {
        status: 'idle',
        token: null,
        containerId: null,
        challengeKind: null,
        captchaPhase: 'none',
        captchaTileCount: 0,
        sweptAt: new Date().toISOString(),
        sweptReason: `clear_${st.status || 'error'}`,
        error: null,
      },
      root
    );
    return { swept: true, reason: `clear_${st.status || 'error'}` };
  }

  const looksActive =
    st.status === 'running' ||
    st.status === 'starting' ||
    st.status === 'awaiting_user' ||
    (!!st.challengeKind && !st.liAtCaptured);

  if (!looksActive) {
    if (!containerUp) clearStaleRepairLock(root);
    return { swept: false };
  }

  const markIdle = (reason, error = null) => {
    stopRepairWorker();
    clearStaleRepairLock(root);
    writeRepairState(
      {
        status: error ? 'timeout' : 'idle',
        token: null,
        error,
        containerId: null,
        challengeKind: null,
        captchaPhase: 'none',
        captchaTileCount: 0,
        sweptAt: new Date().toISOString(),
        sweptReason: reason,
      },
      root
    );
    return { swept: true, reason };
  };

  // Running container past hard timeout → kill
  if (containerUp && ageStarted > hardMaxMs) {
    return markIdle('hard_timeout', 'LinkedIn sign-in timed out — press Sign in again.');
  }

  // Claimed running/starting but container already gone → stop immediately
  if (!containerUp && (st.status === 'running' || st.status === 'starting')) {
    return markIdle('container_gone', 'LinkedIn sign-in stopped — press Sign in again.');
  }

  // No container + stale awaiting_user / leftover challenge → idle
  if (
    !containerUp &&
    (ageUpdated > idleMaxMs || ageStarted > softMaxMs || ageStarted > 20 * 60 * 1000)
  ) {
    return markIdle('stale_no_container');
  }

  if (!containerUp) clearStaleRepairLock(root);
  return { swept: false };
}

/** Prepare lock for Stage R: preempt A/B/Brain/C if needed (R has highest priority). */
export function assertSingleAutomation(root = hostAppRoot()) {
  sweepStaleRepairState(root);
  clearStaleRepairLock(root);
  if (repairContainerRunning(root)) {
    // Another Sign in already owns Chromium — caller should stop it first.
    return;
  }
  const owner = readHostCycleLock(root);
  if (owner && owner !== 'R') {
    preemptForStageR(root);
    return;
  }
  if (connectOneShotRunning() || agentContainerRunning()) {
    preemptForStageR(root);
  }
}

/**
 * Dashboard LinkedIn Session tile: start remote Chromium login with email/password.
 * @param {string} username
 * @param {string} password
 * @param {string} [workspaceId]
 */
export function startDashboardLinkedInLogin(username, password, workspaceId = 'default') {
  const user = String(username || '').trim();
  const pass = String(password || '');
  const ws = String(workspaceId || waffiWorkspaceId()).trim() || waffiWorkspaceId();
  if (!user || !pass) throw new Error('Email/phone and password are required');

  // Always hard-stop any prior Stage R (reload / second Sign in must never see "Stage R busy").
  forceStopStageR('new_signin');
  clearResumePlan();

  // Highest priority: interrupt Stage A/B (and restart them after Sign in).
  const preempt = preemptForStageR();

  const link = ensureActiveRepairLink('dashboard_login', { forceFresh: true });
  writeRepairState({
    status: 'awaiting_user',
    lastSignInError: null,
    error: null,
    credentialErrorAt: null,
    signInUsername: user,
    lastSignInAt: null,
    uiMode: null,
    emailUpdateAttempted: false,
    emailUpdateStatus: null,
    challengeKind: null,
    captchaPhase: 'none',
    captchaUiChecked: false,
    captchaChecked: false,
    captchaHasTiles: false,
    captchaHasChallengeJpg: false,
    captchaTileCount: 0,
    workspaceId: ws,
    preemptedOwner: preempt.preemptedOwner,
  });
  const started = startRepairWorkerSync(link.token, ws);
  appendRepairInput(link.token, { type: 'signin', username: user, password: pass });
  return {
    ok: true,
    token: link.token,
    url: link.url,
    repairUrl: link.repairUrl || repairRemoteUrlForToken(link.token),
    reused: false,
    started,
    workspaceId: ws,
    preempted: preempt,
    state: readRepairState(),
  };
}

export function startRepairWorkerSync(token, workspaceId = 'default') {
  const st = readRepairState();
  if (!st || st.token !== token) throw new Error('Invalid repair token');
  const containerUp = repairContainerRunning();
  // Repair page opens while dashboard already holds Stage R — must not throw.
  if ((st.status === 'running' || st.status === 'starting' || st.status === 'awaiting_user') && containerUp) {
    return { ok: true, already: true, state: st };
  }
  // R preempts any leftover A/B lock / agent (idempotent if already preempted).
  preemptForStageR();
  const ws = String(workspaceId || st.workspaceId || waffiWorkspaceId()).trim() || waffiWorkspaceId();
  writeRepairState({ status: 'starting', error: null, containerId: null, workspaceId: ws });

  const root = hostAppRoot();
  const name = 'linkedin-repair';
  // Ensure agent is down — shared session_data + parallel Chromium burns li_at.
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
    '-e',
    `WORKSPACE_ID=${ws}`,
    '-v',
    `${root}:/app`,
  ];
  if (isDefault) {
    // WAFFi legacy: bind root session_data (unchanged)
    args.push('-v', `${root}/session_data:/app/session_data`);
  } else {
    // Tenant jar under /app/halo-tenants/{ws} (covered by ${root}:/app bind)
    args.push('-e', `TENANT_DATA_ROOT=/app/halo-tenants/${ws}`);
  }
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
    writeRepairState({
      status: 'running',
      containerId: id,
      startedAt: new Date().toISOString(),
      workspaceId: ws,
    });
    return { ok: true, containerId: id, workspaceId: ws };
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
