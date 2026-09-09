#!/usr/bin/env node
import dotenv from 'dotenv';
dotenv.config({ override: true });
import { Client } from '@notionhq/client';

const n = new Client({ auth: process.env.NOTION_TOKEN });
const id = process.env.NOTION_DATABASE_ID;
const statuses = ['Proposal 1️⃣', 'Proposal 1', 'Proposal 2️⃣', 'Lost❌'];

for (const s of statuses) {
  try {
    let total = 0;
    let names = [];
    let cursor;
    do {
      const r = await n.databases.query({
        database_id: id,
        filter: { property: 'Status', select: { equals: s } },
        page_size: 100,
        start_cursor: cursor,
      });
      total += r.results.length;
      for (const p of r.results) {
        if (names.length < 10) names.push(p.properties.Name?.title?.[0]?.plain_text || '?');
      }
      cursor = r.has_more ? r.next_cursor : undefined;
    } while (cursor);
    console.log(`${s}: ${total}`);
    for (const name of names) console.log(`  - ${name}`);
  } catch (e) {
    console.log(`${s}: ERR ${e.message}`);
  }
}
