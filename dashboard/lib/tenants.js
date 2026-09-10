/**
 * Tenant (cabinet) helpers — Supabase halo_tenants table.
 */
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { readEnvFile } from './env.js';

const WAFFI_WORKSPACE = 'default';

function client(env = readEnvFile()) {
  const url = (env.SUPABASE_URL || '').trim();
  const key = (env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!url || !key) throw new Error('Supabase credentials missing');
  return createClient(url, key, { auth: { persistSession: false } });
}

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(password, stored) {
  const parts = String(stored || '').split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const [, salt, hash] = parts;
  const next = crypto.scryptSync(String(password), salt, 64).toString('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(next, 'hex'));
  } catch {
    return false;
  }
}

export function waffiWorkspaceId() {
  return WAFFI_WORKSPACE;
}

function rowToTenant(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: String(row.email || '').trim().toLowerCase(),
    workspaceId: String(row.workspace_id || '').trim(),
    displayName: String(row.display_name || '').trim(),
    company: String(row.company || '').trim(),
    role: String(row.role || 'user'),
    subscriptionStatus: String(row.subscription_status || 'trial'),
    trialLeadLimit: Number(row.trial_lead_limit) || 50,
    userUnreadSupport: row.user_unread_support === true,
    supportAttention: row.support_attention === true,
    supportAttentionAt: row.support_attention_at || null,
    errorAttention: row.error_attention === true,
    errorAttentionAt: row.error_attention_at || null,
    errorAttentionUntil: row.error_attention_until || null,
    errorAttentionReason: String(row.error_attention_reason || '').trim(),
    stripeCustomerId: String(row.stripe_customer_id || '').trim(),
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}

export async function getTenantAuthRow(email, env = readEnvFile()) {
  const sb = client(env);
  const needle = String(email || '').trim().toLowerCase();
  if (!needle) return null;
  const { data, error } = await sb.from('halo_tenants').select('*').ilike('email', needle).maybeSingle();
  if (error) throw new Error(error.message);
  return data || null;
}

export async function getTenantByEmail(email, env = readEnvFile()) {
  return rowToTenant(await getTenantAuthRow(email, env));
}

export async function getTenantByWorkspace(workspaceId, env = readEnvFile()) {
  const sb = client(env);
  const ws = String(workspaceId || '').trim();
  if (!ws) return null;
  const { data, error } = await sb.from('halo_tenants').select('*').eq('workspace_id', ws).maybeSingle();
  if (error) throw new Error(error.message);
  return rowToTenant(data);
}

export async function listTenants(env = readEnvFile()) {
  const sb = client(env);
  const { data, error } = await sb.from('halo_tenants').select('*').order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return (data || []).map(rowToTenant);
}

/**
 * Create tenant. workspace_id must be unique; email unique (case-insensitive).
 */
export async function createTenant(
  { email, password, workspaceId, displayName = '', company = '', role = 'user', subscriptionStatus = 'trial' },
  env = readEnvFile()
) {
  const sb = client(env);
  const em = String(email || '').trim().toLowerCase();
  const ws = String(workspaceId || '').trim();
  const pass = String(password || '');
  if (!em || !em.includes('@')) throw new Error('Valid email required');
  if (pass.length < 8) throw new Error('Password must be at least 8 characters');
  if (!ws) throw new Error('workspace_id required');

  const { data, error } = await sb
    .from('halo_tenants')
    .insert({
      email: em,
      password_hash: hashPassword(pass),
      workspace_id: ws,
      display_name: String(displayName || '').trim(),
      company: String(company || '').trim(),
      role,
      subscription_status: subscriptionStatus,
    })
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return rowToTenant(data);
}

export async function ensureTenant(
  { email, password, workspaceId, displayName, company, role, subscriptionStatus },
  env = readEnvFile()
) {
  const existing = await getTenantByEmail(email, env);
  if (existing) return { tenant: existing, created: false };
  const tenant = await createTenant(
    { email, password, workspaceId, displayName, company, role, subscriptionStatus },
    env
  );
  return { tenant, created: true };
}

export async function countLeadsForWorkspace(workspaceId, env = readEnvFile()) {
  const sb = client(env);
  const ws = String(workspaceId || '').trim();
  const { count, error } = await sb
    .from('leads')
    .select('*', { count: 'exact', head: true })
    .eq('workspace_id', ws);
  if (error) throw new Error(error.message);
  return count || 0;
}

/** Block new leads when trial cabinet hit limit (active subscription unlimited). */
export async function assertTrialAllowsNewLead(workspaceId, env = readEnvFile()) {
  const tenant = await getTenantByWorkspace(workspaceId, env);
  if (!tenant) return { ok: true };
  if (tenant.subscriptionStatus === 'active') return { ok: true, tenant };
  const n = await countLeadsForWorkspace(workspaceId, env);
  const limit = tenant.trialLeadLimit || 50;
  if (n >= limit) {
    const err = new Error(
      `Trial ended: ${n}/${limit} leads in this cabinet. Upgrade via Profile Settings to continue.`
    );
    err.code = 'TRIAL_LIMIT';
    err.leadCount = n;
    err.trialLeadLimit = limit;
    throw err;
  }
  return { ok: true, tenant, leadCount: n, trialLeadLimit: limit };
}

/** Public view for /api/auth/me */
export function tenantPublic(tenant) {
  if (!tenant) return null;
  return {
    email: tenant.email,
    workspaceId: tenant.workspaceId,
    displayName: tenant.displayName,
    company: tenant.company,
    role: tenant.role,
    subscriptionStatus: tenant.subscriptionStatus,
    trialLeadLimit: tenant.trialLeadLimit,
    userUnreadSupport: tenant.userUnreadSupport === true,
  };
}
