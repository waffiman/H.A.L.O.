/**
 * Notion CRM auto-provision for first-time HALO users.
 * Creates a database matching the agent schema (OVERVIEW.md §3).
 */
import { readEnvFile, writeEnvFile } from './env.js';

const NOTION_VERSION = '2022-06-28';

export const HALO_CRM_STATUS_OPTIONS = [
  { name: 'Lead😴', color: 'default' },
  { name: 'Proposal 1️⃣', color: 'blue' },
  { name: 'Proposal 2️⃣', color: 'purple' },
  { name: 'Active ✅', color: 'green' },
  { name: 'Lost❌', color: 'red' },
];

export function notionConfigured(env = readEnvFile()) {
  return Boolean((env.NOTION_TOKEN || '').trim() && (env.NOTION_DATABASE_ID || '').trim());
}

async function notionFetch(token, apiPath, { method = 'GET', body } = {}) {
  const res = await fetch(`https://api.notion.com/v1${apiPath}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.message || `Notion API ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  return data;
}

export async function validateNotionToken(token) {
  const t = String(token || '').trim();
  if (!t) throw new Error('Notion integration token is required');
  const me = await notionFetch(t, '/users/me');
  return {
    ok: true,
    name: me.name || 'Notion integration',
    type: me.type || 'bot',
  };
}

function readPageTitle(page) {
  const props = page.properties || {};
  for (const val of Object.values(props)) {
    if (val?.type === 'title') {
      return (val.title || []).map((t) => t.plain_text).join('').trim() || 'Untitled';
    }
  }
  return 'Untitled';
}

export async function searchNotionPages(token, { query = '', pageSize = 50 } = {}) {
  const t = String(token || '').trim();
  if (!t) throw new Error('Notion integration token is required');

  const body = {
    filter: { property: 'object', value: 'page' },
    page_size: Math.min(Math.max(pageSize, 1), 100),
    sort: { direction: 'descending', timestamp: 'last_edited_time' },
  };
  const q = String(query || '').trim();
  if (q) body.query = q;

  const data = await notionFetch(t, '/search', { method: 'POST', body });
  const pages = (data.results || [])
    .filter((p) => p.object === 'page' && !p.archived)
    .map((p) => ({
      id: p.id,
      title: readPageTitle(p),
      url: p.url || '',
      lastEdited: p.last_edited_time || null,
    }));
  return { ok: true, pages };
}

export async function provisionHaloCrm(token, parentPageId) {
  const t = String(token || '').trim();
  const pageId = String(parentPageId || '').trim();
  if (!t) throw new Error('Notion integration token is required');
  if (!pageId) throw new Error('Choose a parent page for the CRM database');

  const db = await notionFetch(t, '/databases', {
    method: 'POST',
    body: {
      parent: { type: 'page_id', page_id: pageId },
      icon: { type: 'emoji', emoji: '🎯' },
      title: [{ type: 'text', text: { content: 'H.A.L.O. CRM' } }],
      properties: {
        Name: { title: {} },
        Link: { url: {} },
        Status: {
          select: {
            options: HALO_CRM_STATUS_OPTIONS,
          },
        },
        'Ice-breaker': { rich_text: {} },
        'Processing at': { date: {} },
      },
    },
  });

  const databaseId = db.id;
  const crmUrl = db.url || `https://www.notion.so/${String(databaseId).replace(/-/g, '')}`;

  writeEnvFile({
    NOTION_TOKEN: t,
    NOTION_DATABASE_ID: databaseId,
    NOTION_CRM_URL: crmUrl,
  });

  return { ok: true, databaseId, crmUrl };
}
