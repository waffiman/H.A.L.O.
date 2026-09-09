/**
 * Sync Notion page bodies → Supabase leads.notes (Conversation).
 * Only fills empty notes by default. Use --force to overwrite all.
 *
 * Usage: node scripts/sync-notion-notes-to-supabase.js [--force]
 */
import dotenv from 'dotenv';
import { Client } from '@notionhq/client';

dotenv.config({ override: true });

const force = process.argv.includes('--force');

function sbHeaders(key, extra = {}) {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
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
    await sleep(180);
  } while (cursor);
  return parts.join('\n');
}

async function fetchLeadsNeedingNotes(baseUrl, key, workspace) {
  const out = [];
  let offset = 0;
  const limit = 200;
  for (;;) {
    const q = new URLSearchParams({
      select: 'id,notion_page_id,name,notes',
      workspace_id: `eq.${workspace}`,
      notion_page_id: 'not.is.null',
      order: 'updated_at.desc',
      limit: String(limit),
      offset: String(offset),
    });
    const res = await fetch(`${baseUrl}/rest/v1/leads?${q}`, {
      headers: sbHeaders(key),
    });
    if (!res.ok) throw new Error(await res.text());
    const rows = await res.json();
    for (const row of rows) {
      if (force || !String(row.notes || '').trim()) out.push(row);
    }
    if (rows.length < limit) break;
    offset += limit;
  }
  return out;
}

async function patchNotes(baseUrl, key, id, notes) {
  const res = await fetch(`${baseUrl}/rest/v1/leads?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: sbHeaders(key, { Prefer: 'return=minimal' }),
    body: JSON.stringify({ notes }),
  });
  if (!res.ok) throw new Error(await res.text());
}

async function main() {
  const token = process.env.NOTION_TOKEN;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const workspace = process.env.WORKSPACE_ID || 'default';
  if (!token) throw new Error('NOTION_TOKEN required');
  if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY required');

  const notion = new Client({ auth: token });
  const baseUrl = url.replace(/\/$/, '');

  console.log(force ? 'Mode: overwrite all notes' : 'Mode: fill empty notes only');
  const leads = await fetchLeadsNeedingNotes(baseUrl, key, workspace);
  console.log(`Leads to sync: ${leads.length}`);

  let updated = 0;
  let empty = 0;
  let failed = 0;
  for (let i = 0; i < leads.length; i++) {
    const lead = leads[i];
    const pageId = lead.notion_page_id;
    if (!pageId) continue;
    try {
      const notes = await readNotionBody(notion, pageId);
      if (!notes.trim()) {
        empty += 1;
      } else {
        await patchNotes(baseUrl, key, lead.id, notes);
        updated += 1;
      }
    } catch (e) {
      failed += 1;
      console.error(`Fail ${lead.name || lead.id}:`, e.message);
    }
    if ((i + 1) % 20 === 0 || i === leads.length - 1) {
      process.stdout.write(`\rDone ${i + 1}/${leads.length} · updated=${updated} empty=${empty} failed=${failed}`);
    }
    await sleep(40);
  }
  console.log(`\nSync complete. updated=${updated} empty_in_notion=${empty} failed=${failed}`);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
