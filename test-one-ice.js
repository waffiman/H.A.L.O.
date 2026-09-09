/**
 * One-lead test: Notion Proposal 1️⃣ + Link → enrich → send ice → Proposal 2️⃣.
 * Skips My Connections sync. Does not run Stage B.
 *
 *   TARGET_LINKEDIN_URL=https://www.linkedin.com/in/.../ node test-one-ice.js
 */
import dotenv from 'dotenv';
dotenv.config();

import { createNotionLead, canonicalProfileUrl, profileSlugFromUrl } from './connectionsSync.js';
import { Client } from '@notionhq/client';
import { enrichProposal1Leads, hasRealIceBreaker } from './enrichAndWrite.js';
import { runStageA } from './index.js';

const TARGET =
  process.env.TARGET_LINKEDIN_URL ||
  'https://www.linkedin.com/in/dmytro-korobko-86921a2a9/';

const notion = new Client({ auth: process.env.NOTION_TOKEN });
const databaseId = process.env.NOTION_DATABASE_ID;

async function findBySlug(slug) {
  const statuses = ['Proposal 1️⃣', 'Proposal 2️⃣', 'Active ✅', 'Lost❌'];
  for (const status of statuses) {
    let cursor;
    do {
      const chunk = await notion.databases.query({
        database_id: databaseId,
        filter: { property: 'Status', select: { equals: status } },
        page_size: 100,
        start_cursor: cursor,
      });
      for (const p of chunk.results) {
        const link = p.properties.Link?.url || '';
        if (profileSlugFromUrl(link) === slug) {
          return {
            id: p.id,
            url: link,
            name: (p.properties.Name?.title?.[0]?.plain_text || '').trim(),
            msg: (p.properties['Ice-breaker']?.rich_text?.[0]?.plain_text || '').trim(),
            status: p.properties.Status?.select?.name || '',
            processingAt: p.properties['Processing at']?.date?.start || null,
          };
        }
      }
      cursor = chunk.has_more ? chunk.next_cursor : undefined;
    } while (cursor);
  }
  return null;
}

async function main() {
  const cleanUrl = canonicalProfileUrl(TARGET);
  const slug = profileSlugFromUrl(cleanUrl);
  process.env.TARGET_LINKEDIN_URL = cleanUrl;
  console.log(`=== ONE-LEAD ICE TEST: ${cleanUrl} ===`);

  let lead = await findBySlug(slug);
  if (lead?.status === 'Proposal 2️⃣' && hasRealIceBreaker(lead.msg)) {
    console.log(`Already Proposal 2️⃣ (${lead.name}). Skip send to avoid duplicate DM.`);
    console.log(JSON.stringify(lead, null, 2));
    return;
  }

  if (!lead) {
    console.log('Creating Notion CRM page: Link + Proposal 1️⃣ ...');
    const created = await createNotionLead({ url: cleanUrl });
    lead = { id: created.id, url: created.url, name: '', msg: '', status: 'Proposal 1️⃣' };
    console.log('Created page:', lead.id);
  } else {
    console.log(`Found: ${lead.status} | ${lead.name || '(no name)'} | ${lead.url}`);
  }

  console.log('--- Enrich (TARGET only) ---');
  process.env.ENRICH_MAX_PER_RUN = '1';
  await enrichProposal1Leads();

  const page = await notion.pages.retrieve({ page_id: lead.id });
  lead.name = (page.properties.Name?.title?.[0]?.plain_text || '').trim();
  lead.msg = (page.properties['Ice-breaker']?.rich_text?.[0]?.plain_text || '').trim();
  console.log(`After enrich: name="${lead.name}" iceLen=${(lead.msg || '').length}`);
  console.log(`Ice preview: ${(lead.msg || '').slice(0, 200)}`);

  if (!hasRealIceBreaker(lead.msg) || !lead.name || lead.name.length < 2) {
    throw new Error('Enrich failed — missing Name or Ice-breaker');
  }

  console.log('--- Send ice (SKIP_SYNC=1, TARGET only) ---');
  process.env.SKIP_SYNC = '1';
  process.env.SKIP_ENRICH = '1';
  process.env.FORCE_STAGE_A = '1';
  process.env.STAGE_A_ONLY = '1';
  await runStageA();

  const after = await findBySlug(slug);
  console.log('=== RESULT ===');
  console.log(JSON.stringify(after, null, 2));
  if (after?.status === 'Proposal 2️⃣') {
    console.log('SUCCESS: ice sent → Proposal 2️⃣. Ask friend to reply, then we run Stage B.');
  } else {
    console.log('WARNING: not Proposal 2️⃣ — check LinkedIn session / send logs.');
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
