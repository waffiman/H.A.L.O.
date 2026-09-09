/**
 * Supabase PostgREST helpers (no WebSocket / no supabase-js client).
 */
import { workspaceId } from './constants.js';

function cfg() {
  const url = String(process.env.SUPABASE_URL || '').trim().replace(/\/$/, '');
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!url || !key) throw new Error('SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing');
  return { url, key };
}

function headers(key, extra = {}) {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}

export async function restSelect(table, { filters = {}, order, range, count = false } = {}) {
  const { url, key } = cfg();
  const params = new URLSearchParams({ select: '*' });
  for (const [k, v] of Object.entries(filters)) {
    if (v == null) continue;
    params.set(k, typeof v === 'string' && v.includes('.') ? v : `eq.${v}`);
  }
  if (order) params.set('order', order);
  const h = headers(key);
  if (count) h.Prefer = 'count=exact';
  const res = await fetch(`${url}/rest/v1/${table}?${params}`, { headers: h });
  if (!res.ok) throw new Error(await res.text());
  const rows = count ? [] : await res.json();
  const total = count ? Number(res.headers.get('content-range')?.split('/')?.[1] || 0) : rows.length;
  return { rows, total, res };
}

export async function restInsert(table, row) {
  const { url, key } = cfg();
  const res = await fetch(`${url}/rest/v1/${table}`, {
    method: 'POST',
    headers: headers(key, { Prefer: 'return=representation' }),
    body: JSON.stringify(row),
  });
  if (!res.ok) throw new Error(await res.text());
  const data = await res.json();
  return Array.isArray(data) ? data[0] : data;
}

export async function restUpdate(table, id, patch) {
  const { url, key } = cfg();
  const res = await fetch(`${url}/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: headers(key, { Prefer: 'return=representation' }),
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(await res.text());
  const data = await res.json();
  return Array.isArray(data) ? data[0] : data;
}

export async function restDelete(table, id) {
  const { url, key } = cfg();
  const res = await fetch(`${url}/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: headers(key),
  });
  if (!res.ok) throw new Error(await res.text());
}

export async function restFetchAll(table, filters = {}, order = 'created_at.asc') {
  const pageSize = 1000;
  const out = [];
  for (let from = 0; ; from += pageSize) {
    const { url, key } = cfg();
    const params = new URLSearchParams({ select: '*', order });
    for (const [k, v] of Object.entries(filters)) {
      params.set(k, typeof v === 'string' && v.includes('.') ? v : `eq.${v}`);
    }
    const res = await fetch(`${url}/rest/v1/${table}?${params}`, {
      headers: headers(key, { Range: `${from}-${from + pageSize - 1}` }),
    });
    if (!res.ok) throw new Error(await res.text());
    const chunk = await res.json();
    out.push(...chunk);
    if (chunk.length < pageSize) break;
  }
  return out;
}

export { workspaceId };
