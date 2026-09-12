/**
 * Seed WAFFi owner cabinet only.
 * Run inside outreach-dashboard with APP_ROOT=/app-data (compose) or env from container.
 */
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

function readEnv() {
  const roots = [
    process.env.APP_ROOT,
    '/app-data',
    '/root/cold-outreach-agent',
    path.join(process.cwd(), '..'),
    process.cwd(),
  ].filter(Boolean);
  const env = { ...process.env };
  for (const root of roots) {
    const p = path.join(root, '.env');
    if (!fs.existsSync(p)) continue;
    for (const ln of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
      const s = ln.trim();
      if (!s || s.startsWith('#') || !s.includes('=')) continue;
      const i = s.indexOf('=');
      const k = s.slice(0, i).trim();
      const v = s.slice(i + 1).trim();
      if (k && env[k] == null) env[k] = v;
    }
    break;
  }
  return env;
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

async function ensure(sb, row, { forceWorkspaceId = false } = {}) {
  const { data: existing } = await sb
    .from('halo_tenants')
    .select('id,email,workspace_id')
    .ilike('email', row.email)
    .maybeSingle();
  if (existing) {
    if (forceWorkspaceId && row.workspace_id && existing.workspace_id !== row.workspace_id) {
      const { data, error } = await sb
        .from('halo_tenants')
        .update({ workspace_id: row.workspace_id })
        .eq('id', existing.id)
        .select('id,email,workspace_id')
        .single();
      if (error) throw new Error(error.message);
      console.log('repaired workspace', data.email, existing.workspace_id, '→', data.workspace_id);
      return data;
    }
    console.log('exists', existing.email, existing.workspace_id);
    return existing;
  }
  const { data, error } = await sb.from('halo_tenants').insert(row).select('id,email,workspace_id').single();
  if (error) throw new Error(error.message);
  console.log('created', data.email, data.workspace_id);
  return data;
}

async function main() {
  const env = readEnv();
  const url = (env.SUPABASE_URL || '').trim();
  const key = (env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!url || !key) throw new Error('SUPABASE_URL / SERVICE_ROLE missing');

  const sb = createClient(url, key, { auth: { persistSession: false } });

  const { error: probe } = await sb.from('halo_tenants').select('id', { head: true, count: 'exact' }).limit(1);
  if (probe) throw new Error(`halo_tenants missing? ${probe.message}`);

  const waffiPass = (env.DASHBOARD_PASSWORD || process.env.DASHBOARD_PASSWORD || '').trim();
  const waffiEmail = (process.env.WAFFI_EMAIL || 'wafficompany@gmail.com').trim().toLowerCase();

  if (!waffiPass) throw new Error('DASHBOARD_PASSWORD missing for WAFFi seed');

  await ensure(
    sb,
    {
      email: waffiEmail,
      password_hash: hashPassword(waffiPass),
      workspace_id: 'default',
      display_name: 'WAFFi',
      company: 'WAFFi',
      role: 'owner',
      subscription_status: 'active',
      trial_lead_limit: 999999,
    },
    { forceWorkspaceId: true }
  );

  const { count, error } = await sb
    .from('leads')
    .select('*', { count: 'exact', head: true })
    .eq('workspace_id', 'default');
  if (error) throw new Error(error.message);
  console.log('leads default', count || 0);
  console.log('SEED_OK');
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
