/**
 * Dashboard-side Supabase CRM (reads .env via APP_ROOT).
 * Pass workspaceId to scope to a cabinet; default WORKSPACE_ID / `default`.
 */
import { createClient } from '@supabase/supabase-js';
import { readEnvFile } from './env.js';

export const CRM_STATUSES = [
  'Lead😴',
  'Proposal 1️⃣',
  'Proposal 2️⃣',
  'Active ✅',
  'Lost❌',
];

export function crmBackend(env = readEnvFile()) {
  return String(env.CRM_BACKEND || 'notion').trim().toLowerCase() === 'supabase'
    ? 'supabase'
    : 'notion';
}

export function supabaseConfigured(env = readEnvFile()) {
  return Boolean(
    (env.SUPABASE_URL || '').trim() && (env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
  );
}

function client(env = readEnvFile()) {
  const url = (env.SUPABASE_URL || '').trim();
  const key = (env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!url || !key) throw new Error('Supabase credentials missing');
  return createClient(url, key, { auth: { persistSession: false } });
}

function ws(env = readEnvFile(), workspaceId) {
  if (workspaceId != null && String(workspaceId).trim()) return String(workspaceId).trim();
  return String(env.WORKSPACE_ID || 'default').trim() || 'default';
}

function rowToLead(row) {
  return {
    id: row.id,
    name: String(row.name || '').trim(),
    url: String(row.link || '').trim(),
    msg: String(row.ice_breaker || ''),
    location: String(row.location || '').trim(),
    timezone: String(row.timezone || '').trim(),
    email: String(row.email || '').trim(),
    lostReason: String(row.lost_reason || '').trim(),
    messengerApp: String(row.messenger_app || '').trim(),
    messengerValue: String(row.messenger_value || '').trim(),
    processingAt: row.processing_at || null,
    status: String(row.status || '').trim(),
    notes: String(row.notes || ''),
  };
}

export async function countByStatus(env = readEnvFile(), workspaceId) {
  const sb = client(env);
  const workspace = ws(env, workspaceId);
  const counts = {};
  for (const status of CRM_STATUSES) {
    const { count, error } = await sb
      .from('leads')
      .select('*', { count: 'exact', head: true })
      .eq('workspace_id', workspace)
      .eq('status', status);
    if (error) throw new Error(error.message);
    counts[status] = count || 0;
  }
  return { ok: true, counts, cachedAt: new Date().toISOString(), workspaceId: workspace };
}

export async function listLeadsPage(
  { status, q, page = 1, limit = 50, workspaceId } = {},
  env = readEnvFile()
) {
  const sb = client(env);
  const workspace = ws(env, workspaceId);
  const pageSize = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const pageNum = Math.max(Number(page) || 1, 1);
  const from = (pageNum - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = sb
    .from('leads')
    .select('*', { count: 'exact' })
    .eq('workspace_id', workspace)
    .order('updated_at', { ascending: false })
    .range(from, to);

  if (status) query = query.eq('status', status);
  const needle = String(q || '').trim();
  if (needle) {
    const safe = needle.replace(/[%_,]/g, '');
    if (safe) {
      query = query.or(
        `name.ilike.%${safe}%,link.ilike.%${safe}%,ice_breaker.ilike.%${safe}%,location.ilike.%${safe}%,email.ilike.%${safe}%,messenger_value.ilike.%${safe}%,notes.ilike.%${safe}%`
      );
    }
  }

  const { data, error, count } = await query;
  if (error) {
    // PostgREST 416 when page is past the end — return empty instead of failing the CRM UI.
    if (/not satisfiable|PGRST103/i.test(error.message || '')) {
      return {
        ok: true,
        leads: [],
        total: typeof count === 'number' ? count : 0,
        page: pageNum,
        limit: pageSize,
        workspaceId: workspace,
      };
    }
    throw new Error(error.message);
  }
  return {
    ok: true,
    leads: (data || []).map(rowToLead),
    total: count || 0,
    page: pageNum,
    limit: pageSize,
    workspaceId: workspace,
  };
}

export async function patchLead(id, fields, env = readEnvFile(), workspaceId) {
  const sb = client(env);
  const workspace = ws(env, workspaceId);
  const patch = {};
  if (fields.name != null) patch.name = String(fields.name).trim().slice(0, 200);
  if (fields.url != null) patch.link = String(fields.url).trim();
  if (fields.status != null) patch.status = String(fields.status);
  if (fields.msg != null) patch.ice_breaker = String(fields.msg);
  if (fields.notes != null) patch.notes = String(fields.notes);
  if (fields.location != null) patch.location = String(fields.location).trim().slice(0, 300);
  if (fields.timezone != null) patch.timezone = String(fields.timezone).trim().slice(0, 64);
  if (fields.email != null) patch.email = String(fields.email).trim().slice(0, 200);
  if (fields.lostReason != null) patch.lost_reason = String(fields.lostReason).trim().slice(0, 64);
  if (fields.messengerApp != null) patch.messenger_app = String(fields.messengerApp).trim().slice(0, 32);
  if (fields.messengerValue != null) {
    patch.messenger_value = String(fields.messengerValue).trim().slice(0, 300);
  }
  const { data, error } = await sb
    .from('leads')
    .update(patch)
    .eq('id', id)
    .eq('workspace_id', workspace)
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return rowToLead(data);
}

export async function createLead(fields, env = readEnvFile(), workspaceId) {
  const link = String(fields.url || fields.link || '').trim();
  if (!link || !/linkedin\.com\/in\//i.test(link)) {
    throw new Error('LinkedIn profile Link is required (https://www.linkedin.com/in/…)');
  }
  const nowIso = fields.processingAt || fields.processing_at || new Date().toISOString();
  const sb = client(env);
  const workspace = ws(env, workspaceId);
  const { data, error } = await sb
    .from('leads')
    .insert({
      workspace_id: workspace,
      name: String(fields.name || '').trim().slice(0, 200) || 'New lead',
      link,
      status: fields.status || 'Lead😴',
      ice_breaker: String(fields.msg || fields.ice_breaker || ''),
      notes: '',
      processing_at: nowIso,
    })
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return rowToLead(data);
}

export async function deleteLead(id, env = readEnvFile(), workspaceId) {
  const sb = client(env);
  const workspace = ws(env, workspaceId);
  const { error } = await sb.from('leads').delete().eq('id', id).eq('workspace_id', workspace);
  if (error) throw new Error(error.message);
  return { ok: true };
}

function normalizeIdList(ids) {
  return [...new Set((ids || []).map(String).filter(Boolean))];
}

export async function bulkPatchLeads(ids, fields, env = readEnvFile(), workspaceId) {
  const sb = client(env);
  const workspace = ws(env, workspaceId);
  const idList = normalizeIdList(ids);
  if (!idList.length) throw new Error('No leads selected');

  const patch = {};
  if (fields.status != null) {
    const status = String(fields.status);
    if (!CRM_STATUSES.includes(status)) throw new Error('Invalid status');
    patch.status = status;
  }
  if (!Object.keys(patch).length) throw new Error('Nothing to update');

  const { data, error } = await sb
    .from('leads')
    .update(patch)
    .eq('workspace_id', workspace)
    .in('id', idList)
    .select('*');
  if (error) throw new Error(error.message);
  return { ok: true, updated: (data || []).map(rowToLead), count: (data || []).length };
}

export async function bulkDeleteLeads(ids, env = readEnvFile(), workspaceId) {
  const sb = client(env);
  const workspace = ws(env, workspaceId);
  const idList = normalizeIdList(ids);
  if (!idList.length) throw new Error('No leads selected');
  const { error } = await sb.from('leads').delete().eq('workspace_id', workspace).in('id', idList);
  if (error) throw new Error(error.message);
  return { ok: true, count: idList.length };
}

export async function validateSupabaseCredentials(url, serviceRoleKey) {
  const sb = createClient(url.trim(), serviceRoleKey.trim(), {
    auth: { persistSession: false },
  });
  const { error } = await sb.from('leads').select('id', { count: 'exact', head: true }).limit(1);
  if (error) {
    if (/does not exist|relation.*leads/i.test(error.message)) {
      throw new Error('leads table not found — run the H.A.L.O. SQL schema in Supabase SQL Editor first');
    }
    throw new Error(error.message);
  }
  return true;
}
