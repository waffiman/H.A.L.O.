/**
 * LinkedIn session health marker on disk.
 * Used so the agent can soft-fail and external repair (cookie push) can detect status.
 */
import fs from 'fs';
import path from 'path';

const STATUS_PATH = path.join(process.cwd(), 'session_status.json');

export function readSessionStatus() {
  try {
    if (!fs.existsSync(STATUS_PATH)) return null;
    return JSON.parse(fs.readFileSync(STATUS_PATH, 'utf8'));
  } catch {
    return null;
  }
}

export function writeSessionStatus(patch = {}) {
  const prev = readSessionStatus() || {};
  const next = {
    ...prev,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(STATUS_PATH, JSON.stringify(next, null, 2));
  return next;
}

export function markSessionOk(extra = {}) {
  return writeSessionStatus({ ok: true, reason: null, needsCookieRepair: false, ...extra });
}

export function markSessionDead(reason = 'auth_wall', extra = {}) {
  const prev = readSessionStatus();
  const alreadyDead = prev && prev.ok === false;
  const st = writeSessionStatus({ ok: false, reason, needsCookieRepair: true, ...extra });
  // Only notify on ok→dead transition — rapid re-marks were spamming Telegram 3×.
  if (alreadyDead) return st;
  import('./notify.js')
    .then(async ({ notify }) => {
      let repairUrl = '';
      try {
        // Prefer dashboard helper when available; fallback builds URL from env
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
          'Session is inactive. Open H.A.L.O. → LinkedIn and Sign in with email/password (approve in the LinkedIn app if asked):',
          repairUrl,
        ].join('\n'),
      });
    })
    .catch(() => {});
  return st;
}
