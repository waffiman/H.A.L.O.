/**
 * LinkedIn session health marker on disk.
 * Used so the agent can soft-fail and external repair (cookie push) can detect status.
 *
 * On ok→dead: pause Stage A/B (SKIP_*=1) and remember which were on, so a later
 * session restore can flip them back without the agent hammering LinkedIn.
 */
import fs from 'fs';
import path from 'path';
import { sessionStatusFile, dataRoot } from './dataRoot.js';

function statusPath() {
  return sessionStatusFile();
}

function defaultEnvPath() {
  return path.join(dataRoot(), '.env');
}

export function readSessionStatus(filePath = statusPath()) {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

export function writeSessionStatus(patch = {}, filePath = statusPath()) {
  const prev = readSessionStatus(filePath) || {};
  const next = {
    ...prev,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(filePath, JSON.stringify(next, null, 2));
  return next;
}

function parseEnvFile(envPath) {
  const map = {};
  if (!fs.existsSync(envPath)) return map;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    if (!line || line.trim().startsWith('#')) continue;
    const i = line.indexOf('=');
    if (i <= 0) continue;
    map[line.slice(0, i).trim()] = line.slice(i + 1);
  }
  return map;
}

/** Upsert keys in a .env file (preserves other lines / comments). */
export function patchEnvFile(updates = {}, envPath = defaultEnvPath()) {
  const keys = Object.keys(updates || {});
  if (!keys.length) return;
  let text = '';
  try {
    text = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
  } catch {
    text = '';
  }
  const lines = text.split(/\r?\n/);
  const seen = new Set();
  const next = lines.map((line) => {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!m) return line;
    const key = m[1];
    if (!(key in updates)) return line;
    seen.add(key);
    return `${key}=${updates[key]}`;
  });
  for (const key of keys) {
    if (seen.has(key)) continue;
    if (next.length && next[next.length - 1] !== '') next.push('');
    next.push(`${key}=${updates[key]}`);
  }
  fs.writeFileSync(envPath, next.join('\n').replace(/\n+$/, '\n'));
  for (const key of keys) {
    process.env[key] = String(updates[key]);
  }
}

/**
 * First dead mark: turn off stages that were on; remember them for restore.
 * Idempotent while already dead (keeps the original snapshot).
 */
export function pauseStagesForDeadSession({
  envPath = defaultEnvPath(),
  statusFile = statusPath(),
} = {}) {
  const prev = readSessionStatus(statusFile) || {};
  if (prev.stagesPausedBySession && prev.ok === false) {
    return prev.stagesPausedBySession;
  }
  const env = { ...parseEnvFile(envPath), ...process.env };
  const stageAWasOn = env.SKIP_STAGE_A !== '1';
  const stageBWasOn = env.SKIP_STAGE_B !== '1' && env.SKIP_CONVERSATION !== '1';
  if (!stageAWasOn && !stageBWasOn) {
    writeSessionStatus(
      {
        stagesPausedBySession: {
          stageAWasOn: false,
          stageBWasOn: false,
          pausedAt: new Date().toISOString(),
          empty: true,
        },
      },
      statusFile
    );
    return null;
  }
  const snap = {
    stageAWasOn,
    stageBWasOn,
    pausedAt: new Date().toISOString(),
    prevSkipStageA: env.SKIP_STAGE_A === '1' ? '1' : '0',
    prevSkipStageB: env.SKIP_STAGE_B === '1' ? '1' : '0',
    prevSkipConversation: env.SKIP_CONVERSATION === '1' ? '1' : '0',
    prevOutreachPaused: env.OUTREACH_PAUSED === '1' ? '1' : '0',
  };
  patchEnvFile(
    {
      SKIP_STAGE_A: '1',
      SKIP_STAGE_B: '1',
      SKIP_CONVERSATION: '1',
      OUTREACH_PAUSED: '1',
    },
    envPath
  );
  writeSessionStatus({ stagesPausedBySession: snap }, statusFile);
  console.log(
    `Session dead — paused stages (A was ${stageAWasOn ? 'on' : 'off'}, B was ${stageBWasOn ? 'on' : 'off'}) until session restore`
  );
  return snap;
}

/** After session OK: restore stages that were auto-paused on death. */
export function restoreStagesAfterSessionOk({
  envPath = defaultEnvPath(),
  statusFile = statusPath(),
} = {}) {
  const prev = readSessionStatus(statusFile) || {};
  const snap = prev.stagesPausedBySession;
  if (!snap || snap.empty) {
    if (snap) writeSessionStatus({ stagesPausedBySession: null }, statusFile);
    return null;
  }
  const updates = {
    SKIP_STAGE_A: snap.stageAWasOn ? '0' : '1',
    SKIP_STAGE_B: snap.stageBWasOn ? '0' : '1',
    SKIP_CONVERSATION: snap.stageBWasOn ? '0' : '1',
  };
  updates.OUTREACH_PAUSED = snap.stageAWasOn || snap.stageBWasOn ? '0' : '1';
  patchEnvFile(updates, envPath);
  writeSessionStatus({ stagesPausedBySession: null }, statusFile);
  console.log(
    `Session restored — re-enabled stages (A=${snap.stageAWasOn ? 'on' : 'off'}, B=${snap.stageBWasOn ? 'on' : 'off'})`
  );
  return snap;
}

export function markSessionOk(extra = {}, opts = {}) {
  const statusFile = opts.statusFile || statusPath();
  const envPath = opts.envPath || defaultEnvPath();
  try {
    restoreStagesAfterSessionOk({ envPath, statusFile });
  } catch (e) {
    console.log('restoreStagesAfterSessionOk:', e.message);
  }
  return writeSessionStatus(
    { ok: true, reason: null, needsCookieRepair: false, stagesPausedBySession: null, ...extra },
    statusFile
  );
}

export function markSessionDead(reason = 'auth_wall', extra = {}, opts = {}) {
  const statusFile = opts.statusFile || statusPath();
  const envPath = opts.envPath || defaultEnvPath();
  const prev = readSessionStatus(statusFile);
  const alreadyDead = prev && prev.ok === false;
  let st = writeSessionStatus({ ok: false, reason, needsCookieRepair: true, ...extra }, statusFile);
  // Pause on ok→dead, or if already dead but never snapped (pre-deploy / crashed mid-write).
  if (!alreadyDead || !prev?.stagesPausedBySession) {
    try {
      pauseStagesForDeadSession({ envPath, statusFile });
      st = readSessionStatus(statusFile) || st;
    } catch (e) {
      console.log('pauseStagesForDeadSession:', e.message);
    }
  }
  // Only notify on ok→dead transition — rapid re-marks were spamming Telegram 3×.
  if (alreadyDead) return st;
  import('./notify.js')
    .then(async ({ notify }) => {
      let repairUrl = '';
      try {
        const { ensureActiveRepairLink } = await import('./sessionRepairLink.js');
        const link = ensureActiveRepairLink(reason);
        repairUrl = link.url;
      } catch {
        const base = (
          process.env.DASHBOARD_PUBLIC_URL ||
          process.env.PUBLIC_DASHBOARD_URL ||
          'https://temporarily-olympics-pilot-kathy.trycloudflare.com'
        )
          .trim()
          .replace(/\/+$/, '');
        repairUrl = `${base}/?page=linkedin`;
      }
      await notify({
        key: 'session_dead',
        type: 'session',
        severity: 'error',
        title: 'LinkedIn session inactive — Sign in',
        message: [
          'Session is inactive. Stage A and B are paused until you restore the session.',
          'Open H.A.L.O. → LinkedIn and Sign in (stay logged into the LinkedIn mobile app for that account):',
          repairUrl,
        ].join('\n'),
      });
    })
    .catch(() => {});
  return st;
}
