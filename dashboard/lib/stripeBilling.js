/**
 * Stripe billing stubs — activate when STRIPE_* env vars are set.
 * Env:
 *   STRIPE_SECRET_KEY
 *   STRIPE_WEBHOOK_SECRET
 *   STRIPE_PRICE_ID          (monthly subscription price)
 *   STRIPE_SUCCESS_URL       (optional, default {public}/?billing=success)
 *   STRIPE_CANCEL_URL        (optional, default {public}/?billing=cancel)
 */
import crypto from 'crypto';
import { readEnvFile } from './env.js';
import { invalidateTenantCache } from './tenants.js';
import { createClient } from '@supabase/supabase-js';

export function stripeConfigured(env = readEnvFile()) {
  return Boolean(
    (env.STRIPE_SECRET_KEY || '').trim() && (env.STRIPE_PRICE_ID || '').trim()
  );
}

function sb(env = readEnvFile()) {
  const url = (env.SUPABASE_URL || '').trim();
  const key = (env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!url || !key) throw new Error('Supabase credentials missing');
  return createClient(url, key, { auth: { persistSession: false } });
}

function publicBase(env = readEnvFile()) {
  return (
    env.DASHBOARD_PUBLIC_URL ||
    env.PUBLIC_DASHBOARD_URL ||
    env.HALO_PUBLIC_URL ||
    ''
  ).replace(/\/$/, '');
}

async function stripeRequest(path, body, env = readEnvFile()) {
  const key = (env.STRIPE_SECRET_KEY || '').trim();
  if (!key) throw new Error('STRIPE_SECRET_KEY not set');
  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(body).toString(),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || `Stripe error ${res.status}`);
  return data;
}

export async function createCheckoutSession({ tenant, env = readEnvFile() } = {}) {
  if (!stripeConfigured(env)) {
    return {
      ok: false,
      configured: false,
      error: 'Stripe is not configured yet. Add STRIPE_SECRET_KEY and STRIPE_PRICE_ID to .env.',
    };
  }
  const base = publicBase(env);
  const success =
    (env.STRIPE_SUCCESS_URL || '').trim() || `${base}/?billing=success`;
  const cancel = (env.STRIPE_CANCEL_URL || '').trim() || `${base}/?billing=cancel`;
  const params = {
    mode: 'subscription',
    'line_items[0][price]': (env.STRIPE_PRICE_ID || '').trim(),
    'line_items[0][quantity]': '1',
    success_url: success,
    cancel_url: cancel,
    client_reference_id: tenant.workspaceId,
    'metadata[workspace_id]': tenant.workspaceId,
    'metadata[email]': tenant.email,
  };
  if (tenant.stripeCustomerId) params.customer = tenant.stripeCustomerId;
  else params.customer_email = tenant.email;

  const session = await stripeRequest('/checkout/sessions', params, env);
  return { ok: true, configured: true, url: session.url, id: session.id };
}

export async function createBillingPortalSession({ tenant, env = readEnvFile() } = {}) {
  if (!stripeConfigured(env)) {
    return {
      ok: false,
      configured: false,
      error: 'Stripe is not configured yet.',
    };
  }
  if (!tenant.stripeCustomerId) {
    return { ok: false, configured: true, error: 'No Stripe customer yet — subscribe first.' };
  }
  const base = publicBase(env);
  const session = await stripeRequest(
    '/billing_portal/sessions',
    {
      customer: tenant.stripeCustomerId,
      return_url: `${base}/`,
    },
    env
  );
  return { ok: true, configured: true, url: session.url };
}

/**
 * Minimal webhook handler (Checkout completed / subscription updated / deleted).
 * Call with raw JSON body from Stripe (signature verification when secret set).
 */
/**
 * Verify a Stripe webhook signature (scheme v1) against the raw request body.
 * Stripe signs `${timestamp}.${rawBody}` with STRIPE_WEBHOOK_SECRET.
 * @param {Buffer|string} rawBody exact bytes Stripe POSTed — a re-serialized
 *   JSON object will not match.
 * @param {string} signatureHeader value of the `stripe-signature` header
 * @param {string} secret STRIPE_WEBHOOK_SECRET (whsec_…)
 * @param {number} toleranceSec reject timestamps older/newer than this
 * @returns {{ ok: boolean, error?: string }}
 */
export function verifyStripeSignature(rawBody, signatureHeader, secret, toleranceSec = 300) {
  const key = String(secret || '').trim();
  if (!key) return { ok: false, error: 'STRIPE_WEBHOOK_SECRET not configured' };
  const header = String(signatureHeader || '').trim();
  if (!header) return { ok: false, error: 'Missing stripe-signature header' };

  let timestamp = '';
  const signatures = [];
  for (const part of header.split(',')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (k === 't') timestamp = v;
    else if (k === 'v1') signatures.push(v);
  }
  if (!timestamp || !signatures.length) {
    return { ok: false, error: 'Malformed stripe-signature header' };
  }

  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return { ok: false, error: 'Invalid signature timestamp' };
  if (Math.abs(Date.now() / 1000 - ts) > toleranceSec) {
    return { ok: false, error: 'Signature timestamp outside tolerance' };
  }

  const payload = Buffer.concat([
    Buffer.from(`${timestamp}.`, 'utf8'),
    Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody || ''), 'utf8'),
  ]);
  const expected = crypto.createHmac('sha256', key).update(payload).digest('hex');
  const expectedBuf = Buffer.from(expected, 'utf8');

  for (const candidate of signatures) {
    const candidateBuf = Buffer.from(candidate, 'utf8');
    if (candidateBuf.length !== expectedBuf.length) continue;
    if (crypto.timingSafeEqual(candidateBuf, expectedBuf)) return { ok: true };
  }
  return { ok: false, error: 'Signature mismatch' };
}

export async function applyStripeWebhookEvent(event, env = readEnvFile()) {
  const type = event?.type || '';
  const obj = event?.data?.object || {};
  const workspaceId =
    obj.client_reference_id ||
    obj.metadata?.workspace_id ||
    '';

  if (type === 'checkout.session.completed' && workspaceId) {
    const customerId = obj.customer || '';
    const subId = obj.subscription || '';
    await sb(env)
      .from('halo_tenants')
      .update({
        subscription_status: 'active',
        stripe_customer_id: String(customerId || ''),
        stripe_subscription_id: String(subId || ''),
      })
      .eq('workspace_id', workspaceId);
    invalidateTenantCache();
    return { ok: true, applied: 'checkout.session.completed', workspaceId };
  }

  if (type === 'customer.subscription.updated' || type === 'customer.subscription.deleted') {
    const status = obj.status; // active, past_due, canceled, …
    const customerId = obj.customer || '';
    let mapped = 'trial';
    if (status === 'active' || status === 'trialing') mapped = 'active';
    else if (status === 'past_due' || status === 'unpaid') mapped = 'past_due';
    else if (status === 'canceled' || status === 'incomplete_expired') mapped = 'canceled';

    const q = sb(env).from('halo_tenants').update({
      subscription_status: mapped,
      stripe_subscription_id: String(obj.id || ''),
    });
    if (workspaceId) await q.eq('workspace_id', workspaceId);
    else if (customerId) await q.eq('stripe_customer_id', String(customerId));
    invalidateTenantCache();
    return { ok: true, applied: type, mapped };
  }

  return { ok: true, applied: false, type };
}

export function stripePublicConfig(env = readEnvFile()) {
  return {
    configured: stripeConfigured(env),
    priceIdSet: Boolean((env.STRIPE_PRICE_ID || '').trim()),
    webhookSecretSet: Boolean((env.STRIPE_WEBHOOK_SECRET || '').trim()),
  };
}
