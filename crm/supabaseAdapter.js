/**
 * Supabase CRM adapter — PostgREST fetch (Node 20 safe).
 */
import { profileSlugFromUrl, canonicalProfileUrl } from '../connectionsSync.js';
import { STATUS_LEAD, STATUS_PROPOSAL_1 } from './constants.js';
import { restDelete, restFetchAll, restInsert, restSelect, restUpdate, workspaceId } from './supabaseRest.js';

function rowToLead(row) {
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

export async function listByStatus(statusName) {
  const ws = workspaceId();
  const rows = await restFetchAll('leads', { workspace_id: ws, status: statusName });
  return rows.map(rowToLead).filter((l) => (l.url || '').includes('linkedin.com'));
}

export async function findLeadsByName(statusName, searchToken) {
  const ws = workspaceId();
  const rows = await restFetchAll('leads', {
    workspace_id: ws,
    status: statusName,
    name: `ilike.%${searchToken}%`,
  });
  return rows.map(rowToLead);
}

export async function findCrmBySenderName(searchToken) {
  const ws = workspaceId();
  const rows = await restFetchAll('leads', {
    workspace_id: ws,
    name: `ilike.%${searchToken}%`,
  });
  return rows.map((row) => ({
    id: row.id,
    name: String(row.name || '').trim(),
    url: String(row.link || '').trim(),
    msg: String(row.ice_breaker || ''),
    status: String(row.status || '').trim(),
  }));
}

export async function updateStatus(id, statusName, extra = {}) {
  const patch = { status: statusName };
  if (extra.lost_reason != null || extra.lostReason != null) {
    patch.lost_reason = String(extra.lost_reason ?? extra.lostReason ?? '').trim().slice(0, 64);
  }
  await restUpdate('leads', id, patch);
}

export async function setProcessingAt(id, iso = new Date().toISOString()) {
  await restUpdate('leads', id, { processing_at: iso });
}

export async function ensureProcessingAt(id, iso = new Date().toISOString()) {
  const { rows } = await restSelect('leads', {
    filters: { id: `eq.${id}` },
    select: 'processing_at',
  });
  if (rows[0]?.processing_at) return;
  await setProcessingAt(id, iso);
}

export async function updateNameAndIceBreaker(
  id,
  { name, iceBreaker, location, timezone, email, setProcessingAt: setProc = false }
) {
  const patch = {};
  if (iceBreaker != null) patch.ice_breaker = String(iceBreaker);
  if (name != null && String(name).trim()) patch.name = String(name).trim().slice(0, 200);
  if (location != null) patch.location = String(location).trim().slice(0, 300);
  if (timezone != null) patch.timezone = String(timezone).trim().slice(0, 64);
  if (email != null) patch.email = String(email).trim().slice(0, 200);
  if (setProc) patch.processing_at = new Date().toISOString();
  await restUpdate('leads', id, patch);
}

export async function createLead({ url, name = '', status = STATUS_PROPOSAL_1 } = {}) {
  const cleanUrl = canonicalProfileUrl(url);
  if (!cleanUrl) throw new Error(`Invalid LinkedIn URL: ${url}`);
  const slug = profileSlugFromUrl(cleanUrl);
  const titleName = String(name || '').replace(/\s+/g, ' ').trim().slice(0, 200);
  const row = await restInsert('leads', {
    workspace_id: workspaceId(),
    name: titleName,
    link: cleanUrl,
    status,
    ice_breaker: '',
    notes: '',
    ...(status === STATUS_LEAD ? { processing_at: new Date().toISOString() } : {}),
  });
  return { id: row.id, url: cleanUrl, slug, name: titleName };
}

export async function createLeadSleep({ url }) {
  return createLead({ url, name: '', status: STATUS_LEAD });
}

export async function listLeadSleepPages({ maxPages = 30 } = {}) {
  const ws = workspaceId();
  const limit = Math.min(Math.max(maxPages, 1) * 100, 3000);
  const rows = await restFetchAll(
    'leads',
    { workspace_id: ws, status: STATUS_LEAD },
    'created_at.asc',
    { select: 'id,link,name,processing_at,created_at', max: limit }
  );
  const out = [];
  for (const row of rows) {
    const u = String(row.link || '');
    const slug = profileSlugFromUrl(u);
    if (!slug) continue;
    out.push({
      id: row.id,
      url: u,
      slug,
      name: String(row.name || '').trim(),
      processingAt: row.processing_at || null,
      createdAt: row.created_at || null,
    });
  }
  return out;
}

export async function findLeadSleepByUrls(urls = []) {
  const targets = new Set(
    urls
      .map((u) => profileSlugFromUrl(canonicalProfileUrl(u) || u))
      .filter(Boolean)
      .map((s) => s.toLowerCase())
  );
  if (!targets.size) return [];
  // listLeadSleepPages now selects only the columns needed for slug matching,
  // so scanning Lead rows here is cheap and keeps link-format quirks working.
  const all = await listLeadSleepPages({ maxPages: 30 });
  return all.filter((p) => targets.has(String(p.slug || '').toLowerCase()));
}

export async function promoteLeadSleepToProposal1({ id, url, name = '' }) {
  const cleanUrl = canonicalProfileUrl(url);
  const titleName = String(name || '').replace(/\s+/g, ' ').trim().slice(0, 200);
  const patch = { status: STATUS_PROPOSAL_1 };
  if (cleanUrl) patch.link = cleanUrl;
  if (titleName.length >= 2) patch.name = titleName;
  await restUpdate('leads', id, patch);
  return { id, url: cleanUrl, slug: profileSlugFromUrl(cleanUrl), name: titleName };
}

export async function fetchKnownProfileSlugs({ maxPages = 60 } = {}) {
  const ws = workspaceId();
  const limit = Math.min(Math.max(maxPages, 1) * 100, 6000);
  // Only `link` is needed here; this used to pull every column of every lead,
  // including the full `notes` transcript, just to build a slug set.
  const rows = await restFetchAll('leads', { workspace_id: ws }, 'created_at.asc', {
    select: 'link',
    max: limit,
  });
  const slugs = new Set();
  for (const row of rows) {
    if (!row.link) continue;
    const slug = profileSlugFromUrl(row.link);
    if (slug) slugs.add(slug.toLowerCase());
  }
  console.log(`CRM known LinkedIn slugs: ${slugs.size}`);
  return slugs;
}

export async function readNotes(id) {
  const { rows } = await restSelect('leads', { filters: { id: `eq.${id}` }, select: 'notes' });
  return String(rows[0]?.notes || '');
}

export async function appendNote(id, text) {
  const stamp = new Date().toISOString();
  const body = String(text || '').trim() || '(empty note)';
  const chunk = `[${stamp}] ${body}`;
  const existing = await readNotes(id);
  const notes = existing ? `${existing}\n${chunk}` : chunk;
  await restUpdate('leads', id, { notes });
}

export async function countByStatus() {
  const { CRM_STATUSES } = await import('./constants.js');
  const ws = workspaceId();
  const totals = await Promise.all(
    CRM_STATUSES.map((status) =>
      restSelect('leads', { filters: { workspace_id: ws, status }, count: true }).then(
        (r) => r.total
      )
    )
  );
  const counts = {};
  CRM_STATUSES.forEach((status, i) => {
    counts[status] = totals[i];
  });
  return { ok: true, counts, cachedAt: new Date().toISOString() };
}

export async function listLeadsPage({ status, q, page = 1, limit = 50 } = {}) {
  const ws = workspaceId();
  const pageSize = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const pageNum = Math.max(Number(page) || 1, 1);
  const from = (pageNum - 1) * pageSize;
  const url = String(process.env.SUPABASE_URL || '').trim().replace(/\/$/, '');
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!url || !key) throw new Error('SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing');
  const params = new URLSearchParams({ select: '*', order: 'updated_at.desc' });
  params.set('workspace_id', `eq.${ws}`);
  if (status) params.set('status', `eq.${status}`);
  const needle = String(q || '').trim();
  if (needle) params.set('or', `(name.ilike.%${needle}%,link.ilike.%${needle}%)`);
  const res = await fetch(`${url}/rest/v1/leads?${params}`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Prefer: 'count=exact',
      Range: `${from}-${from + pageSize - 1}`,
    },
  });
  if (!res.ok) throw new Error(await res.text());
  const data = await res.json();
  const total = Number(res.headers.get('content-range')?.split('/')?.[1] || 0);
  return { ok: true, leads: data.map(rowToLead), total, page: pageNum, limit: pageSize };
}

export async function getLead(id) {
  const { rows } = await restSelect('leads', { filters: { id: `eq.${id}` } });
  return rowToLead(rows[0]);
}

export async function patchLead(id, fields = {}) {
  const patch = {};
  if (fields.name != null) patch.name = String(fields.name).trim().slice(0, 200);
  if (fields.url != null || fields.link != null) {
    const raw = fields.url != null ? fields.url : fields.link;
    patch.link = canonicalProfileUrl(raw) || String(raw || '').trim();
  }
  if (fields.status != null) patch.status = String(fields.status);
  if (fields.msg != null || fields.ice_breaker != null) {
    patch.ice_breaker = String(fields.msg ?? fields.ice_breaker);
  }
  if (fields.processingAt != null || fields.processing_at != null) {
    patch.processing_at = fields.processingAt || fields.processing_at;
  }
  if (fields.notes != null) patch.notes = String(fields.notes);
  if (fields.location != null) patch.location = String(fields.location).trim().slice(0, 300);
  if (fields.timezone != null) patch.timezone = String(fields.timezone).trim().slice(0, 64);
  if (fields.email != null) patch.email = String(fields.email).trim().slice(0, 200);
  if (fields.lostReason != null || fields.lost_reason != null) {
    patch.lost_reason = String(fields.lostReason ?? fields.lost_reason ?? '').trim().slice(0, 64);
  }
  if (fields.messengerApp != null || fields.messenger_app != null) {
    patch.messenger_app = String(fields.messengerApp ?? fields.messenger_app ?? '').trim().slice(0, 32);
  }
  if (fields.messengerValue != null || fields.messenger_value != null) {
    patch.messenger_value = String(fields.messengerValue ?? fields.messenger_value ?? '')
      .trim()
      .slice(0, 300);
  }
  const row = await restUpdate('leads', id, patch);
  return rowToLead(row);
}

export async function deleteLead(id) {
  await restDelete('leads', id);
  return { ok: true };
}
