/**
 * Sequential multi-cabinet LinkedIn runner (one Chromium at a time).
 * WAFFi `default` stays on the long-running linkedin-agent — this only runs other cabinets.
 */
import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { HOST_APP_ROOT, APP_ROOT, readEnvFile } from './env.js';
import { listTenants, waffiWorkspaceId } from './tenants.js';
import { tenantPaths, ensureTenantRuntime } from './tenantRuntime.js';
import { withBrowserLock, browserLockStatus } from './browserQueue.js';
import { readLiAtPresent } from './ops.js';

const execFileAsync = promisify(execFile);
export const MAX_LINKEDIN_CABINETS = 3;

let timer = null;
let tickInFlight = false;
let rrIndex = 0;

function hostRoot() {
  return HOST_APP_ROOT || '/root/cold-outreach-agent';
}

function tenantStageFlags(workspaceId) {
  const paths = tenantPaths(workspaceId);
  const root = readEnvFile();
  const ten = paths.isLegacy ? {} : readEnvFile(paths.envFile);
  const env = { ...root, ...ten };
  const linkedinOn = env.CHANNEL_LINKEDIN_ENABLED !== '0';
  const outreachOn = env.OUTREACH_PAUSED !== '1';
  const runA = linkedinOn && outreachOn && env.SKIP_STAGE_A !== '1';
  const runB = linkedinOn && outreachOn && env.SKIP_STAGE_B !== '1' && env.SKIP_CONVERSATION !== '1';
  return { runA, runB, env, paths };
}

function isStageDue(statePath, intervalMs, forceKey) {
  if (process.env[forceKey] === '1') return true;
  try {
    if (!fs.existsSync(statePath)) return true;
    const st = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    const last = st.lastRunAt || st.lastBrowserAt || st.lastInboxScanAt;
    if (!last) return true;
    const elapsed = Date.now() - Date.parse(last);
    return Number.isFinite(elapsed) && elapsed >= intervalMs;
  } catch {
    return true;
  }
}

/**
 * Cabinets eligible for LinkedIn automation (cookies + at least one stage on).
 * Always includes `default` in the count cap, but default is not run by this orchestrator.
 */
export async function listLinkedInCabinets() {
  const tenants = await listTenants();
  const out = [];
  for (const t of tenants) {
    const ws = t.workspaceId;
    ensureTenantRuntime(ws);
    const flags = tenantStageFlags(ws);
    const cookies = readLiAtPresent(ws);
    const eligible = cookies.present && (flags.runA || flags.runB);
    out.push({
      workspaceId: ws,
      email: t.email,
      isDefault: ws === waffiWorkspaceId(),
      eligible,
      runA: flags.runA,
      runB: flags.runB,
      hasCookies: cookies.present,
    });
  }
  return out;
}

async function runTenantOneShot(workspaceId, stage) {
  const root = hostRoot();
  const ws = String(workspaceId).trim();
  const script =
    stage === 'A' ? 'scripts/run-stage-a-once.js' : 'scripts/run-stage-b-once.js';
  const args = [
    'run',
    '--rm',
    '--name',
    `halo-tenant-${stage.toLowerCase()}-${ws.slice(0, 24)}`.replace(/[^a-zA-Z0-9_.-]/g, '_'),
    '--env-file',
    path.join(root, '.env'),
    '-e',
    `WORKSPACE_ID=${ws}`,
    '-e',
    `TENANT_DATA_ROOT=/app/halo-tenants/${ws}`,
    '-e',
    'OUTREACH_PAUSED=0',
    '-v',
    `${root}:/app`,
    '--shm-size=2gb',
    '-w',
    '/app',
    'cold-outreach-agent-linkedin-agent',
    'node',
    script,
  ];
  console.log(`[tenant-orch] starting Stage ${stage} for ${ws}`);
  const { stdout, stderr } = await execFileAsync('docker', args, {
    timeout: 90 * 60 * 1000,
    maxBuffer: 8 * 1024 * 1024,
  });
  if (stdout) console.log(stdout.slice(-2000));
  if (stderr) console.warn(stderr.slice(-1000));
  return { ok: true, workspaceId: ws, stage };
}

async function tickOnce() {
  if (tickInFlight) return;
  tickInFlight = true;
  try {
    const lock = browserLockStatus();
    if (lock.held) {
      console.log('[tenant-orch] skip — browser busy', lock.owner, lock.workspaceId);
      return;
    }
    // Prefer not overlapping with linkedin-agent: if cycle.lock held, skip
    const cabinets = await listLinkedInCabinets();
    const enabled = cabinets.filter((c) => c.eligible);
    if (enabled.length > MAX_LINKEDIN_CABINETS) {
      console.warn(
        `[tenant-orch] ${enabled.length} cabinets have LinkedIn on (max ${MAX_LINKEDIN_CABINETS}) — running first ${MAX_LINKEDIN_CABINETS}`
      );
    }
    const capped = enabled.slice(0, MAX_LINKEDIN_CABINETS);
    const others = capped.filter((c) => !c.isDefault);
    if (!others.length) return;

    // Round-robin among non-default cabinets
    rrIndex = rrIndex % others.length;
    const ordered = [...others.slice(rrIndex), ...others.slice(0, rrIndex)];
    rrIndex = (rrIndex + 1) % others.length;

    for (const cab of ordered) {
      const { env, paths, runA, runB } = tenantStageFlags(cab.workspaceId);
      const aDue =
        runA &&
        isStageDue(
          path.join(paths.root, 'stage_a_state.json'),
          Number(env.STAGE_A_INTERVAL_MS || 172800000),
          'FORCE_STAGE_A'
        );
      const bDue =
        runB &&
        isStageDue(
          path.join(paths.root, 'stage_b_state.json'),
          Number(env.STAGE_B_INTERVAL_MS || 1800000),
          'FORCE_STAGE_B'
        );
      if (!aDue && !bDue) continue;

      const job = await withBrowserLock(
        { owner: aDue ? 'A' : 'B', workspaceId: cab.workspaceId, skipIfBusy: true },
        async () => {
          // Stop long-running agent while tenant Chromium runs (same rule as repair)
          try {
            await execFileAsync('docker', ['stop', 'linkedin-agent'], { timeout: 60000 });
          } catch {
            /* ignore */
          }
          try {
            if (aDue) await runTenantOneShot(cab.workspaceId, 'A');
            if (bDue) await runTenantOneShot(cab.workspaceId, 'B');
          } finally {
            try {
              await execFileAsync(
                'docker',
                ['compose', '-f', path.join(hostRoot(), 'docker-compose.ionos.yml'), 'start', 'linkedin-agent'],
                { timeout: 120000, cwd: hostRoot() }
              );
            } catch (e) {
              console.warn('[tenant-orch] restart linkedin-agent:', e.message);
              try {
                await execFileAsync('docker', ['start', 'linkedin-agent'], { timeout: 60000 });
              } catch {
                /* ignore */
              }
            }
          }
        }
      );
      if (job.skipped) {
        console.log('[tenant-orch] lock skipped', job.reason);
        return;
      }
      // One cabinet per tick to keep VPS light
      return;
    }
  } catch (e) {
    console.error('[tenant-orch]', e.message || e);
  } finally {
    tickInFlight = false;
  }
}

export function startTenantOrchestrator() {
  if (timer) return;
  const ms = Number(process.env.TENANT_ORCH_INTERVAL_MS || 10 * 60 * 1000);
  console.log(`[tenant-orch] scheduler every ${Math.round(ms / 60000)}m (max ${MAX_LINKEDIN_CABINETS} LinkedIn cabinets)`);
  timer = setInterval(() => {
    tickOnce().catch((e) => console.error('[tenant-orch] tick', e.message));
  }, ms);
  // First tick after boot delay so WAFFi agent can settle
  setTimeout(() => tickOnce().catch(() => {}), 90 * 1000);
}

export function tenantOrchestratorStatus() {
  return {
    running: Boolean(timer),
    tickInFlight,
    maxCabinets: MAX_LINKEDIN_CABINETS,
    lock: browserLockStatus(),
  };
}
