/**
 * Per-role LLM health for dashboard Integrations (runtime failures).
 */
import fs from 'fs';
import path from 'path';

const HEALTH_PATH = path.join(process.cwd(), 'brain_llm_health.json');

const ROLES = ['researcher', 'copywriter', 'inspector'];

function emptyRole() {
  return { ok: true, error: null, source: null, at: null };
}

export function loadBrainLlmHealth() {
  try {
    if (fs.existsSync(HEALTH_PATH)) {
      const raw = JSON.parse(fs.readFileSync(HEALTH_PATH, 'utf8'));
      const out = {};
      for (const r of ROLES) {
        out[r] = { ...emptyRole(), ...(raw[r] || {}) };
      }
      return out;
    }
  } catch {
    /* ignore */
  }
  return Object.fromEntries(ROLES.map((r) => [r, emptyRole()]));
}

export function saveBrainLlmHealth(state) {
  fs.writeFileSync(HEALTH_PATH, JSON.stringify(state, null, 2));
}

/** @param {'researcher'|'copywriter'|'inspector'} role */
export function markBrainRoleHealth(role, ok, error = null, source = null) {
  if (!ROLES.includes(role)) return;
  const state = loadBrainLlmHealth();
  state[role] = {
    ok: Boolean(ok),
    error: ok ? null : String(error || 'Unknown error').slice(0, 280),
    source: source || (ok ? 'primary' : null),
    at: new Date().toISOString(),
  };
  saveBrainLlmHealth(state);
}

export function clearBrainRoleHealth(role) {
  if (role && ROLES.includes(role)) {
    markBrainRoleHealth(role, true);
    return;
  }
  saveBrainLlmHealth(Object.fromEntries(ROLES.map((r) => [r, emptyRole()])));
}
