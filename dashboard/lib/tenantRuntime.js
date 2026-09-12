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
      prompts: path.join(appRoot, 'prompts'),
      playbook: path.join(appRoot, 'salesPlaybook.md'),
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
    prompts: path.join(root, 'prompts'),
    playbook: path.join(root, 'salesPlaybook.md'),
    envFile: path.join(root, 'tenant.env'),
    isLegacy: false,
    workspaceId: ws,
  };
}

/** Create empty cabinet folders (idempotent). Does not touch WAFFi legacy tree. */
/**
 * Neutral starter for a new cabinet. Deliberately NOT a copy of the WAFFi
 * master prompt — that file names WAFFi and its founder, and cabinets belong to
 * other companies.
 */
const TENANT_STARTER_PROMPT = `# Sales playbook

You write LinkedIn messages on behalf of the account owner.

## Goal
Start and advance a real conversation that leads to a short intro call.
The recipient must believe a human researched them — not a bot.

## Voice
- Short, specific, human. No corporate filler, no emoji spam.
- One concrete detail from their profile in the opener.
- One soft call to action. Never two asks in one message.

## Product
Describe what you sell here — the Brain uses this to build the angle.

## Rules
- Never invent facts about the recipient or their company.
- No pricing in the first message.
- If they say no, thank them and stop.
`;

/** Mode adapters a cabinet needs for Stage A/B copy generation. */
const MODE_PROMPTS = ['ice_breaker', 'reply', 'closing_followup'];

/**
 * Give a new cabinet its own Brain + prompt files so the dashboard can edit
 * them without touching the WAFFi tree. Mode adapters are copied from the
 * platform tree (they are mechanical output contracts); the master prompt is a
 * neutral starter.
 */
function seedTenantBrain(paths, appRoot) {
  const userPrompt = path.join(paths.brain, 'user_prompt.md');
  if (!fs.existsSync(userPrompt)) {
    fs.writeFileSync(userPrompt, TENANT_STARTER_PROMPT, 'utf8');
  }
  if (!fs.existsSync(paths.playbook)) {
    fs.writeFileSync(paths.playbook, TENANT_STARTER_PROMPT, 'utf8');
  }
  fs.mkdirSync(paths.prompts, { recursive: true });
  for (const name of MODE_PROMPTS) {
    const dest = path.join(paths.prompts, `${name}.md`);
    if (fs.existsSync(dest)) continue;
    const src = path.join(appRoot, 'prompts', `${name}.md`);
    try {
      if (fs.existsSync(src)) fs.copyFileSync(src, dest);
    } catch {
      /* a missing platform adapter is not fatal — readPrompt returns '' */
    }
  }
}

export function ensureTenantRuntime(workspaceId, appRoot = APP_ROOT) {
  const paths = tenantPaths(workspaceId, appRoot);
  if (paths.isLegacy) return paths;
  fs.mkdirSync(paths.root, { recursive: true });
  fs.mkdirSync(paths.sessionData, { recursive: true });
  fs.mkdirSync(paths.brain, { recursive: true });
  fs.mkdirSync(paths.prompts, { recursive: true });
  seedTenantBrain(paths, appRoot);
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
