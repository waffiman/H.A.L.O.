/**
 * Read/write X chat passcode pause state under APP_ROOT (cabinet or legacy root).
 */
import fs from 'fs';
import path from 'path';
import { APP_ROOT } from './env.js';
import { tenantPaths } from './tenantRuntime.js';
import { waffiWorkspaceId } from './tenants.js';

function statePath(workspaceId = waffiWorkspaceId()) {
  const paths = tenantPaths(workspaceId);
  const root = paths.isLegacy ? APP_ROOT : paths.root;
  return path.join(root, 'x_passcode_state.json');
}

export function readXPasscodeState(workspaceId = waffiWorkspaceId()) {
  try {
    const file = statePath(workspaceId);
    if (!fs.existsSync(file)) return { needsPasscode: false };
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return { needsPasscode: false };
  }
}

export function clearXPasscodeRequired(workspaceId = waffiWorkspaceId()) {
  const file = statePath(workspaceId);
  const next = {
    needsPasscode: false,
    reason: null,
    pausedChannel: false,
    updatedAt: new Date().toISOString(),
  };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(next, null, 2));
  return next;
}
