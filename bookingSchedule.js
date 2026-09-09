/**
 * Book-a-call weekly availability + offer-slot builder (no LLM).
 * Slots are computed in the host timezone, then labeled in the lead timezone.
 */
export const WEEK_DAYS = [
  { id: 'mon', label: 'Monday', js: 1 },
  { id: 'tue', label: 'Tuesday', js: 2 },
  { id: 'wed', label: 'Wednesday', js: 3 },
  { id: 'thu', label: 'Thursday', js: 4 },
  { id: 'fri', label: 'Friday', js: 5 },
  { id: 'sat', label: 'Saturday', js: 6 },
  { id: 'sun', label: 'Sunday', js: 0 },
];

const DAY_IDS = WEEK_DAYS.map((d) => d.id);

function hhmmValid(s) {
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(String(s || ''));
}

function toMinutes(hhmm) {
  const [h, m] = String(hhmm).split(':').map(Number);
  return h * 60 + m;
}

/** Default = available 24/7 (free all day) until the user customizes. */
export function defaultBookingDay() {
  return { mode: 'free', intervals: [{ start: '00:00', end: '23:59' }] };
}

export function defaultBookingSchedule() {
  const days = {};
  for (const d of DAY_IDS) days[d] = defaultBookingDay();
  return {
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    days,
  };
}

export function normalizeBookingSchedule(raw) {
  const base = defaultBookingSchedule();
  if (!raw || typeof raw !== 'object') return base;
  const timezone = String(raw.timezone || base.timezone).trim() || base.timezone;
  const days = {};
  for (const id of DAY_IDS) {
    const src = raw.days?.[id] || {};
    const mode = ['busy', 'free', 'intervals'].includes(src.mode) ? src.mode : 'free';
    const intervals = Array.isArray(src.intervals)
      ? src.intervals
          .map((iv) => ({
            start: String(iv?.start || '').trim(),
            end: String(iv?.end || '').trim(),
          }))
          .filter((iv) => hhmmValid(iv.start) && hhmmValid(iv.end) && toMinutes(iv.start) < toMinutes(iv.end))
      : [];
    days[id] = {
      mode,
      intervals: intervals.length ? intervals : [{ start: '00:00', end: '23:59' }],
    };
  }
  return { timezone, days };
}

/** Every weekday must be busy | free | intervals (with ≥1 valid interval). */
export function validateBookingSchedule(raw) {
  const schedule = normalizeBookingSchedule(raw);
  const missing = [];
  for (const d of WEEK_DAYS) {
    const day = schedule.days[d.id];
    if (!day.mode) {
      missing.push(d.label);
      continue;
    }
    if (day.mode === 'intervals') {
      const ok = (day.intervals || []).some(
        (iv) => hhmmValid(iv.start) && hhmmValid(iv.end) && toMinutes(iv.start) < toMinutes(iv.end)
      );
      if (!ok) missing.push(d.label);
    }
  }
  return {
    ok: missing.length === 0,
    missing,
    schedule,
  };
}

function zonedParts(date, timeZone) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
    hour12: false,
  });
  const map = {};
  for (const p of fmt.formatToParts(date)) {
    if (p.type !== 'literal') map[p.type] = p.value;
  }
  return map;
}

function weekdayIdFromJs(jsDay) {
  return WEEK_DAYS.find((d) => d.js === jsDay)?.id || 'mon';
}

function jsDayFromParts(parts) {
  const map = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return map[parts.weekday] ?? 1;
}

/** Approximate UTC Date for a local wall time in `timeZone`. */
function zonedLocalToUtc(year, month, day, hour, minute, timeZone) {
  let guess = Date.UTC(year, month - 1, day, hour, minute, 0);
  for (let i = 0; i < 3; i++) {
    const p = zonedParts(new Date(guess), timeZone);
    const asUtc = Date.UTC(
      Number(p.year),
      Number(p.month) - 1,
      Number(p.day),
      Number(p.hour),
      Number(p.minute),
      0
    );
    const target = Date.UTC(year, month - 1, day, hour, minute, 0);
    guess += target - asUtc;
  }
  return new Date(guess);
}

function formatLeadLocal(date, timeZone) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date);
}

/**
 * Build up to `limit` concrete offer slots for the next `horizonDays`.
 * Returns labels already converted to lead TZ.
 */
export function buildBookingOffers({
  schedule: rawSchedule,
  leadTimezone = '',
  now = new Date(),
  horizonDays = 10,
  limit = 5,
  slotMinutes = 30,
  minNoticeMinutes = 24 * 60,
} = {}) {
  const { ok, schedule } = validateBookingSchedule(rawSchedule);
  if (!ok) return { ok: false, offers: [], error: 'incomplete_schedule' };

  const hostTz = schedule.timezone || 'UTC';
  const leadTz = String(leadTimezone || '').trim() || hostTz;
  const offers = [];
  const noticeMs = minNoticeMinutes * 60 * 1000;
  const startMs = now.getTime() + noticeMs;

  for (let dayOffset = 0; dayOffset < horizonDays && offers.length < limit; dayOffset++) {
    const probe = new Date(now.getTime() + dayOffset * 86400000);
    const parts = zonedParts(probe, hostTz);
    const y = Number(parts.year);
    const mo = Number(parts.month);
    const d = Number(parts.day);
    const dayId = weekdayIdFromJs(jsDayFromParts(parts));
    const day = schedule.days[dayId];
    if (!day || day.mode === 'busy') continue;

    const windows =
      day.mode === 'free'
        ? [{ start: '00:00', end: '23:59' }]
        : (day.intervals || []).filter(
            (iv) => hhmmValid(iv.start) && hhmmValid(iv.end) && toMinutes(iv.start) < toMinutes(iv.end)
          );

    for (const win of windows) {
      let cursor = toMinutes(win.start);
      const end = toMinutes(win.end);
      while (cursor + slotMinutes <= end && offers.length < limit) {
        const hh = String(Math.floor(cursor / 60)).padStart(2, '0');
        const mm = String(cursor % 60).padStart(2, '0');
        const utc = zonedLocalToUtc(y, mo, d, Number(hh), Number(mm), hostTz);
        if (utc.getTime() >= startMs) {
          const id = `s${offers.length + 1}_${utc.toISOString().slice(0, 16).replace(/[-:T]/g, '')}`;
          offers.push({
            id,
            startUtc: utc.toISOString(),
            hostTimezone: hostTz,
            leadTimezone: leadTz,
            labelLead: `${formatLeadLocal(utc, leadTz)} (${leadTz})`,
            labelHost: `${formatLeadLocal(utc, hostTz)} (${hostTz})`,
          });
        }
        cursor += slotMinutes;
      }
    }
  }

  return { ok: true, offers, hostTimezone: hostTz, leadTimezone: leadTz };
}

/** Compact prompt block — few tokens, concrete choices only. */
export function formatBookingOffersForPrompt(offers, { meetUrl = '', meetUrlReady = false } = {}) {
  void meetUrl;
  void meetUrlReady;
  if (!offers?.length) {
    return [
      '## Booking offers',
      '(No concrete slots available — ask for THEIR preferred days/times; do NOT invent clock times.)',
      'Active ✅ after they agree to a specific day+time; system sends calendar invite link on accept.',
    ].join('\n');
  }
  const lines = [
    '## Booking offers (lead local time — choose ONLY from this list)',
    ...offers.map((o, i) => `${i + 1}. ${o.labelLead} [id=${o.id}]`),
    'Rules:',
    '- Soft "yes to a call" ≠ Active. First propose 1–2 options from the list (use lead TZ labels).',
    '- If none work, ask which days work; stay Proposal 2️⃣; do NOT invent times.',
    '- When they clearly accept one listed slot: intent=book, booked_slot_id=<exact id> → Active ✅.',
    '- After accept, the system appends a calendar invite link for the lead (do not invent Meet URLs).',
  ];
  return lines.join('\n');
}

/**
 * Server-side gate: Active when a listed slot is accepted.
 * Appends calendar-add link (not raw Meet URL) after accept.
 */
export function enforceBookACallDecision(decision, { offers = [], meetUrl = '', calendarAddUrl = '' } = {}) {
  const out = { ...decision };
  const cal = String(calendarAddUrl || '').trim();
  const slotId = String(out.booked_slot_id || out.bookedSlotId || '').trim();
  const offer = offers.find((o) => o.id === slotId) || null;
  const intent = String(out.intent || '').toLowerCase();

  if (intent !== 'book') {
    out.booked_slot_id = '';
    out.bookedOffer = null;
    if (out.status === 'Active ✅') out.status = 'Proposal 2️⃣';
    return out;
  }

  if (!offer) {
    out.intent = 'continue';
    out.status = 'Proposal 2️⃣';
    out.booked_slot_id = '';
    out.bookedOffer = null;
    out.reason = out.reason
      ? `${out.reason} | book deferred (need accepted listed slot)`
      : 'book deferred (need accepted listed slot)';
    return out;
  }

  let reply = String(out.reply || '');
  // Calendar invite link only (Meet room may be embedded in the event if configured).
  void meetUrl;
  if (cal && !reply.includes(cal)) {
    reply = `${reply.trim()}\n\nAdd this call to your calendar:\n${cal}`.trim();
  }
  out.reply = reply;
  out.text = reply;
  out.intent = 'book';
  out.status = 'Active ✅';
  out.booked_slot_id = offer.id;
  out.bookedOffer = offer;
  return out;
}
