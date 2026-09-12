import fs from 'fs';
import path from 'path';
import { spawn, execSync } from 'child_process';
import {
  APP_ROOT,
  HOST_APP_ROOT,
  COOKIES_PATH,
  ENV_PATH,
  PLAYBOOK_PATH,
  PROMPTS_DIR,
  SESSION_STATUS_PATH,
  BRAIN_DIR,
  BRAIN_USER_PROMPT_PATH,
  BRAIN_STRATEGY_NOTES_PATH,
  BRAIN_ANALYSIS_STATE_PATH,
  BRAIN_TARGET_PORTRAIT_PATH,
  BRAIN_SALES_POLICY_PATH,
  get,
  hoursToMs,
  intervalToMs,
  normalizeStageBIntervalMs,
  STAGE_B_MIN_INTERVAL_MS,
  isSecretKey,
  maskSecret,
  minutesToMs,
  msToHours,
  msToInterval,
  msToMinutes,
  readEnvFile,
  writeEnvFile,
} from './env.js';
import { tenantPaths, ensureTenantRuntime } from './tenantRuntime.js';
import { waffiWorkspaceId } from './tenants.js';
import {
  addNotification,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  syncSessionNotifications,
} from './notifications.js';
import { notionConfigured as notionOnlyConfigured } from './notionProvision.js';
import { supabaseDashboardUrl } from './supabaseProvision.js';
import { getSupabaseKeepaliveStatus } from './supabaseKeepalive.js';
import { getTelegramIntegrationMeta } from './telegramBot.js';
import {
  defaultBookingSchedule,
  normalizeBookingSchedule,
  validateBookingSchedule,
} from '../bookingSchedule.js';

export function notionConfigured(env = readEnvFile()) {
  if (String(env.CRM_BACKEND || 'notion').trim().toLowerCase() === 'supabase') {
    return Boolean((env.SUPABASE_URL || '').trim() && (env.SUPABASE_SERVICE_ROLE_KEY || '').trim());
  }
  return notionOnlyConfigured(env);
}

export { notionOnlyConfigured };

const STATUS_LABELS = ['Lead😴', 'Conversation 💬', 'Active ✅', 'Lost❌'];
let countsCache = { at: 0, data: null, ws: null };

export function invalidateNotionCountsCache() {
  countsCache = { at: 0, data: null, ws: null };
}

function ensureBrainDir() {
  if (!fs.existsSync(BRAIN_DIR)) fs.mkdirSync(BRAIN_DIR, { recursive: true });
}

function readBrainUserPrompt() {
  ensureBrainDir();
  if (!fs.existsSync(BRAIN_USER_PROMPT_PATH) || !fs.readFileSync(BRAIN_USER_PROMPT_PATH, 'utf8').trim()) {
    if (fs.existsSync(PLAYBOOK_PATH)) {
      fs.writeFileSync(BRAIN_USER_PROMPT_PATH, fs.readFileSync(PLAYBOOK_PATH, 'utf8'), 'utf8');
    } else {
      fs.writeFileSync(
        BRAIN_USER_PROMPT_PATH,
        'You write LinkedIn messages for Mykhailo, Founder of WAFFi.\n',
        'utf8'
      );
    }
  }
  return fs.readFileSync(BRAIN_USER_PROMPT_PATH, 'utf8');
}

function writeBrainUserPrompt(text) {
  ensureBrainDir();
  fs.writeFileSync(BRAIN_USER_PROMPT_PATH, String(text ?? ''), 'utf8');
  // Keep legacy playbook in sync so older scripts still see the same voice
  try {
    fs.writeFileSync(PLAYBOOK_PATH, String(text ?? ''), 'utf8');
  } catch {
    /* ignore */
  }
}

function readBrainStrategyNotes() {
  ensureBrainDir();
  if (!fs.existsSync(BRAIN_STRATEGY_NOTES_PATH)) return '';
  return fs.readFileSync(BRAIN_STRATEGY_NOTES_PATH, 'utf8');
}

function readBrainAnalysisState() {
  try {
    if (!fs.existsSync(BRAIN_ANALYSIS_STATE_PATH)) {
      return { lastRunAt: null, leadsAnalyzed: 0, lastSummary: '' };
    }
    return {
      lastRunAt: null,
      leadsAnalyzed: 0,
      lastSummary: '',
      ...JSON.parse(fs.readFileSync(BRAIN_ANALYSIS_STATE_PATH, 'utf8')),
    };
  } catch {
    return { lastRunAt: null, leadsAnalyzed: 0, lastSummary: '' };
  }
}

const SALES_OUTCOME_IDS = ['book_a_call', 'purchase', 'qualify', 'referral'];

function readBrainTargetPortrait() {
  ensureBrainDir();
  if (!fs.existsSync(BRAIN_TARGET_PORTRAIT_PATH)) return '';
  return fs.readFileSync(BRAIN_TARGET_PORTRAIT_PATH, 'utf8');
}

function writeBrainTargetPortrait(text) {
  ensureBrainDir();
  fs.writeFileSync(BRAIN_TARGET_PORTRAIT_PATH, String(text ?? ''), 'utf8');
}

function readBrainSalesPolicy() {
  ensureBrainDir();
  try {
    if (fs.existsSync(BRAIN_SALES_POLICY_PATH)) {
      const raw = JSON.parse(fs.readFileSync(BRAIN_SALES_POLICY_PATH, 'utf8'));
      const outcome = SALES_OUTCOME_IDS.includes(raw.outcome) ? raw.outcome : 'book_a_call';
      let portrait = normalizePortraitFields(raw.portrait);
      if (isPortraitFieldsEmpty(portrait)) {
        const legacy = readBrainTargetPortrait().trim();
        if (legacy) portrait = { ...portrait, need: legacy };
      }
      return {
        outcome,
        portrait,
        linkedInSearch: normalizeLinkedInSearchFields(raw.linkedInSearch),
        searchUrlOverride: String(raw.searchUrlOverride || '').trim(),
        booking: normalizeBookingSchedule(raw.booking),
      };
    }
  } catch {
    /* fall through */
  }
  const legacy = readBrainTargetPortrait().trim();
  return {
    outcome: 'book_a_call',
    portrait: legacy
      ? { ...defaultPortraitFields(), need: legacy }
      : defaultPortraitFields(),
    linkedInSearch: normalizeLinkedInSearchFields(),
    searchUrlOverride: '',
    booking: defaultBookingSchedule(),
  };
}

function normalizeLinkedInSearchFields(raw) {
  const base = {
    connectionDegree: '2nd',
    keywordsExtra: '',
    currentCompany: '',
    pastCompany: '',
    school: '',
    profileLanguage: '',
  };
  if (!raw || typeof raw !== 'object') return base;
  const degrees = new Set(['2nd', '3rd_plus', '2nd_3rd', 'all', '1st']);
  const degree = String(raw.connectionDegree || base.connectionDegree).trim();
  return {
    connectionDegree: degrees.has(degree) ? degree : base.connectionDegree,
    keywordsExtra: String(raw.keywordsExtra || '').trim(),
    currentCompany: String(raw.currentCompany || '').trim(),
    pastCompany: String(raw.pastCompany || '').trim(),
    school: String(raw.school || '').trim(),
    profileLanguage: String(raw.profileLanguage || '').trim(),
  };
}

function defaultPortraitFields() {
  return {
    roles: [],
    industries: [],
    companySize: '',
    decisionMaker: [],
    stage: '',
    regions: [],
    budget: '',
    urgency: '',
    painPoints: [],
    linkedinSignals: [],
    need: '',
    greenFlags: '',
    nonFit: 'No decision power, hard refusal, wrong persona, or clearly outside this portrait',
  };
}

function isPortraitFieldsEmpty(p) {
  if (!p || typeof p !== 'object') return true;
  return !(
    (p.roles && p.roles.length) ||
    (p.industries && p.industries.length) ||
    p.companySize ||
    (p.decisionMaker && p.decisionMaker.length) ||
    p.stage ||
    (p.regions && p.regions.length) ||
    p.budget ||
    p.urgency ||
    (p.painPoints && p.painPoints.length) ||
    (p.linkedinSignals && p.linkedinSignals.length) ||
    String(p.need || '').trim() ||
    String(p.greenFlags || '').trim() ||
    String(p.nonFit || '').trim()
  );
}

function normalizePortraitFields(raw) {
  const base = defaultPortraitFields();
  if (!raw || typeof raw !== 'object') return base;
  const arr = (v) => (Array.isArray(v) ? v.map(String) : []);
  return {
    roles: arr(raw.roles),
    industries: arr(raw.industries),
    companySize: String(raw.companySize || '').trim(),
    decisionMaker: arr(raw.decisionMaker),
    stage: String(raw.stage || '').trim(),
    regions: arr(raw.regions),
    budget: String(raw.budget || '').trim(),
    urgency: String(raw.urgency || '').trim(),
    painPoints: arr(raw.painPoints),
    linkedinSignals: arr(raw.linkedinSignals),
    need: String(raw.need || '').trim(),
    greenFlags: String(raw.greenFlags || '').trim(),
    nonFit: String(raw.nonFit || base.nonFit).trim(),
  };
}

function compilePortraitMarkdownFromFields(portrait) {
  const p = normalizePortraitFields(portrait);
  const lines = [];
  if (p.roles.length) lines.push(`Roles: ${p.roles.join(', ')}.`);
  if (p.industries.length) lines.push(`Industries: ${p.industries.join(', ')}.`);
  if (p.companySize) lines.push(`Company size: ${p.companySize}.`);
  if (p.decisionMaker.length) lines.push(`Decision maker: ${p.decisionMaker.join(', ')}.`);
  if (p.stage) lines.push(`Stage: ${p.stage}.`);
  if (p.regions.length) lines.push(`Regions: ${p.regions.join(', ')}.`);
  if (p.budget) lines.push(`Budget signal: ${p.budget}.`);
  if (p.urgency) lines.push(`Urgency: ${p.urgency}.`);
  if (p.painPoints.length) lines.push(`Pain points: ${p.painPoints.join(', ')}.`);
  if (p.linkedinSignals.length) lines.push(`LinkedIn signals: ${p.linkedinSignals.join(', ')}.`);
  if (p.need) lines.push(`Need / offer fit: ${p.need}`);
  if (p.greenFlags) lines.push(`Green flags: ${p.greenFlags}`);
  if (p.nonFit) lines.push(`Clear non-fit → Lost: ${p.nonFit}`);
  return lines.join('\n\n');
}

function writeBrainSalesPolicy(policy) {
  ensureBrainDir();
  const outcome = SALES_OUTCOME_IDS.includes(policy?.outcome) ? policy.outcome : 'book_a_call';
  const portrait = normalizePortraitFields(policy?.portrait);
  const linkedInSearch = normalizeLinkedInSearchFields(policy?.linkedInSearch);
  const searchUrlOverride = String(policy?.searchUrlOverride || '').trim();
  const booking = normalizeBookingSchedule(policy?.booking);
  fs.writeFileSync(
    BRAIN_SALES_POLICY_PATH,
    JSON.stringify({ outcome, portrait, linkedInSearch, searchUrlOverride, booking }, null, 2),
    'utf8'
  );
  writeBrainTargetPortrait(compilePortraitMarkdownFromFields(portrait));
}

function readProspectSearchPreview() {
  try {
    const out = execSync(
      `node --input-type=module -e "import { resolvePeopleSearchUrl } from './prospectSearch.js'; console.log(JSON.stringify(resolvePeopleSearchUrl(process.cwd())))"`,
      { cwd: APP_ROOT, encoding: 'utf8', timeout: 15000 }
    );
    return JSON.parse(String(out).trim());
  } catch {
    return {
      keywords: 'founder',
      searchUrl: '',
      facets: [],
      source: 'portrait',
    };
  }
}

/** Wipe dead Chromium cookie stores so a fresh li_at paste can take effect. */
export function resetBrowserSessionsForCookieRepair(workspaceId = waffiWorkspaceId()) {
  const paths = tenantPaths(workspaceId);
  const profiles = [paths.sessionData];
  if (paths.isLegacy) {
    profiles.push(path.join(APP_ROOT, 'session_data_connect'));
  }
  const cookieRel = [
    'Default/Cookies',
    'Default/Cookies-journal',
    'Default/Network/Cookies',
    'Default/Network/Cookies-journal',
  ];
  let cleared = 0;
  for (const root of profiles) {
    if (root.endsWith('session_data_connect')) {
      try {
        fs.mkdirSync(root, { recursive: true });
        for (const name of fs.readdirSync(root)) {
          fs.rmSync(path.join(root, name), { recursive: true, force: true });
          cleared += 1;
        }
        continue;
      } catch {
        /* fall through */
      }
    }
    for (const rel of cookieRel) {
      const p = path.join(root, rel);
      try {
        if (fs.existsSync(p)) {
          fs.unlinkSync(p);
          cleared += 1;
        }
      } catch {
        /* ignore locked files */
      }
    }
  }
  try {
    fs.writeFileSync(path.join(paths.root, '.cookie_repair_pending'), new Date().toISOString());
  } catch {
    /* ignore */
  }
  return cleared;
}

export function readSessionStatus(workspaceId = waffiWorkspaceId()) {
  try {
    const p = path.join(tenantPaths(workspaceId).root, 'session_status.json');
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

export function readLiAtPresent(workspaceId = waffiWorkspaceId()) {
  try {
    const cookiesPath = tenantPaths(workspaceId).cookies;
    if (!fs.existsSync(cookiesPath)) return { present: false, count: 0 };
    const cookies = JSON.parse(fs.readFileSync(cookiesPath, 'utf8'));
    const list = Array.isArray(cookies) ? cookies : [];
    return {
      present: list.some((c) => c.name === 'li_at' && c.value),
      count: list.length,
    };
  } catch {
    return { present: false, count: 0 };
  }
}

export async function countNotionStatuses(workspaceId) {
  const now = Date.now();
  const wsKey = String(workspaceId || '').trim() || '_env_';
  if (
    countsCache.data &&
    countsCache.ws === wsKey &&
    now - countsCache.at < 60000
  ) {
    return countsCache.data;
  }

  const env = readEnvFile();
  const backend = String(env.CRM_BACKEND || 'notion').trim().toLowerCase();

  if (backend === 'supabase') {
    if (!(env.SUPABASE_URL || '').trim() || !(env.SUPABASE_SERVICE_ROLE_KEY || '').trim()) {
      return { ok: false, error: 'SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing', counts: {} };
    }
    try {
      const { countByStatus } = await import('./crmApi.js');
      const data = await countByStatus(env, workspaceId);
      countsCache = { at: now, data, ws: wsKey };
      try {
        const { recordCrmSnapshot } = await import('./analytics.js');
        if (!workspaceId || workspaceId === (env.WORKSPACE_ID || 'default')) {
          recordCrmSnapshot(data.counts);
        }
      } catch {
        /* ignore */
      }
      return data;
    } catch (e) {
      return { ok: false, error: e.message, counts: {} };
    }
  }

  const token = get('NOTION_TOKEN');
  const db = get('NOTION_DATABASE_ID');
  if (!token || !db) {
    return { ok: false, error: 'NOTION_TOKEN or NOTION_DATABASE_ID missing', counts: {} };
  }

  const counts = {};
  for (const status of STATUS_LABELS) {
    counts[status] = await countStatus(token, db, status);
  }
  const data = { ok: true, counts, cachedAt: new Date().toISOString() };
  countsCache = { at: now, data, ws: wsKey };
  try {
    const { recordCrmSnapshot } = await import('./analytics.js');
    recordCrmSnapshot(counts);
  } catch {
    /* ignore */
  }
  return data;
}

async function countStatus(token, databaseId, statusName) {
  let total = 0;
  let cursor = undefined;
  for (let i = 0; i < 50; i++) {
    const body = {
      filter: { property: 'Status', select: { equals: statusName } },
      page_size: 100,
    };
    if (cursor) body.start_cursor = cursor;
    const res = await fetch(`https://api.notion.com/v1/databases/${databaseId}/query`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.message || `Notion ${res.status}`);
    total += (data.results || []).length;
    if (!data.has_more) break;
    cursor = data.next_cursor;
  }
  return total;
}

export function notionCrmUrl() {
  const custom = get('NOTION_CRM_URL');
  if (custom) return custom;
  const id = get('NOTION_DATABASE_ID');
  if (!id) return '';
  const compact = id.replace(/-/g, '');
  return `https://www.notion.so/${compact}`;
}

/** Convert EditThisCookie / Chrome export cookie → Playwright cookie shape */
function toPlaywrightCookie(c) {
  const name = c.name;
  const value = String(c.value ?? '').replace(/^"|"$/g, '');
  if (!name || !value) return null;
  const domain = c.domain || '.linkedin.com';
  const sameSiteRaw = String(c.sameSite || 'None').toLowerCase();
  let sameSite = 'None';
  if (sameSiteRaw.includes('lax')) sameSite = 'Lax';
  else if (sameSiteRaw.includes('strict')) sameSite = 'Strict';
  else if (sameSiteRaw.includes('no_restriction') || sameSiteRaw.includes('none')) sameSite = 'None';

  const out = {
    name,
    value,
    domain,
    path: c.path || '/',
    httpOnly: Boolean(c.httpOnly),
    secure: c.secure !== false,
    sameSite,
  };
  if (c.expirationDate) {
    out.expires = Math.floor(Number(c.expirationDate));
  } else if (!c.session) {
    out.expires = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 180;
  }
  return out;
}

/**
 * Accept:
 * - raw li_at value
 * - EditThisCookie JSON array (extracts li_at + writes all LinkedIn cookies)
 */
export function ingestCookiePaste(raw, workspaceId = waffiWorkspaceId()) {
  const text = String(raw || '').trim();
  if (!text) throw new Error('Empty cookie paste');
  const ws = String(workspaceId || waffiWorkspaceId()).trim() || waffiWorkspaceId();
  ensureTenantRuntime(ws);
  const paths = tenantPaths(ws);

  // EditThisCookie / JSON array
  if (text.startsWith('[')) {
    let arr;
    try {
      arr = JSON.parse(text);
    } catch {
      throw new Error('Could not parse cookie JSON — paste EditThisCookie export as-is');
    }
    if (!Array.isArray(arr) || !arr.length) throw new Error('Cookie JSON is empty');

    const linkedIn = arr
      .filter((c) => /linkedin\.com/i.test(String(c.domain || '')))
      .map(toPlaywrightCookie)
      .filter(Boolean);

    if (!linkedIn.length) throw new Error('No LinkedIn cookies found in paste');
    const liAt = linkedIn.find((c) => c.name === 'li_at');
    if (!liAt?.value) throw new Error('li_at cookie not found in EditThisCookie export');

    fs.writeFileSync(paths.cookies, JSON.stringify(linkedIn, null, 2));
    const cleared = resetBrowserSessionsForCookieRepair(ws);
    // mark session healthy after repair
    try {
      const statusPath = path.join(paths.root, 'session_status.json');
      fs.writeFileSync(
        statusPath,
        JSON.stringify(
          {
            ok: true,
            reason: null,
            needsCookieRepair: false,
            updatedAt: new Date().toISOString(),
            source: 'dashboard_cookie_paste',
            cookieCount: linkedIn.length,
            profilesCleared: cleared,
            workspaceId: ws,
          },
          null,
          2
        )
      );
    } catch {
      /* ignore */
    }
    return {
      ok: true,
      mode: 'editthiscookie',
      count: linkedIn.length,
      liAtPresent: true,
      liAtPreview: `${liAt.value.slice(0, 6)}…${liAt.value.slice(-4)}`,
      profilesCleared: cleared,
      workspaceId: ws,
    };
  }

  // Raw li_at only
  return upsertLiAt(text, ws);
}

export function upsertLiAt(token, workspaceId = waffiWorkspaceId()) {
  const value = String(token || '').trim();
  if (!value || value.length < 20) throw new Error('li_at token looks too short');
  const ws = String(workspaceId || waffiWorkspaceId()).trim() || waffiWorkspaceId();
  ensureTenantRuntime(ws);
  const paths = tenantPaths(ws);
  let cookies = [];
  if (fs.existsSync(paths.cookies)) {
    try {
      cookies = JSON.parse(fs.readFileSync(paths.cookies, 'utf8'));
      if (!Array.isArray(cookies)) cookies = [];
    } catch {
      cookies = [];
    }
  }
  const rest = cookies.filter((c) => c.name !== 'li_at');
  rest.push({
    name: 'li_at',
    value,
    domain: '.www.linkedin.com',
    path: '/',
    expires: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 180,
    httpOnly: true,
    secure: true,
    sameSite: 'None',
  });
  fs.writeFileSync(paths.cookies, JSON.stringify(rest, null, 2));
  const cleared = resetBrowserSessionsForCookieRepair(ws);
  try {
    fs.writeFileSync(
      path.join(paths.root, 'session_status.json'),
      JSON.stringify(
        {
          ok: true,
          reason: null,
          needsCookieRepair: false,
          updatedAt: new Date().toISOString(),
          source: 'dashboard_li_at_paste',
          profilesCleared: cleared,
          workspaceId: ws,
        },
        null,
        2
      )
    );
  } catch {
    /* ignore */
  }
  return {
    ok: true,
    mode: 'li_at',
    count: rest.length,
    liAtPresent: true,
    profilesCleared: cleared,
    workspaceId: ws,
  };
}

export function readPrompt(name) {
  if (name === 'playbook') {
    return fs.existsSync(PLAYBOOK_PATH) ? fs.readFileSync(PLAYBOOK_PATH, 'utf8') : '';
  }
  const p = path.join(PROMPTS_DIR, `${name}.md`);
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
}

export function writePrompt(name, text) {
  if (name === 'playbook') {
    fs.writeFileSync(PLAYBOOK_PATH, String(text ?? ''), 'utf8');
    return;
  }
  if (!fs.existsSync(PROMPTS_DIR)) fs.mkdirSync(PROMPTS_DIR, { recursive: true });
  const allowed = new Set(['ice_breaker', 'reply', 'closing_followup']);
  if (!allowed.has(name)) throw new Error('Unknown prompt');
  fs.writeFileSync(path.join(PROMPTS_DIR, `${name}.md`), String(text ?? ''), 'utf8');
}

export function buildSettingsView(workspaceId = waffiWorkspaceId()) {
  const ws = String(workspaceId || waffiWorkspaceId()).trim() || waffiWorkspaceId();
  const rootEnv = readEnvFile();
  const paths = tenantPaths(ws);
  const tenantEnv = paths.isLegacy ? {} : readEnvFile(paths.envFile);
  // Shared secrets from root; stage/LinkedIn flags from tenant.env when non-default
  const env = paths.isLegacy ? rootEnv : { ...rootEnv, ...tenantEnv, WORKSPACE_ID: ws };
  const stageAMs = Number(env.STAGE_A_INTERVAL_MS || 172800000);
  const stageBMs = Number(env.STAGE_B_INTERVAL_MS || 1800000);
  const stageAInt = msToInterval(stageAMs, env.STAGE_A_INTERVAL_UNIT || 'hours');
  const stageBInt = msToInterval(stageBMs, env.STAGE_B_INTERVAL_UNIT || 'minutes');
  const brainMs = Number(env.BRAIN_ANALYSIS_INTERVAL_MS || 604800000);
  const brainInt = msToInterval(brainMs, env.BRAIN_ANALYSIS_INTERVAL_UNIT || 'days');
  const stageAOn = env.SKIP_STAGE_A !== '1';
  const stageBOn = env.SKIP_STAGE_B !== '1' && env.SKIP_CONVERSATION !== '1';
  // Master is a convenience toggle: ON only when both stages are enabled
  const masterOn = stageAOn && stageBOn;
  const session = readSessionStatus(ws);
  const cookies = readLiAtPresent(ws);
  // Only push TG session alerts for the active request cabinet
  syncSessionNotifications(session, cookies, ws);
  // Read the policy file once — this block used to re-read and re-parse
  // sales_policy.json six times per settings request.
  const salesPolicy = readBrainSalesPolicy();
  const linkedinSessionOk =
    session?.ok === true && !session?.needsCookieRepair && cookies.present;
  const integrations = buildIntegrationsView(rootEnv);

  return {
    masterEnabled: masterOn,
    stageA: {
      enabled: stageAOn,
      intervalValue: stageAInt.value,
      intervalUnit: stageAInt.unit,
      intervalHours: msToHours(stageAMs) ?? 48,
      title: 'Stage A',
      hint: 'Sync → enrich → ice DMs. 1–3 new leads per cycle is safe; volume via interval, not a bigger batch.',
    },
    stageB: {
      enabled: stageBOn,
      intervalValue: stageBInt.value,
      intervalUnit: stageBInt.unit,
      intervalMinutes: msToMinutes(stageBMs) ?? 30,
      title: 'Stage B',
      hint: 'Check existing chats (replies, revive, silence). Actual runs vary ±1–5 min around your interval.',
    },
    silenceBusinessDays: Number(env.SILENCE_BUSINESS_DAYS || 2),
    silenceSkipWeekends: env.SILENCE_SKIP_WEEKENDS !== '0',
    channels: {
      linkedin: env.CHANNEL_LINKEDIN_ENABLED !== '0',
      instagram: env.CHANNEL_INSTAGRAM_ENABLED === '1',
      facebook: env.CHANNEL_FACEBOOK_ENABLED === '1',
    },
    linkedin: {
      targetUrl: env.TARGET_LINKEDIN_URL || '',
      syncMaxNew: Number(env.SYNC_MAX_NEW || env.SYNC_FIRST_RUN_LIMIT || 20),
      syncMaxScrolls: Number(env.SYNC_MAX_SCROLLS || 80),
      allowAutoLogin: env.ALLOW_AUTO_LOGIN === '1',
      enableInboxReplies: env.ENABLE_INBOX_REPLIES !== '0',
      convMaxPerRun: Number(env.CONV_MAX_PER_RUN || 15),
      lostInboxMax: Number(env.LOST_INBOX_MAX || 15),
      outboundConnect: env.STAGE_A_OUTBOUND_CONNECT === '1',
      portraitProspecting: env.STAGE_A_OUTBOUND_CONNECT === '1',
      acceptanceMonitor: env.STAGE_A_ACCEPTANCE === '1',
      legacySync: env.STAGE_A_LEGACY_SYNC !== '0',
      connectMaxPerRun: Number(env.CONNECT_MAX_PER_RUN || 15),
      connectAcceptExpire: env.CONNECT_ACCEPT_EXPIRE !== '0',
      connectAcceptWaitDays: Number(env.CONNECT_ACCEPT_WAIT_DAYS ?? 21) || 21,
      connectDryRun: env.CONNECT_DRY_RUN === '1',
    },
    telegram: {
      ...getTelegramIntegrationMeta(env),
      botTokenSet: Boolean((env.TELEGRAM_BOT_TOKEN || '').trim()),
    },
    googleCalendar: {
      meetUrl: (env.GOOGLE_MEET_URL || env.WAFFI_BOOKING_URL || '').trim(),
      ready: Boolean((env.GOOGLE_MEET_URL || env.WAFFI_BOOKING_URL || '').trim()),
    },
    notionCrmUrl: notionCrmUrl(),
    session,
    cookies,
    prompts: {
      playbook: readPrompt('playbook'),
      ice_breaker: readPrompt('ice_breaker'),
      reply: readPrompt('reply'),
      closing_followup: readPrompt('closing_followup'),
    },
    brain: {
      userPrompt: readBrainUserPrompt(),
      strategyNotes: readBrainStrategyNotes(),
      analysisEnabled: env.BRAIN_ANALYSIS_ENABLED !== '0',
      analysisIntervalValue: brainInt.value,
      analysisIntervalUnit: brainInt.unit,
      analysisState: readBrainAnalysisState(),
      portrait: salesPolicy.portrait,
      linkedInSearch: salesPolicy.linkedInSearch,
      outcome: salesPolicy.outcome,
      searchUrlOverride: salesPolicy.searchUrlOverride,
      booking: salesPolicy.booking,
      bookingComplete: validateBookingSchedule(salesPolicy.booking).ok,
      prospectSearch: readProspectSearchPreview(),
    },
    integrations,
    integrationsHasProblem: integrations.some((it) => it.problem),
    brainLlmHealth: readBrainLlmHealth(),
    llmRolesConfigured: llmRolesConfigured(env),
    apifyAgent1Configured: apifyAgent1Configured(env),
    linkedinSessionOk,
    notionConfigured: notionConfigured(env),
    crmBackend: (env.CRM_BACKEND || 'notion').trim().toLowerCase(),
    supabaseDashboardUrl: supabaseDashboardUrl(env),
    supabaseUrl: (env.SUPABASE_URL || '').trim(),
    supabaseKeepalive: getSupabaseKeepaliveStatus(env),
    apifyActor: (env.APIFY_ACTOR || 'apimaestro~linkedin-profile-detail').trim(),
    notifications: listNotifications(ws),
    envPath: ENV_PATH,
    appRoot: APP_ROOT,
  };
}

const BRAIN_LLM_HEALTH_PATH = path.join(APP_ROOT, 'brain_llm_health.json');

const LLM_ROLE_KEYS = {
  researcher: { key: 'GEMINI_API_KEY', modelKey: 'GEMINI_RESEARCHER_MODEL' },
  copywriter: { key: 'GEMINI_API_KEY_2', modelKey: 'GEMINI_COPYWRITER_MODEL' },
  inspector: { key: 'COHERE_API_KEY', modelKey: 'COHERE_MODEL' },
};

export function readBrainLlmHealth() {
  const empty = () => ({
    researcher: { ok: true, error: null, at: null },
    copywriter: { ok: true, error: null, at: null },
    inspector: { ok: true, error: null, at: null },
  });
  try {
    if (fs.existsSync(BRAIN_LLM_HEALTH_PATH)) {
      const raw = JSON.parse(fs.readFileSync(BRAIN_LLM_HEALTH_PATH, 'utf8'));
      const base = empty();
      for (const r of Object.keys(base)) {
        base[r] = { ...base[r], ...(raw[r] || {}) };
      }
      return base;
    }
  } catch {
    /* ignore */
  }
  return empty();
}

/** Shared platform Apify pool (root .env). Users no longer configure this. */
export function apifyAgent1Configured(env = readEnvFile()) {
  for (let i = 1; i <= 20; i++) {
    if (String(env[`APIFY_TOKEN_${i}`] || '').trim()) return true;
  }
  return Boolean(String(env.APIFY_TOKEN || '').trim());
}

export function llmRolesConfigured(env = readEnvFile()) {
  return Boolean(
    (env.GEMINI_API_KEY || '').trim() &&
      (env.GEMINI_API_KEY_2 || '').trim() &&
      (env.COHERE_API_KEY || '').trim()
  );
}
const INTEGRATION_DEFS = [
  { key: 'NOTION_TOKEN', label: 'Notion Token', group: 'Notion', required: true, hidden: true },
  { key: 'NOTION_DATABASE_ID', label: 'Notion Database ID', group: 'Notion', secret: false, required: true, hidden: true },
  { key: 'NOTION_CRM_URL', label: 'Notion CRM URL', group: 'Notion', secret: false, hidden: true },
  { key: 'SUPABASE_URL', label: 'Project URL', group: 'Supabase', secret: false, required: true },
  { key: 'SUPABASE_SERVICE_ROLE_KEY', label: 'Service role key', group: 'Supabase', required: true },
  { key: 'WORKSPACE_ID', label: 'Workspace ID', group: 'Supabase', secret: false, hidden: true },
  { key: 'CRM_BACKEND', label: 'CRM backend', group: 'Supabase', secret: false, hidden: true },
  { key: 'GEMINI_API_KEY', label: 'Researcher API key', group: 'LLM', required: true, role: 'researcher' },
  { key: 'GEMINI_RESEARCHER_MODEL', label: 'Researcher model', group: 'LLM', secret: false, role: 'researcher' },
  { key: 'GEMINI_API_KEY_2', label: 'Copywriter API key', group: 'LLM', required: true, role: 'copywriter' },
  { key: 'GEMINI_COPYWRITER_MODEL', label: 'Copywriter model', group: 'LLM', secret: false, role: 'copywriter' },
  { key: 'COHERE_API_KEY', label: 'Inspector API key', group: 'LLM', required: true, role: 'inspector' },
  { key: 'COHERE_MODEL', label: 'Inspector model', group: 'LLM', secret: false, role: 'inspector' },
  { key: 'OPENROUTER_API_KEY', label: 'Fallback API key', group: 'LLM', required: false, role: 'fallback' },
  { key: 'OPENROUTER_FALLBACK_MODEL', label: 'Fallback model', group: 'LLM', secret: false, role: 'fallback' },
  { key: 'BRAIN_PIPELINE', label: 'Brain 3-role pipeline (1=on, 0=off)', group: 'LLM', secret: false, hidden: true },
  { key: 'GEMINI_MODEL', label: 'Gemini Model (legacy)', group: 'LLM', secret: false, hidden: true },
  { key: 'OPENROUTER_RESEARCHER_MODEL', label: 'OpenRouter Researcher model (legacy)', group: 'LLM', secret: false, hidden: true },
  { key: 'OPENROUTER_COPYWRITER_MODEL', label: 'OpenRouter Copywriter model (legacy)', group: 'LLM', secret: false, hidden: true },
  { key: 'OPENROUTER_INSPECTOR_MODEL', label: 'OpenRouter Inspector model (legacy)', group: 'LLM', secret: false, hidden: true },
  { key: 'BRAIN_PREFER_OPENROUTER', label: 'Use OpenRouter before Gemini (legacy)', group: 'LLM', secret: false, hidden: true },
  { key: 'OPENAI_API_KEY', label: 'OpenAI API Key (unused)', group: 'LLM', hidden: true },
  { key: 'OPENAI_MODEL', label: 'OpenAI Model (unused)', group: 'LLM', secret: false, hidden: true },
  { key: 'APIFY_TOKEN_1', label: 'Apify Agent 1', group: 'Apify', required: false, hidden: true, apifyAgent: 1 },
  { key: 'APIFY_TOKEN_2', label: 'Apify Agent 2', group: 'Apify', hidden: true, apifyAgent: 2 },
  { key: 'APIFY_TOKEN_3', label: 'Apify Agent 3', group: 'Apify', hidden: true, apifyAgent: 3 },
  { key: 'APIFY_TOKEN_4', label: 'Apify Agent 4', group: 'Apify', hidden: true, apifyAgent: 4 },
  { key: 'APIFY_TOKEN_5', label: 'Apify Agent 5', group: 'Apify', hidden: true, apifyAgent: 5 },
  { key: 'APIFY_TOKEN_6', label: 'Apify Agent 6', group: 'Apify', hidden: true, apifyAgent: 6 },
  { key: 'APIFY_TOKEN_7', label: 'Apify Agent 7', group: 'Apify', hidden: true, apifyAgent: 7 },
  { key: 'APIFY_TOKEN_8', label: 'Apify Agent 8', group: 'Apify', hidden: true, apifyAgent: 8 },
  { key: 'APIFY_ACTOR', label: 'Apify Actor ID', group: 'Apify', secret: false, hidden: true },
  { key: 'TELEGRAM_BOT_TOKEN', label: 'Telegram Bot Token', group: 'Telegram', required: false, hidden: true },
  {
    key: 'TELEGRAM_NOTIFY_CHAT',
    label: 'Telegram Chat ID',
    group: 'Telegram',
    secret: false,
    required: false,
  },
  { key: 'TELEGRAM_NOTIFY_PHONE', label: 'Telegram Phone (display)', group: 'Telegram', secret: false, hidden: true },
  {
    key: 'GOOGLE_MEET_URL',
    label: 'Google Meet room URL',
    group: 'Google Calendar',
    secret: false,
    required: false,
    hidden: true,
  },
  { key: 'WAFFI_BOOKING_URL', label: 'Booking URL', group: 'Product', secret: false, hidden: true },
  { key: 'LINKEDIN_EMAIL', label: 'LinkedIn Email (optional)', group: 'LinkedIn', secret: false, hidden: true },
  { key: 'LINKEDIN_PASSWORD', label: 'LinkedIn Password (optional)', group: 'LinkedIn', hidden: true },
  { key: 'STRIPE_SECRET_KEY', label: 'Stripe Secret Key', group: 'Stripe', required: false, hidden: true },
  { key: 'STRIPE_PRICE_ID', label: 'Stripe Price ID', group: 'Stripe', secret: false, required: false, hidden: true },
  { key: 'STRIPE_WEBHOOK_SECRET', label: 'Stripe Webhook Secret', group: 'Stripe', required: false, hidden: true },
];

const GROUP_ORDER = ['Supabase', 'LLM', 'Telegram'];

function integrationProblem(d, env, health = readBrainLlmHealth()) {
  if (d.hidden) return null;
  if (d.required && !(env[d.key] || '').trim()) {
    return 'Missing — required for H.A.L.O.';
  }
  if (d.role && d.role !== 'fallback' && health[d.role] && health[d.role].ok === false) {
    return health[d.role].error || 'Last API call failed — check key or use fallback';
  }
  return null;
}

function buildIntegrationsView(env) {
  const health = readBrainLlmHealth();
  const items = INTEGRATION_DEFS.filter((d) => !d.hidden).map((d) => {
    const secret = d.secret !== false && isSecretKey(d.key);
    const raw = env[d.key] || '';
    const problem = integrationProblem(d, env, health);
    return {
      key: d.key,
      label: d.label,
      group: d.group,
      role: d.role || null,
      secret,
      set: Boolean(raw),
      required: !!d.required,
      problem: problem || null,
      masked: secret ? maskSecret(raw) : raw,
      value: secret ? '' : raw,
    };
  });

  // LLM: all three brain roles must have API keys
  if (!llmRolesConfigured(env)) {
    for (const it of items) {
      if (it.key === 'GEMINI_API_KEY' || it.key === 'GEMINI_API_KEY_2' || it.key === 'COHERE_API_KEY') {
        it.problem = it.problem || 'Required — add API key for this brain role';
      }
    }
  }

  // LLM group: surface runtime failures on accordion
  const roleFailed = ['researcher', 'copywriter', 'inspector'].some((r) => health[r]?.ok === false);
  if (roleFailed) {
    for (const it of items) {
      if (it.group === 'LLM' && it.role && it.role !== 'fallback' && health[it.role]?.ok === false) {
        it.problem = it.problem || health[it.role].error || 'Last call failed';
      }
    }
  }

  items.sort((a, b) => {
    const ga = GROUP_ORDER.indexOf(a.group);
    const gb = GROUP_ORDER.indexOf(b.group);
    const ia = ga === -1 ? 99 : ga;
    const ib = gb === -1 ? 99 : gb;
    if (ia !== ib) return ia - ib;
    return String(a.label).localeCompare(String(b.label));
  });
  return items;
}

export function applyDashboardPatch(body = {}, workspaceId = waffiWorkspaceId()) {
  const updates = {};
  const removeKeys = [];
  const ws = String(workspaceId || waffiWorkspaceId()).trim() || waffiWorkspaceId();
  ensureTenantRuntime(ws);
  const paths = tenantPaths(ws);
  const env = paths.isLegacy
    ? readEnvFile()
    : { ...readEnvFile(), ...readEnvFile(paths.envFile), WORKSPACE_ID: ws };

  // Master = convenience to enable/disable BOTH stages together.
  // Turning master ON → enable A+B. Turning master OFF → disable A+B.
  // Turning a single stage off while the other stays on → master becomes OFF in the UI
  // (derived in buildSettingsView) without killing the remaining stage.
  if (typeof body.masterEnabled === 'boolean' && body._masterSource === true) {
    if (body.masterEnabled) {
      updates.OUTREACH_PAUSED = '0';
      updates.SKIP_STAGE_A = '0';
      updates.SKIP_STAGE_B = '0';
      updates.SKIP_CONVERSATION = '0';
    } else {
      updates.OUTREACH_PAUSED = '1';
      updates.SKIP_STAGE_A = '1';
      updates.SKIP_STAGE_B = '1';
      updates.SKIP_CONVERSATION = '1';
    }
  } else if (typeof body.masterEnabled === 'boolean' && body.stageAEnabled == null && body.stageBEnabled == null) {
    // Legacy: master alone without stage flags
    if (body.masterEnabled) {
      updates.OUTREACH_PAUSED = '0';
      updates.SKIP_STAGE_A = '0';
      updates.SKIP_STAGE_B = '0';
      updates.SKIP_CONVERSATION = '0';
    } else {
      updates.OUTREACH_PAUSED = '1';
      updates.SKIP_STAGE_A = '1';
      updates.SKIP_STAGE_B = '1';
      updates.SKIP_CONVERSATION = '1';
    }
  }

  if (typeof body.stageAEnabled === 'boolean') {
    updates.SKIP_STAGE_A = body.stageAEnabled ? '0' : '1';
  }
  if (typeof body.stageBEnabled === 'boolean') {
    updates.SKIP_STAGE_B = body.stageBEnabled ? '0' : '1';
    updates.SKIP_CONVERSATION = body.stageBEnabled ? '0' : '1';
  }

  // Keep OUTREACH_PAUSED in sync: paused only when both stages are off
  if (typeof body.stageAEnabled === 'boolean' || typeof body.stageBEnabled === 'boolean') {
    const nextA =
      updates.SKIP_STAGE_A != null
        ? updates.SKIP_STAGE_A !== '1'
        : env.SKIP_STAGE_A !== '1';
    const nextB =
      updates.SKIP_STAGE_B != null
        ? updates.SKIP_STAGE_B !== '1'
        : env.SKIP_STAGE_B !== '1' && env.SKIP_CONVERSATION !== '1';
    if (nextA || nextB) updates.OUTREACH_PAUSED = '0';
    else updates.OUTREACH_PAUSED = '1';
  }
  if (body.stageAIntervalHours != null && body.stageAIntervalHours !== '') {
    updates.STAGE_A_INTERVAL_MS = String(hoursToMs(body.stageAIntervalHours));
    updates.STAGE_A_INTERVAL_UNIT = 'hours';
  }
  if (body.stageBIntervalMinutes != null && body.stageBIntervalMinutes !== '') {
    updates.STAGE_B_INTERVAL_MS = String(
      normalizeStageBIntervalMs(minutesToMs(body.stageBIntervalMinutes), 'minutes')
    );
    updates.STAGE_B_INTERVAL_UNIT = 'minutes';
  }
  if (body.stageAIntervalValue != null && body.stageAIntervalUnit) {
    const ms = intervalToMs(body.stageAIntervalValue, body.stageAIntervalUnit);
    if (ms) {
      updates.STAGE_A_INTERVAL_MS = String(ms);
      updates.STAGE_A_INTERVAL_UNIT = body.stageAIntervalUnit;
    }
  }
  if (body.stageBIntervalValue != null && body.stageBIntervalUnit) {
    const raw = intervalToMs(body.stageBIntervalValue, body.stageBIntervalUnit);
    if (raw) {
      updates.STAGE_B_INTERVAL_MS = String(
        normalizeStageBIntervalMs(raw, body.stageBIntervalUnit)
      );
      updates.STAGE_B_INTERVAL_UNIT = body.stageBIntervalUnit;
    }
  }
  if (body.silenceBusinessDays != null && body.silenceBusinessDays !== '') {
    updates.SILENCE_BUSINESS_DAYS = String(Number(body.silenceBusinessDays));
  }
  if (typeof body.silenceSkipWeekends === 'boolean') {
    updates.SILENCE_SKIP_WEEKENDS = body.silenceSkipWeekends ? '1' : '0';
  }

  if (body.channels && typeof body.channels === 'object') {
    if (typeof body.channels.linkedin === 'boolean') {
      updates.CHANNEL_LINKEDIN_ENABLED = body.channels.linkedin ? '1' : '0';
    }
    if (typeof body.channels.instagram === 'boolean') {
      updates.CHANNEL_INSTAGRAM_ENABLED = body.channels.instagram ? '1' : '0';
    }
    if (typeof body.channels.facebook === 'boolean') {
      updates.CHANNEL_FACEBOOK_ENABLED = body.channels.facebook ? '1' : '0';
    }
  }

  if (body.linkedin && typeof body.linkedin === 'object') {
    const li = body.linkedin;
    // Auto-dialog is core — always on
    updates.ENABLE_INBOX_REPLIES = '1';
    if ('targetUrl' in li) {
      const t = String(li.targetUrl || '').trim();
      if (t) updates.TARGET_LINKEDIN_URL = t;
      else removeKeys.push('TARGET_LINKEDIN_URL');
    }
    if (li.syncMaxNew != null && li.syncMaxNew !== '') {
      const scrolls = Number(
        li.syncMaxScrolls != null && li.syncMaxScrolls !== ''
          ? li.syncMaxScrolls
          : env.SYNC_MAX_SCROLLS || 80
      );
      const scrollCap = Number.isFinite(scrolls) && scrolls > 0 ? scrolls : 80;
      const requested = Number(li.syncMaxNew);
      const capped = Math.max(1, Math.min(requested, scrollCap));
      updates.SYNC_MAX_NEW = String(capped);
      updates.SYNC_FIRST_RUN_LIMIT = String(capped);
    }
    if (li.syncMaxScrolls != null && li.syncMaxScrolls !== '') {
      const scrolls = Math.max(1, Math.min(Number(li.syncMaxScrolls) || 80, 200));
      updates.SYNC_MAX_SCROLLS = String(scrolls);
      // Re-clamp sync max if scrolls shrunk below current syncMaxNew
      const curSync = Number(
        updates.SYNC_MAX_NEW || env.SYNC_MAX_NEW || env.SYNC_FIRST_RUN_LIMIT || 20
      );
      if (curSync > scrolls) {
        updates.SYNC_MAX_NEW = String(scrolls);
        updates.SYNC_FIRST_RUN_LIMIT = String(scrolls);
      }
    }
    if (typeof li.enableInboxReplies === 'boolean') {
      updates.ENABLE_INBOX_REPLIES = li.enableInboxReplies ? '1' : '0';
    }
    if (li.convMaxPerRun != null) updates.CONV_MAX_PER_RUN = String(Number(li.convMaxPerRun));
    if (li.lostInboxMax != null) updates.LOST_INBOX_MAX = String(Number(li.lostInboxMax));
    if (typeof li.outboundConnect === 'boolean') {
      updates.STAGE_A_OUTBOUND_CONNECT = li.outboundConnect ? '1' : '0';
    }
    if (typeof li.portraitProspecting === 'boolean') {
      updates.STAGE_A_OUTBOUND_CONNECT = li.portraitProspecting ? '1' : '0';
      updates.STAGE_A_ACCEPTANCE = '1';
      updates.STAGE_A_LEGACY_SYNC = '0';
    }
    if (typeof li.acceptanceMonitor === 'boolean') {
      updates.STAGE_A_ACCEPTANCE = li.acceptanceMonitor ? '1' : '0';
    }
    if (typeof li.legacySync === 'boolean') {
      updates.STAGE_A_LEGACY_SYNC = li.legacySync ? '1' : '0';
    }
    if (li.connectMaxPerRun != null && li.connectMaxPerRun !== '') {
      const n = Math.max(1, Math.min(Number(li.connectMaxPerRun) || 15, 100));
      updates.CONNECT_MAX_PER_RUN = String(n);
    }
    if (typeof li.connectAcceptExpire === 'boolean') {
      updates.CONNECT_ACCEPT_EXPIRE = li.connectAcceptExpire ? '1' : '0';
    }
    if (li.connectAcceptWaitDays != null && li.connectAcceptWaitDays !== '') {
      const d = Math.max(1, Math.min(Number(li.connectAcceptWaitDays) || 21, 365));
      updates.CONNECT_ACCEPT_WAIT_DAYS = String(d);
    }
    if (typeof li.connectDryRun === 'boolean') {
      updates.CONNECT_DRY_RUN = li.connectDryRun ? '1' : '0';
    }
  }

  if (body.notionCrmUrl != null) {
    const u = String(body.notionCrmUrl || '').trim();
    if (u) updates.NOTION_CRM_URL = u;
    else removeKeys.push('NOTION_CRM_URL');
  }

  if (body.integrations && typeof body.integrations === 'object') {
    for (const [key, value] of Object.entries(body.integrations)) {
      if (value === undefined) continue;
      if (value === null || value === '') {
        // empty means delete only if explicitly requested
        if (body.deleteEmptyIntegrations) removeKeys.push(key);
        continue;
      }
      updates[key] = String(value);
    }
  }

  if (Array.isArray(body.removeIntegrationKeys)) {
    for (const k of body.removeIntegrationKeys) removeKeys.push(String(k));
  }

  if (typeof body.brainAnalysisEnabled === 'boolean') {
    updates.BRAIN_ANALYSIS_ENABLED = body.brainAnalysisEnabled ? '1' : '0';
  }
  if (body.brainAnalysisIntervalValue != null && body.brainAnalysisIntervalUnit) {
    const ms = intervalToMs(body.brainAnalysisIntervalValue, body.brainAnalysisIntervalUnit);
    if (ms) {
      updates.BRAIN_ANALYSIS_INTERVAL_MS = String(ms);
      updates.BRAIN_ANALYSIS_INTERVAL_UNIT = body.brainAnalysisIntervalUnit;
    }
  }

  if (body.brain && typeof body.brain === 'object') {
    const policy = readBrainSalesPolicy();
    if (body.brain.userPrompt != null) {
      writeBrainUserPrompt(body.brain.userPrompt);
    }
    if (body.brain.outcome != null) policy.outcome = body.brain.outcome;
    if (body.brain.portrait != null) policy.portrait = body.brain.portrait;
    if (body.brain.linkedInSearch != null) policy.linkedInSearch = body.brain.linkedInSearch;
    if (body.brain.searchUrlOverride != null) {
      policy.searchUrlOverride = String(body.brain.searchUrlOverride || '').trim();
    }
    if (body.brain.booking != null) {
      const check = validateBookingSchedule(body.brain.booking);
      if (policy.outcome === 'book_a_call' && !check.ok) {
        throw new Error(
          `Book a call schedule incomplete — set every weekday (${check.missing.join(', ')})`
        );
      }
      policy.booking = check.schedule;
    }
    if (policy.outcome === 'book_a_call' && !validateBookingSchedule(policy.booking).ok) {
      throw new Error('Book a call requires a complete weekly availability schedule');
    }
    writeBrainSalesPolicy(policy);
  }

  if (body.prompts && typeof body.prompts === 'object') {
    for (const [name, text] of Object.entries(body.prompts)) {
      if (text == null) continue;
      writePrompt(name, text);
    }
  }

  if (body.liAtToken || body.cookiePaste) {
    ingestCookiePaste(body.cookiePaste || body.liAtToken, ws);
  }

  // Integration secrets always go to root .env (shared LLM/Apify/Telegram)
  const rootOnlyKeys = new Set();
  const tenantKeys = new Set();
  for (const k of Object.keys(updates)) {
    if (
      /TOKEN|API_KEY|PASSWORD|SECRET|RESEND|STRIPE|SUPABASE|NOTION|DASHBOARD_/i.test(k) ||
      k === 'CRM_BACKEND'
    ) {
      rootOnlyKeys.add(k);
    } else {
      tenantKeys.add(k);
    }
  }

  if (paths.isLegacy) {
    writeEnvFile(updates, { removeKeys });
  } else {
    const rootUpdates = {};
    const tenantUpdates = { WORKSPACE_ID: ws };
    for (const [k, v] of Object.entries(updates)) {
      if (rootOnlyKeys.has(k)) rootUpdates[k] = v;
      else tenantUpdates[k] = v;
    }
    if (Object.keys(rootUpdates).length || removeKeys.some((k) => rootOnlyKeys.has(k))) {
      writeEnvFile(rootUpdates, {
        removeKeys: removeKeys.filter((k) => rootOnlyKeys.has(k)),
      });
    }
    writeEnvFile(tenantUpdates, {
      removeKeys: removeKeys.filter((k) => !rootOnlyKeys.has(k)),
    }, paths.envFile);
  }

  return buildSettingsView(ws);
}

export {
  addNotification,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
};

/**
 * Only values the Integrations UI actually renders a reveal/copy button for may
 * be read back in cleartext. Derived from INTEGRATION_DEFS so the allowlist
 * cannot drift from the UI. Everything else — Stripe keys, LinkedIn password,
 * DASHBOARD_PASSWORD, HALO_SESSION_SECRET, Notion token — is never returned.
 */
function revealableKeys() {
  const out = new Set();
  for (const d of INTEGRATION_DEFS) {
    if (d.hidden) continue;
    if (d.secret === false) continue;
    if (!isSecretKey(d.key)) continue;
    out.add(d.key);
  }
  return out;
}

export function revealSecret(key) {
  const k = String(key || '');
  if (!revealableKeys().has(k)) {
    return { ok: false, error: 'This value cannot be revealed' };
  }
  const env = readEnvFile();
  if (!(k in env)) return { ok: false, error: 'not found' };
  return { ok: true, key: k, value: env[k] || '' };
}

const FORCE_RUN_ONCE_PATH = path.join(APP_ROOT, 'force_run_once.json');

/** Which stages to run immediately after Save and restart (reads saved .env). */
export function resolveForceRunStages(env = readEnvFile()) {
  const linkedinOn = env.CHANNEL_LINKEDIN_ENABLED !== '0';
  const outreachOn = env.OUTREACH_PAUSED !== '1';
  const runStageA = linkedinOn && outreachOn && env.SKIP_STAGE_A !== '1';
  const runStageB =
    linkedinOn && outreachOn && env.SKIP_STAGE_B !== '1' && env.SKIP_CONVERSATION !== '1';
  return { runStageA, runStageB };
}

function forceRunHint({ runStageA, runStageB }) {
  if (runStageA && runStageB) {
    return 'Stage A runs first, then Stage B when A finishes (never parallel). Later cycles use your dashboard intervals.';
  }
  if (runStageA) {
    return 'Stage A runs now. Later cycles use your Stage A interval.';
  }
  if (runStageB) {
    return 'Stage B runs now (Chromium opens immediately for inbox). Later cycles follow your Stage B interval.';
  }
  return 'No immediate run — automation paused or no stages enabled. Later cycles follow saved settings when you turn stages on.';
}

/** Ask agent to run enabled stage(s) once on next boot (A then B when both — never parallel). */
export function requestForceRunOnce(reason = 'dashboard_save_and_restart') {
  const { runStageA, runStageB } = resolveForceRunStages();
  const payload = {
    reason,
    requestedAt: new Date().toISOString(),
    runStageA,
    runStageB,
  };
  fs.writeFileSync(FORCE_RUN_ONCE_PATH, JSON.stringify(payload, null, 2));
  return { path: FORCE_RUN_ONCE_PATH, runStageA, runStageB };
}

function notifyRestartResult(result, workspaceId = waffiWorkspaceId()) {
  const hint = result.ok ? forceRunHint(result) : '';
  const ws = String(workspaceId || waffiWorkspaceId()).trim() || waffiWorkspaceId();
  try {
    if (result.ok) {
      const runningNow = result.runStageA || result.runStageB;
      addNotification({
        workspaceId: ws,
        type: 'agent_restart',
        severity: 'info',
        key: `agent_restart_${ws}_${Date.now()}`,
        title: runningNow ? 'H.A.L.O. restarted — running now' : 'H.A.L.O. restarted',
        message: ['Save and restart completed — agent recreated.', hint].filter(Boolean).join('\n'),
      });
    } else {
      addNotification({
        workspaceId: ws,
        type: 'agent_restart',
        severity: 'error',
        key: `agent_restart_fail_${ws}_${Date.now()}`,
        title: 'H.A.L.O. restart failed',
        message: String(result.output || result.error || 'unknown error').slice(0, 500),
      });
      import('./supportChat.js')
        .then(({ flagTenantError }) =>
          flagTenantError(ws, {
            title: 'H.A.L.O. restart failed',
            message: String(result.output || result.error || 'unknown error').slice(0, 400),
          })
        )
        .catch(() => {});
    }
  } catch {
    /* ignore notify failures */
  }
  return { ...result, hint, runStageA: result.runStageA, runStageB: result.runStageB };
}

export function restartAgent(workspaceId = waffiWorkspaceId()) {
  const ws = String(workspaceId || waffiWorkspaceId()).trim() || waffiWorkspaceId();
  const env = readEnvFile();
  if (!llmRolesConfigured(env)) {
    return Promise.resolve(
      notifyRestartResult(
        {
          ok: false,
          error:
            'LLM brain roles incomplete — add Researcher, Copywriter, and Inspector API keys in Integrations → LLM.',
          runStageA: false,
          runStageB: false,
        },
        ws
      )
    );
  }
  return new Promise((resolve) => {
    let forcePlan;
    try {
      forcePlan = requestForceRunOnce('dashboard_save_and_restart');
    } catch (e) {
      resolve(notifyRestartResult({ ok: false, error: `force_run_once write failed: ${e.message}` }, ws));
      return;
    }
    // Prefer host path when it is mounted into this container (see docker-compose.ionos.yml).
    // Fallback to APP_ROOT (/app-data) so -f always resolves.
    const hostCompose = path.join(HOST_APP_ROOT, 'docker-compose.ionos.yml');
    const composeFile = fs.existsSync(hostCompose)
      ? hostCompose
      : path.join(APP_ROOT, 'docker-compose.ionos.yml');
    const projectDir = fs.existsSync(hostCompose) ? HOST_APP_ROOT : APP_ROOT;
    const args = [
      'compose',
      '-f',
      composeFile,
      '--project-directory',
      projectDir,
      'up',
      '-d',
      '--force-recreate',
      '--no-deps',
      'linkedin-agent',
    ];
    const child = spawn('docker', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', (d) => (out += d.toString()));
    child.stderr.on('data', (d) => (out += d.toString()));
    child.on('close', (code) => {
      if (code === 0) {
        resolve(
          notifyRestartResult(
            {
              ok: true,
              output: (out || 'agent recreated').trim().slice(-400),
              ...forcePlan,
            },
            ws
          )
        );
        return;
      }
      // Fallback: docker restart (env reload now uses dotenv override on boot)
      const fb = spawn(
        'curl',
        [
          '-sS',
          '-o',
          '/tmp/docker-restart.out',
          '-w',
          '%{http_code}',
          '--unix-socket',
          '/var/run/docker.sock',
          '-X',
          'POST',
          'http://localhost/containers/linkedin-agent/restart',
        ],
        { stdio: ['ignore', 'pipe', 'pipe'] }
      );
      let fbOut = '';
      fb.stdout.on('data', (d) => (fbOut += d.toString()));
      fb.stderr.on('data', (d) => (fbOut += d.toString()));
      fb.on('close', (fbCode) => {
        const httpCode = fbOut.trim();
        const ok = fbCode === 0 && (httpCode === '204' || httpCode === '200' || httpCode === '');
        resolve(
          notifyRestartResult(
            {
              ok,
              code: fbCode,
              output: `compose recreate failed (${code}): ${out.slice(-200)} | restart http=${httpCode}`,
              ...forcePlan,
            },
            ws
          )
        );
      });
      fb.on('error', (err) =>
        resolve(notifyRestartResult({ ok: false, error: err.message, output: out.slice(-300) }, ws))
      );
    });
    child.on('error', (err) => {
      resolve(notifyRestartResult({ ok: false, error: err.message }, ws));
    });
  });
}
