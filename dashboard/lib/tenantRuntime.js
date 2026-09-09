/**
 * Per-cabinet runtime dirs on the shared VPS (cookies / Chromium / brain).
 * WAFFi golden workspace `default` keeps legacy paths under APP_ROOT.
 */
import fs from 'fs';
import path from 'path';
import { APP_ROOT, HOST_APP_ROOT } from './env.js';
import { waffiWorkspaceId } from './tenants.js';

export const TENANTS_DIRNAME = 'halo-tenants';

export function tenantsRoot(appRoot = APP_ROOT) {
  return path.join(appRoot, TENANTS_DIRNAME);
}

export function hostTenantsRoot() {
  return path.join(HOST_APP_ROOT, TENANTS_DIRNAME);
}

/**
 * @returns {{ root: string, cookies: string, sessionData: string, brain: string, envFile: string, isLegacy: boolean }}
 */
export function tenantPaths(workspaceId, appRoot = APP_ROOT) {
  const ws = String(workspaceId || '').trim() || waffiWorkspaceId();
  if (ws === waffiWorkspaceId()) {
    return {
      root: appRoot,
      cookies: path.join(appRoot, 'cookies.json'),
      sessionData: path.join(appRoot, 'session_data'),
      brain: path.join(appRoot, 'brain'),
      envFile: path.join(appRoot, '.env'),
      isLegacy: true,
      workspaceId: ws,
    };
  }
  const root = path.join(tenantsRoot(appRoot), ws);
  return {
    root,
    cookies: path.join(root, 'cookies.json'),
    sessionData: path.join(root, 'session_data'),
    brain: path.join(root, 'brain'),
    envFile: path.join(root, 'tenant.env'),
    isLegacy: false,
    workspaceId: ws,
  };
}

/** Create empty cabinet folders (idempotent). Does not touch WAFFi legacy tree. */
export function ensureTenantRuntime(workspaceId, appRoot = APP_ROOT) {
  const paths = tenantPaths(workspaceId, appRoot);
  if (paths.isLegacy) return paths;
  fs.mkdirSync(paths.root, { recursive: true });
  fs.mkdirSync(paths.sessionData, { recursive: true });
  fs.mkdirSync(paths.brain, { recursive: true });
  if (!fs.existsSync(paths.cookies)) {
    fs.writeFileSync(paths.cookies, '[]\n', 'utf8');
  }
  if (!fs.existsSync(paths.envFile)) {
    fs.writeFileSync(
      paths.envFile,
      [
        `# HALO cabinet ${paths.workspaceId}`,
        `WORKSPACE_ID=${paths.workspaceId}`,
        'OUTREACH_PAUSED=1',
        'SKIP_STAGE_A=1',
        'SKIP_STAGE_B=1',
        '',
      ].join('\n'),
      'utf8'
    );
  }
  const statusPath = path.join(paths.root, 'session_status.json');
  if (!fs.existsSync(statusPath)) {
    fs.writeFileSync(
      statusPath,
      JSON.stringify(
        {
          ok: false,
          reason: 'awaiting_linkedin_cookies',
          needsCookieRepair: true,
          updatedAt: new Date().toISOString(),
          source: 'tenant_provision',
        },
        null,
        2
      ),
      'utf8'
    );
  }
  return paths;
}

/** New unique workspace id for self-serve signup */
export function allocateWorkspaceId(email = '') {
  const slug = String(email || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 24);
  const rand = Math.random().toString(36).slice(2, 8);
  const base = slug || 'cabinet';
  return `ws_${base}_${rand}`;
}
