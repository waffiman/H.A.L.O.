/**
 * Dry-run Book-a-call path: offers → LLM-shaped JSON → enforce → Active.
 * Does NOT call LinkedIn or OpenAI by default.
 *
 * Usage:
 *   node scripts/test-book-a-call-flow.js
 *   node scripts/test-book-a-call-flow.js --live   # optional real LLM call (costs tokens)
 */
import {
  buildBookingOffers,
  defaultBookingSchedule,
  enforceBookACallDecision,
  formatBookingOffersForPrompt,
} from '../bookingSchedule.js';
import { generateSalesMessage } from '../salesBrain.js';
import { writeSalesPolicy, readSalesPolicy } from '../brainStore.js';

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function simulateDecision(rawJson, offers, meetUrl, calendarAddUrl = '') {
  const parsed = JSON.parse(rawJson);
  const decision = {
    intent: String(parsed.intent || 'continue').toLowerCase(),
    reason: String(parsed.reason || ''),
    reply: String(parsed.reply || ''),
    notes_append: String(parsed.notes_append || ''),
    status: parsed.status || 'Proposal 2️⃣',
    booked_slot_id: String(parsed.booked_slot_id || '').trim(),
    text: String(parsed.reply || ''),
  };
  if (decision.intent === 'book') decision.status = 'Active ✅';
  return enforceBookACallDecision(decision, { offers, meetUrl, calendarAddUrl });
}

async function main() {
  const live = process.argv.includes('--live');
  const schedule = defaultBookingSchedule();
  schedule.timezone = 'America/New_York';
  // Paint Mon–Fri 09:00–12:00 available (partial)
  for (const id of ['mon', 'tue', 'wed', 'thu', 'fri']) {
    schedule.days[id] = { mode: 'intervals', intervals: [{ start: '09:00', end: '12:00' }] };
  }
  for (const id of ['sat', 'sun']) {
    schedule.days[id] = { mode: 'busy', intervals: [{ start: '00:00', end: '23:59' }] };
  }

  const { offers, ok } = buildBookingOffers({
    schedule,
    leadTimezone: 'Europe/Kyiv',
    limit: 4,
    minNoticeMinutes: 60,
  });
  assert(ok && offers.length > 0, 'expected offers from weekday mornings');
  console.log('offers:');
  for (const o of offers) console.log(' -', o.id, o.labelLead);

  const soft = simulateDecision(
    JSON.stringify({
      intent: 'continue',
      reason: 'soft interest',
      reply: 'Happy to hop on a call — what times work?',
      booked_slot_id: '',
      status: 'Proposal 2️⃣',
    }),
    offers,
    ''
  );
  assert(soft.status === 'Proposal 2️⃣', 'soft yes must stay P2');
  console.log('soft interest →', soft.status);

  const badId = simulateDecision(
    JSON.stringify({
      intent: 'book',
      reason: 'accepted',
      reply: 'Thursday works',
      booked_slot_id: 'invented_slot',
      status: 'Active ✅',
    }),
    offers,
    'https://meet.google.com/aaa-bbbb-ccc'
  );
  assert(badId.status === 'Proposal 2️⃣' && badId.intent === 'continue', 'bad slot id must not Active');
  console.log('bad booked_slot_id →', badId.intent, badId.status);

  const acceptNoMeet = simulateDecision(
    JSON.stringify({
      intent: 'book',
      reason: 'accepted listed slot',
      reply: `Let's do ${offers[0].labelLead}`,
      booked_slot_id: offers[0].id,
      status: 'Active ✅',
    }),
    offers,
    ''
  );
  assert(acceptNoMeet.status === 'Active ✅', 'accepted slot without Meet → Active');
  assert(!/meet\.google/.test(acceptNoMeet.reply), 'no Meet URL injected when unset');
  console.log('accept + no Meet →', acceptNoMeet.status);

  const calLink = 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=Scheduled+call';
  const acceptMeet = simulateDecision(
    JSON.stringify({
      intent: 'book',
      reason: 'accepted',
      reply: 'Perfect, see you then',
      booked_slot_id: offers[0].id,
      status: 'Active ✅',
    }),
    offers,
    'https://meet.google.com/fze-fufc-gyz',
    calLink
  );
  assert(acceptMeet.status === 'Active ✅', 'accepted + calendar link → Active');
  assert(acceptMeet.reply.includes(calLink), 'calendar invite link appended');
  assert(!acceptMeet.reply.includes('meet.google.com/fze-fufc-gyz'), 'raw Meet URL not appended');
  console.log('accept + calendar invite → Active, link in reply');

  console.log('\n--- prompt block (token sample) ---');
  console.log(formatBookingOffersForPrompt(offers, { meetUrl: '' }).slice(0, 500), '…');

  if (!live) {
    console.log('\nOK dry-run (no LLM). Re-run with --live to hit real brain once.');
    return;
  }

  const prev = readSalesPolicy(process.cwd());
  writeSalesPolicy({ ...prev, outcome: 'book_a_call', booking: schedule }, process.cwd());
  try {
    const decision = await generateSalesMessage({
      mode: 'reply',
      lead: {
        name: 'Test Lead',
        timezone: 'Europe/Kyiv',
        url: 'https://www.linkedin.com/in/example',
        notesText: '',
        msg: 'Hi — earlier ice breaker',
      },
      thread: [
        '[ME] Hi Test — quick note about calendars.',
        '[LEAD] Sure, happy to jump on a call. What times work this week?',
      ].join('\n---\n'),
    });
    console.log('\nLIVE LLM decision:', {
      intent: decision.intent,
      status: decision.status,
      booked_slot_id: decision.booked_slot_id,
      reply: String(decision.reply || '').slice(0, 280),
    });
  } finally {
    writeSalesPolicy(prev, process.cwd());
  }
}

main().catch((e) => {
  console.error('FAIL', e.message);
  process.exit(1);
});
