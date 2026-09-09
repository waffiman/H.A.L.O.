/**
 * Archive all Proposal 1️⃣ pages and reset connections cursor to hunny-makhado.
 * Run inside linkedin-agent container / app cwd.
 */
import fs from 'fs';
import { Client } from '@notionhq/client';
import dotenv from 'dotenv';

dotenv.config({ override: true });

const STATUS = 'Proposal 1️⃣';
const RESET_SLUG = 'hunny-makhado-3771947a';
const RESET_URL = 'https://www.linkedin.com/in/hunny-makhado-3771947a/';

const notion = new Client({ auth: process.env.NOTION_TOKEN });
const db = process.env.NOTION_DATABASE_ID;
if (!process.env.NOTION_TOKEN || !db) {
  console.error('Missing NOTION_TOKEN / NOTION_DATABASE_ID');
  process.exit(1);
}

const results = [];
let cursor;
do {
  const chunk = await notion.databases.query({
    database_id: db,
    filter: { property: 'Status', select: { equals: STATUS } },
    page_size: 100,
    start_cursor: cursor,
  });
  results.push(...chunk.results);
  cursor = chunk.has_more ? chunk.next_cursor : undefined;
} while (cursor);

const slugs = [];
for (const p of results) {
  const link = p.properties?.Link;
  const url = (link?.url || '').trim();
  const m = url.match(/linkedin\.com\/in\/([^/?#]+)/i);
  if (m) slugs.push(decodeURIComponent(m[1]).toLowerCase());
  const name = (p.properties?.Name?.title?.[0]?.plain_text || '').trim();
  await notion.pages.update({ page_id: p.id, archived: true });
  console.log('archived', name || p.id, url);
}
console.log('archived_count', results.length);

const statePath = new URL('./connections_sync_state.json', import.meta.url);
const path = statePath.pathname.startsWith('/') && process.platform === 'win32'
  ? statePath.pathname.slice(1)
  : statePath.pathname;
const file = process.cwd() + '/connections_sync_state.json';
const state = JSON.parse(fs.readFileSync(file, 'utf8'));
const drop = new Set(slugs);
state.recentSlugs = (state.recentSlugs || []).filter((s) => !drop.has(String(s).toLowerCase()));
state.lastSyncedProfileSlug = RESET_SLUG;
state.lastSyncedProfileUrl = RESET_URL;
state.lastRunAt = null;
fs.writeFileSync(file, JSON.stringify(state, null, 2));
console.log('cursor_reset', state.lastSyncedProfileSlug, 'recent_left', state.recentSlugs.length);
