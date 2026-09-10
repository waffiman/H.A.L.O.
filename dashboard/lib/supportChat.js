/**
 * Support chat — one thread per workspace_id in Supabase.
 * Live updates: SSE + Supabase Realtime (no VPS poll when chat closed).
 * Alerts: Telegram only (with workspace_id + email). No email. No red tenant fills.
 */
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import { readEnvFile } from './env.js';
import { addNotification } from './notifications.js';
import { countLeadsForWorkspace, listTenants, waffiWorkspaceId } from './tenants.js';
import { tenantPaths } from './tenantRuntime.js';

const MAX_BODY = 4000;

function client(env = readEnvFile()) {
  const url = (env.SUPABASE_URL || '').trim();
  const key = (env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!url || !key) throw new Error('Supabase credentials missing');
  return createClient(url, key, { auth: { persistSession: false } });
}

function rowMessage(row) {
  if (!row) return null;
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    author: row.author,
    body: row.body,
    createdAt: row.created_at,
  };
}

export function isSupportStaff(tenant) {
  const role = String(tenant?.role || '').toLowerCase();
  return role === 'owner' || role === 'support';
}

/** WAFFi golden cabinet only — admin UI / cross-tenant inbox. */
export function isWaffiAdmin(tenant) {
  if (!isSupportStaff(tenant)) return false;
  return String(tenant?.workspaceId || '').trim() === waffiWorkspaceId();
}

export async function getUserUnreadSupport(workspaceId, env = readEnvFile()) {
  const sb = client(env);
  const ws = String(workspaceId || '').trim();
  if (!ws) return false;
  const { data, error } = await sb
    .from('halo_tenants')
    .select('user_unread_support')
    .eq('workspace_id', ws)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data?.user_unread_support === true;
}

/** Clear FAB red dot after user opens the chat. */
export async function markUserSupportRead(workspaceId, env = readEnvFile()) {
  const sb = client(env);
  const ws = String(workspaceId || '').trim();
  if (!ws) throw new Error('workspace_id required');
  const { error } = await sb
    .from('halo_tenants')
    .update({ user_unread_support: false, user_unread_support_at: null })
    .eq('workspace_id', ws);
  if (error) throw new Error(error.message);
  return { ok: true };
}

/** Staff opened a cabinet thread — clear inbox highlight. */
export async function markStaffSupportRead(workspaceId, env = readEnvFile()) {
  const sb = client(env);
  const ws = String(workspaceId || '').trim();
  if (!ws) throw new Error('workspace_id required');
  const { error } = await sb
    .from('halo_tenants')
    .update({ support_attention: false, support_attention_at: null })
    .eq('workspace_id', ws);
  if (error) throw new Error(error.message);
  return { ok: true };
}

export async function listMessages(workspaceId, { limit = 200 } = {}, env = readEnvFile()) {
  const sb = client(env);
  const ws = String(workspaceId || '').trim();
  if (!ws) throw new Error('workspace_id required');
  const { data, error } = await sb
    .from('support_messages')
    .select('id, workspace_id, author, body, created_at')
    .eq('workspace_id', ws)
    .order('created_at', { ascending: true })
    .limit(Math.min(500, Math.max(1, Number(limit) || 200)));
  if (error) throw new Error(error.message);
  return (data || []).map(rowMessage);
}

/**
 * @param {{ workspaceId: string, author: 'user'|'support', body: string, tenantEmail?: string, displayName?: string }} opts
 */
export async function sendMessage(opts, env = readEnvFile()) {
  const sb = client(env);
  const ws = String(opts.workspaceId || '').trim();
  const author = opts.author === 'support' ? 'support' : 'user';
  const body = String(opts.body || '').trim();
  if (!ws) throw new Error('workspace_id required');
  if (!body) throw new Error('Message is empty');
  if (body.length > MAX_BODY) throw new Error(`Message too long (max ${MAX_BODY})`);

  const { data, error } = await sb
    .from('support_messages')
    .insert({ workspace_id: ws, author, body })
    .select('id, workspace_id, author, body, created_at')
    .single();
  if (error) throw new Error(error.message);

  if (author === 'user') {
    try {
      await sb
        .from('halo_tenants')
        .update({
          support_attention: true,
          support_attention_at: new Date().toISOString(),
        })
        .eq('workspace_id', ws);
    } catch {
      /* ignore */
    }
    const email = String(opts.tenantEmail || '').trim() || '—';
    const name = String(opts.displayName || '').trim() || '—';
    try {
      addNotification({
        type: 'support_message',
        severity: 'warn',
        key: `support_msg_${ws}_${Date.now()}`,
        title: 'Support chat — new user message',
        message: [
          `workspace_id: ${ws}`,
          `email: ${email}`,
          `name: ${name}`,
          '',
          body.slice(0, 500),
          '',
          'Reply: HALO Profile → Admin → open this cabinet chat',
        ].join('\n'),
      });
    } catch {
      /* ignore */
    }
  }
  // author=support → DB trigger sets user_unread_support for FAB red dot

  return rowMessage(data);
}

/**
 * Telegram alert on cabinet error (no UI red fills). Includes workspace_id.
 */
export async function flagTenantError(
  workspaceId,
  { title = 'Cabinet error', message = '' } = {},
  env = readEnvFile()
) {
  const ws = String(workspaceId || '').trim();
  if (!ws) return { ok: false, error: 'workspace_id required' };

  let email = '';
  try {
    const sb = client(env);
    const { data } = await sb
      .from('halo_tenants')
      .select('email, display_name')
      .eq('workspace_id', ws)
      .maybeSingle();
    email = data?.email || '';
  } catch {
    /* ignore */
  }

  const reason = [title, message].filter(Boolean).join(' — ').slice(0, 500);
  try {
    addNotification({
      type: 'tenant_error',
      severity: 'error',
      key: `tenant_error_${ws}`,
      title: `Cabinet error — ${ws}`,
      message: [`workspace_id: ${ws}`, `email: ${email || '—'}`, '', reason].join('\n'),
    });
  } catch {
    /* ignore */
  }

  return { ok: true };
}

function errorAttentionActive(tenant) {
  if (!tenant?.errorAttention) return false;
  if (!tenant.errorAttentionUntil) return true;
  const until = Date.parse(tenant.errorAttentionUntil);
  return Number.isNaN(until) || until > Date.now();
}

/**
 * Admin overview: all cabinets + lead counts + inbox flags (read-only Supabase front).
 */
export async function getAdminOverview(env = readEnvFile()) {
  const sb = client(env);
  const tenants = await listTenants(env);
  const { count: totalLeads, error: leadErr } = await sb
    .from('leads')
    .select('*', { count: 'exact', head: true });
  if (leadErr) throw new Error(leadErr.message);

  const cabinets = await Promise.all(
    tenants.map(async (t) => {
      const leadCount = await countLeadsForWorkspace(t.workspaceId, env).catch(() => 0);
      let lastMessage = null;
      try {
        const { data } = await sb
          .from('support_messages')
          .select('id, author, body, created_at')
          .eq('workspace_id', t.workspaceId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (data) {
          lastMessage = {
            id: data.id,
            author: data.author,
            body: data.body,
            createdAt: data.created_at,
          };
        }
      } catch {
        /* ignore */
      }
      const problem = errorAttentionActive(t)
        ? t.errorAttentionReason || 'Cabinet reported an error'
        : '';
      return {
        workspaceId: t.workspaceId,
        email: t.email,
        displayName: t.displayName,
        company: t.company,
        role: t.role,
        subscriptionStatus: t.subscriptionStatus,
        trialLeadLimit: t.trialLeadLimit,
        leadCount,
        unreadFromUser: t.supportAttention === true,
        supportAttentionAt: t.supportAttentionAt,
        hasProblem: !!problem,
        problem,
        isDefault: t.workspaceId === waffiWorkspaceId(),
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
        lastMessage,
      };
    })
  );

  cabinets.sort((a, b) => {
    if (a.unreadFromUser !== b.unreadFromUser) return a.unreadFromUser ? -1 : 1;
    if (a.hasProblem !== b.hasProblem) return a.hasProblem ? -1 : 1;
    return String(a.email || '').localeCompare(String(b.email || ''));
  });

  return {
    ok: true,
    totalCabinets: cabinets.length,
    totalLeads: totalLeads || 0,
    unreadThreads: cabinets.filter((c) => c.unreadFromUser).length,
    problemCabinets: cabinets.filter((c) => c.hasProblem).length,
    cabinets,
  };
}

/** Permanently delete one support_messages row (admin). */
export async function deleteSupportMessage(messageId, env = readEnvFile()) {
  const sb = client(env);
  const id = String(messageId || '').trim();
  if (!id) throw new Error('message id required');
  const { data, error } = await sb
    .from('support_messages')
    .delete()
    .eq('id', id)
    .select('id, workspace_id')
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error('Message not found');
  return { ok: true, id: data.id, workspaceId: data.workspace_id };
}

/**
 * Wipe cabinets: leads + support messages + halo_tenants + local halo-tenants/{ws}.
 * Never deletes the WAFFi default workspace.
 */
export async function deleteCabinets(workspaceIds, env = readEnvFile()) {
  const sb = client(env);
  const waffi = waffiWorkspaceId();
  const ids = [...new Set((workspaceIds || []).map((w) => String(w || '').trim()).filter(Boolean))];
  if (!ids.length) throw new Error('No cabinets selected');
  if (ids.includes(waffi)) {
    throw new Error(`Cannot delete the WAFFi cabinet (${waffi})`);
  }

  const results = [];
  for (const ws of ids) {
    const { count: leadCount } = await sb
      .from('leads')
      .select('*', { count: 'exact', head: true })
      .eq('workspace_id', ws);
    const { error: leadErr } = await sb.from('leads').delete().eq('workspace_id', ws);
    if (leadErr) throw new Error(`leads ${ws}: ${leadErr.message}`);

    const { error: msgErr } = await sb.from('support_messages').delete().eq('workspace_id', ws);
    if (msgErr) throw new Error(`support_messages ${ws}: ${msgErr.message}`);

    const { data: tenant, error: tenErr } = await sb
      .from('halo_tenants')
      .delete()
      .eq('workspace_id', ws)
      .select('workspace_id, email')
      .maybeSingle();
    if (tenErr) throw new Error(`halo_tenants ${ws}: ${tenErr.message}`);

    // Local runtime jar / Chromium profile for non-default cabinets
    try {
      const paths = tenantPaths(ws);
      if (!paths.isLegacy && fs.existsSync(paths.root)) {
        fs.rmSync(paths.root, { recursive: true, force: true });
      }
    } catch {
      /* ignore FS cleanup */
    }

    results.push({
      workspaceId: ws,
      email: tenant?.email || null,
      deleted: !!tenant,
      leadsRemoved: leadCount || 0,
    });
  }

  return { ok: true, deleted: results };
}

/**
 * Attach Supabase Realtime → SSE. Caller owns HTTP response headers.
 * @returns {() => void} cleanup
 */
export function attachSupportRealtime(workspaceId, onEvent) {
  const env = readEnvFile();
  const sb = client(env);
  const ws = String(workspaceId || '').trim();
  const channel = sb
    .channel(`support-chat-${ws}-${Date.now()}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'support_messages',
        filter: `workspace_id=eq.${ws}`,
      },
      (payload) => {
        try {
          onEvent({ type: 'message', message: rowMessage(payload.new) });
        } catch {
          /* ignore */
        }
      }
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        try {
          onEvent({ type: 'ready' });
        } catch {
          /* ignore */
        }
      }
    });

  return () => {
    try {
      sb.removeChannel(channel);
    } catch {
      /* ignore */
    }
  };
}
