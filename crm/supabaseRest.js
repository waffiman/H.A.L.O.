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

/**
 * @param {string} table
 * @param {{ filters?: object, order?: string, count?: boolean, select?: string, limit?: number }} opts
 *   `select` narrows returned columns (default '*'). `count: true` issues a HEAD
 *   request so PostgREST returns only the Content-Range count — it previously
 *   sent a full GET and threw the serialized body away.
 */
export async function restSelect(
  table,
  { filters = {}, order, count = false, select = '*', limit } = {}
) {
  const { url, key } = cfg();
  const params = new URLSearchParams({ select: count ? 'id' : select });
  for (const [k, v] of Object.entries(filters)) {
    if (v == null) continue;
    params.set(k, typeof v === 'string' && v.includes('.') ? v : `eq.${v}`);
  }
  if (order) params.set('order', order);
  if (Number.isFinite(limit) && limit > 0) params.set('limit', String(limit));
  const h = headers(key);
  if (count) h.Prefer = 'count=exact';
  const res = await fetch(`${url}/rest/v1/${table}?${params}`, {
    method: count ? 'HEAD' : 'GET',
    headers: h,
  });
  if (!res.ok) {
    // HEAD responses have no body, so fall back to the status line.
    const body = await res.text().catch(() => '');
    throw new Error(body || `HTTP ${res.status} ${res.statusText}`.trim());
  }
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

/**
 * Page through every matching row.
 * @param {string} table
 * @param {object} filters
 * @param {string} order
 * @param {{ select?: string, max?: number }} opts `select` narrows columns —
 *   important because `leads.notes` holds full conversation transcripts and is
 *   pure waste for callers that only need a slug or a status. `max` stops
 *   paging once enough rows are collected instead of fetching all then slicing.
 */
export async function restFetchAll(
  table,
  filters = {},
  order = 'created_at.asc',
  { select = '*', max } = {}
) {
  const hardMax = Number.isFinite(max) && max > 0 ? max : Infinity;
  const pageSize = Math.min(1000, hardMax);
  const out = [];
  for (let from = 0; ; from += pageSize) {
    const { url, key } = cfg();
    const params = new URLSearchParams({ select, order });
    for (const [k, v] of Object.entries(filters)) {
      params.set(k, typeof v === 'string' && v.includes('.') ? v : `eq.${v}`);
    }
    const res = await fetch(`${url}/rest/v1/${table}?${params}`, {
      headers: headers(key, { Range: `${from}-${from + pageSize - 1}` }),
    });
    if (!res.ok) throw new Error(await res.text().catch(() => `HTTP ${res.status}`));
    const chunk = await res.json();
    out.push(...chunk);
    if (chunk.length < pageSize) break;
    if (out.length >= hardMax) break;
  }
  return out.length > hardMax ? out.slice(0, hardMax) : out;
}

export { workspaceId };
