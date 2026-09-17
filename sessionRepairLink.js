/**
 * Agent-side thin wrapper so sessionHealth can mint repair links without
 * depending on dashboard/lib paths inside the agent container.
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const STATE_PATH = path.join(process.cwd(), 'session_repair.json');
const INPUT_PATH = path.join(process.cwd(), 'session_repair_input.jsonl');

function publicUrl() {
  return (
    process.env.DASHBOARD_PUBLIC_URL ||
    process.env.PUBLIC_DASHBOARD_URL ||
    'https://temporarily-olympics-pilot-kathy.trycloudflare.com'
  )
    .trim()
    .replace(/\/+$/, '');
}

/** Same Sign in page as the dashboard LinkedIn section. */
function linkedInDashboardUrl() {
  return `${publicUrl()}/?page=linkedin`;
}

function readState() {
  try {
    if (!fs.existsSync(STATE_PATH)) return null;
    return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
  } catch {
    return null;
  }
}

function writeState(patch) {
  const prev = readState() || {};
  const next = { ...prev, ...patch, updatedAt: new Date().toISOString() };
  fs.writeFileSync(STATE_PATH, JSON.stringify(next, null, 2));
  return next;
}

export function ensureActiveRepairLink(reason = 'session_dead') {
  const st = readState();
  const ageMs = st?.createdAt ? Date.now() - Date.parse(st.createdAt) : Infinity;
  const updatedMs = st?.updatedAt ? Date.now() - Date.parse(st.updatedAt) : Infinity;
  const reuseMaxMs = 45 * 60 * 1000;
  if (
    st?.token &&
    !st.liAtCaptured &&
    Number.isFinite(ageMs) &&
    ageMs < reuseMaxMs &&
    Number.isFinite(updatedMs) &&
    updatedMs < reuseMaxMs &&
    ['starting', 'running'].includes(st.status)
  ) {
    return {
      token: st.token,
      url: linkedInDashboardUrl(),
      reused: true,
    };
  }
  const token = crypto.randomBytes(24).toString('hex');
  writeState({
    token,
    status: 'awaiting_user',
    reason,
    createdAt: new Date().toISOString(),
    liAtCaptured: false,
    error: null,
    challengeKind: null,
    captchaPhase: 'none',
  });
  try {
    if (fs.existsSync(INPUT_PATH)) fs.unlinkSync(INPUT_PATH);
  } catch {
    /* ignore */
  }
  return {
    token,
    url: linkedInDashboardUrl(),
    reused: false,
  };
}

