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
  ensureSessionSecret,
} from './lib/tenantAuth.js';
import { getTenantByEmail, countLeadsForWorkspace, createTenant, assertTrialAllowsNewLead, waffiWorkspaceId } from './lib/tenants.js';
import { readEnvFile } from './lib/env.js';
import { ensureTenantRuntime, allocateWorkspaceId } from './lib/tenantRuntime.js';
import { browserLockStatus } from './lib/browserQueue.js';
import {
  createCheckoutSession,
  createBillingPortalSession,
  applyStripeWebhookEvent,
  stripePublicConfig,
  verifyStripeSignature,
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
  startTenantOrchestrator,
  tenantOrchestratorStatus,
  listLinkedInCabinets,
  MAX_LINKEDIN_CABINETS,
} from './lib/tenantOrchestrator.js';
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
import {
  listMessages,
  sendMessage,
  markUserSupportRead,
  markStaffSupportRead,
  getUserUnreadSupport,
  flagTenantError,
  attachSupportRealtime,
  isSupportStaff,
  isWaffiAdmin,
  getAdminOverview,
  deleteSupportMessage,
  deleteCabinets,
  getSupportAttachment,
  MAX_SUPPORT_IMAGE_BYTES,
} from './lib/supportChat.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import express from 'express';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT || 3080);

/**
 * Stripe webhook — MUST be registered before express.json() so the signature is
 * verified against the exact bytes Stripe signed. Public by design (Stripe is
 * unauthenticated), so the signature IS the authentication: without a verified
 * signature anyone could POST a checkout.session.completed and mark any
 * workspace paid. Fails closed when STRIPE_WEBHOOK_SECRET is unset.
 */
app.post(
  '/api/billing/webhook',
  express.raw({ type: '*/*', limit: '1mb' }),
  async (req, res) => {
    try {
      const env = readEnvFile();
      const secret = (env.STRIPE_WEBHOOK_SECRET || process.env.STRIPE_WEBHOOK_SECRET || '').trim();
      if (!secret) {
        console.warn('[billing] webhook rejected — STRIPE_WEBHOOK_SECRET not configured');
        return res.status(503).json({ ok: false, error: 'Webhook not configured' });
      }
      const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from(String(req.body || ''), 'utf8');
      const verdict = verifyStripeSignature(raw, req.headers['stripe-signature'], secret);
      if (!verdict.ok) {
        console.warn('[billing] webhook rejected —', verdict.error);
        return res.status(400).json({ ok: false, error: 'Invalid signature' });
      }
      let event;
      try {
        event = JSON.parse(raw.toString('utf8'));
      } catch {
        return res.status(400).json({ ok: false, error: 'Invalid JSON' });
      }
      const result = await applyStripeWebhookEvent(event, env);
      res.json(result);
    } catch (e) {
      console.warn('[billing] webhook error:', e.message);
      res.status(400).json({ ok: false, error: e.message });
    }
  }
);

app.use(express.json({ limit: '4mb' }));

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
  // Login/register/logout are public; /api/auth/me must still resolve the session.
  if (p === '/api/auth/login' || p === '/api/auth/register' || p === '/api/auth/logout') return true;
  if (p === '/auth/register') return true;
  if (p.startsWith('/api/billing/webhook')) return true;
  if (p.startsWith('/api/telegram/webhook')) return true;
  if (p.startsWith('/api/calendar/')) return true;
  if (p === '/api/health') return true;
  if (p.startsWith('/repair')) return true;
  if (p === '/marketing' || p.startsWith('/marketing/')) return true;
  return false;
}

/**
 * Minimal fixed-window rate limiter (no new dependency — the dashboard image
 * ships only express + supabase-js). Keyed per client IP per bucket.
 */
const rateBuckets = new Map();

function rateLimit({ bucket, limit, windowMs }) {
  return (req, res, next) => {
    const ip =
      (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
      req.socket?.remoteAddress ||
      'unknown';
    const key = `${bucket}:${ip}`;
    const now = Date.now();
    let entry = rateBuckets.get(key);
    if (!entry || now >= entry.resetAt) {
      entry = { count: 0, resetAt: now + windowMs };
      rateBuckets.set(key, entry);
    }
    entry.count += 1;
    if (entry.count > limit) {
      const retryAfter = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
      res.setHeader('Retry-After', String(retryAfter));
      return res.status(429).json({
        ok: false,
        success: false,
        error: 'Too many attempts. Try again shortly.',
        message: 'Too many attempts. Try again shortly.',
      });
    }
    return next();
  };
}

// Bound memory: drop expired buckets periodically.
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateBuckets) {
    if (now >= entry.resetAt) rateBuckets.delete(key);
  }
}, 60000).unref();

const loginLimiter = rateLimit({ bucket: 'login', limit: 10, windowMs: 15 * 60 * 1000 });
const registerLimiter = rateLimit({ bucket: 'register', limit: 5, windowMs: 60 * 60 * 1000 });

/**
 * @param {object} req
 * @param {object} res
 * @param {{ basicAvailable?: boolean }} opts when Basic auth is configured, a
 *   browser navigation must get 401 + WWW-Authenticate so Chrome shows its
 *   credential prompt. A 302 with that header is ignored by browsers, which
 *   would leave WAFFi ops with no way in at all.
 */
function denyUnauthenticated(req, res, { basicAvailable = false } = {}) {
  if (req.path.startsWith('/api/')) {
    return res.status(401).json({ ok: false, error: 'Sign in required', login: '/login.html' });
  }
  if (basicAvailable) {
    res.setHeader('WWW-Authenticate', 'Basic realm="H.A.L.O."');
    return res
      .status(401)
      .type('html')
      .send(
        '<!doctype html><meta charset="utf-8"><title>H.A.L.O. — sign in</title>' +
          '<body style="font:14px system-ui;background:#0b0f14;color:#c9d4e0;padding:3rem">' +
          '<h1 style="font-size:1.1rem">Sign in required</h1>' +
          '<p>Operator access uses HTTP Basic auth (DASHBOARD_USER / DASHBOARD_PASSWORD).</p>' +
          '<p>Cabinet accounts sign in at <a style="color:#4ade80" href="/login.html">/login.html</a>.</p>' +
          '</body>'
      );
  }
  return res.redirect('/login.html');
}

/**
 * Single auth gate. resolveRequestTenant() handles BOTH the cabinet session
 * cookie and the legacy Basic credentials, so it is called exactly once per
 * request — it used to run two or three times, each a Supabase round-trip, and
 * it ran for every static asset too.
 */
/**
 * Resolve cabinet session/Basic on every request (including public paths like
 * /api/auth/me). Only enforce login for non-public routes.
 */
app.use(async (req, res, next) => {
  try {
    req.tenant = await resolveRequestTenant(req, readEnvFile());
  } catch (e) {
    console.warn('[auth]', e.message);
    req.tenant = null;
  }
  if (isPublicPath(req)) return next();
  if (req.tenant?.workspaceId) return next();
  // Fail closed. Previously an unset DASHBOARD_PASSWORD made basicAuth call
  // next() with 'X-Dashboard-Auth: open', leaving the whole dashboard public.
  const env = readEnvFile();
  const pass = (env.DASHBOARD_PASSWORD || process.env.DASHBOARD_PASSWORD || '').trim();
  return denyUnauthenticated(req, res, { basicAvailable: Boolean(pass) });
});

/** Global config, secrets, and agent control are owner-only. */
function requireOwner(req, res, next) {
  if (!req.tenant?.workspaceId) return denyUnauthenticated(req, res);
  if (req.tenant.role !== 'owner') {
    return res.status(403).json({
      ok: false,
      error: 'Owner access required',
      code: 'OWNER_ONLY',
    });
  }
  return next();
}

/**
 * A cabinet's own Brain, prompts, stage flags, LinkedIn session and
 * notifications all resolve under tenantPaths(workspaceId), so any signed-in
 * cabinet account uses its own data — not WAFFi's.
 * requireOwner stays only for platform-shared ops (secrets, CRM provision, agent restart).
 * LinkedIn Sign in + analytics are available to every authenticated cabinet.
 */
function redactSettingsForTenant(view) {
  return {
    ...view,
    integrations: [],
    integrationsHasProblem: false,
    brainLlmHealth: {},
    notionCrmUrl: '',
    supabaseUrl: '',
    supabaseDashboardUrl: '',
    supabaseKeepalive: null,
    apifyActor: '',
    envPath: '',
    appRoot: '',
  };
}

app.use(express.static(path.join(__dirname, 'public'), { maxAge: '5m', etag: true }));

// Public marketing site (../marketing), built by Vite into marketing/dist.
// Static assets are content-hashed, so they cache hard; index.html must not.
// Absent build output is not fatal — the dashboard runs without it.
const marketingDist = path.join(__dirname, '..', 'marketing', 'dist');
if (fs.existsSync(marketingDist)) {
  app.use('/marketing', express.static(marketingDist, { maxAge: '1y', etag: true, index: false }));
  // Client-side routes (/marketing/pricing, ...) fall back to the SPA shell.
  app.get('/marketing/*', (_req, res) => {
    res.sendFile(path.join(marketingDist, 'index.html'), { maxAge: 0 });
  });
}

app.post('/api/auth/login', loginLimiter, async (req, res) => {
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
          role: 'owner',
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

app.post('/api/auth/register', registerLimiter, handleRegister);
app.post('/auth/register', registerLimiter, handleRegister);
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
      isWaffiAdmin: isWaffiAdmin(full || req.tenant),
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

function waffiWorkspaceIdFallback() {
  return waffiWorkspaceId();
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'outreach-dashboard' });
});

app.get('/api/settings', async (req, res) => {
  try {
    const ws = req.tenant?.workspaceId || waffiWorkspaceIdFallback();
    const view = await buildSettingsView(ws);
    const isOwner = req.tenant?.role === 'owner';
    res.json({ ok: true, settings: isOwner ? view : redactSettingsForTenant(view) });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

/**
 * Cabinet-scoped: Brain, prompts, stage flags and cookies all resolve under
 * tenantPaths(ws), so a tenant edits only its own. applyDashboardPatch refuses
 * platform-shared config (integration secrets, Notion CRM URL) unless isOwner.
 */
app.post('/api/settings', async (req, res) => {
  try {
    if (!req.tenant?.workspaceId) return denyUnauthenticated(req, res);
    const ws = req.tenant.workspaceId;
    const settings = await applyDashboardPatch(req.body || {}, ws, {
      isOwner: req.tenant.role === 'owner',
    });
    res.json({ ok: true, settings });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

/** Auto-save switches only (master / stages / channels) without full form submit */
app.post('/api/settings/switches', async (req, res) => {
  try {
    const body = req.body || {};
    const patch = {};
    if (typeof body.masterEnabled === 'boolean') patch.masterEnabled = body.masterEnabled;
    if (typeof body.stageAEnabled === 'boolean') patch.stageAEnabled = body.stageAEnabled;
    if (typeof body.stageBEnabled === 'boolean') patch.stageBEnabled = body.stageBEnabled;
    if (body._masterSource === true) patch._masterSource = true;
    if (body.channels && typeof body.channels === 'object') patch.channels = body.channels;
    if (!req.tenant?.workspaceId) return denyUnauthenticated(req, res);
    const ws = req.tenant.workspaceId;
    const settings = await applyDashboardPatch(patch, ws, {
      isOwner: req.tenant.role === 'owner',
    });
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

app.get('/api/notion/setup', requireOwner, (_req, res) => {
  res.json({ ok: true, configured: notionConfigured() });
});

app.post('/api/notion/validate', requireOwner, async (req, res) => {
  try {
    const token = String(req.body?.token || '').trim();
    const data = await validateNotionToken(token);
    res.json(data);
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

app.post('/api/notion/pages', requireOwner, async (req, res) => {
  try {
    const token = String(req.body?.token || '').trim();
    const query = String(req.body?.query || '').trim();
    const data = await searchNotionPages(token, { query });
    res.json(data);
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message, pages: [] });
  }
});

app.post('/api/notion/provision', requireOwner, async (req, res) => {
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
    const settings = await buildSettingsView();
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

app.post('/api/supabase/validate', requireOwner, async (req, res) => {
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

app.post('/api/supabase/provision', requireOwner, async (req, res) => {
  try {
    const url = String(req.body?.url || '').trim();
    const serviceRoleKey = String(req.body?.serviceRoleKey || '').trim();
    const workspaceId = String(req.body?.workspaceId || 'default').trim() || 'default';
    const result = await provisionSupabaseCrm(url, serviceRoleKey, { workspaceId });
    invalidateNotionCountsCache();
    const settings = await buildSettingsView();
    res.json({ ...result, settings });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

app.get('/api/analytics/series', (req, res) => {
  try {
    if (!req.tenant?.workspaceId) return denyUnauthenticated(req, res);
    const range = String(req.query.range || '30d');
    const tab = String(req.query.tab || 'pipeline');
    const from = req.query.from != null ? String(req.query.from) : '';
    const to = req.query.to != null ? String(req.query.to) : '';
    const bucket = req.query.bucket != null ? String(req.query.bucket) : 'auto';
    const workspaceId = req.tenant.workspaceId;
    res.json(buildAnalyticsSeries({ range, tab, from, to, bucket, workspaceId }));
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get('/api/notifications', (req, res) => {
  const ws = req.tenant?.workspaceId || waffiWorkspaceIdFallback();
  res.json(listNotifications(ws));
});

app.post('/api/notifications/:id/read', (req, res) => {
  const ws = req.tenant?.workspaceId || waffiWorkspaceIdFallback();
  res.json(markNotificationRead(req.params.id, ws));
});

app.post('/api/notifications/read-all', (req, res) => {
  const ws = req.tenant?.workspaceId || waffiWorkspaceIdFallback();
  res.json(markAllNotificationsRead(ws));
});

function resolveSupportWorkspace(req) {
  const own = String(req.tenant?.workspaceId || '').trim();
  const requested = String(req.query?.workspaceId || req.body?.workspaceId || '').trim();
  const forceSupport =
    req.body?.asSupport === true ||
    req.body?.asSupport === '1' ||
    String(req.query?.asSupport || '') === '1';
  if (!own) return { error: 'Sign in required', status: 401 };

  // FAB / user chat: no workspaceId → always post as the signed-in user
  if (!requested) return { workspaceId: own, asSupport: false };

  // Admin panel always sends workspaceId (including WAFFi's own cabinet).
  // Replies must be author=support even when requested === own.
  if (requested === own) {
    if (forceSupport || isWaffiAdmin(req.tenant)) {
      if (!isWaffiAdmin(req.tenant)) {
        return { error: 'Only WAFFi admin can reply as support', status: 403 };
      }
      return { workspaceId: own, asSupport: true };
    }
    return { workspaceId: own, asSupport: false };
  }

  if (!isWaffiAdmin(req.tenant)) {
    return { error: 'Only WAFFi admin can open another cabinet chat', status: 403 };
  }
  return { workspaceId: requested, asSupport: true };
}

function requireWaffiAdmin(req) {
  if (!req.tenant?.workspaceId) return { error: 'Sign in required', status: 401 };
  if (!isWaffiAdmin(req.tenant)) {
    return { error: 'Admin panel is only available on the WAFFi cabinet', status: 403 };
  }
  return null;
}

app.get('/api/admin/overview', async (req, res) => {
  try {
    const denied = requireWaffiAdmin(req);
    if (denied) return res.status(denied.status).json({ ok: false, error: denied.error });
    const overview = await getAdminOverview();
    res.json(overview);
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post('/api/admin/support/mark-read', async (req, res) => {
  try {
    const denied = requireWaffiAdmin(req);
    if (denied) return res.status(denied.status).json({ ok: false, error: denied.error });
    const ws = String(req.body?.workspaceId || '').trim();
    if (!ws) return res.status(400).json({ ok: false, error: 'workspaceId required' });
    await markStaffSupportRead(ws);
    res.json({ ok: true, workspaceId: ws });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.delete('/api/admin/support/messages/:id', async (req, res) => {
  try {
    const denied = requireWaffiAdmin(req);
    if (denied) return res.status(denied.status).json({ ok: false, error: denied.error });
    const out = await deleteSupportMessage(req.params.id);
    res.json(out);
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

app.post('/api/admin/cabinets/delete', async (req, res) => {
  try {
    const denied = requireWaffiAdmin(req);
    if (denied) return res.status(denied.status).json({ ok: false, error: denied.error });
    const ids = Array.isArray(req.body?.workspaceIds) ? req.body.workspaceIds : [];
    const out = await deleteCabinets(ids);
    res.json(out);
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

app.get('/api/support/status', async (req, res) => {
  try {
    if (!req.tenant?.workspaceId) {
      return res.status(401).json({ ok: false, error: 'Sign in required' });
    }
    const unread = await getUserUnreadSupport(req.tenant.workspaceId);
    res.json({ ok: true, unreadFromSupport: unread });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get('/api/support/messages', async (req, res) => {
  try {
    const scope = resolveSupportWorkspace(req);
    if (scope.error) return res.status(scope.status).json({ ok: false, error: scope.error });
    const messages = await listMessages(scope.workspaceId);
    res.json({ ok: true, workspaceId: scope.workspaceId, messages });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post('/api/support/messages', async (req, res) => {
  try {
    const scope = resolveSupportWorkspace(req);
    if (scope.error) return res.status(scope.status).json({ ok: false, error: scope.error });
    const finalAuthor = scope.asSupport ? 'support' : 'user';
    const full = await getTenantByEmail(req.tenant.email).catch(() => null);
    const message = await sendMessage({
      workspaceId: scope.workspaceId,
      author: finalAuthor,
      body: req.body?.body,
      image: req.body?.image || null,
      tenantEmail: req.tenant.email,
      displayName: full?.displayName || req.tenant.email,
    });
    res.json({ ok: true, message, maxImageBytes: MAX_SUPPORT_IMAGE_BYTES });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

app.get('/api/support/attachment/:id', async (req, res) => {
  try {
    const scope = resolveSupportWorkspace(req);
    if (scope.error) return res.status(scope.status).json({ ok: false, error: scope.error });
    const file = await getSupportAttachment(req.params.id);
    if (file.workspaceId !== scope.workspaceId) {
      return res.status(403).json({ ok: false, error: 'Forbidden' });
    }
    res.setHeader('Content-Type', file.mime);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${String(file.name || 'image').replace(/"/g, '')}"`
    );
    res.send(file.buffer);
  } catch (e) {
    res.status(404).json({ ok: false, error: e.message });
  }
});

/** User opened chat — clear FAB red dot. */
app.post('/api/support/mark-read', async (req, res) => {
  try {
    if (!req.tenant?.workspaceId) {
      return res.status(401).json({ ok: false, error: 'Sign in required' });
    }
    await markUserSupportRead(req.tenant.workspaceId);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post('/api/support/report-error', async (req, res) => {
  try {
    if (!req.tenant?.workspaceId) {
      return res.status(401).json({ ok: false, error: 'Sign in required' });
    }
    let ws = req.tenant.workspaceId;
    if (req.body?.workspaceId && isSupportStaff(req.tenant)) {
      ws = String(req.body.workspaceId).trim() || ws;
    }
    const out = await flagTenantError(ws, {
      title: req.body?.title || 'Reported error',
      message: req.body?.message || '',
    });
    res.json(out);
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

/** Live chat updates — Realtime push while panel is open (no background poll). */
app.get('/api/support/stream', async (req, res) => {
  try {
    const scope = resolveSupportWorkspace(req);
    if (scope.error) return res.status(scope.status).json({ ok: false, error: scope.error });

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    if (typeof res.flushHeaders === 'function') res.flushHeaders();

    const messages = await listMessages(scope.workspaceId);
    res.write(`data: ${JSON.stringify({ type: 'snapshot', messages, workspaceId: scope.workspaceId })}\n\n`);

    const cleanup = attachSupportRealtime(scope.workspaceId, (evt) => {
      try {
        res.write(`data: ${JSON.stringify(evt)}\n\n`);
      } catch {
        /* closed */
      }
    });

    const heartbeat = setInterval(() => {
      try {
        res.write(`: ping\n\n`);
      } catch {
        /* closed */
      }
    }, 25000);

    const close = () => {
      clearInterval(heartbeat);
      cleanup();
      try {
        res.end();
      } catch {
        /* ignore */
      }
    };
    req.on('close', close);
    req.on('aborted', close);
  } catch (e) {
    if (!res.headersSent) res.status(500).json({ ok: false, error: e.message });
    else {
      try {
        res.write(`data: ${JSON.stringify({ type: 'error', error: e.message })}\n\n`);
        res.end();
      } catch {
        /* ignore */
      }
    }
  }
});

app.post('/api/secrets/reveal', requireOwner, (req, res) => {
  try {
    const key = String(req.body?.key || '');
    const out = revealSecret(key);
    res.status(out.ok ? 200 : 403).json(out);
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

app.post('/api/agent/restart', requireOwner, async (req, res) => {
  const ws = req.tenant?.workspaceId || waffiWorkspaceIdFallback();
  const result = await restartAgent(ws);
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

app.get('/api/linkedin/repair/link', (req, res) => {
  try {
    if (!req.tenant?.workspaceId) return denyUnauthenticated(req, res);
    const link = ensureActiveRepairLink('manual');
    res.json({ ok: true, ...link });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

/** LinkedIn Session tile on dashboard — email/password → remote Chromium login. */
app.post('/api/linkedin/session/login', (req, res) => {
  try {
    if (!req.tenant?.workspaceId) return denyUnauthenticated(req, res);
    const { username, password } = req.body || {};
    const ws = req.tenant.workspaceId;
    const result = startDashboardLinkedInLogin(username, password, ws);
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

app.get('/api/supabase/keepalive', requireOwner, (_req, res) => {
  try {
    res.json({ ok: true, keepalive: getSupabaseKeepaliveStatus() });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get('/api/tenants/linkedin', async (req, res) => {
  try {
    if (!req.tenant?.workspaceId) {
      return res.status(401).json({ ok: false, error: 'Sign in required' });
    }
    const cabinets = await listLinkedInCabinets();
    res.json({
      ok: true,
      maxCabinets: MAX_LINKEDIN_CABINETS,
      cabinets,
      orchestrator: tenantOrchestratorStatus(),
    });
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

const secretBoot = ensureSessionSecret();
if (secretBoot.created) {
  console.warn('[auth] generated a new HALO_SESSION_SECRET and wrote it to .env — existing sessions are invalidated.');
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`outreach-dashboard listening on :${PORT}`);
  startSupabaseKeepaliveScheduler();
  startTenantOrchestrator();
  registerTelegramWebhook().catch((e) => console.warn('[telegram] webhook init:', e.message || e));
  warmBotAvatarCache().catch((e) => console.warn('[telegram] avatar warm:', e.message || e));
});
