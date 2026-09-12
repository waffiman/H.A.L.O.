/**
 * Runtime data directory for LinkedIn cookies / Chromium profile / stage state.
 * Default (unset TENANT_DATA_ROOT): process.cwd() → WAFFi root on VPS (/app).
 * Tenant one-shot / repair: TENANT_DATA_ROOT=/app/halo-tenants/{workspaceId}
 */
import path from 'path';

export function dataRoot() {
  const t = String(process.env.TENANT_DATA_ROOT || '').trim();
  if (t) return path.resolve(t);
  return process.cwd();
}

export function cookiesFile() {
  return path.join(dataRoot(), 'cookies.json');
}

export function sessionDataDir() {
  return path.join(dataRoot(), 'session_data');
}

export function sessionRepairDataDir() {
  return path.join(dataRoot(), 'session_data_repair');
}

export function sessionStatusFile() {
  return path.join(dataRoot(), 'session_status.json');
}

export function stateJsonFile() {
  return path.join(dataRoot(), 'state.json');
}

export function stageAStateFile() {
  return path.join(dataRoot(), 'stage_a_state.json');
}

export function stageBStateFile() {
  return path.join(dataRoot(), 'stage_b_state.json');
}
