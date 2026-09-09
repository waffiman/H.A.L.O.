/**
 * Copy ALL leads from Notion CRM → Supabase (idempotent via notion_page_id).
 * Requires: NOTION_* + SUPABASE_* in .env. Does NOT change CRM_BACKEND.
 *
 * Usage: node scripts/migrate-notion-to-supabase.js [--skip-notes]
 */
import dotenv from 'dotenv';
import { Client } from '@notionhq/client';
import { notionRichText } from '../messageQuality.js';

dotenv.config({ override: true });

const CRM_STATUSES = ['Lead😴', 'Proposal 1️⃣', 'Proposal 2️⃣', 'Active ✅', 'Lost❌'];
const skipNotes = process.argv.includes('--skip-notes');

function sbHeaders(key, extra = {}) {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}

async function sbUpsert(baseUrl, key, row) {
  const res = await fetch(`${baseUrl}/rest/v1/leads?on_conflict=notion_page_id`, {
    method: 'POST',
    headers: sbHeaders(key, {
      Prefer: 'resolution=merge-duplicates,return=minimal',
    }),
    body: JSON.stringify(row),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || `HTTP ${res.status}`);
  }
}

async function sbCountStatus(baseUrl, key, workspace, status) {
  const q = new URLSearchParams({
    select: 'id',
    workspace_id: `eq.${workspace}`,
    status: `eq.${status}`,
  });
  const res = await fetch(`${baseUrl}/rest/v1/leads?${q}`, {
    headers: sbHeaders(key, { Prefer: 'count=exact' }),
  });
  if (!res.ok) throw new Error(await res.text());
  return Number(res.headers.get('content-range')?.split('/')?.[1] || 0);
}

async function sbCountTotal(baseUrl, key, workspace) {
  const q = new URLSearchParams({ select: 'id', workspace_id: `eq.${workspace}` });
  const res = await fetch(`${baseUrl}/rest/v1/leads?${q}`, {
    headers: sbHeaders(key, { Prefer: 'count=exact' }),
  });
  if (!res.ok) throw new Error(await res.text());
  return Number(res.headers.get('content-range')?.split('/')?.[1] || 0);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function mapPage(p) {
  const props = p.properties || {};
  const linkProp = props.Link;
  const url =
    linkProp?.url || linkProp?.rich_text?.[0]?.plain_text || linkProp?.title?.[0]?.plain_text || '';
  return {
    notion_page_id: p.id,
    name: (props.Name?.title?.[0]?.plain_text || '').trim(),
    link: String(url || '').trim(),
    status: (props.Status?.select?.name || '').trim(),
    ice_breaker: notionRichText(props['Ice-breaker']),
    processing_at: props['Processing at']?.date?.start || null,
  };
}

async function fetchAllNotionPages(notion, databaseId) {
  const out = [];
  let cursor;
  do {
    const chunk = await notion.databases.query({
      database_id: databaseId,
      page_size: 100,
      start_cursor: cursor,
    });
    out.push(...chunk.results);
    cursor = chunk.has_more ? chunk.next_cursor : undefined;
    process.stdout.write(`\rNotion fetched: ${out.length}`);
    await sleep(350);
  } while (cursor);
  console.log('');
  return out;
}

async function readNotionBody(notion, pageId) {
  const parts = [];
  let cursor;
  do {
    const chunk = await notion.blocks.children.list({
      block_id: pageId,
      page_size: 100,
      start_cursor: cursor,
    });
    for (const b of chunk.results || []) {
      if (b.archived) continue;
      const data = b[b.type];
      if (data?.rich_text) {
        const line = data.rich_text.map((r) => r.plain_text || '').join('').trim();
        if (line) parts.push(line);
      }
    }
    cursor = chunk.has_more ? chunk.next_cursor : undefined;
    await sleep(200);
  } while (cursor);
  return parts.join('\n');
}

async function countNotionByStatus(pages) {
  const counts = Object.fromEntries(CRM_STATUSES.map((s) => [s, 0]));
  let other = 0;
  for (const p of pages) {
    const row = mapPage(p);
    if (CRM_STATUSES.includes(row.status)) counts[row.status] += 1;
    else other += 1;
  }
  return { counts, other, total: pages.length };
}

async function countSupabase(baseUrl, key, workspace) {
  const counts = {};
  for (const status of CRM_STATUSES) {
    counts[status] = await sbCountStatus(baseUrl, key, workspace, status);
  }
  const total = await sbCountTotal(baseUrl, key, workspace);
  return { counts, total };
}

async function main() {
  const token = process.env.NOTION_TOKEN;
  const databaseId = process.env.NOTION_DATABASE_ID;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const workspace = process.env.WORKSPACE_ID || 'default';

  if (!token || !databaseId) throw new Error('NOTION_TOKEN / NOTION_DATABASE_ID required');
  if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY required');

  const notion = new Client({ auth: token });
  const baseUrl = url.replace(/\/$/, '');

  console.log('Fetching Notion CRM pages…');
  const pages = await fetchAllNotionPages(notion, databaseId);
  const notionStats = await countNotionByStatus(pages);
  console.log('Notion counts:', notionStats.counts, 'total:', notionStats.total, 'other status:', notionStats.other);

  let upserted = 0;
  let skipped = 0;
  for (let i = 0; i < pages.length; i++) {
    const p = pages[i];
    const row = mapPage(p);
    if (!CRM_STATUSES.includes(row.status)) {
      skipped += 1;
      continue;
    }
    let notes = '';
    if (!skipNotes) {
      try {
        notes = await readNotionBody(notion, p.id);
      } catch {
        notes = '';
      }
    }
    const payload = {
      notion_page_id: row.notion_page_id,
      workspace_id: workspace,
      name: row.name,
      link: row.link || null,
      status: row.status,
      ice_breaker: row.ice_breaker || '',
      processing_at: row.processing_at,
      notes,
    };
    try {
      await sbUpsert(baseUrl, key, payload);
      upserted += 1;
    } catch (e) {
      console.error(`Upsert failed ${row.notion_page_id}:`, e.message);
    }
    if ((i + 1) % 25 === 0) process.stdout.write(`\rUpserted: ${upserted}/${pages.length - skipped}`);
    await sleep(50);
  }
  console.log(`\nUpserted: ${upserted}, skipped (bad status): ${skipped}`);

  const sbStats = await countSupabase(baseUrl, key, workspace);
  console.log('Supabase counts:', sbStats.counts, 'total:', sbStats.total);

  let mismatch = false;
  for (const s of CRM_STATUSES) {
    if (notionStats.counts[s] !== sbStats.counts[s]) {
      console.error(`MISMATCH ${s}: notion=${notionStats.counts[s]} supabase=${sbStats.counts[s]}`);
      mismatch = true;
    }
  }
  if (mismatch) {
    console.error('Count verification FAILED');
    process.exit(1);
  }
  console.log('Count verification OK');
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
