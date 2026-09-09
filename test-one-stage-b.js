/**
 * One-lead Stage B: inbox reply only (skip Lost mass-scan via TARGET filter).
 *   TARGET_LINKEDIN_URL=... STAGE_B_ONLY=1 node test-one-stage-b.js
 */
import dotenv from 'dotenv';
dotenv.config();

import { Client } from '@notionhq/client';
import { profileSlugFromUrl, canonicalProfileUrl } from './connectionsSync.js';
import { runStageB } from './index.js';

const TARGET =
  process.env.TARGET_LINKEDIN_URL ||
  'https://www.linkedin.com/in/dmytro-korobko-86921a2a9/';

const notion = new Client({ auth: process.env.NOTION_TOKEN });
const databaseId = process.env.NOTION_DATABASE_ID;

async function findBySlug(slug) {
  for (const status of ['Proposal 2️⃣', 'Active ✅', 'Lost❌', 'Proposal 1️⃣']) {
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
            status,
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
  process.env.ALLOW_AUTO_LOGIN = process.env.ALLOW_AUTO_LOGIN || '0';
  process.env.SKIP_STAGE_B = '0';
  process.env.SKIP_CONVERSATION = '0';
  process.env.ENABLE_INBOX_REPLIES = process.env.ENABLE_INBOX_REPLIES || '1';
  process.env.CONV_MAX_PER_RUN = '1';
  process.env.LOST_INBOX_MAX = '0';

  console.log(`=== ONE-LEAD STAGE B: ${cleanUrl} ===`);
  const before = await findBySlug(slug);
  console.log('Before:', JSON.stringify(before, null, 2));
  if (!before || before.status !== 'Proposal 2️⃣') {
    console.log('Expected Proposal 2️⃣ — aborting.');
    process.exitCode = 1;
    return;
  }

  await runStageB();

  const after = await findBySlug(slug);
  console.log('=== RESULT ===');
  console.log(JSON.stringify(after, null, 2));
  if (after && after.status !== before.status) {
    console.log(`Status changed: ${before.status} → ${after.status}`);
  } else {
    console.log('Status unchanged (may stay Proposal 2️⃣ if still nurturing).');
  }
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
