/**
 * Notion CRM adapter — wraps existing Notion API usage.
 */
import { Client } from '@notionhq/client';
import { notionRichText } from '../messageQuality.js';
import { canonicalProfileUrl, profileSlugFromUrl } from '../connectionsSync.js';
import { STATUS_LEAD, STATUS_PROPOSAL_1 } from './constants.js';

function getNotion() {
  return new Client({ auth: process.env.NOTION_TOKEN });
}

function getDatabaseId() {
  return process.env.NOTION_DATABASE_ID;
}

function mapPage(p) {
  const props = p.properties || {};
  const linkProp = props.Link;
  const linkedinUrl =
    linkProp?.url || linkProp?.rich_text?.[0]?.plain_text || linkProp?.title?.[0]?.plain_text || '';
  const processingAtRaw = props['Processing at']?.date?.start || null;
  return {
    id: p.id,
    name: (props.Name?.title?.[0]?.plain_text || '').trim(),
    url: String(linkedinUrl || '').trim(),
    msg: notionRichText(props['Ice-breaker']),
    processingAt: processingAtRaw ? new Date(processingAtRaw) : null,
    status: (props.Status?.select?.name || '').trim(),
  };
}

async function queryAll(filter) {
  const notion = getNotion();
  const databaseId = getDatabaseId();
  const results = [];
  let cursor;
  do {
    const chunk = await notion.databases.query({
      database_id: databaseId,
      filter,
      page_size: 100,
      start_cursor: cursor,
    });
    results.push(...chunk.results);
    cursor = chunk.has_more ? chunk.next_cursor : undefined;
  } while (cursor);
  return results;
}

export async function listByStatus(statusName) {
  const results = await queryAll({ property: 'Status', select: { equals: statusName } });
  return results.map(mapPage).filter((l) => l.url.includes('linkedin.com'));
}

export async function findLeadsByName(statusName, searchToken) {
  const results = await queryAll({
    and: [
      { property: 'Status', select: { equals: statusName } },
      { property: 'Name', title: { contains: searchToken } },
    ],
  });
  return results.map(mapPage);
}

export async function findCrmBySenderName(searchToken) {
  const results = await queryAll({ property: 'Name', title: { contains: searchToken } });
  return results.map(mapPage);
}

export async function updateStatus(id, statusName, extraProps = {}) {
  const notion = getNotion();
  const properties = { Status: { select: { name: statusName } } };
  const reason = extraProps.lost_reason ?? extraProps.lostReason;
  if (reason) {
    properties['Lost reason'] = { select: { name: String(reason) } };
  }
  try {
    await notion.pages.update({ page_id: id, properties });
  } catch (e) {
    if (properties['Lost reason']) {
      delete properties['Lost reason'];
      await notion.pages.update({ page_id: id, properties });
      return;
    }
    throw e;
  }
}

export async function setProcessingAt(id, iso = new Date().toISOString()) {
  const notion = getNotion();
  await notion.pages.update({
    page_id: id,
    properties: { 'Processing at': { date: { start: iso } } },
  });
}

export async function ensureProcessingAt(id, iso = new Date().toISOString()) {
  const notion = getNotion();
  const page = await notion.pages.retrieve({ page_id: id });
  const existing = page.properties?.['Processing at']?.date?.start;
  if (existing) return;
  await setProcessingAt(id, iso);
}

export async function updateNameAndIceBreaker(
  id,
  { name, iceBreaker, location, timezone, email, setProcessingAt: setProc = false }
) {
  const notion = getNotion();
  const properties = {
    'Ice-breaker': {
      rich_text: [{ type: 'text', text: { content: String(iceBreaker || '') } }],
    },
  };
  if (name != null && String(name).trim()) {
    properties.Name = {
      title: [{ type: 'text', text: { content: String(name).trim().slice(0, 200) } }],
    };
  }
  if (location != null && String(location).trim()) {
    properties.Location = {
      rich_text: [{ type: 'text', text: { content: String(location).trim().slice(0, 300) } }],
    };
  }
  if (timezone != null && String(timezone).trim()) {
    properties.Timezone = {
      rich_text: [{ type: 'text', text: { content: String(timezone).trim().slice(0, 64) } }],
    };
  }
  if (email != null && String(email).trim()) {
    properties.Email = { email: String(email).trim().slice(0, 200) };
  }
  if (setProc) {
    properties['Processing at'] = { date: { start: new Date().toISOString() } };
  }
  const optionalKeys = ['Location', 'Timezone', 'Email'];
  try {
    await notion.pages.update({ page_id: id, properties });
  } catch (e) {
    for (const k of optionalKeys) delete properties[k];
    await notion.pages.update({ page_id: id, properties });
  }
}

export async function createLead({ url, name = '', status = STATUS_PROPOSAL_1 } = {}) {
  const notion = getNotion();
  const databaseId = getDatabaseId();
  const cleanUrl = canonicalProfileUrl(url);
  if (!cleanUrl) throw new Error(`Invalid LinkedIn URL: ${url}`);
  const slug = profileSlugFromUrl(cleanUrl);
  const titleName = String(name || '').replace(/\s+/g, ' ').trim().slice(0, 200);
  const properties = {
    Name: { title: titleName ? [{ type: 'text', text: { content: titleName } }] : [] },
    Link: { url: cleanUrl },
    Status: { select: { name: status } },
  };
  if (status === STATUS_LEAD) {
    properties['Processing at'] = { date: { start: new Date().toISOString() } };
  }
  const page = await notion.pages.create({ parent: { database_id: databaseId }, properties });
  return { id: page.id, url: cleanUrl, slug, name: titleName };
}

export async function createLeadSleep({ url }) {
  return createLead({ url, name: '', status: STATUS_LEAD });
}

function readLinkFromPage(page) {
  const linkProp = page.properties?.Link;
  if (linkProp?.type === 'url') return linkProp.url || '';
  if (linkProp?.type === 'rich_text') {
    return (linkProp.rich_text || []).map((t) => t.plain_text).join('') || '';
  }
  return '';
}

export async function listLeadSleepPages({ maxPages = 30 } = {}) {
  const notion = getNotion();
  const databaseId = getDatabaseId();
  const out = [];
  let cursor;
  for (let i = 0; i < maxPages; i++) {
    const body = {
      filter: { property: 'Status', select: { equals: STATUS_LEAD } },
      page_size: 100,
    };
    if (cursor) body.start_cursor = cursor;
    const chunk = await notion.databases.query({ database_id: databaseId, ...body });
    for (const page of chunk.results || []) {
      const url = readLinkFromPage(page);
      const slug = profileSlugFromUrl(url);
      if (!slug) continue;
      const processingAtRaw = page.properties?.['Processing at']?.date?.start || null;
      out.push({
        id: page.id,
        url,
        slug,
        name: (page.properties?.Name?.title || []).map((t) => t.plain_text).join('').trim(),
        processingAt: processingAtRaw,
        createdAt: page.created_time || null,
      });
    }
    if (!chunk.has_more) break;
    cursor = chunk.next_cursor;
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
  const all = await listLeadSleepPages({ maxPages: 30 });
  return all.filter((p) => targets.has(String(p.slug || '').toLowerCase()));
}

export async function promoteLeadSleepToProposal1({ id, url, name = '' }) {
  const notion = getNotion();
  const cleanUrl = canonicalProfileUrl(url);
  const titleName = String(name || '').replace(/\s+/g, ' ').trim().slice(0, 200);
  const properties = { Status: { select: { name: STATUS_PROPOSAL_1 } } };
  if (cleanUrl) properties.Link = { url: cleanUrl };
  if (titleName.length >= 2) {
    properties.Name = { title: [{ type: 'text', text: { content: titleName } }] };
  }
  await notion.pages.update({ page_id: id, properties });
  return { id, url: cleanUrl, slug: profileSlugFromUrl(cleanUrl), name: titleName };
}

export async function fetchKnownProfileSlugs({ maxPages = 60 } = {}) {
  const notion = getNotion();
  const databaseId = getDatabaseId();
  const slugs = new Set();
  let cursor;
  for (let i = 0; i < maxPages; i++) {
    const body = {
      database_id: databaseId,
      page_size: 100,
      filter: { property: 'Link', url: { is_not_empty: true } },
    };
    if (cursor) body.start_cursor = cursor;
    const chunk = await notion.databases.query(body);
    for (const page of chunk.results || []) {
      const url = readLinkFromPage(page);
      const slug = profileSlugFromUrl(url);
      if (slug) slugs.add(slug.toLowerCase());
    }
    if (!chunk.has_more) break;
    cursor = chunk.next_cursor;
  }
  console.log(`CRM known LinkedIn slugs: ${slugs.size}`);
  return slugs;
}

export async function readNotes(pageId) {
  const notion = getNotion();
  const parts = [];
  let cursor;
  do {
    const chunk = await notion.blocks.children.list({
      block_id: pageId,
      start_cursor: cursor,
      page_size: 100,
    });
    for (const b of chunk.results) {
      if (b.archived) continue;
      const t = b.type;
      const data = b[t];
      if (data?.rich_text) {
        const line = data.rich_text.map((r) => r.plain_text || '').join('').trim();
        if (line) parts.push(line);
      }
    }
    cursor = chunk.has_more ? chunk.next_cursor : undefined;
  } while (cursor);
  return parts.join('\n');
}

export async function appendNote(pageId, text) {
  const notion = getNotion();
  const stamp = new Date().toISOString();
  const body = String(text || '').trim() || '(empty note)';
  const full = `[${stamp}] ${body}`;
  const chunks = [];
  for (let i = 0; i < full.length; i += 1900) chunks.push(full.slice(i, i + 1900));
  await notion.blocks.children.append({
    block_id: pageId,
    children: chunks.map((content) => ({
      object: 'block',
      type: 'paragraph',
      paragraph: { rich_text: [{ type: 'text', text: { content } }] },
    })),
  });
}

export async function countByStatus() {
  const { CRM_STATUSES } = await import('./constants.js');
  const counts = {};
  for (const status of CRM_STATUSES) {
    const rows = await queryAll({ property: 'Status', select: { equals: status } });
    counts[status] = rows.length;
  }
  return { ok: true, counts, cachedAt: new Date().toISOString() };
}

export async function listLeadsPage(opts) {
  const status = opts?.status;
  const q = String(opts?.q || '').trim().toLowerCase();
  const page = Math.max(Number(opts?.page) || 1, 1);
  const limit = Math.min(Math.max(Number(opts?.limit) || 50, 1), 200);
  let leads = status ? await listByStatus(status) : [];
  if (!status) {
    const { CRM_STATUSES } = await import('./constants.js');
    leads = [];
    for (const s of CRM_STATUSES) {
      leads.push(...(await listByStatus(s)));
    }
  }
  if (q) {
    leads = leads.filter(
      (l) => l.name.toLowerCase().includes(q) || l.url.toLowerCase().includes(q)
    );
  }
  const total = leads.length;
  const slice = leads.slice((page - 1) * limit, page * limit);
  return { ok: true, leads: slice, total, page, limit };
}

export async function getLead(id) {
  const notion = getNotion();
  const page = await notion.pages.retrieve({ page_id: id });
  return mapPage(page);
}

export async function patchLead(id, fields = {}) {
  const notion = getNotion();
  const properties = {};
  if (fields.name != null) {
    properties.Name = {
      title: [{ type: 'text', text: { content: String(fields.name).trim().slice(0, 200) } }],
    };
  }
  if (fields.url != null || fields.link != null) {
    const raw = fields.url != null ? fields.url : fields.link;
    properties.Link = { url: canonicalProfileUrl(raw) || String(raw || '') };
  }
  if (fields.status != null) properties.Status = { select: { name: String(fields.status) } };
  if (fields.msg != null || fields.ice_breaker != null) {
    properties['Ice-breaker'] = {
      rich_text: [{ type: 'text', text: { content: String(fields.msg ?? fields.ice_breaker) } }],
    };
  }
  if (fields.processingAt != null || fields.processing_at != null) {
    properties['Processing at'] = {
      date: { start: fields.processingAt || fields.processing_at },
    };
  }
  await notion.pages.update({ page_id: id, properties });
  return getLead(id);
}

export async function deleteLead(id) {
  const notion = getNotion();
  await notion.pages.update({ page_id: id, archived: true });
  return { ok: true };
}
