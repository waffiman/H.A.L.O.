/**
 * Token-based password reset. Passwords are scrypt hashes and cannot be revealed.
 * Delivery: optional RESEND_API_KEY email, else Telegram notify chat when configured.
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { APP_ROOT, readEnvFile } from './env.js';
import { getTenantByEmail, hashPassword } from './tenants.js';
import { addNotification } from './notifications.js';

const STORE = () => path.join(APP_ROOT, 'password_resets.json');
const TTL_MS = 60 * 60 * 1000;

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

async function deliverResetLink(email, link, env) {
  const resend = (env.RESEND_API_KEY || '').trim();
  const from = (env.RESEND_FROM || 'HALO <onboarding@resend.dev>').trim();
  if (resend) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resend}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [email],
        subject: 'Reset your HALO password',
        text: `Open this link within one hour to set a new password:\n\n${link}\n`,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Resend ${res.status}: ${body.slice(0, 160)}`);
    }
    return 'email';
  }
  addNotification({
    type: 'auth',
    key: `password_reset:${email}`,
    title: 'Password reset requested',
    message: `Reset link for ${email}: ${link}`,
    once: false,
  });
  return 'notification';
}

export async function requestPasswordReset(email, { origin = '' } = {}) {
  const env = readEnvFile();
  const clean = String(email || '').trim().toLowerCase();
  // Always look successful — do not reveal whether the email exists.
  if (!clean || !clean.includes('@')) return { ok: true };
  const tenant = await getTenantByEmail(clean, env).catch(() => null);
  if (!tenant) return { ok: true };

  const token = crypto.randomBytes(24).toString('base64url');
  const data = prune(loadStore());
  data.items.push({
    email: clean,
    workspaceId: tenant.workspaceId,
    tokenHash: crypto.createHash('sha256').update(token).digest('hex'),
    expiresAt: new Date(Date.now() + TTL_MS).toISOString(),
  });
  saveStore(data);

  const base = String(origin || env.PUBLIC_DASHBOARD_URL || 'http://31.70.101.111').replace(/\/$/, '');
  const link = `${base}/reset.html?token=${encodeURIComponent(token)}`;
  try {
    await deliverResetLink(clean, link, env);
  } catch (e) {
    console.error('Password reset delivery:', e.message);
  }
  return { ok: true };
}

export async function completePasswordReset(token, newPassword) {
  const env = readEnvFile();
  const raw = String(token || '').trim();
  const pass = String(newPassword || '');
  if (!raw || pass.length < 8) throw new Error('Password must be at least 8 characters');
  const hash = crypto.createHash('sha256').update(raw).digest('hex');
  const data = prune(loadStore());
  const idx = data.items.findIndex((item) => item.tokenHash === hash);
  if (idx < 0) throw new Error('Reset link is invalid or expired');
  const item = data.items[idx];
  data.items.splice(idx, 1);
  saveStore(data);

  const { createClient } = await import('@supabase/supabase-js');
  const { invalidateTenantCache } = await import('./tenants.js');
  const url = (env.SUPABASE_URL || '').trim();
  const key = (env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!url || !key) throw new Error('Password reset is unavailable');
  const sb = createClient(url, key, { auth: { persistSession: false } });
  const { error } = await sb
    .from('halo_tenants')
    .update({ password_hash: hashPassword(pass), updated_at: new Date().toISOString() })
    .eq('email', item.email);
  if (error) throw new Error(error.message);
  invalidateTenantCache(item.email);
  return { ok: true, email: item.email };
}
