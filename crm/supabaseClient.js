import { createClient } from '@supabase/supabase-js';
import ws from 'ws';
import { workspaceId } from './constants.js';

let cached = null;

export function getSupabase() {
  if (cached) return cached;
  const url = String(process.env.SUPABASE_URL || '').trim();
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!url || !key) {
    throw new Error('SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing');
  }
  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { WebSocket: ws },
  });
  return cached;
}

export function resetSupabaseClient() {
  cached = null;
}

export function rowToLead(row) {
  if (!row) return null;
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
    processingAt: row.processing_at ? new Date(row.processing_at) : null,
    status: String(row.status || '').trim(),
    notes: String(row.notes || ''),
  };
}

export { workspaceId };
