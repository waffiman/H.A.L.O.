/**
 * Meet room URL + calendar invite links (no OAuth).
 * Env: GOOGLE_MEET_URL (or legacy WAFFI_BOOKING_URL).
 * Optional: DASHBOARD_PUBLIC_URL for .ics invites with VALARM reminders.
 */
function env(key, fallback = '') {
  return String(process.env[key] || fallback).trim();
}

export function getMeetRoomUrl() {
  return env('GOOGLE_MEET_URL') || env('WAFFI_BOOKING_URL');
}

export function meetLinkReady() {
  return Boolean(getMeetRoomUrl());
}

export function dashboardPublicBase() {
  return (
    env('DASHBOARD_PUBLIC_URL') ||
    env('PUBLIC_DASHBOARD_URL') ||
    env('HALO_PUBLIC_URL') ||
    ''
  ).replace(/\/$/, '');
}

/** @deprecated OAuth removed — always false */
export function googleCalendarOAuthReady() {
  return false;
}

/** @deprecated */
export function googleCalendarConfigured() {
  return false;
}

/** Google Calendar TEMPLATE stamp: 20240115T143000Z */
export function toGoogleCalendarStamp(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function escapeIcsText(s) {
  return String(s || '')
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

/**
 * ICS with reminders: 1 day, 1 hour, 10 minutes before start.
 */
export function buildIcsInvite(opts) {
  const title = String(opts.title || 'Call').slice(0, 200);
  const start = new Date(opts.startUtc);
  if (Number.isNaN(start.getTime())) return '';
  const mins = Number(opts.durationMinutes) > 0 ? Number(opts.durationMinutes) : 30;
  const end = opts.endUtc
    ? new Date(opts.endUtc)
    : new Date(start.getTime() + mins * 60000);
  const stamp = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const uid = `halo-${start.getTime()}@book-a-call`;
  const desc = String(opts.description || '').trim();
  const loc = String(opts.location || '').trim();
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//H.A.L.O.//Book a call//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(start)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:${escapeIcsText(title)}`,
  ];
  if (desc) lines.push(`DESCRIPTION:${escapeIcsText(desc)}`);
  if (loc) lines.push(`LOCATION:${escapeIcsText(loc)}`);
  for (const [trigger, label] of [
    ['-P1D', 'Call in 1 day'],
    ['-PT1H', 'Call in 1 hour'],
    ['-PT10M', 'Call in 10 minutes'],
  ]) {
    lines.push(
      'BEGIN:VALARM',
      `TRIGGER:${trigger}`,
      'ACTION:DISPLAY',
      `DESCRIPTION:${escapeIcsText(label)}`,
      'END:VALARM'
    );
  }
  lines.push('END:VEVENT', 'END:VCALENDAR');
  return lines.join('\r\n');
}

/**
 * One-click Google Calendar TEMPLATE URL (user confirms in browser).
 * Note: Google TEMPLATE cannot set custom reminder offsets; prefer .ics for VALARMs.
 */
export function buildGoogleCalendarAddUrl(opts) {
  const start = toGoogleCalendarStamp(opts.startUtc);
  if (!start) return '';
  const mins = Number(opts.durationMinutes) > 0 ? Number(opts.durationMinutes) : 30;
  const endIso =
    opts.endUtc ||
    new Date(new Date(opts.startUtc).getTime() + mins * 60000).toISOString();
  const end = toGoogleCalendarStamp(endIso);
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: String(opts.title || 'Call').slice(0, 200),
    dates: `${start}/${end}`,
  });
  const details = String(opts.description || '').trim();
  if (details) params.set('details', details.slice(0, 8000));
  const loc = String(opts.location || '').trim();
  if (loc) params.set('location', loc.slice(0, 500));
  const ctz = String(opts.timeZone || opts.ctz || '').trim();
  if (ctz) params.set('ctz', ctz);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/** Public .ics download URL (requires DASHBOARD_PUBLIC_URL). */
export function buildIcsInviteUrl(opts) {
  const base = dashboardPublicBase();
  if (!base || !opts?.startUtc) return '';
  const q = new URLSearchParams({
    s: String(opts.startUtc),
    t: String(opts.title || 'Call').slice(0, 200),
    d: String(Number(opts.durationMinutes) > 0 ? Number(opts.durationMinutes) : 30),
  });
  const meet = String(opts.location || opts.meetUrl || '').trim();
  if (meet) q.set('m', meet.slice(0, 500));
  const desc = String(opts.description || '').trim();
  if (desc) q.set('desc', desc.slice(0, 1500));
  return `${base}/api/calendar/invite.ics?${q.toString()}`;
}

/**
 * Best calendar link for a party: prefer .ics (reminders 1d / 1h / 10m), else Google TEMPLATE.
 */
export function buildBookingCalendarAddLink(opts) {
  const ics = buildIcsInviteUrl(opts);
  if (ics) return { url: ics, kind: 'ics' };
  const google = buildGoogleCalendarAddUrl(opts);
  return { url: google, kind: google ? 'google' : '' };
}

/** @deprecated */
export async function createBookingCalendarEvent() {
  return { ok: false, skipped: true, reason: 'calendar_oauth_removed' };
}

/**
 * Telegram + dashboard notice when a call is booked → Active ✅.
 * Content: lead name, host-local time, calendar add link only.
 */
export async function notifyBookedCall({ lead, offer, meetUrl = '' } = {}) {
  const name = String(lead?.name || 'Lead').trim() || 'Lead';
  const meet = String(meetUrl || getMeetRoomUrl()).trim();
  const startUtc = offer?.startUtc || '';
  const whenHost = offer?.labelHost || '';
  const { url: calUrl } = startUtc
    ? buildBookingCalendarAddLink({
        title: `Call with ${name}`,
        startUtc,
        description: [
          `Booked via H.A.L.O.`,
          meet ? `Meet: ${meet}` : '',
        ]
          .filter(Boolean)
          .join('\n'),
        location: meet,
        meetUrl: meet,
        timeZone: offer?.hostTimezone || '',
        durationMinutes: 30,
      })
    : { url: '' };

  const lines = [
    name,
    whenHost ? `Call: ${whenHost}` : '',
    calUrl ? `Add to calendar:\n${calUrl}` : '',
  ].filter(Boolean);

  const { notify } = await import('./notify.js');
  return notify({
    type: 'booked_call',
    severity: 'info',
    key: `active_booked_${lead?.id || name}_${startUtc || 'na'}`,
    title: `Active ✅ — ${name}`,
    message: lines.join('\n'),
  });
}
