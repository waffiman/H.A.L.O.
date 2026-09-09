/**
 * Env helpers for the outreach control dashboard.
 * APP_ROOT = parent cold-outreach-agent directory (shared volume).
 */
import fs from 'fs';
import path from 'path';

export const APP_ROOT = process.env.APP_ROOT || path.resolve(process.cwd(), '..');
/** Host path for docker -v binds (daemon resolves on the host, not inside this container). */
export const HOST_APP_ROOT = process.env.HOST_APP_ROOT || APP_ROOT;
export const ENV_PATH = path.join(APP_ROOT, '.env');
export const COOKIES_PATH = path.join(APP_ROOT, 'cookies.json');
export const SESSION_STATUS_PATH = path.join(APP_ROOT, 'session_status.json');
export const PLAYBOOK_PATH = path.join(APP_ROOT, 'salesPlaybook.md');
export const PROMPTS_DIR = path.join(APP_ROOT, 'prompts');
export const BRAIN_DIR = path.join(APP_ROOT, 'brain');
export const BRAIN_USER_PROMPT_PATH = path.join(BRAIN_DIR, 'user_prompt.md');
export const BRAIN_STRATEGY_NOTES_PATH = path.join(BRAIN_DIR, 'strategy_notes.md');
export const BRAIN_ANALYSIS_STATE_PATH = path.join(BRAIN_DIR, 'analysis_state.json');
export const BRAIN_TARGET_PORTRAIT_PATH = path.join(BRAIN_DIR, 'target_portrait.md');
export const BRAIN_SALES_POLICY_PATH = path.join(BRAIN_DIR, 'sales_policy.json');

const SECRET_KEYS = new Set([
  'NOTION_TOKEN',
  'SUPABASE_SERVICE_ROLE_KEY',
  'LINKEDIN_PASSWORD',
  'OPENAI_API_KEY',
  'GEMINI_API_KEY',
  'GEMINI_API_KEY_2',
  'GOOGLE_API_KEY',
  'COHERE_API_KEY',
  'CO_API_KEY',
  'APIFY_TOKEN',
  'APIFY_TOKEN_1',
  'APIFY_TOKEN_2',
  'APIFY_TOKEN_3',
  'DASHBOARD_PASSWORD',
]);

export function isSecretKey(key) {
  const k = String(key || '').toUpperCase();
  return SECRET_KEYS.has(k) || k.includes('TOKEN') || k.includes('PASSWORD') || k.includes('SECRET') || k.endsWith('_KEY');
}

export function maskSecret(value) {
  const v = String(value || '');
  if (!v) return '';
  if (v.length <= 8) return '••••••••';
  return `${v.slice(0, 4)}…${v.slice(-4)}`;
}

export function readEnvFile(filePath = ENV_PATH) {
  const map = {};
  if (!fs.existsSync(filePath)) return map;
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const s = line.trim();
    if (!s || s.startsWith('#')) continue;
    const i = s.indexOf('=');
    if (i < 0) continue;
    const k = s.slice(0, i).trim();
    let v = s.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    map[k] = v;
  }
  return map;
}

export function writeEnvFile(updates, { removeKeys = [] } = {}, filePath = ENV_PATH) {
  const current = readEnvFile(filePath);
  for (const k of removeKeys) delete current[k];
  for (const [k, v] of Object.entries(updates || {})) {
    if (v === undefined || v === null) continue;
    current[k] = String(v);
  }
  const lines = Object.entries(current).map(([k, v]) => `${k}=${v}`);
  fs.writeFileSync(filePath, lines.join('\n') + '\n', 'utf8');
  return current;
}

export function get(key, fallback = '') {
  return readEnvFile()[key] ?? process.env[key] ?? fallback;
}

export function msToHours(ms) {
  const n = Number(ms);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round((n / 3600000) * 100) / 100;
}

export function hoursToMs(hours) {
  return Math.round(Number(hours) * 3600000);
}

export function msToMinutes(ms) {
  const n = Number(ms);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round((n / 60000) * 100) / 100;
}

export function minutesToMs(minutes) {
  return Math.round(Number(minutes) * 60000);
}

export function daysToMs(days) {
  return Math.round(Number(days) * 86400000);
}

export function msToDays(ms) {
  const n = Number(ms);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round((n / 86400000) * 1000) / 1000;
}

/** Minimum Stage B interval the dashboard allows (> 5 minutes). */
export const STAGE_B_MIN_INTERVAL_MS = 6 * 60 * 1000;

/** Convert UI value+unit → ms */
export function intervalToMs(value, unit) {
  const v = Number(value);
  if (!Number.isFinite(v) || v <= 0) return null;
  if (unit === 'minutes') return minutesToMs(v);
  if (unit === 'days') return daysToMs(v);
  return hoursToMs(v); // default hours
}

/** Clamp Stage B interval from dashboard (minutes unit must be ≥ 6). */
export function normalizeStageBIntervalMs(ms, unit) {
  const n = Number(ms);
  if (!Number.isFinite(n) || n <= 0) return STAGE_B_MIN_INTERVAL_MS;
  if (unit === 'minutes' && n <= 5 * 60 * 1000) return STAGE_B_MIN_INTERVAL_MS;
  if (n < STAGE_B_MIN_INTERVAL_MS && unit === 'minutes') return STAGE_B_MIN_INTERVAL_MS;
  return Math.round(n);
}

/** Prefer stored unit; derive display value from ms */
export function msToInterval(ms, preferredUnit) {
  const unit = preferredUnit === 'minutes' || preferredUnit === 'days' || preferredUnit === 'hours'
    ? preferredUnit
    : 'hours';
  const n = Number(ms);
  if (!Number.isFinite(n) || n <= 0) return { value: 1, unit };
  if (unit === 'minutes') return { value: msToMinutes(n) ?? 1, unit };
  if (unit === 'days') return { value: msToDays(n) ?? 1, unit };
  return { value: msToHours(n) ?? 1, unit };
}
