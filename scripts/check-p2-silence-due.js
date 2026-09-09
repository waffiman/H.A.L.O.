#!/usr/bin/env node
/** Dry-check: which Proposal 2️⃣ leads are due for closing follow-up (no browser). */
import dotenv from 'dotenv';
dotenv.config({ override: true });

function isWeekday(date = new Date()) {
  const d = date.getUTCDay();
  return d !== 0 && d !== 6;
}

function businessDaysBetween(from, to) {
  const start = new Date(from);
  const end = new Date(to);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return 0;
  let count = 0;
  const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
  const endDay = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()));
  while (cursor < endDay) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    if (isWeekday(cursor)) count++;
  }
  return count;
}

const { Client } = await import('@notionhq/client');
const notion = new Client({ auth: process.env.NOTION_TOKEN });
const databaseId = process.env.NOTION_DATABASE_ID;
const silenceDays = Number(process.env.SILENCE_BUSINESS_DAYS || 2);
const skipWeekends = process.env.SILENCE_SKIP_WEEKENDS !== '0';
const now = new Date();

const results = [];
let cursor;
do {
  const res = await notion.databases.query({
    database_id: databaseId,
    start_cursor: cursor,
    filter: { property: 'Status', select: { equals: 'Proposal 2️⃣' } },
  });
  results.push(...res.results);
  cursor = res.has_more ? res.next_cursor : undefined;
} while (cursor);

const rows = results.map((page) => {
  const name = page.properties.Name?.title?.[0]?.plain_text || '(no name)';
  const processingAt = page.properties['Processing at']?.date?.start || null;
  const days = processingAt ? businessDaysBetween(processingAt, now) : null;
  return { name, processingAt, days, due: days != null && days >= silenceDays };
});

console.log(
  JSON.stringify(
    {
      now: now.toISOString(),
      weekday: isWeekday(now),
      silenceDays,
      skipWeekends,
      weekendWouldSkipSilence: skipWeekends && !isWeekday(now),
      proposal2Count: rows.length,
      dueCount: rows.filter((r) => r.due).length,
      due: rows.filter((r) => r.due).map((r) => ({ name: r.name, processingAt: r.processingAt, businessDays: r.days })),
      sample: rows.slice(0, 8).map((r) => ({ name: r.name, processingAt: r.processingAt, businessDays: r.days, due: r.due })),
    },
    null,
    2
  )
);
