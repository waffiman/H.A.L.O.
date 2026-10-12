/**
 * Signup email verification (link + 6-digit code). Requires RESEND_API_KEY in production.
 * Pending signups live in APP_ROOT/email_verifications.json until confirmed — no tenant row yet.
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { APP_ROOT, readEnvFile } from './env.js';
import { createTenant, getTenantByEmail, invalidateTenantCache } from './tenants.js';
import { ensureTenantRuntime } from './tenantRuntime.js';
import { addNotification } from './notifications.js';

const STORE = () => path.join(APP_ROOT, 'email_verifications.json');
const TTL_MS = 24 * 60 * 60 * 1000;

function loadStore() {
  try {
    if (!fs.existsSync(STORE())) return { items: [] };
    return JSON.parse(fs.readFileSync(STORE(), 'utf8'));
  } catch {
    return { items: [] };
  }
}

function saveStore(data) {
  fs.mkdirSync(path.dirname(STORE()), { recursive: true });
  fs.writeFileSync(STORE(), JSON.stringify(data, null, 2));
}

function prune(data) {
  const now = Date.now();
  data.items = (data.items || []).filter((item) => Date.parse(item.expiresAt || 0) > now);
  return data;
}

async function sendMail({ to, subject, text }, env) {
  const resend = (env.RESEND_API_KEY || '').trim();
  const from = (env.RESEND_FROM || 'HALO <onboarding@resend.dev>').trim();
  if (!resend) {
    if (env.EMAIL_VERIFY_ALLOW_NOTIFY_FALLBACK === '1') {
      addNotification({
        type: 'auth',
        key: `email_verify:${to}`,
        title: 'Email verification (fallback)',
        message: `${subject}\n\n${text}`,
        once: false,
      });
      return 'notification';
    }
    throw new Error('Email delivery is not configured (set RESEND_API_KEY)');
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resend}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to: [to], subject, text }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend ${res.status}: ${body.slice(0, 160)}`);
  }
  return 'email';
}

function sixDigitCode() {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}

/**
 * Start signup verification. Does not create a tenant until confirmed.
 */
export async function startEmailVerification(
  { email, password, displayName = '', company = '', workspaceId },
  { origin = '' } = {}
) {
  const env = readEnvFile();
  const clean = String(email || '').trim().toLowerCase();
  if (!clean.includes('@')) throw new Error('Valid email required');
  if (String(password || '').length < 8) throw new Error('Password must be at least 8 characters');

  const existing = await getTenantByEmail(clean, env).catch(() => null);
  if (existing) throw new Error('An account with this email already exists. Sign in instead.');

  const token = crypto.randomBytes(24).toString('base64url');
  const code = sixDigitCode();
  const data = prune(loadStore());
  data.items = data.items.filter((item) => item.email !== clean);
  const { hashPassword } = await import('./tenants.js');
  data.items.push({
    email: clean,
    passwordStored: hashPassword(password),
    displayName: String(displayName || '').trim(),
    company: String(company || '').trim(),
    workspaceId: String(workspaceId || '').trim(),
    tokenHash: crypto.createHash('sha256').update(token).digest('hex'),
    codeHash: crypto.createHash('sha256').update(code).digest('hex'),
    expiresAt: new Date(Date.now() + TTL_MS).toISOString(),
  });
  saveStore(data);

  const base = String(env.PUBLIC_DASHBOARD_URL || origin || '').replace(/\/$/, '');
  if (!base) throw new Error('PUBLIC_DASHBOARD_URL is required for email verification links');
  const link = `${base}/verify.html?token=${encodeURIComponent(token)}`;
  await sendMail(
    {
      to: clean,
      subject: 'Verify your HALO email',
      text:
        `Confirm your HALO account.\n\n` +
        `Open this link (valid 24h):\n${link}\n\n` +
        `Or enter this code on the verification page: ${code}\n`,
    },
    env
  );
  return { ok: true, email: clean, needsVerify: true };
}

async function consumePending(matcher) {
  const data = prune(loadStore());
  const idx = data.items.findIndex(matcher);
  if (idx < 0) throw new Error('Verification link or code is invalid or expired');
  const item = data.items[idx];
  data.items.splice(idx, 1);
  saveStore(data);
  return item;
}

async function finishPending(item) {
  const env = readEnvFile();
  const again = await getTenantByEmail(item.email, env).catch(() => null);
  if (again) throw new Error('An account with this email already exists. Sign in instead.');

  let workspaceId = item.workspaceId;
  let tenant = null;
  for (let i = 0; i < 3; i++) {
    try {
      // createTenant hashes again — pass a temporary password then overwrite hash.
      const tempPass = crypto.randomBytes(16).toString('base64url') + 'Aa1!';
      tenant = await createTenant(
        {
          email: item.email,
          password: tempPass,
          workspaceId,
          displayName: item.displayName || item.email.split('@')[0],
          company: item.company || '',
          role: 'owner',
          subscriptionStatus: 'trial',
        },
        env
      );
      break;
    } catch (e) {
      if (/duplicate|unique/i.test(e.message) && i < 2) {
        workspaceId = `${workspaceId}-${crypto.randomBytes(2).toString('hex')}`;
        continue;
      }
      throw e;
    }
  }
  if (!tenant) throw new Error('Could not create account');

  const { createClient } = await import('@supabase/supabase-js');
  const url = (env.SUPABASE_URL || '').trim();
  const key = (env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  const sb = createClient(url, key, { auth: { persistSession: false } });
  const patch = {
    password_hash: item.passwordStored,
    email_verified: true,
    email_verified_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  let { error } = await sb.from('halo_tenants').update(patch).eq('email', item.email);
  if (error && /email_verified/i.test(error.message || '')) {
    // Column not migrated yet — still safe: tenant is only created after verify.
    ({ error } = await sb
      .from('halo_tenants')
      .update({ password_hash: item.passwordStored, updated_at: patch.updated_at })
      .eq('email', item.email));
  }
  if (error) throw new Error(error.message);
  invalidateTenantCache(item.email);
  ensureTenantRuntime(tenant.workspaceId);
  return getTenantByEmail(item.email, env);
}

export async function confirmEmailVerification({ token = '', code = '', email = '' } = {}) {
  const rawToken = String(token || '').trim();
  const rawCode = String(code || '').replace(/\D/g, '');
  const cleanEmail = String(email || '').trim().toLowerCase();

  let item;
  if (rawToken) {
    const hash = crypto.createHash('sha256').update(rawToken).digest('hex');
    item = await consumePending((row) => row.tokenHash === hash);
  } else if (rawCode.length === 6 && cleanEmail.includes('@')) {
    const hash = crypto.createHash('sha256').update(rawCode).digest('hex');
    item = await consumePending((row) => row.email === cleanEmail && row.codeHash === hash);
  } else {
    throw new Error('Provide the verification link token, or email + 6-digit code');
  }
  return finishPending(item);
}

export function tenantEmailVerified(rowOrTenant) {
  if (!rowOrTenant) return false;
  if (rowOrTenant.email_verified === true || rowOrTenant.emailVerified === true) return true;
  // Pre-migration rows may omit the column — treat missing as verified for WAFFi continuity.
  if (rowOrTenant.email_verified == null && rowOrTenant.emailVerified == null) return true;
  return false;
}
