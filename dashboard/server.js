import {
  applyDashboardPatch,
  buildSettingsView,
  countNotionStatuses,
  invalidateNotionCountsCache,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  notionConfigured,
  notionCrmUrl,
  restartAgent,
  revealSecret,
} from './lib/ops.js';
import {
  provisionHaloCrm,
  searchNotionPages,
  validateNotionToken,
} from './lib/notionProvision.js';
import {
  crmBackend,
  listLeadsPage,
  patchLead,
  createLead,
  deleteLead,
  bulkPatchLeads,
  bulkDeleteLeads,
  supabaseConfigured,
} from './lib/crmApi.js';
import {
  resolveRequestTenant,
  loginWithPassword,
  createSessionToken,
  setSessionCookie,
  clearSessionCookie,
  tenantPublic,
} from './lib/tenantAuth.js';
import { getTenantByEmail, countLeadsForWorkspace, createTenant, assertTrialAllowsNewLead } from './lib/tenants.js';
import { readEnvFile } from './lib/env.js';
import { ensureTenantRuntime, allocateWorkspaceId } from './lib/tenantRuntime.js';
import { browserLockStatus } from './lib/browserQueue.js';
import {
  createCheckoutSession,
  createBillingPortalSession,
  applyStripeWebhookEvent,
  stripePublicConfig,
} from './lib/stripeBilling.js';
import {
  provisionSupabaseCrm,
  readCrmSchemaSql,
} from './lib/supabaseProvision.js';
import {
  getSupabaseKeepaliveStatus,
  startSupabaseKeepaliveScheduler,
} from './lib/supabaseKeepalive.js';
import {
  handleTelegramWebhook,
  registerTelegramWebhook,
  getBotAvatarCached,
  warmBotAvatarCache,
  WAFFI_TELEGRAM_BOT_AVATAR_FALLBACK,
} from './lib/telegramBot.js';
import { buildAnalyticsSeries } from './lib/analytics.js';
import {
  appendRepairInput,
  ensureActiveRepairLink,
  readRepairState,
  repairContainerRunning,
  repairFramePath,
  startDashboardLinkedInLogin,
  startRepairWorkerSync,
} from './lib/sessionRepair.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import express from 'express';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT || 3080);

app.use(express.json({ limit: '2mb' }));

/** Telegram Bot API webhook — must not require dashboard Basic auth. */
app.post('/api/telegram/webhook/:secret?', async (req, res) => {
  const expected = (process.env.TELEGRAM_WEBHOOK_SECRET || '').trim();
  if (expected && req.params.secret !== expected) {
    return res.status(403).json({ ok: false });
  }
  try {
    await handleTelegramWebhook(req.body || {});
  } catch (e) {
    console.warn('[telegram] webhook:', e.message || e);
  }
  res.json({ ok: true });
});

/** Public .ics invite (Book a call) — reminders 1d / 1h / 10m. No auth. */
app.get('/api/calendar/invite.ics', async (req, res) => {
  try {
    const root = process.env.APP_ROOT || path.join(__dirname, '..');
    const { buildIcsInvite } = await import(
      pathToFileURL(path.join(root, 'googleCalendar.js')).href
    );
    const startUtc = String(req.query.s || '').trim();
    const title = String(req.query.t || 'Scheduled call').trim().slice(0, 200);
    const meet = String(req.query.m || '').trim().slice(0, 500);
    const desc = String(req.query.desc || '').trim().slice(0, 2000);
    const durationMinutes = Math.max(15, Math.min(Number(req.query.d) || 30, 180));
    if (!startUtc || Number.isNaN(Date.parse(startUtc))) {
      return res.status(400).type('text').send('Invalid start time');
    }
    const ics = buildIcsInvite({
      title: title || 'Scheduled call',
      startUtc,
      durationMinutes,
      description: desc || (meet ? `Join Google Meet:\n${meet}` : ''),
      location: meet,
    });
    if (!ics) return res.status(400).type('text').send('Could not build invite');
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="halo-call.ics"');
    res.send(ics);
  } catch (e) {
    res.status(500).type('text').send(e.message || 'error');
  }
});

function basicAuth(req, res, next) {
  const user = process.env.DASHBOARD_USER || 'admin';
  const pass = process.env.DASHBOARD_PASSWORD || '';
  if (!pass) {
    res.setHeader('X-Dashboard-Auth', 'open');
    return next();
  }
  const header = req.headers.authorization || '';
  if (!header.startsWith('Basic ')) {
    res.setHeader('WWW-Authenticate', 'Basic realm="H.A.L.O."');
    return res.status(401).send('Auth required');
  }
  const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
  const i = decoded.indexOf(':');
  const u = decoded.slice(0, i);
  const p = decoded.slice(i + 1);
  if (u !== user || p !== pass) {
    res.setHeader('WWW-Authenticate', 'Basic realm="H.A.L.O."');
    return res.status(401).send('Invalid credentials');
  }
  next();
}

/** Paths usable without Basic auth (cabinet login / landing / public APIs). */
function isPublicPath(req) {
  const p = req.path || '';
  if (
    p === '/login.html' ||
    p === '/landing.html' ||
    p === '/waffi-telegram-bot.png' ||
    p === '/waffi-logo.png' ||
    p === '/logo.svg'
  ) {
    return true;
  }
  if (p === '/login' || p === '/landing') return true;
  if (p.startsWith('/api/auth/')) return true;
  if (p === '/auth/register') return true;
  if (p.startsWith('/api/billing/webhook')) return true;
  if (p.startsWith('/api/telegram/webhook')) return true;
  if (p.startsWith('/api/calendar/')) return true;
  if (p === '/api/health') return true;
  if (p.startsWith('/repair')) return true;
  return false;
}

async function attachTenant(req, _res, next) {
  try {
    req.tenant = await resolveRequestTenant(req, readEnvFile());
  } catch (e) {
    console.warn('[auth] resolve tenant:', e.message);
    req.tenant = null;
  }
  next();
}

function requireTenant(req, res, next) {
  if (req.tenant?.workspaceId) return next();
  if (req.path.startsWith('/api/')) {
    return res.status(401).json({ ok: false, error: 'Sign in required', login: '/login.html' });
  }
  return res.redirect('/login.html');
}

app.use(async (req, res, next) => {
  if (isPublicPath(req)) return next();
  // Prefer cabinet session cookie; fall back to legacy Basic for WAFFi ops.
  try {
    const tenant = await resolveRequestTenant(req, readEnvFile());
    if (tenant) {
      req.tenant = tenant;
      return next();
    }
  } catch (e) {
    console.warn('[auth]', e.message);
  }
  return basicAuth(req, res, (err) => {
    if (err) return next(err);
    // After successful Basic, attach WAFFi tenant
    resolveRequestTenant(req, readEnvFile())
      .then((t) => {
        req.tenant = t;
        next();
      })
      .catch(next);
  });
});
app.use(attachTenant);
app.use(express.static(path.join(__dirname, 'public')));

app.post('/api/auth/login', async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim();
    const password = String(req.body?.password || '');
    const tenant = await loginWithPassword(email, password);
    const token = createSessionToken(tenant);
    setSessionCookie(res, token);
    const leads = await countLeadsForWorkspace(tenant.workspaceId).catch(() => 0);
    res.json({ ok: true, success: true, tenant: tenantPublic(tenant), leadCount: leads, dashboard_url: '/' });
  } catch (e) {
    res.status(401).json({ ok: false, success: false, error: e.message || 'Login failed', message: e.message || 'Login failed' });
  }
});

async function handleRegister(req, res) {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    const company = String(req.body?.company || '').trim();
    const displayName = String(req.body?.name || req.body?.displayName || '').trim();
    if (!email.includes('@')) throw new Error('Valid email required');
    if (password.length < 8) throw new Error('Password must be at least 8 characters');

    const existing = await getTenantByEmail(email);
    if (existing) throw new Error('An account with this email already exists. Sign in instead.');

    let workspaceId = allocateWorkspaceId(email);
    for (let i = 0; i < 3; i++) {
      try {
        const tenant = await createTenant({
          email,
          password,
          workspaceId,
          displayName: displayName || email.split('@')[0],
          company,
          role: 'user',
          subscriptionStatus: 'trial',
        });
        ensureTenantRuntime(tenant.workspaceId);
        const token = createSessionToken(tenant);
        setSessionCookie(res, token);
        return res.json({
          ok: true,
          success: true,
          tenant: tenantPublic(tenant),
          dashboard_url: '/',
          message: 'Account created',
        });
      } catch (e) {
        if (/duplicate|unique/i.test(e.message) && i < 2) {
          workspaceId = allocateWorkspaceId(email);
          continue;
        }
        throw e;
      }
    }
    throw new Error('Could not create account');
  } catch (e) {
    res.status(400).json({
      ok: false,
      success: false,
      error: e.message || 'Registration failed',
      message: e.message || 'Registration failed',
    });
  }
}

app.post('/api/auth/register', handleRegister);
app.post('/auth/register', handleRegister);
app.post('/api/auth/logout', (_req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

app.get('/api/auth/me', async (req, res) => {
  try {
    if (!req.tenant?.workspaceId) {
      return res.status(401).json({ ok: false, error: 'Not signed in' });
    }
    const full = await getTenantByEmail(req.tenant.email).catch(() => null);
    const leads = await countLeadsForWorkspace(req.tenant.workspaceId).catch(() => 0);
    const lock = browserLockStatus();
    res.json({
      ok: true,
      tenant: full ? tenantPublic(full) : tenantPublic(req.tenant),
      leadCount: leads,
      via: req.tenant.via || 'session',
      automation: lock.held
        ? { busy: true, owner: lock.owner, workspaceId: lock.workspaceId }
        : { busy: false },
      trialEnded:
        full &&
        full.subscriptionStatus !== 'active' &&
        leads >= (full.trialLeadLimit || 50),
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get('/login', (_req, res) => res.redirect('/login.html'));
app.get('/landing', (_req, res) => res.redirect('/landing.html'));

app.get('/api/billing/status', (req, res) => {
  res.json({ ok: true, ...stripePublicConfig(readEnvFile()) });
});

app.post('/api/billing/checkout', async (req, res) => {
  try {
    if (!req.tenant?.workspaceId) {
      return res.status(401).json({ ok: false, error: 'Sign in required' });
    }
    const full = await getTenantByEmail(req.tenant.email);
    if (!full) return res.status(404).json({ ok: false, error: 'Tenant not found' });
    // attach stripe ids if present in DB
    const { createClient } = await import('@supabase/supabase-js');
    const env = readEnvFile();
    const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });
    const { data } = await sb
      .from('halo_tenants')
      .select('stripe_customer_id')
      .eq('workspace_id', full.workspaceId)
      .maybeSingle();
    const tenant = {
      ...full,
      stripeCustomerId: data?.stripe_customer_id || '',
    };
    const out = await createCheckoutSession({ tenant, env });
    res.status(out.ok ? 200 : 400).json(out);
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

app.post('/api/billing/portal', async (req, res) => {
  try {
    if (!req.tenant?.workspaceId) {
      return res.status(401).json({ ok: false, error: 'Sign in required' });
    }
    const full = await getTenantByEmail(req.tenant.email);
    const env = readEnvFile();
    const { createClient } = await import('@supabase/supabase-js');
    const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });
    const { data } = await sb
      .from('halo_tenants')
      .select('stripe_customer_id')
      .eq('workspace_id', full.workspaceId)
      .maybeSingle();
    const out = await createBillingPortalSession({
      tenant: { ...full, stripeCustomerId: data?.stripe_customer_id || '' },
      env,
    });
    res.status(out.ok ? 200 : 400).json(out);
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

/** Stripe webhooks — public. Signature verify lands when STRIPE_WEBHOOK_SECRET + SDK are wired. */
app.post('/api/billing/webhook', async (req, res) => {
  try {
    const env = readEnvFile();
    const event = req.body && typeof req.body === 'object' ? req.body : {};
    const result = await applyStripeWebhookEvent(event, env);
    res.json(result);
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'outreach-dashboard' });
});

app.get('/api/settings', (_req, res) => {
  try {
    res.json({ ok: true, settings: buildSettingsView() });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post('/api/settings', (req, res) => {
  try {
    const settings = applyDashboardPatch(req.body || {});
    res.json({ ok: true, settings });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

/** Auto-save switches only (master / stages / channels) without full form submit */
app.post('/api/settings/switches', (req, res) => {
  try {
    const body = req.body || {};
    const patch = {};
    if (typeof body.masterEnabled === 'boolean') patch.masterEnabled = body.masterEnabled;
    if (typeof body.stageAEnabled === 'boolean') patch.stageAEnabled = body.stageAEnabled;
    if (typeof body.stageBEnabled === 'boolean') patch.stageBEnabled = body.stageBEnabled;
    if (body._masterSource === true) patch._masterSource = true;
    if (body.channels && typeof body.channels === 'object') patch.channels = body.channels;
    const settings = applyDashboardPatch(patch);
    res.json({ ok: true, settings });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

app.get('/api/notion/counts', async (req, res) => {
  try {
    const ws = req.tenant?.workspaceId;
    if (!ws) {
      return res.status(401).json({ ok: false, error: 'Sign in required', counts: {}, login: '/login.html' });
    }
    const data = await countNotionStatuses(ws);
    res.json({ ...data, crmUrl: notionCrmUrl() });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message, counts: {}, crmUrl: notionCrmUrl() });
  }
});

app.get('/api/notion/setup', (_req, res) => {
  res.json({ ok: true, configured: notionConfigured() });
});

app.post('/api/notion/validate', async (req, res) => {
  try {
    const token = String(req.body?.token || '').trim();
    const data = await validateNotionToken(token);
    res.json(data);
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

app.post('/api/notion/pages', async (req, res) => {
  try {
    const token = String(req.body?.token || '').trim();
    const query = String(req.body?.query || '').trim();
    const data = await searchNotionPages(token, { query });
    res.json(data);
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message, pages: [] });
  }
});

app.post('/api/notion/provision', async (req, res) => {
  try {
    if (notionConfigured()) {
      return res.status(409).json({
        ok: false,
        error: 'Notion is already configured. Edit credentials in Integrations if you need to change them.',
      });
    }
    const token = String(req.body?.token || '').trim();
    const parentPageId = String(req.body?.parentPageId || '').trim();
    const result = await provisionHaloCrm(token, parentPageId);
    invalidateNotionCountsCache();
    const settings = buildSettingsView();
    res.json({ ...result, settings });
  } catch (e) {
    const status = e.status === 404 ? 404 : 400;
    res.status(status).json({ ok: false, error: e.message });
  }
});

function requireSupabaseCrm(req, res, next) {
  if (crmBackend() !== 'supabase') {
    return res.status(400).json({ ok: false, error: 'In-app CRM requires CRM_BACKEND=supabase' });
  }
  if (!supabaseConfigured()) {
    return res.status(400).json({ ok: false, error: 'Supabase credentials missing' });
  }
  if (!req.tenant?.workspaceId) {
    return res.status(401).json({ ok: false, error: 'Sign in required', login: '/login.html' });
  }
  return next();
}

app.get('/api/crm/schema', (_req, res) => {
  try {
    res.json({ ok: true, sql: readCrmSchemaSql() });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get('/api/crm/leads', requireSupabaseCrm, async (req, res) => {
  try {
    const data = await listLeadsPage({
      status: String(req.query.status || '').trim() || undefined,
      q: String(req.query.q || '').trim() || undefined,
      page: Number(req.query.page) || 1,
      limit: Number(req.query.limit) || 50,
      workspaceId: req.tenant.workspaceId,
    });
    res.json(data);
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message, leads: [], total: 0 });
  }
});

app.post('/api/crm/leads', requireSupabaseCrm, async (req, res) => {
  try {
    await assertTrialAllowsNewLead(req.tenant.workspaceId);
    const lead = await createLead(req.body || {}, readEnvFile(), req.tenant.workspaceId);
    invalidateNotionCountsCache();
    res.json({ ok: true, lead });
  } catch (e) {
    const status = e.code === 'TRIAL_LIMIT' ? 402 : 400;
    res.status(status).json({ ok: false, error: e.message, code: e.code || undefined });
  }
});

app.patch('/api/crm/leads/:id', requireSupabaseCrm, async (req, res) => {
  try {
    const lead = await patchLead(req.params.id, req.body || {}, readEnvFile(), req.tenant.workspaceId);
    invalidateNotionCountsCache();
    res.json({ ok: true, lead });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

app.delete('/api/crm/leads/:id', requireSupabaseCrm, async (req, res) => {
  try {
    await deleteLead(req.params.id, readEnvFile(), req.tenant.workspaceId);
    invalidateNotionCountsCache();
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

app.post('/api/crm/leads/bulk', requireSupabaseCrm, async (req, res) => {
  try {
    const ids = req.body?.ids || [];
    const action = String(req.body?.action || '').trim();
    if (action === 'delete') {
      const result = await bulkDeleteLeads(ids, readEnvFile(), req.tenant.workspaceId);
      invalidateNotionCountsCache();
      return res.json(result);
    }
    if (action === 'status') {
      const status = String(req.body?.status || '').trim();
      const result = await bulkPatchLeads(ids, { status }, readEnvFile(), req.tenant.workspaceId);
      invalidateNotionCountsCache();
      return res.json(result);
    }
    res.status(400).json({ ok: false, error: 'Unknown bulk action' });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

app.post('/api/supabase/validate', async (req, res) => {
  try {
    const url = String(req.body?.url || '').trim();
    const serviceRoleKey = String(req.body?.serviceRoleKey || '').trim();
    const { validateSupabaseCredentials } = await import('./lib/crmApi.js');
    await validateSupabaseCredentials(url, serviceRoleKey);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

app.post('/api/supabase/provision', async (req, res) => {
  try {
    const url = String(req.body?.url || '').trim();
    const serviceRoleKey = String(req.body?.serviceRoleKey || '').trim();
    const workspaceId = String(req.body?.workspaceId || 'default').trim() || 'default';
    const result = await provisionSupabaseCrm(url, serviceRoleKey, { workspaceId });
    invalidateNotionCountsCache();
    const settings = buildSettingsView();
    res.json({ ...result, settings });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

app.get('/api/analytics/series', (req, res) => {
  try {
    const range = String(req.query.range || '30d');
    const tab = String(req.query.tab || 'pipeline');
    res.json(buildAnalyticsSeries({ range, tab }));
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get('/api/notifications', (_req, res) => {
  res.json(listNotifications());
});

app.post('/api/notifications/:id/read', (req, res) => {
  res.json(markNotificationRead(req.params.id));
});

app.post('/api/notifications/read-all', (_req, res) => {
  res.json(markAllNotificationsRead());
});

app.post('/api/secrets/reveal', (req, res) => {
  try {
    const key = String(req.body?.key || '');
    res.json(revealSecret(key));
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

app.post('/api/agent/restart', async (_req, res) => {
  const result = await restartAgent();
  res.status(result.ok ? 200 : 500).json(result);
});

/** LinkedIn remote session repair (screenshot remote control). */
app.get('/linkedin/repair', (req, res) => {
  // Legacy TG links → same Sign in surface as the dashboard LinkedIn page.
  const q = new URLSearchParams();
  q.set('page', 'linkedin');
  if (req.query?.token) q.set('repairToken', String(req.query.token));
  return res.redirect(302, `/?${q.toString()}`);
});

app.post('/api/linkedin/repair/start', (req, res) => {
  try {
    const token = String(req.body?.token || req.query.token || '');
    const st = readRepairState();
    if (!token || !st?.token || st.token !== token) {
      return res.status(403).json({ ok: false, error: 'Invalid repair token' });
    }
    const result = startRepairWorkerSync(token);
    res.json({ ok: true, ...result, state: readRepairState() });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get('/api/linkedin/repair/status', (req, res) => {
  const token = String(req.query.token || '');
  const st = readRepairState();
  if (!token || !st?.token || st.token !== token) {
    return res.status(403).json({ ok: false, error: 'Invalid repair token' });
  }
  res.json({ ok: true, ...st });
});

app.get('/api/linkedin/repair/frame', (req, res) => {
  const token = String(req.query.token || '');
  const st = readRepairState();
  if (!token || !st?.token || st.token !== token) {
    return res.status(403).send('forbidden');
  }
  const frame = repairFramePath();
  if (!fs.existsSync(frame)) {
    res.status(404).send('no frame yet');
    return;
  }
  res.setHeader('Cache-Control', 'no-store');
  res.type('jpeg');
  fs.createReadStream(frame).pipe(res);
});

app.post('/api/linkedin/repair/input', (req, res) => {
  try {
    const { token, ...event } = req.body || {};
    appendRepairInput(String(token || ''), event);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

app.get('/api/linkedin/repair/link', (_req, res) => {
  try {
    const link = ensureActiveRepairLink('manual');
    res.json({ ok: true, ...link });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

/** LinkedIn Session tile on dashboard — email/password → remote Chromium login. */
app.post('/api/linkedin/session/login', (req, res) => {
  try {
    const { username, password } = req.body || {};
    const result = startDashboardLinkedInLogin(username, password);
    res.json(result);
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

app.get('/api/linkedin/session/login/status', (req, res) => {
  const token = String(req.query.token || '');
  const st = readRepairState();
  if (!token || !st?.token || st.token !== token) {
    return res.status(403).json({ ok: false, error: 'Invalid repair token' });
  }
  const workerAlive = repairContainerRunning();
  const stale =
    (st.status === 'running' || st.status === 'starting') &&
    !workerAlive &&
    !st.liAtCaptured;
  res.json({ ok: true, workerAlive, stale, ...st });
});

app.get('/api/supabase/keepalive', (_req, res) => {
  try {
    res.json({ ok: true, keepalive: getSupabaseKeepaliveStatus() });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get('/api/telegram/bot-avatar', async (_req, res) => {
  try {
    const img = await getBotAvatarCached();
    if (img?.buffer) {
      res.set('Cache-Control', 'public, max-age=3600');
      return res.type(img.contentType || 'image/jpeg').send(img.buffer);
    }
  } catch (e) {
    console.warn('[telegram] bot-avatar route:', e.message || e);
  }
  res.redirect(WAFFI_TELEGRAM_BOT_AVATAR_FALLBACK);
});

app.get('/regions/catalog.js', async (_req, res) => {
  try {
    const root = process.env.APP_ROOT || path.join(__dirname, '..');
    const mod = await import(pathToFileURL(path.join(root, 'regionsGeo.js')).href);
    res.type('application/javascript');
    res.set('Cache-Control', 'public, max-age=300');
    res.send(
      `window.HALO_REGIONS=${JSON.stringify({
        groups: mod.PORTRAIT_REGION_GROUPS,
        aliases: mod.REGION_ALIASES,
      })};`
    );
  } catch (e) {
    console.error('regions catalog:', e.message);
    res.type('application/javascript');
    res.send('window.HALO_REGIONS=window.HALO_REGIONS||{};');
  }
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`outreach-dashboard listening on :${PORT}`);
  startSupabaseKeepaliveScheduler();
  registerTelegramWebhook().catch((e) => console.warn('[telegram] webhook init:', e.message || e));
  warmBotAvatarCache().catch((e) => console.warn('[telegram] avatar warm:', e.message || e));
});
