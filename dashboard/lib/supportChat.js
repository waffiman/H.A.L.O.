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
export const SUPPORT_MEDIA_BUCKET = 'support-media';
export const MAX_SUPPORT_IMAGE_BYTES = 2 * 1024 * 1024; // 2 MiB
const ALLOWED_IMAGE_MIME = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
]);

function client(env = readEnvFile()) {
  const url = (env.SUPABASE_URL || '').trim();
  const key = (env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!url || !key) throw new Error('Supabase credentials missing');
  return createClient(url, key, { auth: { persistSession: false } });
}

function rowMessage(row) {
  if (!row) return null;
  const hasAttachment = Boolean(row.attachment_path);
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    author: row.author,
    body: row.body,
    createdAt: row.created_at,
    attachment: hasAttachment
      ? {
          path: row.attachment_path,
          mime: row.attachment_mime || 'image/jpeg',
          name: row.attachment_name || 'image',
          bytes: Number(row.attachment_bytes) || null,
          url: `/api/support/attachment/${row.id}`,
        }
      : null,
  };
}

async function ensureSupportMediaBucket(sb) {
  try {
    const { data: buckets } = await sb.storage.listBuckets();
    if ((buckets || []).some((b) => b.name === SUPPORT_MEDIA_BUCKET)) return;
    await sb.storage.createBucket(SUPPORT_MEDIA_BUCKET, {
      public: false,
      fileSizeLimit: MAX_SUPPORT_IMAGE_BYTES,
      allowedMimeTypes: [...ALLOWED_IMAGE_MIME],
    });
  } catch {
    /* bucket may already exist or Storage API unavailable */
  }
}

function parseImageAttachment(raw) {
  if (!raw) return null;
  const mime = String(raw.mime || raw.contentType || '').trim().toLowerCase();
  const name = String(raw.name || raw.filename || 'image').trim().slice(0, 180) || 'image';
  let b64 = String(raw.base64 || raw.data || '').trim();
  if (!b64) return null;
  const dataUrl = b64.match(/^data:([^;]+);base64,(.+)$/i);
  if (dataUrl) {
    b64 = dataUrl[2];
  }
  if (!ALLOWED_IMAGE_MIME.has(mime) && !(dataUrl && ALLOWED_IMAGE_MIME.has(String(dataUrl[1]).toLowerCase()))) {
    const m = dataUrl ? String(dataUrl[1]).toLowerCase() : mime;
    if (!ALLOWED_IMAGE_MIME.has(m)) {
      throw new Error('Only image attachments are allowed (JPEG, PNG, WebP, GIF, HEIC)');
    }
  }
  const finalMime = dataUrl ? String(dataUrl[1]).toLowerCase() : mime;
  let buf;
  try {
    buf = Buffer.from(b64, 'base64');
  } catch {
    throw new Error('Invalid image data');
  }
  if (!buf.length) throw new Error('Empty image');
  if (buf.length > MAX_SUPPORT_IMAGE_BYTES) {
    throw new Error(`Image too large (max ${Math.round(MAX_SUPPORT_IMAGE_BYTES / (1024 * 1024))} MB)`);
  }
  const ext =
    finalMime === 'image/png'
      ? 'png'
      : finalMime === 'image/webp'
        ? 'webp'
        : finalMime === 'image/gif'
          ? 'gif'
          : finalMime.includes('heic') || finalMime.includes('heif')
            ? 'heic'
            : 'jpg';
  return { mime: finalMime, name, buf, ext };
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
    .select(
      'id, workspace_id, author, body, created_at, attachment_path, attachment_mime, attachment_name, attachment_bytes'
    )
    .eq('workspace_id', ws)
    .order('created_at', { ascending: true })
    .limit(Math.min(500, Math.max(1, Number(limit) || 200)));
  if (error) {
    // Older schema without attachment columns — fall back
    if (/attachment_/i.test(error.message || '')) {
      const retry = await sb
        .from('support_messages')
        .select('id, workspace_id, author, body, created_at')
        .eq('workspace_id', ws)
        .order('created_at', { ascending: true })
        .limit(Math.min(500, Math.max(1, Number(limit) || 200)));
      if (retry.error) throw new Error(retry.error.message);
      return (retry.data || []).map(rowMessage);
    }
    throw new Error(error.message);
  }
  return (data || []).map(rowMessage);
}

/**
 * @param {{ workspaceId: string, author: 'user'|'support', body?: string, image?: object, tenantEmail?: string, displayName?: string }} opts
 */
export async function sendMessage(opts, env = readEnvFile()) {
  const sb = client(env);
  const ws = String(opts.workspaceId || '').trim();
  const author = opts.author === 'support' ? 'support' : 'user';
  const body = String(opts.body || '').trim();
  const image = parseImageAttachment(opts.image);
  if (!ws) throw new Error('workspace_id required');
  if (!body && !image) throw new Error('Message is empty');
  if (body.length > MAX_BODY) throw new Error(`Message too long (max ${MAX_BODY})`);

  let attachment = null;
  if (image) {
    await ensureSupportMediaBucket(sb);
    const path = `${ws}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${image.ext}`;
    const { error: upErr } = await sb.storage.from(SUPPORT_MEDIA_BUCKET).upload(path, image.buf, {
      contentType: image.mime,
      upsert: false,
    });
    if (upErr) {
      throw new Error(
        /column|schema|attachment_/i.test(upErr.message || '')
          ? upErr.message
          : `Image upload failed: ${upErr.message}. If Storage is new, create bucket "${SUPPORT_MEDIA_BUCKET}" or re-try.`
      );
    }
    attachment = {
      attachment_path: path,
      attachment_mime: image.mime,
      attachment_name: image.name,
      attachment_bytes: image.buf.length,
    };
  }

  const insertRow = {
    workspace_id: ws,
    author,
    body: body || (attachment ? '' : ''),
    ...(attachment || {}),
  };

  let data;
  let error;
  ({ data, error } = await sb
    .from('support_messages')
    .insert(insertRow)
    .select(
      'id, workspace_id, author, body, created_at, attachment_path, attachment_mime, attachment_name, attachment_bytes'
    )
    .single());

  if (error && attachment && /attachment_/i.test(error.message || '')) {
    // Columns missing — roll back storage object and ask for SQL
    try {
      await sb.storage.from(SUPPORT_MEDIA_BUCKET).remove([attachment.attachment_path]);
    } catch {
      /* ignore */
    }
    throw new Error(
      'Image columns missing in support_messages. Run sql/halo_support_attachments.sql in Supabase, then retry.'
    );
  }
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
          attachment ? `attachment: ${attachment.attachment_name} (${attachment.attachment_bytes} bytes)` : '',
          '',
          (body || '[image]').slice(0, 500),
          '',
          'Reply: HALO Profile → Admin → open this cabinet chat',
        ]
          .filter(Boolean)
          .join('\n'),
      });
    } catch {
      /* ignore */
    }
  }

  return rowMessage(data);
}

export async function getSupportAttachment(messageId, env = readEnvFile()) {
  const sb = client(env);
  const id = String(messageId || '').trim();
  if (!id) throw new Error('message id required');
  const { data, error } = await sb
    .from('support_messages')
    .select('id, workspace_id, attachment_path, attachment_mime, attachment_name')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data?.attachment_path) throw new Error('Attachment not found');
  const { data: file, error: dlErr } = await sb.storage
    .from(SUPPORT_MEDIA_BUCKET)
    .download(data.attachment_path);
  if (dlErr) throw new Error(dlErr.message);
  const buf = Buffer.from(await file.arrayBuffer());
  return {
    workspaceId: data.workspace_id,
    mime: data.attachment_mime || 'application/octet-stream',
    name: data.attachment_name || 'image',
    buffer: buf,
  };
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
          .select('id, author, body, created_at, attachment_path, attachment_name')
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
            attachment: data.attachment_path
              ? { name: data.attachment_name || 'image' }
              : null,
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
  const { data: existing } = await sb
    .from('support_messages')
    .select('id, workspace_id, attachment_path')
    .eq('id', id)
    .maybeSingle();
  const { data, error } = await sb
    .from('support_messages')
    .delete()
    .eq('id', id)
    .select('id, workspace_id')
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error('Message not found');
  if (existing?.attachment_path) {
    try {
      await sb.storage.from(SUPPORT_MEDIA_BUCKET).remove([existing.attachment_path]);
    } catch {
      /* ignore */
    }
  }
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
